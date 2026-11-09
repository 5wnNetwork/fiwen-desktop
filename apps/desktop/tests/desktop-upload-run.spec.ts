import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it } from 'vitest'
import { uploadDesktopRelease } from '../scripts/desktop-upload-run.ts'
import type { DesktopUploadPlan } from '../scripts/desktop-upload-plan.ts'
import { answer, LOOPBACK_SECRET, s3Error, startS3Loopback, type S3Loopback, type S3LoopbackRequest } from './s3-loopback.ts'

const roots: string[] = []
const loopbacks: S3Loopback[] = []
afterEach(async () => {
  const closers = loopbacks.splice(0)
  const paths = roots.splice(0)
  try { await Promise.all(closers.map(loopback => loopback.close())) }
  finally { await Promise.all(paths.map(path => rm(path, { recursive: true, force: true }))) }
})

const BINARY_BYTES = 'binary fixture'
const FEED_BYTES = 'version: 1.2.3\n'
const RECEIPT = { 'x-amz-request-id': 'fixture-request' }

async function fixture(environment: 'test' | 'production' = 'test') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-upload-audit-'))
  roots.push(root)
  const binary = join(root, 'package.exe')
  await writeFile(binary, BINARY_BYTES)
  const bucket = `${environment}-fixture`
  const plan: DesktopUploadPlan = {
    environment, target: 'win-x64', version: '1.2.3', bucket, endpoint: 'https://s3.example.com', region: 'us-east-1',
    publicUrl: `https://${environment}.invalid/feed/`, accessKeyIdEnvName: 'UNREAD_ID', secretAccessKeyEnvName: 'UNREAD_KEY',
    artifacts: [
      { path: binary, filename: 'package.exe', key: 'bin/package.exe', contentType: 'application/octet-stream', channelMetadata: false },
      { path: join(root, 'nightly.yml'), filename: 'nightly.yml', key: 'feeds/nightly.yml', contentType: 'application/yaml', channelMetadata: true,
        contents: FEED_BYTES },
    ],
  }
  const records = join(root, 'records')
  const directory = async () => join(records, (await readdir(records))[0]!)
  return { root, records, plan, bucket, directory }
}

/** Production client pointed at one isolated loopback endpoint. */
async function transport(responder?: Parameters<typeof startS3Loopback>[0]) {
  const loopback = await startS3Loopback(responder)
  loopbacks.push(loopback)
  return { s3: loopback.client(), loopback }
}

interface RecordedPlan {
  environment: string
  artifacts: ({ contents?: string } & { md5: string; sha512: string; size: number })[]
  sourceSha256: Record<string, string>
}

async function json<T = unknown>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T }

async function journal(path: string): Promise<{ type: string; time: string }[]> {
  return (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { type: string; time: string })
}

/** Assert the wire form shared by every upload: exact bytes, one content-length, no transfer or chunked encoding. */
function expectExactObject(request: S3LoopbackRequest, expected: string, contentType: string, bucket: string, key: string): void {
  expect(request.method).toBe('PUT')
  expect(request.path).toBe(`/${bucket}/${key}?x-id=PutObject`)
  expect(request.body.toString('utf8')).toBe(expected)
  expect(request.headers['content-length']).toBe(String(Buffer.byteLength(expected)))
  expect(request.headers['content-type']).toBe(contentType)
  expect(request.headers['transfer-encoding']).toBeUndefined()
  expect(request.headers['content-encoding']).toBeUndefined()
  expect(request.headers['x-amz-trailer']).toBeUndefined()
  expect(request.headers['content-md5']).toBe(createHash('md5').update(expected).digest('base64'))
}

describe('release upload audit with the real S3 client and an isolated loopback endpoint', () => {
  it.each(['test', 'production'] as const)('retains %s plan, feed bytes, intent, receipt and hashes before advancing', async (environment) => {
    const f = await fixture(environment)
    const { s3, loopback } = await transport(async (request, response) => {
      const directory = await f.directory()
      const plan = await json<RecordedPlan>(join(directory, 'plan.json'))
      expect(plan.environment).toBe(environment)
      expect(plan.artifacts[1]!.contents).toBe(FEED_BYTES)
      const lines = await journal(join(directory, 'events.jsonl'))
      expect(lines.at(-1)).toMatchObject({ type: 'put-intent', key: f.plan.artifacts[loopback.requests.length - 1]!.key })
      expect(request.headers['content-md5']).toBe(plan.artifacts[loopback.requests.length - 1]!.md5)
      answer(response, 200, '', RECEIPT)
    })
    const directory = await uploadDesktopRelease(f.plan, s3, f.records)
    expect(loopback.requests).toHaveLength(2)
    expectExactObject(loopback.requests[0]!, BINARY_BYTES, 'application/octet-stream', f.bucket, 'bin/package.exe')
    expectExactObject(loopback.requests[1]!, FEED_BYTES, 'application/yaml', f.bucket, 'feeds/nightly.yml')
    for (const request of loopback.requests) {
      const authorization = String(request.headers.authorization)
      expect(authorization).toMatch(/^AWS4-HMAC-SHA256 /u)
      expect(authorization).toContain('content-md5')
      expect(authorization).not.toContain(LOOPBACK_SECRET)
    }
    const plan = await json<RecordedPlan>(join(directory, 'plan.json'))
    expect(plan.artifacts[0]!.sha512).toBe(createHash('sha512').update(BINARY_BYTES).digest('base64'))
    for (const source of ['upload-target.ts', 'desktop-s3.ts']) {
      expect(plan.sourceSha256[source]).toBe(createHash('sha256')
        .update(await readFile(join(import.meta.dirname, '../scripts', source))).digest('hex'))
    }
    const result = await json(join(directory, 'result.json'))
    expect(result).toMatchObject({ success: true, stage: 'complete', confirmedPuts: 2, publicReadback: 'not-performed' })
    const events = await journal(join(directory, 'events.jsonl'))
    expect(`${events.map(event => event.type).join('\n')}\n`).toBe(await readFile(join(import.meta.dirname, 'expected/desktop-upload-audit.txt'), 'utf8'))
    expect(events[2]).toMatchObject({ httpStatus: 200, requestId: 'fixture-request', attempts: 1 })
    for (const event of events) expect(Number.isFinite(Date.parse(event.time))).toBe(true)
    expect(JSON.stringify({ plan, result, events })).not.toMatch(/test-credential|authorization|UNREAD_KEY/iu)
  })

  it.each([1, 2])('retains failure at PUT %s without retry or later upload, excluding raw server diagnostics', async (failAt) => {
    const f = await fixture()
    const { s3, loopback } = await transport((_request, response) => {
      if (loopback.requests.length === failAt) {
        answer(response, 500, s3Error('InternalError', LOOPBACK_SECRET), { 'content-type': 'application/xml', ...RECEIPT })
        return
      }
      answer(response, 200, '', RECEIPT)
    })
    await expect(uploadDesktopRelease(f.plan, s3, f.records)).rejects.toThrow('stopped at put')
    expect(loopback.requests).toHaveLength(failAt)
    const directory = await f.directory()
    const result = await json(join(directory, 'result.json'))
    expect(result).toMatchObject({ success: false, confirmedPuts: failAt - 1, stage: 'put', failure: { errorCode: 'InternalError', httpStatus: 500, requestId: 'fixture-request' } })
    expect(await readFile(join(directory, 'result.json'), 'utf8')).not.toContain(LOOPBACK_SECRET)
    expect((await readFile(join(directory, 'events.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(failAt * 2)
  })

  it('refuses a client that may retry writes before sending or recording anything', async () => {
    const f = await fixture()
    const loopback = await startS3Loopback()
    loopbacks.push(loopback)
    // Default retry policy: a 500 would be resent up to twice more.
    const s3 = new S3Client({ region: 'us-east-1', endpoint: loopback.credentials.endpoint, forcePathStyle: true,
      credentials: { accessKeyId: 'test-credential-id', secretAccessKey: LOOPBACK_SECRET } })
    await expect(uploadDesktopRelease(f.plan, s3, f.records)).rejects.toThrow(/must not retry/u)
    expect(loopback.requests).toHaveLength(0)
  })

  it.each([1, 2])('reports a dropped connection at PUT %s once without sending the object again', async (dropAt) => {
    const f = await fixture()
    const { s3, loopback } = await transport((_request, response) => {
      if (loopback.requests.length === dropAt) { response.socket?.destroy(); return }
      answer(response, 200, '', RECEIPT)
    })
    await expect(uploadDesktopRelease(f.plan, s3, f.records)).rejects.toThrow('stopped at put')
    expect(loopback.requests).toHaveLength(dropAt)
    const result = await json(join(await f.directory(), 'result.json'))
    expect(result).toMatchObject({ success: false, confirmedPuts: dropAt - 1, stage: 'put' })
  })

  it('refuses networking when the audit parent cannot be created', async () => {
    const f = await fixture()
    const { s3, loopback } = await transport()
    await expect(uploadDesktopRelease(f.plan, s3, f.plan.artifacts[0]!.path)).rejects.toThrow()
    expect(loopback.requests).toHaveLength(0)
  })

  it('stops before the next PUT when a response cannot be recorded', async () => {
    const f = await fixture()
    const { s3, loopback } = await transport(async (_request, response) => {
      const directory = await f.directory()
      await rename(join(directory, 'events.jsonl'), join(directory, 'events-before-failure.jsonl'))
      await mkdir(join(directory, 'events.jsonl'))
      answer(response, 200, '', RECEIPT)
    })
    await expect(uploadDesktopRelease(f.plan, s3, f.records)).rejects.toThrow('stopped at record-response')
    expect(loopback.requests).toHaveLength(1)
    expect(await json(join(await f.directory(), 'result.json'))).toMatchObject({ success: false, stage: 'record-response', confirmedPuts: 1 })
  })

  it('keeps independent runs without overwriting prior evidence', async () => {
    const f = await fixture()
    const { s3 } = await transport()
    const first = await uploadDesktopRelease(f.plan, s3, f.records)
    const before = await readFile(join(first, 'result.json'), 'utf8')
    const second = await uploadDesktopRelease(f.plan, s3, f.records)
    expect(second).not.toBe(first)
    expect(await readFile(join(first, 'result.json'), 'utf8')).toBe(before)
  })
})

it('sends the fixed-download save filename through the real COS SDK', async () => {
  const f = await fixture('production')
  const contentDisposition = 'attachment; filename="fiwen-desktop-1.2.3-rc.5-win-x64.exe"'
  const plan = { ...f.plan, artifacts: [{ ...f.plan.artifacts[0]!, key: 'desktop/fiwen-latest-windows-x64.exe', contentDisposition }] }
  const { s3, loopback } = await transport()
  await uploadDesktopRelease(plan, s3, f.records)
  expect(loopback.requests).toHaveLength(1)
  expect(loopback.requests[0]!.headers['content-disposition']).toBe(contentDisposition)
})

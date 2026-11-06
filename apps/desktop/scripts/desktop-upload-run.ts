/** Durable, credential-free evidence for test and production Desktop uploads. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import type { DesktopUploadArtifact, DesktopUploadPlan } from './desktop-upload-plan.ts'
import { s3Operation } from './s3-operation.ts'
import { recordPackagingEvent } from './packaging-run.mjs'

const FAILURE_CODES = new Set(['AccessDenied', 'InternalError', 'NoSuchBucket', 'BadDigest', 'SignatureDoesNotMatch',
  'RequestTimeout', 'TimeoutError', 'AbortError', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENOSPC', 'EACCES', 'EPERM', 'ENOENT'])

/** Object keys fingerprinted into every upload record to bind evidence to this uploader. */
const UPLOADER_SOURCES = ['desktop-upload-run.ts', 'upload-target.ts', 'desktop-upload-plan.ts', 'desktop-s3.ts']

async function fingerprint(artifact: DesktopUploadArtifact) {
  const sha512 = createHash('sha512')
  const md5 = createHash('md5')
  let size = 0
  const source = artifact.contents === undefined ? createReadStream(artifact.path) : [Buffer.from(artifact.contents)]
  for await (const bytes of source) {
    size += bytes.length
    sha512.update(bytes)
    md5.update(bytes)
  }
  return { size, sha512: sha512.digest('base64'), md5: md5.digest('base64') }
}

function receipt(value: unknown): object {
  if (typeof value !== 'object' || value === null) return {}
  const response = value as { statusCode?: unknown; $metadata?: { httpStatusCode?: unknown; requestId?: unknown } }
  const metadata = response.$metadata ?? {}
  const requestId = metadata.requestId
  return {
    ...(typeof metadata.httpStatusCode === 'number' ? { httpStatus: metadata.httpStatusCode } : {}),
    ...(typeof requestId === 'string' && /^[\w+/=.-]{1,256}$/u.test(requestId) ? { requestId } : {}),
  }
}

function failureReceipt(error: unknown): object {
  const codes = typeof error === 'object' && error !== null
    ? ['code' in error ? error.code : undefined, 'name' in error ? error.name : undefined] : []
  const errorCode = codes.find(code => typeof code === 'string' && FAILURE_CODES.has(code)) ?? 'UNCLASSIFIED'
  return { errorCode, ...receipt(error) }
}

function streamedBody(artifact: DesktopUploadArtifact): Readable {
  return artifact.contents === undefined
    ? createReadStream(artifact.path)
    : Readable.from([Buffer.from(artifact.contents)])
}

/**
 * Upload an already validated installer or update plan, flushing intent and response evidence around every PUT.
 *
 * Each object is sent as one streamed PUT with an explicit length and Content-MD5. The client must
 * be configured with `maxAttempts: 1`, and this function never retries either, so every confirmed
 * PUT is the only write for its key.
 * @param plan Validated release metadata; credential values must not be included.
 * @param s3 Caller-owned client from the Desktop S3 factory in `desktop-s3.ts`.
 * @param recordsRoot Local retained evidence parent, outside disposable artifact directories.
 * @returns Fresh record directory after all PUTs succeed; errors retain partial evidence and stop later PUTs.
 * @throws {Error} Before any request or record when the client may retry.
 */
export async function uploadDesktopRelease(plan: DesktopUploadPlan, s3: S3Client, recordsRoot: string): Promise<string> {
  if (await s3.config.maxAttempts() !== 1) throw new Error('desktop upload: S3 client must not retry writes (maxAttempts: 1)')
  await mkdir(recordsRoot, { recursive: true })
  const directory = await mkdtemp(join(recordsRoot, `${plan.environment}-${plan.target}-`))
  process.stdout.write(`desktop upload: record ${directory}\n`)
  const startedAt = new Date().toISOString()
  let stage = 'prepare'
  let key: string | undefined
  let confirmedPuts = 0
  let success = false
  let failure: object | undefined
  try {
    await writeFile(join(directory, 'events.jsonl'), '', { flag: 'wx', mode: 0o600, flush: true })
    recordPackagingEvent(directory, { type: 'upload-start', environment: plan.environment, target: plan.target, version: plan.version })
    const artifacts = []
    for (const artifact of plan.artifacts) {
      stage = 'hash-input'
      key = artifact.key
      artifacts.push({ ...artifact, ...await fingerprint(artifact) })
    }
    const sourceSha256: Record<string, string> = {}
    for (const filename of UPLOADER_SOURCES) {
      sourceSha256[filename] = createHash('sha256').update(await readFile(join(import.meta.dirname, filename))).digest('hex')
    }
    await writeFile(join(directory, 'plan.json'), `${JSON.stringify({ schemaVersion: 1,
      environment: plan.environment, target: plan.target, version: plan.version, bucket: plan.bucket,
      publicUrl: plan.publicUrl, maxAttempts: 1, sourceSha256, artifacts }, null, 2)}\n`, { flag: 'wx', mode: 0o600, flush: true })
    for (const artifact of artifacts) {
      key = artifact.key
      stage = 'verify-input'
      const current = await fingerprint(artifact)
      if (current.sha512 !== artifact.sha512 || current.size !== artifact.size) throw new Error('desktop upload: input changed')
      stage = 'put'
      recordPackagingEvent(directory, { type: 'put-intent', key, size: artifact.size, sha512: artifact.sha512,
        channelMetadata: artifact.channelMetadata })
      const body = streamedBody(artifact)
      try {
        const response = await s3Operation(900_000, signal => s3.send(new PutObjectCommand({
          Bucket: plan.bucket, Key: key, Body: body, ContentLength: artifact.size,
          ContentType: artifact.contentType, ContentMD5: artifact.md5,
          ...(artifact.contentDisposition ? { ContentDisposition: artifact.contentDisposition } : {}),
        }), { abortSignal: signal }), 'PutObject')
        confirmedPuts++
        stage = 'record-response'
        recordPackagingEvent(directory, { type: 'put-confirmed', key, attempts: 1, ...receipt(response) })
      } finally {
        body.destroy()
      }
      process.stdout.write(`desktop upload: uploaded ${key}\n`)
    }
    stage = 'complete'
    recordPackagingEvent(directory, { type: 'upload-complete', confirmedPuts })
    success = true
    return directory
  } catch (error) {
    failure = failureReceipt(error)
    throw new Error(`desktop upload: stopped at ${stage}; inspect ${directory} before another upload`)
  } finally {
    await writeFile(join(directory, 'result.json'), `${JSON.stringify({ schemaVersion: 1, startedAt,
      finishedAt: new Date().toISOString(), environment: plan.environment, target: plan.target, version: plan.version,
      success, stage, key, confirmedPuts, failure, publicReadback: 'not-performed' }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600, flush: true })
  }
}

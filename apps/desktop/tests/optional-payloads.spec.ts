import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { c as createTar } from 'tar'
import { describe, expect, it, vi } from 'vitest'
import {
  installOptionalPayload, missingOptionalPayloads, readOptionalPayloads, type OptionalPayload,
} from '../src/optional-payloads.ts'

/** Build a payload archive whose single file proves the extraction ran. */
async function archive(root: string, contents: string): Promise<{ bytes: Buffer; sha256: string }> {
  const source = join(root, 'source')
  await mkdir(join(source, 'nested'), { recursive: true })
  await writeFile(join(source, 'nested', 'marker.txt'), contents)
  const file = join(root, 'payload.tar.gz')
  await createTar({ gzip: true, file, cwd: source, portable: true }, ['.'])
  const bytes = await readFile(file)
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/** Manifest entry pointing at a served archive. */
function payload(bytes: Buffer, sha256: string, overrides: Partial<OptionalPayload> = {}): OptionalPayload {
  return {
    id: 'python',
    title: 'Office documents and Python',
    url: 'https://downloads.example.test/fiwen-payload-python-win-x64.tar.gz',
    target: 'runtime/primary-runtime/dependencies/python',
    bytes: bytes.byteLength,
    sha256,
    ...overrides,
  }
}

describe('optional payload manifest', () => {
  it('reads the declared payloads and reports nothing missing once they are present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-manifest-'))
    const resources = join(root, 'resources')
    await mkdir(join(resources, 'runtime', 'primary-runtime', 'dependencies', 'python'), { recursive: true })
    const entry = payload(Buffer.from('x'), 'a'.repeat(64), { target: 'runtime/primary-runtime/dependencies/python' })
    await writeFile(join(resources, 'optional-payloads.json'), JSON.stringify({ version: 1, payloads: [entry] }))

    await expect(readOptionalPayloads(resources)).resolves.toEqual([entry])
    expect(missingOptionalPayloads(resources, [entry])).toEqual({ missing: [], bytes: 0 })
  })

  it('reports an absent payload with its download size', async () => {
    const resources = join(await mkdtemp(join(tmpdir(), 'payload-missing-')), 'resources')
    await mkdir(resources, { recursive: true })
    const entry = payload(Buffer.alloc(1024), 'b'.repeat(64))

    expect(missingOptionalPayloads(resources, [entry])).toMatchObject({ bytes: entry.bytes })
    expect(missingOptionalPayloads(resources, [entry]).missing).toHaveLength(1)
  })

  it('treats an application that carries every payload as having nothing to offer', async () => {
    const resources = await mkdtemp(join(tmpdir(), 'payload-none-'))
    await expect(readOptionalPayloads(resources)).resolves.toEqual([])
  })

  it('refuses a manifest target that escapes the resources directory', async () => {
    const resources = await mkdtemp(join(tmpdir(), 'payload-escape-'))
    const entry = payload(Buffer.from('x'), 'c'.repeat(64), { target: '../outside' })

    expect(() => missingOptionalPayloads(resources, [entry])).toThrow(/escapes the resources directory/u)
  })
})

describe('optional payload installation', () => {
  it('verifies, extracts, and lands the payload at its target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-install-'))
    const resources = join(root, 'resources')
    await mkdir(resources, { recursive: true })
    const { bytes, sha256 } = await archive(root, 'installed')
    const entry = payload(bytes, sha256)

    await installOptionalPayload(resources, entry, async () => new Response(new Uint8Array(bytes)))

    await expect(readFile(join(resources, entry.target, 'nested', 'marker.txt'), 'utf8')).resolves.toBe('installed')
  })

  it('rejects an archive whose bytes do not match the declared digest, leaving no target behind', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-digest-'))
    const resources = join(root, 'resources')
    await mkdir(resources, { recursive: true })
    const { bytes } = await archive(root, 'tampered')
    const entry = payload(bytes, 'd'.repeat(64))

    await expect(installOptionalPayload(resources, entry, async () => new Response(new Uint8Array(bytes))))
      .rejects.toThrow(/did not match its digest/u)
    expect(missingOptionalPayloads(resources, [entry]).missing).toHaveLength(1)
  })

  it('rejects an archive whose length differs from the manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-size-'))
    const resources = join(root, 'resources')
    await mkdir(resources, { recursive: true })
    const { bytes, sha256 } = await archive(root, 'short')
    const entry = payload(bytes, sha256, { bytes: bytes.byteLength + 1 })

    await expect(installOptionalPayload(resources, entry, async () => new Response(new Uint8Array(bytes))))
      .rejects.toThrow(/bytes, expected/u)
  })

  it('surfaces a failed download without writing a payload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-http-'))
    const resources = join(root, 'resources')
    await mkdir(resources, { recursive: true })
    const entry = payload(Buffer.from('x'), 'e'.repeat(64))

    await expect(installOptionalPayload(resources, entry, async () => new Response('nope', { status: 503 })))
      .rejects.toThrow(/download failed with 503/u)
  })

  it('reports download progress against the declared total', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-progress-'))
    const resources = join(root, 'resources')
    await mkdir(resources, { recursive: true })
    const { bytes, sha256 } = await archive(root, 'progress')
    const entry = payload(bytes, sha256)
    const progress = vi.fn()

    await installOptionalPayload(resources, entry, async () => new Response(new Uint8Array(bytes)), progress)

    expect(progress).toHaveBeenCalled()
    expect(progress.mock.calls.at(-1)?.[0]).toBe(bytes.byteLength)
    expect(progress.mock.calls.at(-1)?.[1]).toBe(entry.bytes)
  })
})

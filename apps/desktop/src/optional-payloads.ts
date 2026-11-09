/**
 * Install the payloads the installer omits: Office documents (Python) and Office
 * conversion. Each archive is verified against the manifest digest before it is
 * extracted, and a failed install leaves the previous tree in place.
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { x as extractTar } from 'tar'

/** One payload the runtime can install, as the build wrote it. */
export interface OptionalPayload {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly target: string
  readonly bytes: number
  readonly sha256: string
}


/** Result of inspecting what an installation still owes its user. */
export interface MissingPayloads {
  /** Payloads whose directory is absent. */
  readonly missing: readonly OptionalPayload[]
  /** Total download size for every missing payload. */
  readonly bytes: number
}

/**
 * Read the manifest that records which payloads this installer omitted.
 * @param resourcesDirectory - Installed application's resources directory.
 * @returns Declared payloads; empty when the build carries everything.
 */
export async function readOptionalPayloads(resourcesDirectory: string): Promise<readonly OptionalPayload[]> {
  const path = join(resourcesDirectory, 'optional-payloads.json')
  if (!existsSync(path)) return []
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || !('payloads' in parsed) || !Array.isArray(parsed.payloads)) {
    throw new Error('optional payloads: invalid manifest')
  }
  return parsed.payloads as readonly OptionalPayload[]
}

/**
 * Report which declared payloads are not on disk yet.
 * @param resourcesDirectory - Installed application's resources directory.
 * @param payloads - Declared payloads.
 * @returns The absent payloads and their combined download size.
 */
export function missingOptionalPayloads(resourcesDirectory: string, payloads: readonly OptionalPayload[]): MissingPayloads {
  const missing: OptionalPayload[] = []
  for (const payload of payloads) {
    if (!existsSync(payloadTarget(resourcesDirectory, payload))) missing.push(payload)
  }
  return { missing, bytes: missing.reduce((total, payload) => total + payload.bytes, 0) }
}

/**
 * Resolve a payload's install directory, refusing a manifest target that escapes resources.
 * @param resourcesDirectory - Installed application's resources directory.
 * @param payload - Declared payload.
 * @returns Absolute install directory.
 */
function payloadTarget(resourcesDirectory: string, payload: OptionalPayload): string {
  const root = resolve(resourcesDirectory)
  const target = resolve(root, payload.target)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`optional payloads: ${payload.id} target escapes the resources directory`)
  }
  return target
}

/**
 * Download, verify, and extract one payload.
 * The archive is unpacked into a staging directory first, so a failure never leaves a
 * half-written payload where the runtime would find it.
 * @param resourcesDirectory - Installed application's resources directory.
 * @param payload - Payload to install.
 * @param download - Fetches a URL, injected so tests need no network.
 * @param onProgress - Receives bytes downloaded so far.
 * @returns Completion once the payload is in place.
 */
export async function installOptionalPayload(
  resourcesDirectory: string,
  payload: OptionalPayload,
  download: (url: string) => Promise<Response> = url => fetch(url),
  onProgress: (received: number, total: number) => void = () => undefined,
): Promise<void> {
  const target = payloadTarget(resourcesDirectory, payload)
  const staging = `${target}.installing`
  await rm(staging, { recursive: true, force: true })
  await mkdir(dirname(staging), { recursive: true })
  const archive = `${staging}.tar.gz`

  try {
    await fetchVerified(payload, download, archive, onProgress)
    await mkdir(staging, { recursive: true })
    await extractTar({ file: archive, cwd: staging, strip: 1 })
    await rm(target, { recursive: true, force: true })
    await rename(staging, target)
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(archive, { force: true })
  }
}

/**
 * Stream an archive to disk while hashing it, then reject a digest mismatch.
 * @param payload - Expected digest and size.
 * @param download - Fetches the URL.
 * @param destination - Archive path.
 * @param onProgress - Receives bytes written so far.
 * @returns Completion once the verification passed.
 */
async function fetchVerified(
  payload: OptionalPayload,
  download: (url: string) => Promise<Response>,
  destination: string,
  onProgress: (received: number, total: number) => void,
): Promise<void> {
  const response = await download(payload.url)
  if (!response.ok || response.body === null) {
    throw new Error(`optional payloads: ${payload.id} download failed with ${String(response.status)}`)
  }
  const hash = createHash('sha256')
  let received = 0
  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    received += chunk.byteLength
    onProgress(received, payload.bytes)
  })
  await pipeline(body, createWriteStream(destination))
  const digest = hash.digest('hex')
  if (digest !== payload.sha256) {
    throw new Error(`optional payloads: ${payload.id} archive did not match its digest`)
  }
  const size = (await stat(destination)).size
  if (size !== payload.bytes) {
    throw new Error(`optional payloads: ${payload.id} archive was ${String(size)} bytes, expected ${String(payload.bytes)}`)
  }
}

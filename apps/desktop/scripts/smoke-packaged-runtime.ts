/** Validate the assembled application, including native Office conversion outside ASAR. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { x as extractTar } from 'tar'
import { desktopArtifactOutput, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'

/** One payload the build moved out of the application, as its manifest records it. */
interface PayloadEntry {
  readonly id: string
  readonly file: string
  readonly target: string
  readonly bytes: number
  readonly sha256: string
}

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false }, 'skip-notarization': { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const artifacts = desktopArtifactOutput(paths, { unsigned: values.unsigned, skipNotarization: values['skip-notarization'] }).directory
const application = windows ? join(artifacts, 'win-unpacked')
  : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', 'Fiwen Desktop.app', 'Contents')
const resources = join(application, windows ? 'resources' : 'Resources')
const executable = windows ? join(application, 'Fiwen Desktop.exe') : join(application, 'MacOS', 'Fiwen Desktop')

/**
 * Read the payloads the installer omitted, if this build split any out.
 * @returns Declared payloads, or none for a build that carries everything.
 */
async function readPayloads(): Promise<readonly PayloadEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(join(resources, 'optional-payloads.json'), 'utf8')) as { payloads?: PayloadEntry[] }
    return parsed.payloads ?? []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Require one archive to match its published size and digest.
 * @param payload - Declared payload.
 * @returns Verified archive path.
 */
async function verifyArchive(payload: PayloadEntry): Promise<string> {
  const file = join(artifacts, payload.file)
  const bytes = await readFile(file)
  if (bytes.byteLength !== payload.bytes) {
    throw new Error(`optional payload: ${payload.id} has ${String(bytes.byteLength)} bytes, expected ${String(payload.bytes)}`)
  }
  if (createHash('sha256').update(bytes).digest('hex') !== payload.sha256) {
    throw new Error(`optional payload: ${payload.id} digest does not match the manifest`)
  }
  return file
}

/**
 * Restore the split payloads so the full smoke runs against a complete application.
 * The archives are the shipped artifacts, so this checks what a user would actually receive.
 * @param payloads - Declared payloads.
 * @returns Directories to remove once the smoke finishes.
 */
async function restorePayloads(payloads: readonly PayloadEntry[]): Promise<string[]> {
  const restored: string[] = []
  for (const payload of payloads) {
    const archive = await verifyArchive(payload)
    const directory = join(resources, payload.target)
    await mkdir(directory, { recursive: true })
    await extractTar({ file: archive, cwd: directory, strip: 1 })
    restored.push(directory)
  }
  return restored
}

const payloads = await readPayloads()
const restored = await restorePayloads(payloads)
try {
  const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
    resolveDesktopPackageTarget(target))
  if (windows && !values.unsigned) await verifyWindowsCode(application)
  await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)
} finally {
  // The installer must not carry what the manifest says it omits.
  for (const directory of restored) await rm(directory, { recursive: true, force: true })
}

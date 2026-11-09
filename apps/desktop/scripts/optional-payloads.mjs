/**
 * Optional payloads: large target-specific directories that the installer omits and the
 * application installs on first use. One definition feeds both the packaging filters and the
 * manifest the desktop reads at runtime, so the two cannot drift.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { c as createTar } from 'tar'

/**
 * @typedef {object} OptionalPayload
 * @property {string} id Stable identifier used by the runtime and the release asset name.
 * @property {string} title Human-facing purpose, shown by the download prompt.
 * @property {string} source Absolute source directory, inside the assembled application tree.
 * @property {string} target Directory the archive restores into, relative to the application resources root.
 */

/**
 * @typedef {object} PayloadManifestEntry
 * @property {string} id Payload identifier.
 * @property {string} title Human-facing purpose.
 * @property {string} file Archive file name, resolved against the release's download directory.
 * @property {string} target Directory the archive restores into.
 * @property {number} bytes Archive size in bytes.
 * @property {string} sha256 Hex digest of the archive.
 */

/**
 * @typedef {object} PayloadManifest
 * @property {number} version Manifest schema version.
 * @property {readonly PayloadManifestEntry[]} payloads Downloadable payloads.
 */

/**
 * Platform token the payload asset names and package directories use.
 * @param {string} platform - Target platform.
 * @returns {string} The token shared by the kit package name and the release asset name.
 */
function platformToken(platform) {
  return platform === 'win32' ? 'win32' : platform
}

/**
 * Describe the payloads this target omits from its installer.
 * @param {{ runtime: string, dsh: string }} paths - Assembled runtime and dsh roots.
 * @param {string} platform - Target platform.
 * @param {string} arch - Target architecture.
 * @returns {OptionalPayload[]} Payloads to publish separately.
 */
export function optionalPayloads(paths, platform, arch) {
  const kit = `libreoffice-kit-${platformToken(platform)}-${arch}`
  return [
    {
      id: 'python',
      // Office authoring and the Python SDK run on this interpreter.
      title: 'Office documents and Python',
      source: join(paths.runtime, 'primary-runtime', 'dependencies', 'python'),
      target: 'runtime/primary-runtime/dependencies/python',
    },
    {
      id: 'office-kit',
      // DOCX/PPTX/XLSX conversion. The engine is an asar-unpacked dependency, so its
      // physical home is the unpacked tree the resolver already prefers.
      title: 'Office conversion',
      source: join(paths.dsh, 'node_modules', '@deepseek-ai', kit),
      target: `app.asar.unpacked/dsh/node_modules/@deepseek-ai/${kit}`,
    },
  ]
}

/**
 * Map a payload to where it sits inside the packed application.
 * @param {OptionalPayload} payload - Declared payload.
 * @param {string} resourcesDirectory - Packed application's resources directory.
 * @returns {string} Absolute directory in the packed application.
 */
export function packedPayloadDirectory(payload, resourcesDirectory) {
  return join(resourcesDirectory, payload.target)
}

/**
 * Write one directory as a payload's archive, then delete it from the packed application.
 * The trees hold already-compressed binaries, so the archive stays close to their own size.
 * @param {string} directory - Packed directory to archive and remove.
 * @param {OptionalPayload} payload - Payload the directory belongs to.
 * @param {string} output - Output directory for the archives.
 * @param {string} target - Target token used in the asset name.
 * @returns {Promise<PayloadManifestEntry>} Manifest entry describing the written archive.
 */
export async function writePayloadArchive(directory, payload, output, target) {
  if (!existsSync(directory)) throw new Error(`optional payload: missing ${payload.id} at ${directory}`)
  const file = join(output, payloadArchiveName(payload.id, target))
  rmSync(file, { force: true })
  await createTar({ gzip: true, file, cwd: directory, portable: true }, ['.'])
  const bytes = readFileSync(file)
  rmSync(directory, { recursive: true, force: true })
  return {
    id: payload.id,
    title: payload.title,
    file: payloadArchiveName(payload.id, target),
    target: payload.target,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

/**
 * Write the manifest that tells the runtime which payloads its installer omitted.
 * @param {readonly PayloadManifestEntry[]} entries - Written payloads.
 * @param {string} path - Manifest destination inside the application resources.
 * @param {string} downloadBase - Directory the archives are served from.
 * @returns {PayloadManifest} The manifest that was written.
 */
export function writePayloadManifest(entries, path, downloadBase) {
  const manifest = {
    version: 1,
    payloads: entries.map(entry => ({ ...entry, url: `${downloadBase}${entry.file}` })),
  }
  writeFileSync(path, `${JSON.stringify(manifest, undefined, 2)}\n`)
  return manifest
}

/**
 * Release asset name for one payload archive.
 * @param {string} id - Payload identifier.
 * @param {string} target - Target token.
 * @returns {string} Stable asset name.
 */
export function payloadArchiveName(id, target) {
  return `fiwen-payload-${id}-${target}.tar.gz`
}

/**
 * Size of a directory tree, used to report a download before it starts.
 * @param {string} root - Directory to measure.
 * @returns {number} Total bytes.
 */
export function directoryBytes(root) {
  let total = 0
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else total += statSync(absolute).size
    }
  }
  walk(root)
  return total
}

/** One target-specific directory the installer omits and the application installs on first use. */
export interface OptionalPayload {
  /** Stable identifier used by the runtime and the release asset name. */
  id: string
  /** Human-facing purpose, shown by the download prompt. */
  title: string
  /** Absolute source directory, inside the assembled application tree. */
  source: string
  /** Directory the archive restores into, relative to the application resources root. */
  target: string
}

/** One payload archive as the runtime reads it back from the release's download directory. */
export interface PayloadManifestEntry {
  /** Payload identifier. */
  id: string
  /** Human-facing purpose. */
  title: string
  /** Archive file name, resolved against the release's download directory. */
  file: string
  /** Directory the archive restores into. */
  target: string
  /** Archive size in bytes. */
  bytes: number
  /** Hex digest of the archive. */
  sha256: string
}

/** The manifest that tells the runtime which payloads its installer omitted. */
export interface PayloadManifest {
  /** Manifest schema version. */
  version: number
  /** Downloadable payloads. */
  payloads: readonly (PayloadManifestEntry & { url: string })[]
}

/**
 * Describe the payloads this target omits from its installer.
 * @param paths - Assembled runtime and dsh roots.
 * @param platform - Target platform.
 * @param arch - Target architecture.
 * @returns Payloads to publish separately.
 */
export function optionalPayloads(paths: { runtime: string, dsh: string }, platform: string, arch: string): OptionalPayload[]

/**
 * Map a payload to where it sits inside the packed application.
 * @param payload - Declared payload.
 * @param resourcesDirectory - Packed application's resources directory.
 * @returns Absolute directory in the packed application.
 */
export function packedPayloadDirectory(payload: OptionalPayload, resourcesDirectory: string): string

/**
 * Write one directory as a payload's archive, then delete it from the packed application.
 * @param directory - Packed directory to archive and remove.
 * @param payload - Payload the directory belongs to.
 * @param output - Output directory for the archives.
 * @param target - Target token used in the asset name.
 * @returns Manifest entry describing the written archive.
 */
export function writePayloadArchive(directory: string, payload: OptionalPayload, output: string, target: string): Promise<PayloadManifestEntry>

/**
 * Write the manifest that tells the runtime which payloads its installer omitted.
 * @param entries - Written payloads.
 * @param path - Manifest destination inside the application resources.
 * @param downloadBase - Directory the archives are served from.
 * @returns The manifest that was written.
 */
export function writePayloadManifest(entries: readonly PayloadManifestEntry[], path: string, downloadBase: string): PayloadManifest

/**
 * Release asset name for one payload archive.
 * @param id - Payload identifier.
 * @param target - Target token.
 * @returns Stable asset name.
 */
export function payloadArchiveName(id: string, target: string): string

/**
 * Size of a directory tree, used to report a download before it starts.
 * @param root - Directory to measure.
 * @returns Total bytes.
 */
export function directoryBytes(root: string): number

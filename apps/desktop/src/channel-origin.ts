import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Backend origin recorded in the packaged manifest at build time.
 * @param metadata - parsed package.json content.
 * @returns the https origin, or undefined when absent or not servable over TLS.
 */
export function parseChannelOrigin(metadata: unknown): string | undefined {
  if (typeof metadata !== 'object' || metadata === null) return undefined
  const value = (metadata as { dshDesktopOrigin?: unknown }).dshDesktopOrigin
  if (typeof value !== 'string' || value === '') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.origin : undefined
  } catch {
    return undefined
  }
}

/**
 * Read the channel origin from a packaged application's manifest.
 * @param appPath - `app.getAppPath()` of the running application.
 * @returns the baked https origin, or undefined when the file is absent or unreadable.
 */
export function readChannelOrigin(appPath: string): string | undefined {
  try {
    return parseChannelOrigin(JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')))
  } catch {
    return undefined
  }
}

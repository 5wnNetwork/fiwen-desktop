import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Origins recorded in the packaged manifest at build time. */
export interface ChannelOrigins {
  /** Backend API origin, omitted when absent or not servable over TLS. */
  origin?: string
  /** Dashboard origin, omitted when absent or not servable over TLS. */
  dashOrigin?: string
}

/**
 * Read one baked origin when it is a well-formed https origin.
 * @param value - manifest value.
 * @returns the normalized https origin, or undefined when absent or not servable over TLS.
 */
function parseHttpsOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.origin : undefined
  } catch {
    return undefined
  }
}

/**
 * Channel origins recorded in the packaged manifest at build time.
 * @param metadata - parsed package.json content.
 * @returns the https origins; a missing or non-TLS value is omitted.
 */
export function parseChannelOrigins(metadata: unknown): ChannelOrigins {
  if (typeof metadata !== 'object' || metadata === null) return {}
  const record = metadata as { dshDesktopOrigin?: unknown; dshDesktopDashOrigin?: unknown }
  const origin = parseHttpsOrigin(record.dshDesktopOrigin)
  const dashOrigin = parseHttpsOrigin(record.dshDesktopDashOrigin)
  return { ...(origin === undefined ? {} : { origin }), ...(dashOrigin === undefined ? {} : { dashOrigin }) }
}

/**
 * Read the channel origins from a packaged application's manifest.
 * @param appPath - `app.getAppPath()` of the running application.
 * @returns the baked https origins; an absent or unreadable file yields none.
 */
export function readChannelOrigins(appPath: string): ChannelOrigins {
  try {
    return parseChannelOrigins(JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')))
  } catch {
    return {}
  }
}

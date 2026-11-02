import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseChannelOrigins, readChannelOrigins } from '../src/channel-origin.ts'

describe('channel origins', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('accepts https origins and drops path and trailing slash', () => {
    expect(parseChannelOrigins({
      dshDesktopOrigin: 'https://backend.example.com/', dshDesktopDashOrigin: 'https://dashboard.example.com/',
    })).toEqual({ origin: 'https://backend.example.com', dashOrigin: 'https://dashboard.example.com' })
    expect(parseChannelOrigins({ dshDesktopOrigin: 'https://backend.example.com/sub' }))
      .toEqual({ origin: 'https://backend.example.com' })
  })

  it('ignores missing, malformed, non-string and plain-http values', () => {
    for (const metadata of [
      null, 42, {}, { dshDesktopOrigin: '' }, { dshDesktopOrigin: 'not a url' },
      { dshDesktopOrigin: 'http://backend.example.com' }, { dshDesktopOrigin: 42 },
      { dshDesktopDashOrigin: '' }, { dshDesktopDashOrigin: 'not a url' },
      { dshDesktopDashOrigin: 'http://dashboard.example.com' }, { dshDesktopDashOrigin: 42 },
    ]) {
      expect(parseChannelOrigins(metadata)).toEqual({})
    }
  })

  it('reads the packaged manifest and tolerates a missing file', () => {
    const root = mkdtempSync(join(tmpdir(), 'fiwen-origin-'))
    roots.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      dshDesktopOrigin: 'https://packaged.example.com', dshDesktopDashOrigin: 'https://dash-package.example.com',
    }))
    expect(readChannelOrigins(root)).toEqual({ origin: 'https://packaged.example.com', dashOrigin: 'https://dash-package.example.com' })
    expect(readChannelOrigins(join(root, 'missing'))).toEqual({})
  })
})

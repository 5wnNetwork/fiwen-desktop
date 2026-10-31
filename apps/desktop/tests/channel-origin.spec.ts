import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseChannelOrigin, readChannelOrigin } from '../src/channel-origin.ts'

describe('channel backend origin', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('accepts an https origin and drops path and trailing slash', () => {
    expect(parseChannelOrigin({ dshDesktopOrigin: 'https://backend.example.com/' })).toBe('https://backend.example.com')
    expect(parseChannelOrigin({ dshDesktopOrigin: 'https://backend.example.com/sub' })).toBe('https://backend.example.com')
  })

  it('ignores missing, malformed, non-string and plain-http values', () => {
    for (const metadata of [
      null, 42, {}, { dshDesktopOrigin: '' }, { dshDesktopOrigin: 'not a url' },
      { dshDesktopOrigin: 'http://backend.example.com' }, { dshDesktopOrigin: 42 },
    ]) {
      expect(parseChannelOrigin(metadata)).toBeUndefined()
    }
  })

  it('reads the packaged manifest and tolerates a missing file', () => {
    const root = mkdtempSync(join(tmpdir(), 'fiwen-origin-'))
    roots.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dshDesktopOrigin: 'https://packaged.example.com' }))
    expect(readChannelOrigin(root)).toBe('https://packaged.example.com')
    expect(readChannelOrigin(join(root, 'missing'))).toBeUndefined()
  })
})

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import {
  installMcp, installSkill, listInstalled, marketPatchIds, mcpRowConfig, uninstallMcp, uninstallSkill, type MarketStoreLayout,
} from '../src/install.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm), writeFile: vi.fn(actual.writeFile) }
})

vi.mock('@deepseek-ai/dsh-atomic-write', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deepseek-ai/dsh-atomic-write')>()
  return { ...actual, writeFileAtomic: vi.fn(actual.writeFileAtomic) }
})

let root: string
let layout: MarketStoreLayout
let patchPath: string
let profile: ProfileContext

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-market-'))
  layout = { skillsDir: join(root, 'skills'), marketDir: join(root, 'market') }
  await mkdir(layout.skillsDir, { recursive: true })
  await mkdir(layout.marketDir, { recursive: true })
  patchPath = join(root, 'cordis.patch.yml')
  profile = { patchPath } as ProfileContext
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const SKILL = { files: [{ path: 'SKILL.md', content: '# Web Tools' }, { path: 'refs/guide.md', content: 'guide' }] } as const

describe('installSkill', () => {
  it('extracts files, stamps the marker, and records the ledger', async () => {
    const view = await installSkill(layout, 'web-tools', '1.0.0', SKILL)
    expect(view).toMatchObject({ id: 'web-tools', kind: 'skill', version: '1.0.0' })
    expect(await readFile(join(layout.skillsDir, 'web-tools', 'SKILL.md'), 'utf8')).toBe('# Web Tools')
    expect(await readFile(join(layout.skillsDir, 'web-tools', 'refs', 'guide.md'), 'utf8')).toBe('guide')
    const marker = JSON.parse(await readFile(join(layout.skillsDir, 'web-tools', '.fiwen-market.json'), 'utf8')) as { id: string }
    expect(marker.id).toBe('web-tools')
    const ledger = JSON.parse(await readFile(join(layout.marketDir, 'installs.json'), 'utf8')) as { installs: Record<string, { kind: string }> }
    expect(ledger.installs['web-tools']).toMatchObject({ kind: 'skill', version: '1.0.0' })
  })

  it('writes base64 content as bytes', async () => {
    await installSkill(layout, 'blob', '1.0.0', { files: [{ path: 'a.bin', content: 'aGVsbG8=', encoding: 'base64' }] })
    expect(await readFile(join(layout.skillsDir, 'blob', 'a.bin'))).toEqual(Buffer.from('hello'))
  })

  it('replaces a previous market install but refuses a user-owned directory', async () => {
    await installSkill(layout, 'web-tools', '1.0.0', SKILL)
    await installSkill(layout, 'web-tools', '1.1.0', { files: [{ path: 'SKILL.md', content: 'v2' }] })
    expect(await readFile(join(layout.skillsDir, 'web-tools', 'SKILL.md'), 'utf8')).toBe('v2')

    await mkdir(join(layout.skillsDir, 'mine'), { recursive: true })
    await writeFile(join(layout.skillsDir, 'mine', 'SKILL.md'), 'user')
    await expect(installSkill(layout, 'mine', '1.0.0', SKILL)).rejects.toThrow('skill-dir')
    expect(await readFile(join(layout.skillsDir, 'mine', 'SKILL.md'), 'utf8')).toBe('user')
  })
})

describe('uninstallSkill', () => {
  it('removes a market install and its ledger entry; a user directory stays', async () => {
    await installSkill(layout, 'web-tools', '1.0.0', SKILL)
    expect(await uninstallSkill(layout, 'web-tools')).toBe(true)
    await expect(readFile(join(layout.skillsDir, 'web-tools', 'SKILL.md'), 'utf8')).rejects.toThrow()
    const ledger = JSON.parse(await readFile(join(layout.marketDir, 'installs.json'), 'utf8')) as { installs: Record<string, unknown> }
    expect(ledger.installs['web-tools']).toBeUndefined()

    await mkdir(join(layout.skillsDir, 'user-skill'), { recursive: true })
    expect(await uninstallSkill(layout, 'user-skill')).toBe(false)
  })
})

describe('mcpRowConfig', () => {
  it('maps stdio and http payloads to mcp-client rows', () => {
    expect(mcpRowConfig('srv', { transport: 'stdio', command: 'npx', args: ['a'], env: { K: 'v' } })).toEqual({
      transport: 'stdio', serverName: 'srv', command: 'npx', args: ['a'], env: { K: 'v' },
    })
    expect(mcpRowConfig('srv', { transport: 'stdio', command: 'npx' })).toEqual({
      transport: 'stdio', serverName: 'srv', command: 'npx',
    })
    expect(mcpRowConfig('srv', { transport: 'http', url: 'https://m.example' })).toEqual({
      transport: 'streamable-http', serverName: 'srv', url: 'https://m.example',
    })
    expect(mcpRowConfig('srv', { transport: 'http', url: 'https://m.example', headers: { A: 'b' } })).toEqual({
      transport: 'streamable-http', serverName: 'srv', url: 'https://m.example', headers: { A: 'b' },
    })
  })
})

describe('installMcp', () => {
  it('appends a market row to a missing or existing patch file', async () => {
    await installMcp(profile, 'notes', '1.0.0', { transport: 'http', url: 'https://m.example' }, layout)
    const text = await readFile(patchPath, 'utf8')
    expect(text).toContain('id: market-notes')
    expect(text).toContain('transport: streamable-http')
    expect(text).toContain('serverName: notes')
    expect(await marketPatchIds(patchPath)).toEqual(new Set(['notes']))
  })

  it('keeps an unrelated patch row and replaces its own row on reinstall', async () => {
    await writeFile(patchPath, `- id: user-row
  disabled: !!js 'true'
`, 'utf8')
    await installMcp(profile, 'notes', '1.0.0', { transport: 'http', url: 'https://a.example' }, layout)
    await installMcp(profile, 'notes', '2.0.0', { transport: 'stdio', command: 'npx', args: ['srv'] }, layout)
    const text = await readFile(patchPath, 'utf8')
    expect(text).toContain('id: user-row')
    expect(text).toContain('transport: stdio')
    expect(text).not.toContain('streamable-http')
    expect(await marketPatchIds(patchPath)).toEqual(new Set(['notes']))
  })

  it('rejects a malformed patch file', async () => {
    await writeFile(patchPath, 'not-a-seq:\n  x: 1\n', 'utf8')
    await expect(installMcp(profile, 'notes', '1.0.0', { transport: 'http', url: 'https://x' }, layout)).rejects.toThrow('sequence')
  })

  it('propagates read errors other than a missing file', async () => {
    const bad = { patchPath: root } as ProfileContext
    await expect(installMcp(bad, 'notes', '1.0.0', { transport: 'http', url: 'https://x' }, layout)).rejects.toThrow()
  })

  it('rejects a syntactically broken patch file', async () => {
    await writeFile(patchPath, 'a:\n  - b\n  c: 1\n', 'utf8')
    await expect(installMcp(profile, 'notes', '1.0.0', { transport: 'http', url: 'https://x' }, layout)).rejects.toThrow()
  })
})

describe('uninstallMcp', () => {
  it('skips non-insert items and keeps siblings when removing one row', async () => {
    await writeFile(patchPath, `- insert:
    - id: market-notes
    - id: keep
      disabled: !!js 'true'
- 5
- x: 1
- insert: 5
`, 'utf8')
    expect(await uninstallMcp(profile, 'notes', layout)).toBe(true)
    const text = await readFile(patchPath, 'utf8')
    expect(text).toContain('id: keep')
    expect(text).toContain('disabled: !!js')
    expect(text).not.toContain('market-notes')
  })

  it('removes the row and the emptied insert item', async () => {
    await installMcp(profile, 'notes', '1.0.0', { transport: 'http', url: 'https://m.example' }, layout)
    expect(await uninstallMcp(profile, 'notes', layout)).toBe(true)
    const text = await readFile(patchPath, 'utf8')
    expect(text).not.toContain('market-notes')
    expect(await uninstallMcp(profile, 'notes', layout)).toBe(false)
  })

  it('returns false without a patch file', async () => {
    expect(await uninstallMcp(profile, 'ghost', layout)).toBe(false)
  })

  it('returns false on a syntactically broken or non-sequence patch file', async () => {
    await writeFile(patchPath, 'a:\n  - b\n  c: 1\n', 'utf8')
    expect(await uninstallMcp(profile, 'notes', layout)).toBe(false)
    await writeFile(patchPath, 'a: 1\n', 'utf8')
    expect(await uninstallMcp(profile, 'notes', layout)).toBe(false)
  })
})

describe('marketPatchIds', () => {
  it('skips items that are not insert row lists', async () => {
    await writeFile(patchPath, `- 5
- x: 1
- insert: 5
- insert:
    - id: market-a
      disabled: !!js 'true'
    - id:
        - not-a-string
`, 'utf8')
    expect(await marketPatchIds(patchPath)).toEqual(new Set(['a']))
  })

  it('reads an empty set from a missing or non-sequence file', async () => {
    expect(await marketPatchIds(join(root, 'absent.yml'))).toEqual(new Set())
    await writeFile(patchPath, 'a: 1\n', 'utf8')
    expect(await marketPatchIds(patchPath)).toEqual(new Set())
  })
})

describe('listInstalled', () => {
  it('reconciles the ledger against existing artifacts and prunes stale entries', async () => {
    await installSkill(layout, 'web-tools', '1.0.0', SKILL)
    await installMcp(profile, 'notes', '1.0.0', { transport: 'http', url: 'https://m.example' }, layout)
    const installed = await listInstalled(layout, patchPath)
    expect(installed.map(entry => entry.id).sort()).toEqual(['notes', 'web-tools'])

    // The user deleted the skill directory by hand: the next read drops it.
    await rm(join(layout.skillsDir, 'web-tools'), { recursive: true })
    const after = await listInstalled(layout, patchPath)
    expect(after.map(entry => entry.id)).toEqual(['notes'])
  })

  it('tolerates a missing ledger and an absent patch path', async () => {
    expect(await listInstalled(layout, undefined)).toEqual([])
  })

  it('starts fresh when the stored ledger has another version', async () => {
    await writeFile(join(layout.marketDir, 'installs.json'),
      JSON.stringify({ version: 2, installs: { ghost: { kind: 'skill', version: '9', installedAt: 'x' } } }), 'utf8')
    await mkdir(join(layout.skillsDir, 'ghost'), { recursive: true })
    await writeFile(join(layout.skillsDir, 'ghost', '.fiwen-market.json'), JSON.stringify({ id: 'ghost', version: '9' }), 'utf8')
    expect(await listInstalled(layout, undefined)).toEqual([])
  })

  it('treats a malformed marker as a user-owned directory', async () => {
    await mkdir(join(layout.skillsDir, 'mine'), { recursive: true })
    await writeFile(join(layout.skillsDir, 'mine', '.fiwen-market.json'), '{"id": 5}', 'utf8')
    await expect(installSkill(layout, 'mine', '1.0.0', SKILL)).rejects.toThrow('skill-dir')
    expect(await uninstallSkill(layout, 'mine')).toBe(false)
  })

  it('still removes a skill whose ledger entry is already gone', async () => {
    await installSkill(layout, 'web-tools', '1.0.0', SKILL)
    await rm(join(layout.marketDir, 'installs.json'))
    expect(await uninstallSkill(layout, 'web-tools')).toBe(true)
  })

  it('tolerates a failed stale-entry prune', async () => {
    await installSkill(layout, 'web-tools', '1.0.0', SKILL)
    await rm(join(layout.skillsDir, 'web-tools'), { recursive: true })
    vi.mocked(writeFileAtomic).mockRejectedValueOnce(new Error('read-only'))
    expect(await listInstalled(layout, undefined)).toEqual([])
  })
})

describe('write failure cleanup', () => {
  it('removes the staging directory when a payload write fails', async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('disk full'))
    await expect(installSkill(layout, 'web-tools', '1.0.0', SKILL)).rejects.toThrow('disk full')
    const names = await readdir(layout.skillsDir)
    expect(names.filter(name => name.includes('.tmp'))).toEqual([])
    expect(names).not.toContain('web-tools')
  })

  it('still reports the original failure when staging cleanup also fails', async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('disk full'))
    vi.mocked(rm).mockRejectedValueOnce(new Error('locked'))
    await expect(installSkill(layout, 'web-tools', '1.0.0', SKILL)).rejects.toThrow('disk full')
  })
})

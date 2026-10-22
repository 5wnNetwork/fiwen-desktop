import { describe, expect, it } from 'vitest'
import {
  MarketWireError, parseCategories, parseDetail, parseInstall, parseList, safeSkillPath,
} from '../src/wire.ts'

const TEXT = { en: 'Title', vi: 'Tiêu đề', zh: '标题' }

function item(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'web-tools', kind: 'skill', categoryId: 'web', title: TEXT, summary: TEXT,
    icon: null, author: 'Fiwen', homepage: null, version: '1.0.0',
    downloads: 12, uniqueDownloads: 3, updatedAt: '2026-01-01T00:00:00Z', ...fields,
  }
}

describe('safeSkillPath', () => {
  it.each([
    ['SKILL.md', true],
    ['refs/guide.md', true],
    ['.hidden/file', true],
    ['a//b', false],
    ['', false],
    ['/abs/x', false],
    ['../x', false],
    ['a/../x', false],
    ['./x', false],
    ['a/./x', false],
    ['a\\b', false],
    ['C:/x', false],
    ['c:x', false],
    ['a/b\0c', false],
  ])('safeSkillPath(%j) === %j', (path, expected) => {
    expect(safeSkillPath(path)).toBe(expected)
  })
})

describe('parseList', () => {
  it('reads a page', () => {
    const parsed = parseList({ items: [item()], total: 7 })
    expect(parsed.total).toBe(7)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({ id: 'web-tools', kind: 'skill', downloads: 12 })
  })

  it.each([
    [{}, '$.items'],
    [{ items: 'x', total: 0 }, '$.items'],
    [{ items: [item({ id: 1 })], total: 0 }, '$.items[0].id'],
    [{ items: [item({ kind: 'nope' })], total: 0 }, '$.items[0].kind'],
    [{ items: [item({ title: { en: 'x' } })], total: 0 }, '$.items[0].title.vi'],
    [{ items: [item({ downloads: 'x' })], total: 0 }, '$.items[0].downloads'],
    [{ items: [], total: 'x' }, '$.total'],
    ['junk', '$'],
    [null, '$'],
  ])('rejects %j at %s', (body, path) => {
    try {
      parseList(body)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(MarketWireError)
      expect((error as MarketWireError).path).toBe(path)
    }
  })
})

describe('parseCategories', () => {
  it('reads the rail', () => {
    expect(parseCategories({ categories: [{ id: 'web', title: TEXT, sortOrder: 1 }] })[0]).toMatchObject({ id: 'web', sortOrder: 1 })
  })

  it.each([
    [{}, '$.categories'],
    [{ categories: [{ title: TEXT, sortOrder: 1 }] }, '$.categories[0].id'],
    [{ categories: [{ id: 'x', title: TEXT, sortOrder: 'a' }] }, '$.categories[0].sortOrder'],
  ])('rejects %j at %s', (body, path) => {
    expect(() => { parseCategories(body) }).toThrow(MarketWireError)
    try {
      parseCategories(body)
    } catch (error) {
      expect((error as MarketWireError).path).toBe(path)
    }
  })
})

describe('parseDetail', () => {
  it('reads description or its absence', () => {
    expect(parseDetail({ item: item({ description: TEXT }) }).description).toEqual(TEXT)
    expect(parseDetail({ item: item({ description: null }) }).description).toBeNull()
    expect(parseDetail({ item: item() }).description).toBeNull()
  })

  it('rejects a non-text description and a missing item', () => {
    expect(() => { parseDetail({ item: item({ description: 4 }) }) }).toThrow(MarketWireError)
    expect(() => { parseDetail({}) }).toThrow(MarketWireError)
  })
})

describe('parseInstall', () => {
  const skill = (files: unknown[] = [{ path: 'SKILL.md', content: '# ok' }]) => ({
    item: { id: 'web-tools', kind: 'skill', version: '1.2.0', name: 'Web Tools', payload: { files } },
  })
  const mcp = (payload: Record<string, unknown>) => ({
    item: { id: 'notes-mcp', kind: 'mcp', version: '2.0.0', name: 'Notes', payload },
  })

  it('reads a skill payload verbatim', () => {
    const parsed = parseInstall(skill([{ path: 'SKILL.md', content: 'a', encoding: 'base64' }, { path: 'x/y.md', content: 'b' }]))
    expect(parsed).toMatchObject({ id: 'web-tools', kind: 'skill', version: '1.2.0' })
    expect(parsed.payload).toEqual({
      files: [{ path: 'SKILL.md', content: 'a', encoding: 'base64' }, { path: 'x/y.md', content: 'b' }],
    })
  })

  it('defaults encoding absent', () => {
    const parsed = parseInstall(skill())
    expect(parsed.payload).toEqual({ files: [{ path: 'SKILL.md', content: '# ok' }] })
  })

  it('reads both MCP transports', () => {
    const stdio = parseInstall(mcp({ transport: 'stdio', command: 'npx', args: ['-y', 'srv'], env: { A: '1' } }))
    expect(stdio.payload).toEqual({ transport: 'stdio', command: 'npx', args: ['-y', 'srv'], env: { A: '1' } })
    const http = parseInstall(mcp({ transport: 'http', url: 'https://m.example/mcp', headers: { X: 'y' } }))
    expect(http.payload).toEqual({ transport: 'http', url: 'https://m.example/mcp', headers: { X: 'y' } })
    const bare = parseInstall(mcp({ transport: 'stdio', command: 'srv' }))
    expect(bare.payload).toEqual({ transport: 'stdio', command: 'srv' })
  })

  it.each([
    [skill([]), '$.item.payload.files'],
    [skill([{ path: '../x', content: 'a' }]), '$.item.payload.files[0].path'],
    [skill([{ path: 'C:/x', content: 'a' }]), '$.item.payload.files[0].path'],
    [skill([{ path: 'a', content: 3 }]), '$.item.payload.files[0].content'],
    [skill([{ path: 'a', content: 'x', encoding: 'hex' }]), '$.item.payload.files[0].encoding'],
    [mcp({ transport: 'sse', url: 'x' }), '$.item.payload.transport'],
    [mcp({ transport: 'stdio', args: [1] }), '$.item.payload.args'],
    [mcp({ transport: 'stdio', command: 'c', env: { A: 1 } }), '$.item.payload.env.A'],
    [mcp({ transport: 'http' }), '$.item.payload.url'],
    [mcp({ transport: 'http', url: 'x', headers: 'y' }), '$.item.payload.headers'],
    [{ item: { id: 'Bad Id', kind: 'mcp', version: '1', name: 'n', payload: { transport: 'http', url: 'x' } } }, '$.item.id'],
    [{ item: { id: 'x', kind: 'mcp' } }, '$.item.version'],
    [{ item: { id: 'x', kind: 'skill', version: '1', name: 'n', payload: { files: 'x' } } }, '$.item.payload.files'],
  ])('rejects %j at %s', (body, path) => {
    try {
      parseInstall(body)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(MarketWireError)
      expect((error as MarketWireError).path).toBe(path)
    }
  })

  it('rejects oversized file lists and content', () => {
    const many = Array.from({ length: 201 }, (_unused, index) => ({ path: `f${String(index)}`, content: 'x' }))
    expect(() => { parseInstall(skill(many)) }).toThrow(MarketWireError)
    const big = 'x'.repeat(1024 * 1024 + 1)
    expect(() => { parseInstall(skill([{ path: 'a', content: big }])) }).toThrow(MarketWireError)
  })
})

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import Market from '../src/index.ts'

const ORIGIN = 'http://market.test'
const TEXT = { en: 'Web Tools', vi: 'Web', zh: '网络工具' }

const ITEM = {
  id: 'web-tools', kind: 'skill', categoryId: 'web', title: TEXT, summary: TEXT,
  icon: null, author: 'Fiwen', homepage: null, version: '1.0.0',
  downloads: 4, uniqueDownloads: 2, updatedAt: '2026-01-01T00:00:00Z',
}

let root: string | undefined

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function mount(options: { token?: string; profile?: boolean } = {}) {
  root = await mkdtemp(join(tmpdir(), 'dsh-market-service-'))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  if (options.token !== undefined || options.profile !== false) {
    const token = options.token
    class Account extends Service {
      constructor(inner: Context) { super(inner, 'deepseekAccount') }
      resolveToken(url: string) { return Promise.resolve(url === ORIGIN ? token : undefined) }
    }
    await ctx.plugin(Account)
  }
  if (options.profile !== false) {
    const profile = { patchPath: join(root, 'cordis.patch.yml') } as ProfileContext
    ctx.provide('profileContext', profile)
  }
  await ctx.plugin(Market, {
    origin: ORIGIN, skillsDir: join(root, 'skills'), marketDir: join(root, 'market'),
  })
  return { ctx, market: ctx.market }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function serve(...responses: (Response | Error | ((url: string, init: RequestInit) => Promise<Response> | Response))[]) {
  const fetch = vi.fn((url: string, init: RequestInit) => {
    const next = responses.shift()
    if (next === undefined) throw new Error(`unexpected fetch ${url}`)
    if (next instanceof Error) return Promise.reject(next)
    if (typeof next === 'function') return Promise.resolve(next(url, init))
    return Promise.resolve(next)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function previewOf(market: Market, id: string) {
  const preview = await market.previewInstall(id)
  return preview
}

async function failure(promise: Promise<unknown>) {
  return remoteErrorOf(await promise.then(() => { throw new Error('resolved') }, (error: unknown) => error))
}

it('lists a catalog page with filters and the category rail, attaching the account token', async () => {
  const { market } = await mount({ token: 'tok' })
  const fetch = serve(
    (url, init) => {
      expect(url).toBe(`${ORIGIN}/v1/market/items?kind=skill&category=web&q=pdf&sort=popular&limit=5&offset=10`)
      expect(new Headers(init.headers).get('x-dsh-auth-token')).toBe('tok')
      return json({ items: [ITEM], total: 41 })
    },
    () => json({ categories: [{ id: 'web', title: TEXT, sortOrder: 1 }] }),
  )
  const page = await market.catalog({ kind: 'skill', category: 'web', q: 'pdf', sort: 'popular', limit: 5, offset: 10 })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(page).toMatchObject({ total: 41, offset: 10 })
  expect(page.items[0]).toMatchObject({ id: 'web-tools' })
  expect(page.categories[0]).toMatchObject({ id: 'web' })
})

it('defaults limit and offset and omits empty filters', async () => {
  const { market } = await mount()
  serve(
    (url) => {
      expect(url).toBe(`${ORIGIN}/v1/market/items?limit=50&offset=0`)
      return json({ items: [], total: 0 })
    },
    () => json({ categories: [] }),
  )
  const page = await market.catalog({})
  expect(page.items).toEqual([])
})

it('maps catalog failures to RemoteError codes', async () => {
  const { market } = await mount()
  serve(() => json({ items: 'junk' }), () => json({ categories: [] }))
  await expect(failure(market.catalog({}))).resolves.toMatchObject({ code: 'market/invalid-response' })
  serve(new TypeError('fetch failed'), () => json({ categories: [] }))
  await expect(failure(market.catalog({}))).resolves.toMatchObject({ code: 'market/fetch-failed' })
  serve(() => json({}, 500), () => json({ categories: [] }))
  await expect(failure(market.catalog({}))).resolves.toMatchObject({ code: 'market/fetch-failed' })
})

it('reads a detail and refuses bad slugs and missing items', async () => {
  const { market } = await mount()
  serve(() => json({ item: { ...ITEM, description: TEXT } }))
  expect(await market.detail('web-tools')).toMatchObject({ id: 'web-tools' })
  await expect(failure(market.detail('Nope'))).resolves.toMatchObject({ code: 'market/not-found' })
  serve(() => json({}, 404))
  await expect(failure(market.detail('gone'))).resolves.toMatchObject({ code: 'market/not-found' })
  serve(() => json({ item: { id: 'x' } }))
  await expect(failure(market.detail('x'))).resolves.toMatchObject({ code: 'market/invalid-response' })
})

it('installs a skill payload and announces market/changed', async () => {
  const { ctx, market } = await mount()
  let changes = 0
  ctx.on('market/changed', () => { changes++ })
  const fetch = serve(() => json({
    item: {
      id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'Web Tools',
      payload: { files: [{ path: 'SKILL.md', content: '# hi' }] },
    },
  }))
  const preview = await previewOf(market, 'web-tools')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(preview).toMatchObject({ id: 'web-tools', kind: 'skill', version: '1.0.0', skillFiles: ['SKILL.md'] })
  await expect(access(join(root as string, 'skills', 'web-tools'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(changes).toBe(0)
  const installed = await market.installItem(preview.token)
  expect(installed).toMatchObject({ id: 'web-tools', kind: 'skill' })
  expect(changes).toBe(1)
  expect(await readFile(join(root as string, 'skills', 'web-tools', 'SKILL.md'), 'utf8')).toBe('# hi')
  expect(await market.installed()).toEqual([installed])
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('installs an MCP payload as a profile patch row', async () => {
  const { market } = await mount()
  serve(() => json({
    item: {
      id: 'notes', kind: 'mcp', version: '2.0.0', name: 'Notes',
      payload: { transport: 'http', url: 'https://m.example/mcp' },
    },
  }))
  const installed = await market.installItem((await previewOf(market, 'notes')).token)
  expect(installed.kind).toBe('mcp')
  const patch = await readFile(join(root as string, 'cordis.patch.yml'), 'utf8')
  expect(patch).toContain('id: market-notes')
  expect(patch).toContain('serverName: notes')
})

it('refuses installs without a token and reports conflicts and profile absence', async () => {
  const { market } = await mount()
  serve(() => json({}, 401))
  await expect(failure(market.previewInstall('x'))).resolves.toMatchObject({ code: 'market/auth-required' })
})

it('refuses to replace a user-owned skill directory', async () => {
  const { market } = await mount()
  await mkdir(join(root as string, 'skills', 'mine'), { recursive: true })
  await writeFile(join(root as string, 'skills', 'mine', 'SKILL.md'), 'user', 'utf8')
  serve(() => json({
    item: { id: 'mine', kind: 'skill', version: '1.0.0', name: 'M', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  const preview = await previewOf(market, 'mine')
  await expect(failure(market.installItem(preview.token))).resolves.toMatchObject({ code: 'market/conflict', details: { reason: 'skill-dir' } })
  expect(await readFile(join(root as string, 'skills', 'mine', 'SKILL.md'), 'utf8')).toBe('user')
})

it('refuses MCP installs without a profile', async () => {
  const { market } = await mount({ profile: false })
  serve(() => json({
    item: { id: 'notes', kind: 'mcp', version: '1.0.0', name: 'N', payload: { transport: 'http', url: 'https://x' } },
  }))
  const preview = await previewOf(market, 'notes')
  await expect(failure(market.installItem(preview.token))).resolves.toMatchObject({ code: 'market/no-profile' })
})

it('refuses a malformed install payload', async () => {
  const { market } = await mount()
  serve(() => json({ item: { id: 'x', kind: 'skill', version: '1', name: 'x', payload: { files: [{ path: '../a', content: 'b' }] } } }))
  await expect(failure(market.previewInstall('x'))).resolves.toMatchObject({ code: 'market/invalid-response' })
})

it('uninstalls what it installed and reports false for foreign artifacts', async () => {
  const { ctx, market } = await mount()
  let changes = 0
  ctx.on('market/changed', () => { changes++ })
  serve(() => json({
    item: { id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'W', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  await market.installItem((await previewOf(market, 'web-tools')).token)
  expect(await market.uninstallItem('web-tools')).toBe(true)
  expect(changes).toBe(2)
  expect(await market.uninstallItem('web-tools')).toBe(false)
  expect(await market.installed()).toEqual([])
  expect(await market.uninstallItem('not-a-slug-!')).toBe(false)
})

it('reports invalid-response when the body is not JSON', async () => {
  const { market } = await mount()
  serve(() => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    () => json({ categories: [] }))
  await expect(failure(market.catalog({}))).resolves.toMatchObject({ code: 'market/invalid-response' })
})

it('refuses malformed install ids and propagates unexpected filesystem failures', async () => {
  const { market } = await mount()
  await expect(failure(market.previewInstall('Bad Id'))).resolves.toMatchObject({ code: 'market/not-found' })
  serve(() => json({
    item: { id: 'x', kind: 'skill', version: '1', name: 'X', payload: { files: [{ path: 'a', content: 'b' }] } },
  }))
  const preview = await previewOf(market, 'x')
  await rm(join(root as string, 'skills'), { recursive: true, force: true })
  await writeFile(join(root as string, 'skills'), 'not a dir', 'utf8')
  await expect(market.installItem(preview.token)).rejects.toThrow()
})

it('reports profile-unavailable when the patch file cannot be written', async () => {
  const { ctx, market } = await mount({ profile: false })
  const blocker = join(root as string, 'blocked')
  await writeFile(blocker, 'file', 'utf8')
  ctx.provide('profileContext', { patchPath: join(blocker, 'cordis.patch.yml') } as ProfileContext)
  serve(() => json({
    item: { id: 'notes', kind: 'mcp', version: '1.0.0', name: 'N', payload: { transport: 'http', url: 'https://x' } },
  }))
  const preview = await previewOf(market, 'notes')
  await expect(failure(market.installItem(preview.token))).resolves.toMatchObject({ code: 'market/profile-unavailable' })
})

it('reports false uninstalling an MCP row without a profile', async () => {
  const { market } = await mount({ profile: false })
  expect(await market.uninstallItem('notes')).toBe(false)
})

it('previews stdio MCP args in full but env keys only', async () => {
  const { market } = await mount()
  serve(() => json({
    item: {
      id: 'mcp-cmd', kind: 'mcp', version: '1.0.0', name: 'Cmd',
      payload: { transport: 'stdio', command: 'node', args: ['server.js', '--path', 'a b'], env: { API_TOKEN: 'secret-env' } },
    },
  }))
  const preview = await previewOf(market, 'mcp-cmd')
  expect(preview.mcp).toEqual({ transport: 'stdio', command: 'node', args: ['server.js', '--path', 'a b'], envKeys: ['API_TOKEN'] })
  expect(JSON.stringify(preview)).not.toContain('secret-env')
})

it('previews http MCP header keys only', async () => {
  const { market } = await mount()
  serve(() => json({
    item: {
      id: 'mcp-http', kind: 'mcp', version: '1.0.0', name: 'H',
      payload: { transport: 'http', url: 'https://h.example/mcp', headers: { Authorization: 'secret-header' } },
    },
  }))
  const preview = await previewOf(market, 'mcp-http')
  expect(preview.mcp).toEqual({ transport: 'http', url: 'https://h.example/mcp', headerKeys: ['Authorization'] })
  expect(JSON.stringify(preview)).not.toContain('secret-header')
})

it('previews skill file paths but never file contents', async () => {
  const { market } = await mount()
  serve(() => json({
    item: {
      id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'W',
      payload: { files: [{ path: 'SKILL.md', content: 'secret-body' }] },
    },
  }))
  const preview = await previewOf(market, 'web-tools')
  expect(preview.skillFiles).toEqual(['SKILL.md'])
  expect(JSON.stringify(preview)).not.toContain('secret-body')
})

it('bounds the preview map and evicts the oldest unconfirmed preview', async () => {
  const { market } = await mount()
  const ids = Array.from({ length: 33 }, (_unused, index) => `item-${String(index)}`)
  serve(...ids.map(id => json({
    item: { id, kind: 'skill', version: '1.0.0', name: id, payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  })))
  const previews: { token: string }[] = []
  for (const id of ids) previews.push(await previewOf(market, id))
  await expect(failure(market.installItem(previews[0]!.token))).resolves.toMatchObject({ code: 'market/preview-expired' })
  await expect(market.installItem(previews[1]!.token)).resolves.toMatchObject({ id: ids[1] })
})

it('rejects unknown, slugs as, and replayed tokens', async () => {
  const { market } = await mount()
  await expect(failure(market.installItem('web-tools'))).resolves.toMatchObject({ code: 'market/preview-expired' })
  await expect(failure(market.installItem('00000000000000000000000000000000'))).resolves.toMatchObject({ code: 'market/preview-expired' })
  serve(() => json({
    item: { id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'W', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  const preview = await previewOf(market, 'web-tools')
  await market.installItem(preview.token)
  await expect(failure(market.installItem(preview.token))).resolves.toMatchObject({ code: 'market/preview-expired' })
})

it('expires preview tokens at ten minutes', async () => {
  const { market } = await mount()
  const base = 1_800_000_000_000
  const now = vi.spyOn(Date, 'now').mockReturnValue(base)
  serve(() => json({
    item: { id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'W', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  const preview = await previewOf(market, 'web-tools')
  now.mockReturnValue(base + 10 * 60_000 - 1)
  await market.installItem(preview.token)
  now.mockReturnValue(base)
  serve(() => json({
    item: { id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'W', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  const expired = await previewOf(market, 'web-tools')
  now.mockReturnValue(base + 10 * 60_000)
  await expect(failure(market.installItem(expired.token))).resolves.toMatchObject({ code: 'market/preview-expired' })
})

it('rejects a preview whose payload id differs from the requested slug', async () => {
  const { market } = await mount()
  serve(() => json({
    item: { id: 'other', kind: 'skill', version: '1.0.0', name: 'W', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  await expect(failure(market.previewInstall('web-tools'))).resolves.toMatchObject({ code: 'market/invalid-response' })
})

it('installs the cached payload even when the returned preview is mutated', async () => {
  const { market } = await mount()
  serve(() => json({
    item: {
      id: 'mcp-cmd', kind: 'mcp', version: '1.0.0', name: 'Cmd',
      payload: { transport: 'stdio', command: 'node', args: ['server.js', '--path', 'a b'] },
    },
  }))
  const preview = await previewOf(market, 'mcp-cmd')
  if (preview.mcp?.transport !== 'stdio') throw new Error('expected stdio preview')
  ;(preview.mcp.args as string[]).push('--evil')
  await market.installItem(preview.token)
  const patch = await readFile(join(root as string, 'cordis.patch.yml'), 'utf8')
  expect(patch).toContain('a b')
  expect(patch).not.toContain('evil')
})

it('rejects a preview completing after the service is disposed', async () => {
  const { ctx, market } = await mount()
  let resolveFetch: (response: Response) => void = () => {}
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => { resolveFetch = res })))
  const pending = market.previewInstall('web-tools')
  await ctx.fiber.dispose()
  resolveFetch(json({
    item: { id: 'web-tools', kind: 'skill', version: '1', name: 'W', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  await expect(failure(pending)).resolves.toMatchObject({ code: 'market/preview-expired' })
})

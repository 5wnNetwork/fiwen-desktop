import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  serve(() => json({
    item: {
      id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'Web Tools',
      payload: { files: [{ path: 'SKILL.md', content: '# hi' }] },
    },
  }))
  const installed = await market.installItem('web-tools')
  expect(installed).toMatchObject({ id: 'web-tools', kind: 'skill' })
  expect(changes).toBe(1)
  expect(await readFile(join(root as string, 'skills', 'web-tools', 'SKILL.md'), 'utf8')).toBe('# hi')
  expect(await market.installed()).toEqual([installed])
})

it('installs an MCP payload as a profile patch row', async () => {
  const { market } = await mount()
  serve(() => json({
    item: {
      id: 'notes', kind: 'mcp', version: '2.0.0', name: 'Notes',
      payload: { transport: 'http', url: 'https://m.example/mcp' },
    },
  }))
  const installed = await market.installItem('notes')
  expect(installed.kind).toBe('mcp')
  const patch = await readFile(join(root as string, 'cordis.patch.yml'), 'utf8')
  expect(patch).toContain('id: market-notes')
  expect(patch).toContain('serverName: notes')
})

it('refuses installs without a token and reports conflicts and profile absence', async () => {
  const { market } = await mount({ token: undefined })
  serve(() => json({}, 401))
  await expect(failure(market.installItem('x'))).resolves.toMatchObject({ code: 'market/auth-required' })
})

it('refuses to replace a user-owned skill directory', async () => {
  const { market } = await mount()
  await mkdir(join(root as string, 'skills', 'mine'), { recursive: true })
  await writeFile(join(root as string, 'skills', 'mine', 'SKILL.md'), 'user', 'utf8')
  serve(() => json({
    item: { id: 'mine', kind: 'skill', version: '1.0.0', name: 'M', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  await expect(failure(market.installItem('mine'))).resolves.toMatchObject({ code: 'market/conflict', details: { reason: 'skill-dir' } })
  expect(await readFile(join(root as string, 'skills', 'mine', 'SKILL.md'), 'utf8')).toBe('user')
})

it('refuses MCP installs without a profile', async () => {
  const { market } = await mount({ profile: false })
  serve(() => json({
    item: { id: 'notes', kind: 'mcp', version: '1.0.0', name: 'N', payload: { transport: 'http', url: 'https://x' } },
  }))
  await expect(failure(market.installItem('notes'))).resolves.toMatchObject({ code: 'market/no-profile' })
})

it('refuses a malformed install payload', async () => {
  const { market } = await mount()
  serve(() => json({ item: { id: 'x', kind: 'skill', version: '1', name: 'x', payload: { files: [{ path: '../a', content: 'b' }] } } }))
  await expect(failure(market.installItem('x'))).resolves.toMatchObject({ code: 'market/invalid-response' })
})

it('uninstalls what it installed and reports false for foreign artifacts', async () => {
  const { ctx, market } = await mount()
  let changes = 0
  ctx.on('market/changed', () => { changes++ })
  serve(() => json({
    item: { id: 'web-tools', kind: 'skill', version: '1.0.0', name: 'W', payload: { files: [{ path: 'SKILL.md', content: 'x' }] } },
  }))
  await market.installItem('web-tools')
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
  await expect(failure(market.installItem('Bad Id'))).resolves.toMatchObject({ code: 'market/not-found' })
  serve(() => json({
    item: { id: 'x', kind: 'skill', version: '1', name: 'X', payload: { files: [{ path: 'a', content: 'b' }] } },
  }))
  await rm(join(root as string, 'skills'), { recursive: true, force: true })
  await writeFile(join(root as string, 'skills'), 'not a dir', 'utf8')
  await expect(market.installItem('x')).rejects.toThrow()
})

it('reports profile-unavailable when the patch file cannot be written', async () => {
  const { ctx, market } = await mount({ profile: false })
  const blocker = join(root as string, 'blocked')
  await writeFile(blocker, 'file', 'utf8')
  ctx.provide('profileContext', { patchPath: join(blocker, 'cordis.patch.yml') } as ProfileContext)
  serve(() => json({
    item: { id: 'notes', kind: 'mcp', version: '1.0.0', name: 'N', payload: { transport: 'http', url: 'https://x' } },
  }))
  await expect(failure(market.installItem('notes'))).resolves.toMatchObject({ code: 'market/profile-unavailable' })
})

it('reports false uninstalling an MCP row without a profile', async () => {
  const { market } = await mount({ profile: false })
  expect(await market.uninstallItem('notes')).toBe(false)
})

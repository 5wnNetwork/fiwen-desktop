import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { MarketCatalogResult, MarketInstalledView, MarketItemDetail, MarketItemView, MarketSearchQuery } from '@deepseek-ai/dsh-api-remotes/client'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { MarketController, PAGE_SIZE } from '../src/client/market-store.ts'

function item(id: string, fields: Partial<MarketItemView> = {}): MarketItemView {
  return {
    id, kind: 'skill', categoryId: 'tools', title: { en: id }, summary: { en: `${id} summary` },
    icon: null, author: null, homepage: null, version: '1.0.0', downloads: 1, uniqueDownloads: 1,
    updatedAt: '2026-01-01T00:00:00Z', ...fields,
  }
}

function page(items: MarketItemView[], total = items.length) {
  return { items, total, offset: 0, categories: [{ id: 'tools', title: { en: 'Tools' }, sortOrder: 0 }] }
}

type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RemoteError<never> }
const ok = <T>(value: T): Promise<Answer<T>> => Promise.resolve({ ok: true, value })
const fail = (code: string): Promise<Answer<never>> =>
  Promise.resolve({ ok: false, error: new RemoteError(code as never, 'x', {} as never) })

function setup() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('locale', new LocaleRuntime(ctx))
  const market = {
    catalog: vi.fn((_query: MarketSearchQuery): Promise<Answer<MarketCatalogResult>> => ok(page([item('a')]))),
    detail: vi.fn((id: string): Promise<Answer<MarketItemDetail>> => ok({ ...item(id), description: { en: 'about' } })),
    installItem: vi.fn((id: string): Promise<Answer<MarketInstalledView>> => ok({ id, kind: 'skill', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z' })),
    uninstallItem: vi.fn((_id: string): Promise<Answer<boolean>> => ok(true)),
    installed: vi.fn((): Promise<Answer<MarketInstalledView[]>> => ok([])),
  }
  new TestRemote(ctx, { market })
  const controller = new MarketController(ctx)
  const face = controller.face(text => typeof text === 'string' ? text : text.en)
  return { controller, face, market, snapshot: () => controller.store.getSnapshot() }
}

describe('MarketController', () => {
  it('loads the popular first page on ensure and refreshes the installed set', async () => {
    const { face, market, snapshot } = setup()
    expect(snapshot().status).toBe('idle')
    face.ensure()
    expect(snapshot().status).toBe('loading')
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    expect(market.catalog).toHaveBeenCalledWith({ sort: 'popular', limit: PAGE_SIZE, offset: 0 })
    expect(snapshot().items.map(entry => entry.id)).toEqual(['a'])
    expect(snapshot().categories).toEqual([{ id: 'tools', title: { en: 'Tools' }, sortOrder: 0 }])
    expect(market.installed).toHaveBeenCalledOnce()
    face.ensure()
    expect(market.catalog).toHaveBeenCalledOnce()
  })

  it('replaces the page on a new query and appends on more', async () => {
    const { face, market, snapshot } = setup()
    market.catalog.mockImplementation((query: MarketSearchQuery) =>
      ok(page(query.offset === 0 ? [item('a')] : [item('b')], 2)))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    face.search({ sort: 'newest', category: 'tools', q: 'doc' })
    await vi.waitFor(() => { expect(snapshot().answered).toMatchObject({ sort: 'newest', q: 'doc' }) })
    expect(market.catalog).toHaveBeenLastCalledWith({ sort: 'newest', category: 'tools', q: 'doc', limit: PAGE_SIZE, offset: 0 })
    face.more()
    await vi.waitFor(() => { expect(snapshot().items.map(entry => entry.id)).toEqual(['a', 'b']) })
    expect(market.catalog).toHaveBeenLastCalledWith({ sort: 'newest', category: 'tools', q: 'doc', limit: PAGE_SIZE, offset: 1 })
    face.more()
    expect(snapshot().items).toHaveLength(2)
  })

  it('keeps the failure kind for the retry button and recovers', async () => {
    const { face, market, snapshot } = setup()
    market.catalog.mockImplementationOnce(() => fail('market/invalid-response'))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('error') })
    expect(snapshot().failure).toBe('invalid')
    face.retry()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    market.catalog.mockImplementationOnce(() => fail('market/fetch-failed'))
    face.refresh()
    await vi.waitFor(() => { expect(snapshot().failure).toBe('fetch') })
  })

  it('tracks install work, refreshes installed, and reports refusals by kind', async () => {
    const { face, market, snapshot } = setup()
    market.installed.mockImplementation(() => ok([{ id: 'a', kind: 'skill' as const, installedAt: '2026-01-01T00:00:00Z', version: '1.0.0' }]))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().installed.a?.id).toBe('a') })
    face.install('b')
    expect(snapshot().busy.b).toBe('install')
    await vi.waitFor(() => { expect(snapshot().busy.b).toBeUndefined() })
    expect(market.installItem).toHaveBeenCalledWith('b')
    market.installItem.mockImplementationOnce(() => fail('market/conflict'))
    face.install('c')
    await vi.waitFor(() => { expect(snapshot().workFailure).toMatchObject({ id: 'c', work: 'install', kind: 'conflict' }) })
    market.installItem.mockImplementationOnce(() => fail('market/auth-required'))
    face.install('d')
    await vi.waitFor(() => { expect(snapshot().workFailure).toMatchObject({ kind: 'auth' }) })
    market.installItem.mockImplementationOnce(() => fail('market/no-profile'))
    face.install('e')
    await vi.waitFor(() => { expect(snapshot().workFailure).toMatchObject({ kind: 'no-profile' }) })
    market.installItem.mockImplementationOnce(() => fail('market/profile-unavailable'))
    face.install('f')
    await vi.waitFor(() => { expect(snapshot().workFailure).toMatchObject({ kind: 'no-profile' }) })
    market.installItem.mockImplementationOnce(() => fail('market/fetch-failed'))
    face.install('g')
    await vi.waitFor(() => { expect(snapshot().workFailure).toMatchObject({ kind: 'other' }) })
  })

  it('uninstalls tracked items and re-reads the set on changed()', async () => {
    const { controller, face, market, snapshot } = setup()
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    face.uninstall('a')
    await vi.waitFor(() => { expect(market.uninstallItem).toHaveBeenCalledWith('a') })
    controller.changed()
    await vi.waitFor(() => { expect(market.installed.mock.calls.length).toBeGreaterThan(1) })
  })

  it('answers detail and hides remote refusals', async () => {
    const { face, market } = setup()
    await expect(face.detail('a')).resolves.toMatchObject({ id: 'a', description: { en: 'about' } })
    market.detail.mockImplementationOnce(() => fail('market/not-found'))
    await expect(face.detail('gone')).resolves.toBeNull()
  })

  it('stops publishing once disposed', async () => {
    const { controller, face, market, snapshot } = setup()
    controller.changed()
    expect(market.installed).not.toHaveBeenCalled()
    market.catalog.mockImplementation(() => new Promise<Answer<ReturnType<typeof page>>>(() => {}))
    face.ensure()
    controller.dispose()
    expect(snapshot().status).toBe('loading')
    const pending = Promise.withResolvers<Answer<MarketInstalledView>>()
    market.installItem.mockImplementation(() => pending.promise)
    face.install('a')
    controller.dispose()
    pending.resolve(ok({ id: 'a', kind: 'skill', version: '1', installedAt: 'x' }))
    await pending.promise
    expect(snapshot().busy.a).toBe('install')
  })

  it('ignores a stale catalog read once a newer query starts', async () => {
    const { face, market, snapshot } = setup()
    const first = Promise.withResolvers<Answer<ReturnType<typeof page>>>()
    market.catalog.mockImplementationOnce(() => first.promise)
    face.ensure()
    face.search({ sort: 'newest' })
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    first.resolve(ok(page([item('stale')])))
    await first.promise
    expect(snapshot().answered).toMatchObject({ sort: 'newest' })
    expect(snapshot().items.map(entry => entry.id)).toEqual(['a'])
  })

  it('ignores more() while loading and refresh() before the first answer', async () => {
    const { face, market, snapshot } = setup()
    const stalled = Promise.withResolvers<Answer<ReturnType<typeof page>>>()
    market.catalog.mockImplementationOnce(() => stalled.promise)
    face.ensure()
    face.more()
    stalled.resolve(ok(page([item('a')])))
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    expect(market.catalog).toHaveBeenCalledOnce()
    const { face: fresh, market: other } = setup()
    fresh.refresh()
    await vi.waitFor(() => { expect(other.catalog).toHaveBeenCalledWith({ sort: 'popular', limit: PAGE_SIZE, offset: 0 }) })
  })

  it('keeps the installed set when its refresh fails, and retry before failure is a no-op', async () => {
    const { face, market, snapshot } = setup()
    market.installed.mockImplementation(() => ok([{ id: 'a', kind: 'skill' as const, version: '1', installedAt: 'x' }]))
    face.ensure()
    await vi.waitFor(() => { expect(snapshot().installed.a).toBeTruthy() })
    market.installed.mockImplementation(() => fail('market/fetch-failed'))
    face.refresh()
    await vi.waitFor(() => { expect(snapshot().status).toBe('ready') })
    expect(snapshot().installed.a).toBeTruthy()
    face.retry()
    expect(market.catalog).toHaveBeenCalledTimes(2)
    face.install('a')
    face.install('a')
    await vi.waitFor(() => { expect(market.installItem).toHaveBeenCalledTimes(1) })
  })
})

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketItemDetail, MarketItemView } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import { MarketSection, type MarketSectionProps } from '../src/client/MarketSection.tsx'
import type { MarketState } from '../src/client/market-store.ts'
import { en, zh, type MarketLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

function translator(dictionary: Record<MarketLocaleKey, string>): MarketSectionProps['t'] {
  return ((key: MarketLocaleKey, params?: Record<string, string>): string =>
    Object.entries(params ?? {}).reduce<string>((text, [name, value]) => text.replaceAll(`{${name}}`, value), dictionary[key])) as MarketSectionProps['t']
}

function item(id: string, fields: Partial<MarketItemView> = {}): MarketItemView {
  return {
    id, kind: 'skill', categoryId: 'tools', title: { en: id }, summary: { en: `${id} summary` },
    icon: null, author: null, homepage: null, version: '1.0.0', downloads: 7, uniqueDownloads: 3,
    updatedAt: '2026-01-01T00:00:00Z', ...fields,
  }
}

const READY: MarketState = {
  status: 'ready', query: { sort: 'popular' }, answered: { sort: 'popular' },
  categories: [{ id: 'tools', title: { en: 'Tools', zh: '工具' }, sortOrder: 0 }],
  items: [item('alpha'), item('beta', { kind: 'mcp' })], total: 2, failure: null,
  installed: {}, busy: {}, workFailure: null,
}

function renderTab(state: Partial<MarketState> = {}, dictionary: Record<MarketLocaleKey, string> = en) {
  const store = createSnapshotStore<MarketState>({ ...READY, ...state })
  const language = dictionary === en ? 'en' : 'zh'
  const locale = createSnapshotStore<LocaleSnapshot>({ active: language, locales: [], revision: 0 })
  const actions = {
    ensure: vi.fn(), search: vi.fn(), more: vi.fn(), refresh: vi.fn(), retry: vi.fn(),
    install: vi.fn(), uninstall: vi.fn(), detail: vi.fn(() => Promise.resolve(null)),
  }
  const props = {
    t: translator(dictionary), ...actions,
    resolveText: (text: string | Record<string, string>) => typeof text === 'string' ? text : text[language] ?? text.en,
    useMarket: bindSnapshotSelector(store),
    useLocale: bindSnapshotSelector(locale),
  } as MarketSectionProps
  render(<MarketSection {...props} />)
  const set = (next: Partial<MarketState>): void => { act(() => { store.set({ ...store.getSnapshot(), ...next }) }) }
  return { actions, set }
}

describe('MarketSection', () => {
  it('shows the skeleton until the catalog answers, then the retry on failure', () => {
    const { actions, set } = renderTab({ status: 'loading', items: [] })
    expect(actions.ensure).toHaveBeenCalledOnce()
    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
    set({ status: 'error', failure: 'fetch' })
    expect(screen.getByRole('alert').textContent).toContain(en.readFailed)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(actions.retry).toHaveBeenCalledOnce()
  })

  it('lists items with kind tags, localized titles, and download counts', () => {
    renderTab()
    const alpha = screen.getByRole('button', { name: en.openItem.replace('{name}', 'alpha') })
    expect(within(alpha.closest('li')!).getByText('alpha summary')).toBeTruthy()
    expect(within(alpha.closest('li')!).getByText(en.kindSkill)).toBeTruthy()
    expect(screen.getByText(en.kindMcp)).toBeTruthy()
    renderTab({}, zh)
    expect(within(document.body).getByText(zh.kindSkill)).toBeTruthy()
  })

  it('installs items, marks installed ones, and uninstalls them', () => {
    const { actions, set } = renderTab()
    fireEvent.click(screen.getByRole('button', { name: en.installTitle.replace('{name}', 'alpha') }))
    expect(actions.install).toHaveBeenCalledWith('alpha')
    set({ installed: { alpha: { id: 'alpha', kind: 'skill', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z' } } })
    fireEvent.click(screen.getByRole('button', { name: en.uninstallTitle.replace('{name}', 'alpha') }))
    expect(actions.uninstall).toHaveBeenCalledWith('alpha')
    set({ busy: { beta: 'install' } })
    expect(screen.getByText(en.installing)).toBeTruthy()
  })

  it('sends kind, sort, and category choices through search', () => {
    const { actions, set } = renderTab()
    const menus = document.querySelectorAll('button[aria-haspopup="menu"]')
    fireEvent.click(menus[0] as HTMLElement)
    fireEvent.click(screen.getByRole('menuitem', { name: en.kindMcp }))
    expect(actions.search).toHaveBeenLastCalledWith({ sort: 'popular', kind: 'mcp' })
    set({ query: { sort: 'popular', kind: 'mcp' } })
    fireEvent.click(menus[1] as HTMLElement)
    fireEvent.click(screen.getByRole('menuitem', { name: en.sortNewest }))
    expect(actions.search).toHaveBeenLastCalledWith({ sort: 'newest', kind: 'mcp' })
    set({ query: { sort: 'newest', kind: 'mcp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    expect(actions.search).toHaveBeenLastCalledWith({ sort: 'newest', kind: 'mcp', category: 'tools' })
  })

  it('opens the detail page and returns to the list', async () => {
    const detail: MarketItemDetail = { ...item('alpha'), description: { en: 'long text' }, author: 'Jane' }
    const { actions } = renderTab()
    actions.detail.mockImplementation(() => Promise.resolve(detail))
    fireEvent.click(screen.getByRole('button', { name: en.openItem.replace('{name}', 'alpha') }))
    expect(actions.detail).toHaveBeenCalledWith('alpha')
    await vi.waitFor(() => { expect(screen.getByText('long text')).toBeTruthy() })
    expect(screen.getByText(en.factAuthor)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.backToList }))
    expect(screen.getByText('alpha summary')).toBeTruthy()
  })

  it('shows the work failure and the empty catalog states', () => {
    const { set } = renderTab({ items: [], categories: [], total: 0 })
    expect(screen.getByText(en.emptyCatalog)).toBeTruthy()
    set({ items: [item('alpha')], workFailure: { id: 'alpha', work: 'install', kind: 'conflict' } })
    expect(screen.getByRole('alert').textContent).toContain(en.conflictSkill)
    set({ workFailure: { id: 'ghost', work: 'install', kind: 'other' } })
    expect(screen.getByRole('alert').textContent).toContain(en.installFailed.replace(' {name}', ''))
    set({ items: [], workFailure: null, answered: { sort: 'popular', q: 'zzz' } })
    expect(screen.getByText(en.noMatches)).toBeTruthy()
  })

  it('debounces the search text into queries, and clears it back', async () => {
    const { actions, set } = renderTab()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'doc' } })
    await vi.waitFor(() => { expect(actions.search).toHaveBeenCalledWith({ sort: 'popular', q: 'doc' }) })
    set({ query: { sort: 'popular', q: 'doc' } })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  ' } })
    await vi.waitFor(() => { expect(actions.search).toHaveBeenCalledWith({ sort: 'popular', q: undefined }) })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'doc' } })
    set({ query: { sort: 'popular', q: 'doc' } })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'doc' } })
    expect(actions.search).toHaveBeenCalledTimes(2)
  })

  it('clears kind and category through the All choices', () => {
    const { actions, set } = renderTab({ query: { sort: 'popular', kind: 'mcp', category: 'tools' } })
    const menus = document.querySelectorAll('button[aria-haspopup="menu"]')
    fireEvent.click(menus[0] as HTMLElement)
    fireEvent.click(screen.getByRole('menuitem', { name: en.kindAll }))
    expect(actions.search).toHaveBeenLastCalledWith({ sort: 'popular', category: 'tools', kind: undefined })
    set({ query: { sort: 'popular', category: 'tools', kind: undefined } })
    const all = [...document.querySelectorAll('button[aria-pressed]')].find(node => node.textContent === en.allCategories)!
    fireEvent.click(all)
    expect(actions.search).toHaveBeenLastCalledWith({ sort: 'popular', kind: undefined, category: undefined })
  })

  it('falls back to the artwork placeholder when an icon fails to load', () => {
    renderTab({ items: [item('alpha', { icon: 'https://cdn.example/icon.png' })], categories: [] })
    expect(document.querySelectorAll('img')).toHaveLength(1)
    fireEvent.error(document.querySelector('img')!)
    expect(document.querySelectorAll('img')).toHaveLength(0)
  })

  it('shows the uninstall busy label and hides show-more at the list end', () => {
    renderTab({ busy: { alpha: 'uninstall' } })
    expect(screen.getByText(en.uninstalling)).toBeTruthy()
    expect(screen.queryByText(en.showMore)).toBeNull()
  })

  it('keeps the skeleton while a detail loads, and omits absent facts', async () => {
    const detail: MarketItemDetail = { ...item('alpha'), categoryId: 'absent', description: null }
    const { actions } = renderTab()
    let release: ((value: MarketItemDetail | null) => void) | undefined
    actions.detail.mockImplementation(() => new Promise<MarketItemDetail | null>((resolve) => { release = resolve }))
    fireEvent.click(screen.getByRole('button', { name: en.openItem.replace('{name}', 'alpha') }))
    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
    act(() => { release?.(detail) })
    await vi.waitFor(() => { expect(screen.getByText(en.factVersion)).toBeTruthy() })
    expect(screen.queryByText(en.factAuthor)).toBeNull()
    expect(screen.queryByText(en.factHomepage)).toBeNull()
    expect(screen.queryByText(en.factCategory)).toBeNull()
    expect(screen.queryByText(en.detailAbout)).toBeNull()
  })

  it('renders a linked homepage and the category fact when present', async () => {
    const detail: MarketItemDetail = { ...item('alpha'), homepage: 'https://example.com/alpha', description: { en: 'about' } }
    const { actions } = renderTab()
    actions.detail.mockImplementation(() => Promise.resolve(detail))
    fireEvent.click(screen.getByRole('button', { name: en.openItem.replace('{name}', 'alpha') }))
    await vi.waitFor(() => { expect(screen.getByRole('link', { name: 'https://example.com/alpha' })).toBeTruthy() })
    expect(screen.getByText(en.factCategory)).toBeTruthy()
  })

  it('falls back to the popular sort label when the query carries none', () => {
    renderTab({ query: { sort: undefined } })
    expect(screen.getByRole('button', { name: en.sortBy.replace('{sort}', en.sortPopular) })).toBeTruthy()
  })

  it('closes its menus on Escape and outside the menu', () => {
    renderTab()
    const menus = document.querySelectorAll('button[aria-haspopup="menu"]')
    fireEvent.click(menus[0] as HTMLElement)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(menus[1] as HTMLElement)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(menus[0] as HTMLElement)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(menus[0] as HTMLElement)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('defaults a missing failure kind to the fetch message', () => {
    renderTab({ status: 'error', failure: null })
    expect(screen.getByRole('alert').textContent).toContain(en.readFailed)
  })
})

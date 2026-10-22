/** Marketplace state: the catalog query and loaded page, the installed set, and per-item install work. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  MarketCategoryView, MarketInstalledView, MarketItemDetail, MarketItemView, MarketSearchQuery, MarketText, RemoteFailure,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'

/** Items loaded before "Show more", and loaded again by each press. */
export const PAGE_SIZE = 50

/** The query the tab starts with: everything, ordered by installs. */
export const INITIAL_QUERY: MarketSearchQuery = { sort: 'popular' }

/** Why the last catalog read failed. */
export type CatalogFailure = 'fetch' | 'invalid'

/** Why the last install or uninstall failed. */
export type WorkFailure = 'auth' | 'conflict' | 'no-profile' | 'other'

/** Shared Marketplace state. */
export interface MarketState {
  /** `idle` until the tab first renders. */
  readonly status: 'idle' | 'loading' | 'more' | 'ready' | 'error'
  readonly query: MarketSearchQuery
  /** The query the shown page answered; it differs from `query` while a new query runs. */
  readonly answered: MarketSearchQuery | null
  readonly categories: readonly MarketCategoryView[]
  readonly items: readonly MarketItemView[]
  readonly total: number
  /** The catalog failure the retry button repeats, when `status` is `error`. */
  readonly failure: CatalogFailure | null
  /** The installed ids this machine reports, refreshed on `market/changed` and after every work call. */
  readonly installed: Readonly<Record<string, MarketInstalledView>>
  /** Items with an install or uninstall running, mapped to the work kind. */
  readonly busy: Readonly<Record<string, 'install' | 'uninstall'>>
  /** The last refused install or uninstall, shown until the next action. */
  readonly workFailure: { readonly id: string; readonly work: 'install' | 'uninstall'; readonly kind: WorkFailure } | null
}

/** What the Marketplace tab receives through injection. */
export interface MarketFace {
  readonly hooks: {
    /** Marketplace state, bound as `useMarket`. */
    readonly market: SnapshotStore<MarketState>
    /** The active locale, bound as `useLocale`, for catalog text. */
    readonly locale: HostObservable<LocaleSnapshot>
  }
  /** Resolve catalog text in the current language through the locale fallback chain. */
  readonly resolveText: (text: MarketText) => string
  /** Read the catalog once the tab first renders. */
  readonly ensure: () => void
  /** Replace the query and load its first page. */
  readonly search: (query: MarketSearchQuery) => void
  /** Load the next page of the current results. */
  readonly more: () => void
  /** Reload the first page of the current results. */
  readonly refresh: () => void
  /** Run the last failed catalog read again. */
  readonly retry: () => void
  /** Install one item by catalog slug. */
  readonly install: (id: string) => void
  /** Uninstall one item by catalog slug. */
  readonly uninstall: (id: string) => void
  /** Read one item's detail through the catalog remote. */
  readonly detail: (id: string) => Promise<MarketItemDetail | null>
}

const INITIAL: MarketState = {
  status: 'idle', query: INITIAL_QUERY, answered: null, categories: [], items: [], total: 0, failure: null,
  installed: {}, busy: {}, workFailure: null,
}

function catalogFailure(failure: RemoteFailure): CatalogFailure {
  return failure.code === 'market/invalid-response' ? 'invalid' : 'fetch'
}

function workFailure(failure: RemoteFailure): WorkFailure {
  switch (failure.code) {
    case 'market/auth-required': return 'auth'
    case 'market/conflict': return 'conflict'
    case 'market/no-profile':
    case 'market/profile-unavailable': return 'no-profile'
    default: return 'other'
  }
}

/** Owns Marketplace reads and installs for one Client. */
export class MarketController {
  /** Shared Marketplace state published to the tab. */
  readonly store: SnapshotStore<MarketState> = createSnapshotStore<MarketState>(INITIAL)
  private disposed = false
  private read = 0
  /** Runs the catalog read that failed last. */
  private failed: () => void = () => {}

  /** @param ctx - the plugin context whose `remote.market` namespace answers. */
  constructor(private readonly ctx: ClientContext) {}

  /** Stop publishing late settlements. */
  dispose(): void {
    this.disposed = true
  }

  /**
   * Build the tab's injected face.
   * @param resolveText - current-language text resolution from the locale service.
   * @returns the tab's injected state sources and actions.
   */
  face(resolveText: MarketFace['resolveText']): MarketFace {
    return {
      hooks: { market: this.store, locale: this.ctx.locale },
      resolveText,
      ensure: () => { if (this.state().status === 'idle') void this.load(INITIAL_QUERY, 0) },
      search: (query) => { void this.load(query, 0) },
      more: () => {
        const { status, answered, items, total } = this.state()
        if ((status === 'ready' || status === 'error') && answered !== null && items.length < total) {
          void this.load(answered, items.length)
        }
      },
      refresh: () => { void this.load(this.state().answered ?? INITIAL_QUERY, 0) },
      retry: () => { this.failed() },
      install: (id) => { void this.work(id, 'install') },
      uninstall: (id) => { void this.work(id, 'uninstall') },
      detail: async (id) => {
        const answer = await this.ctx.remote.market.detail(id)
        return answer.ok ? answer.value : null
      },
    }
  }

  /** Re-read the installed set after the Host announced a change; the tab reads it on first render anyway. */
  changed(): void {
    if (this.state().status === 'idle') return
    void this.loadInstalled()
  }

  private state(): MarketState {
    return this.store.getSnapshot()
  }

  private patch(next: Partial<MarketState>): void {
    this.store.set({ ...this.state(), ...next })
  }

  /** Load the catalog page at `offset` for `query`; `offset` 0 replaces the page, otherwise appends. */
  private async load(query: MarketSearchQuery, offset: number): Promise<void> {
    const read = ++this.read
    const kept = this.state().items
    this.patch(offset === 0
      ? { query, status: 'loading', failure: null }
      : { status: 'more', failure: null })
    const answer = await this.ctx.remote.market.catalog({ ...query, limit: PAGE_SIZE, offset })
    if (this.disposed || read !== this.read) return
    if (!answer.ok) {
      this.failed = () => { void this.load(query, offset) }
      this.patch({ status: 'error', failure: catalogFailure(answer.error) })
      return
    }
    const { items, total, categories } = answer.value
    this.patch({
      status: 'ready',
      items: offset === 0 ? items : [...kept, ...items],
      total,
      categories,
      answered: query,
      failure: null,
    })
    void this.loadInstalled()
  }

  /** Refresh the installed set; failures leave the previous set in place. */
  private async loadInstalled(): Promise<void> {
    const answer = await this.ctx.remote.market.installed()
    if (this.disposed || !answer.ok) return
    const installed: Record<string, MarketInstalledView> = {}
    for (const entry of answer.value) installed[entry.id] = entry
    this.patch({ installed })
  }

  /** Run one install or uninstall, tracking it in `busy` and reporting its refusal in `workFailure`. */
  private async work(id: string, kind: 'install' | 'uninstall'): Promise<void> {
    if (this.state().busy[id] !== undefined) return
    this.patch({ busy: { ...this.state().busy, [id]: kind }, workFailure: null })
    const answer = kind === 'install'
      ? await this.ctx.remote.market.installItem(id)
      : await this.ctx.remote.market.uninstallItem(id)
    if (this.disposed) {
      return
    } else {
      const { [id]: _removed, ...busy } = this.state().busy
      if (!answer.ok) {
        this.patch({ busy, workFailure: { id, work: kind, kind: workFailure(answer.error) } })
        return
      }
      this.patch({ busy })
      await this.loadInstalled()
    }
  }
}

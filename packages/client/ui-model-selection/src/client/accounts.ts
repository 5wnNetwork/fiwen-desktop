/** One Host-generation OAuth-account mirror shared by every Session selector. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { AuthorizationAccountView } from '@deepseek-ai/dsh-api-remotes/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** One provider's OAuth flow and the account records it has stored. */
export interface ProviderAccounts {
  /** The flow's base credential key — the address `selectAccount` writes through. */
  readonly key: string
  /** Stored account views the flow enumerated, base record first. */
  readonly accounts: readonly AuthorizationAccountView[]
}

/** Observable lifecycle of the shared account mirror. */
export interface ProviderAccountsState {
  /**
   * Provider route id → its account flow, joined on the record key's id
   * segment (`llm-pi-ai/anthropic` serves the `anthropic` route). A provider
   * is absent while unloaded, when no OAuth flow claims it, or when its
   * enumeration refused — the seat hides the row rather than guess.
   */
  byProvider: ReadonlyMap<string, ProviderAccounts>
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

/**
 * Loads the authorization flow list once per Host generation and resolves
 * each OAuth-capable flow's stored accounts. Refresh arrives on credential
 * writes and settled attempts; `select` rides the same flow key the settings
 * page writes through.
 */
export class ProviderAccountsDirectory {
  /** Current shared mirror value and load lifecycle. */
  readonly store: SnapshotStore<ProviderAccountsState> = createSnapshotStore<ProviderAccountsState>({
    byProvider: new Map(), status: 'idle', error: null,
  })

  private generation = 0
  private inflight: Promise<void> | undefined

  /**
   * @param ctx - the providing plugin's context, whose `remote.authorization`
   * namespace carries the Host-generation account records.
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Return once the current generation's mirror is loaded, sharing its one
   * in-flight load. Failures land on the store rather than throw.
   */
  load(): Promise<void> {
    if (this.store.getSnapshot().status === 'ready') return Promise.resolve()
    if (this.inflight !== undefined) return this.inflight
    const generation = this.generation
    this.store.update((draft) => {
      draft.status = 'loading'
      draft.error = null
    })
    const operation = this.ctx.remote.authorization.list().then(async (listed) => {
      if (!listed.ok) {
        throw new Error(`${listed.error.code}: ${listed.error.message}`)
      }
      const flows = listed.value.filter(entry => entry.methods.some(method => method.id === 'oauth'))
      const resolved = await Promise.all(flows.map(async entry =>
        ({ entry, accounts: await this.ctx.remote.authorization.listAccounts(entry.key) })))
      if (generation !== this.generation) return
      const byProvider = new Map<string, ProviderAccounts>()
      for (const { entry, accounts } of resolved) {
        // A flow whose enumeration refused contributes nothing — the same
        // silent degrade the settings page applies to a listing failure.
        if (!accounts.ok) continue
        // The wire key is grammar-validated host-side; the catalog join only
        // needs its id segment (credentialKeyId, inlined — the credentials
        // package is not a permitted client-bundle import).
        const id = entry.key.slice(entry.key.indexOf('/') + 1)
        if (!byProvider.has(id)) byProvider.set(id, { key: entry.key, accounts: accounts.value })
      }
      this.store.set({ byProvider, status: 'ready', error: null })
    }).catch((error: unknown) => {
      if (generation === this.generation) {
        this.store.update((draft) => {
          draft.status = 'error'
          draft.error = error instanceof Error ? error.message : String(error)
        })
      }
    }).finally(() => {
      if (generation === this.generation && this.inflight === operation) this.inflight = undefined
    })
    this.inflight = operation
    return operation
  }

  /**
   * Choose which stored account one provider's requests resolve to.
   * @param provider - the catalog route id (the flow key's id segment).
   * @param account - the account slot; `''` selects the base record.
   * @returns the Host outcome, or undefined when the provider has no account flow.
   */
  async select(provider: string, account: string): Promise<RemoteResult<void> | undefined> {
    const flow = this.store.getSnapshot().byProvider.get(provider)
    if (flow === undefined) return undefined
    return this.ctx.remote.authorization.selectAccount(flow.key, account)
  }

  /** Invalidate the mirror; the next read reloads it. */
  private invalidate(clear = false): void {
    this.generation += 1
    this.inflight = undefined
    const byProvider = clear ? new Map<string, ProviderAccounts>() : this.store.getSnapshot().byProvider
    this.store.set({ byProvider, status: 'idle', error: null })
  }

  /** Invalidate and reload after a Host-side credential write or attempt settlement. */
  refresh(): void {
    this.invalidate()
    void this.load()
  }

  /** Clear Host-specific values and load the replacement Host generation. */
  resetGeneration(): void {
    this.invalidate(true)
    void this.load()
  }
}

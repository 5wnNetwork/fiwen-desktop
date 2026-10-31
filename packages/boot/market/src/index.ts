/**
 * Fiwen marketplace Host service: browse the curated catalog served by the account origin and
 * install free skills and MCP servers onto this machine.
 *
 * Skills extract under `$DSH_HOME/skills/<id>` (a `skill-filesystem` user root, so they go live
 * without a restart); MCP servers append one `market-<id>` `mcp-client` row to the profile's
 * `cordis.patch.yml`, which the profile watcher applies. A local ledger at
 * `$DSH_HOME/market/installs.json` reconciles the Installed state with what's actually on disk.
 *
 * @module @deepseek-ai/dsh-market
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { MarketCatalogResult, MarketInstalledView, MarketInstallPreview, MarketItemDetail, MarketSearchQuery } from './types.ts'
import { installMcp, installSkill, listInstalled, uninstallMcp, uninstallSkill, type MarketStoreLayout } from './install.ts'
import { parseCategories, parseDetail, parseInstall, parseList, type InstallResult, type McpPayload, type SkillPayload } from './wire.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Fiwen marketplace: catalog reads and local installs. */
    market: Market
  }
}

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/u
const TOKEN_HEADER = 'x-dsh-auth-token'
/** Bound the in-memory preview map; each entry holds a full install payload. */
const MAX_PREVIEWS = 32

/** Marketplace service configuration. */
export interface Config {
  /** Fiwen origin serving `/v1/market/*`. */
  origin: string
  /** Deadline for one catalog or install fetch, in milliseconds. */
  fetchTimeoutMs: number
  /** User skill root; defaults to `$DSH_HOME/skills`. */
  skillsDir?: string
  /** Ledger directory; defaults to `$DSH_HOME/market`. */
  marketDir?: string
}

/**
 * Browse and install marketplace items. `deepseekAccount` authenticates installs when the origin
 * matches its inference origin; `profileContext` supplies the user patch file MCP installs append to.
 */
export default class Market extends TypertRemoteService {
  private readonly layout: MarketStoreLayout
  private readonly previews = new Map<string, { readonly result: InstallResult; readonly expiresAt: number }>()
  private disposed = false

  static Config = z.object({
    origin: z.string().default('https://desktop.5wn.net'),
    fetchTimeoutMs: z.natural().min(1).default(15000),
    skillsDir: z.string(),
    marketDir: z.string(),
  })

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'market')
    const home = ctx.get('profileContext')?.home ?? resolveDshHome()
    this.layout = {
      skillsDir: config.skillsDir ?? join(home, 'skills'),
      marketDir: config.marketDir ?? join(home, 'market'),
    }
    ctx.effect(() => () => { this.disposed = true; this.previews.clear() }, 'market: install previews')
  }

  private prunePreviews(): void {
    const now = Date.now()
    for (const [token, entry] of this.previews) {
      if (entry.expiresAt <= now) this.previews.delete(token)
    }
  }

  private get profilePatchPath(): string | undefined {
    return this.ctx.get('profileContext')?.patchPath
  }

  private async fetchJson(path: string, init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }): Promise<unknown> {
    const account = this.ctx.get('deepseekAccount')
    const token = await account?.resolveToken(this.config.origin)
    const response = await fetch(`${this.config.origin}${path}`, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(this.config.fetchTimeoutMs),
      headers: { ...(token === undefined ? {} : { [TOKEN_HEADER]: token }), ...init?.headers },
    }).catch((error: unknown) => {
      throw new RemoteError('market/fetch-failed', `Marketplace request failed: ${String(error)}`, { reason: String(error) })
    })
    if (response.status === 404) throw new RemoteError('market/not-found', 'Marketplace item not found', { id: path })
    if (response.status === 401) throw new RemoteError('market/auth-required', 'Sign in to Fiwen to install marketplace items', {})
    if (!response.ok) {
      throw new RemoteError('market/fetch-failed', `Marketplace answered ${String(response.status)}`, { reason: `status ${String(response.status)}` })
    }
    return response.json().catch(() => {
      throw new RemoteError('market/invalid-response', 'Marketplace answered invalid JSON', { reason: 'invalid json' })
    })
  }

  /**
   * One catalog page plus the category rail.
   * @param query - kind/category/text filters, sort key, and pagination.
   * @returns matching items with the enabled categories and the total match count.
   */
  @Remote
  async catalog(query: MarketSearchQuery): Promise<MarketCatalogResult> {
    const params = new URLSearchParams()
    if (query.kind !== undefined) params.set('kind', query.kind)
    if (query.category !== undefined) params.set('category', query.category)
    if (query.q !== undefined && query.q !== '') params.set('q', query.q)
    if (query.sort !== undefined) params.set('sort', query.sort)
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    const [itemsBody, categoriesBody] = await Promise.all([
      this.fetchJson(`/v1/market/items?${params.toString()}`),
      this.fetchJson('/v1/market/categories'),
    ])
    try {
      const { items, total } = parseList(itemsBody)
      return { items, total, offset, categories: parseCategories(categoriesBody) }
    } catch (error) {
      throw new RemoteError('market/invalid-response', `Marketplace catalog rejected: ${String(error)}`, { reason: String(error) })
    }
  }

  /**
   * One item's detail view, including the long description.
   * @param id - catalog slug.
   * @returns the item detail.
   * @throws {RemoteError} `market/not-found` for a missing or delisted item.
   */
  @Remote
  async detail(id: string): Promise<MarketItemDetail> {
    if (!SLUG.test(id)) throw new RemoteError('market/not-found', `No marketplace item ${id}`, { id })
    const body = await this.fetchJson(`/v1/market/items/${encodeURIComponent(id)}`)
    try {
      return parseDetail(body)
    } catch {
      throw new RemoteError('market/invalid-response', `Marketplace detail for ${id} rejected`, { reason: 'invalid detail' })
    }
  }

  /**
   * Fetch an install payload for review without writing local artifacts. The backend counts this request as a download.
   * @param id - catalog slug.
   * @returns a preview with a single-use token valid for ten minutes; environment and header values stay on the Host.
   * @throws {RemoteError} `market/auth-required`, `market/not-found`, `market/invalid-response`, `market/fetch-failed`.
   */
  @Remote
  async previewInstall(id: string): Promise<MarketInstallPreview> {
    this.prunePreviews()
    if (!SLUG.test(id)) throw new RemoteError('market/not-found', `No marketplace item ${id}`, { id })
    const body = await this.fetchJson(`/v1/market/items/${encodeURIComponent(id)}/install`, { method: 'POST' })
    let result: InstallResult
    try {
      result = parseInstall(body)
      if (result.id !== id) throw new Error('install item does not match the requested slug')
    } catch (error) {
      throw new RemoteError('market/invalid-response', `Marketplace install payload rejected: ${String(error)}`, { reason: String(error) })
    }
    if (this.disposed) throw new RemoteError('market/preview-expired', 'Request a new install preview', {})
    this.prunePreviews()
    // A caller that never confirms must not grow the map without bound; evict
    // the oldest preview first, which then fails as preview-expired.
    while (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value
      if (oldest === undefined) break
      this.previews.delete(oldest)
    }
    const token = randomBytes(16).toString('hex')
    this.previews.set(token, { result, expiresAt: Date.now() + 10 * 60_000 })
    const base = { token, id: result.id, kind: result.kind, version: result.version }
    if (result.kind === 'skill') {
      return { ...base, skillFiles: (result.payload as SkillPayload).files.map(file => file.path) }
    }
    const payload = result.payload as McpPayload
    return { ...base, mcp: payload.transport === 'stdio'
      ? { transport: 'stdio', command: payload.command, args: [...(payload.args ?? [])], envKeys: Object.keys(payload.env ?? {}) }
      : { transport: 'http', url: payload.url, headerKeys: Object.keys(payload.headers ?? {}) } }
  }

  /**
   * Consume a preview token and install its cached payload, then publish `market/changed`.
   * @param token - single-use token from `previewInstall`; obtain user confirmation before calling.
   * @returns the recorded local install. No backend request is made.
   * @throws {RemoteError} `market/preview-expired` for an unknown, consumed, or expired token;
   * `market/conflict`, `market/no-profile`, or `market/profile-unavailable` for an install failure.
   * A failed attempt consumes the token; request a new preview before retrying.
   */
  @Remote
  async installItem(token: string): Promise<MarketInstalledView> {
    this.prunePreviews()
    const entry = this.previews.get(token)
    this.previews.delete(token)
    if (entry === undefined) throw new RemoteError('market/preview-expired', 'Request a new install preview', {})
    const { result } = entry
    if (result.kind === 'skill') {
      try {
        const installed = await installSkill(this.layout, result.id, result.version, result.payload as Parameters<typeof installSkill>[3])
        this.ctx.emit('market/changed')
        return installed
      } catch (error) {
        if (error instanceof Error && error.message === 'skill-dir') {
          throw new RemoteError('market/conflict',
            `A user skill directory already owns ${result.id}`, { id: result.id, reason: 'skill-dir' })
        }
        throw error
      }
    }
    const profile = this.ctx.get('profileContext')
    if (profile === undefined) throw new RemoteError('market/no-profile', 'MCP installs require a profile-launched runtime', {})
    try {
      const installed = await installMcp(
        profile, result.id, result.version, result.payload as Parameters<typeof installMcp>[3], this.layout,
      )
      this.ctx.emit('market/changed')
      return installed
    } catch (error) {
      throw new RemoteError('market/profile-unavailable',
        `Could not update the profile patch file: ${String(error)}`, { reason: String(error) })
    }
  }

  /**
   * Remove one installed item: the skill directory or the MCP patch row, and its ledger entry.
   * User-owned directories are never removed.
   * @param id - catalog slug.
   * @returns whether a local artifact was actually removed.
   */
  @Remote
  async uninstallItem(id: string): Promise<boolean> {
    if (!SLUG.test(id)) return false
    const removed = await uninstallSkill(this.layout, id) || await this.uninstallMcpRow(id)
    if (removed) this.ctx.emit('market/changed')
    return removed
  }

  private async uninstallMcpRow(id: string): Promise<boolean> {
    const profile = this.ctx.get('profileContext')
    if (profile === undefined) return false
    return uninstallMcp(profile, id, this.layout)
  }

  /**
   * Items installed on this machine, reconciled against the artifacts that still exist.
   * @returns the install views the Installed marker shows.
   */
  @Remote
  async installed(): Promise<readonly MarketInstalledView[]> {
    return listInstalled(this.layout, this.profilePatchPath)
  }
}

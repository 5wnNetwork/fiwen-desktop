/** JSON-safe records of the Fiwen marketplace Remote namespace. */
import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The catalog or install endpoint could not be reached or answered non-2xx. */
    'market/fetch-failed': { readonly reason: string }
    /** The endpoint answered valid JSON outside the wire contract. */
    'market/invalid-response': { readonly reason: string }
    /** The item does not exist or is delisted. */
    'market/not-found': { readonly id: string }
    /** Installs require a signed-in Fiwen account. */
    'market/auth-required': Record<string, never>
    /**
     * The install target already exists outside the marketplace: a user skill directory with the
     * item's slug, or an mcp-client row with the item's server name.
     */
    'market/conflict': { readonly id: string; readonly reason: 'skill-dir' | 'server-name' }
    /** The profile patch file cannot be read or written (MCP installs need it). */
    'market/profile-unavailable': { readonly reason: string }
    /** The running profile was not launched with a writable user patch layer. */
    'market/no-profile': Record<string, never>
  }
}

/** Localized text as the catalog serves it; the client picks its locale. */
export interface MarketText {
  readonly en: string
  readonly [locale: string]: string
}

export type MarketItemKind = 'skill' | 'mcp'

/** One browsable category. */
export interface MarketCategoryView {
  readonly id: string
  readonly title: MarketText
  readonly sortOrder: number
}

/** One catalog card; `payload` is never listed — it arrives only through install. */
export interface MarketItemView {
  readonly id: string
  readonly kind: MarketItemKind
  readonly categoryId: string | null
  readonly title: MarketText
  readonly summary: MarketText
  readonly icon: string | null
  readonly author: string | null
  readonly homepage: string | null
  readonly version: string
  /** Total installs across all accounts. */
  readonly downloads: number
  /** Distinct accounts that installed. */
  readonly uniqueDownloads: number
  readonly updatedAt: string
}

/** Detail view: the list fields plus the long description. */
export interface MarketItemDetail extends MarketItemView {
  readonly description: MarketText | null
}

/** One install as this machine records it — the Installed marker's local truth. */
export interface MarketInstalledView {
  readonly id: string
  readonly kind: MarketItemKind
  readonly version: string
  readonly installedAt: string
}

/** Browse query: every field narrows or orders the catalog page. */
export interface MarketSearchQuery {
  readonly kind?: MarketItemKind | undefined
  readonly category?: string | undefined
  readonly q?: string | undefined
  readonly sort?: 'popular' | 'unique' | 'newest' | 'name' | undefined
  readonly limit?: number | undefined
  readonly offset?: number | undefined
}

/** One catalog page plus the category rail it filters by. */
export interface MarketCatalogResult {
  readonly categories: readonly MarketCategoryView[]
  readonly items: readonly MarketItemView[]
  readonly total: number
  readonly offset: number
}

import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A marketplace install or uninstall changed the local artifacts.
     * @mode emit
     */
    'market/changed'(): void
  }
}

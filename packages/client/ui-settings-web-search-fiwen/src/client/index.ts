/**
 * The Fiwen web search settings page, browser half: it replaces the official
 * provider card with a statement that search and fetching run on the Fiwen
 * service behind the signed-in account. It registers into the Plugins page's
 * `plugins.item` slot under the official card's id, so the deployment's row
 * occupies that slot instead of it.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { WebSearchSettingsCard } from './WebSearchSettingsCard.tsx'
import { zh, en, ja, es, fr, de, ru, pt, vi, type WebSearchSettingsKey } from './locales.ts'

export type { WebSearchSettingsCardProps } from './WebSearchSettingsCard.tsx'
export type { WebSearchSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Fiwen web search settings copy. */
    'ui-settings-web-search-fiwen': WebSearchSettingsKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'ui-settings-web-search-fiwen'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Register the card where the official provider card would sit.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt, vi }),
    'ui-settings-web-search-fiwen: dictionaries')
  ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'web-search', order: 20, label: () => t('title'), locale: NS,
  }, WebSearchSettingsCard))
}

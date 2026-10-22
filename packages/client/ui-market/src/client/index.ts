/**
 * Marketplace, browser half: the Plugins page tab that browses the curated Fiwen catalog through the `market`
 * Remote and installs skills and MCP servers onto this machine.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge, the forwarded events, and the `plugins.tab` slot declaration.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-market/types'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { MarketSection } from './MarketSection.tsx'
import { en, zh, type MarketLocaleKey } from './locales.ts'
import { MarketController } from './market-store.ts'

export type { MarketFace, MarketState } from './market-store.ts'
export type { MarketLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Marketplace tab copy. */
    'market': MarketLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'market'

/** Services the section reads. */
export const inject = ['slots', 'locale', 'remote', 'remote.market']

/**
 * Contribute Marketplace to the Plugins page and keep it current on Host changes.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-market: dictionaries')
  const controller = new MarketController(ctx)
  ctx.effect(() => () => { controller.dispose() }, 'ui-market: controller')
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('market/changed', () => { controller.changed() }),
      ctx.on('connection/reset', () => { controller.changed() }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-market: host invalidations')
  const face = controller.face(text => ctx.locale.resolveText(text))
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('plugins.tab', () => ctx.slots.register({
    name: 'plugins.tab', id: 'market', label: () => t('title'), locale: NS, inject: () => face,
  }, MarketSection))
}

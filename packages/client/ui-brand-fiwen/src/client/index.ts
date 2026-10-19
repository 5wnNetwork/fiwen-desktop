/** Fiwen occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { FiwenBrandMark, FiwenBrandName, FiwenHeroBrandMark } from './Brand.tsx'
import { en, zh, type BrandKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Fiwen brand name shown in the sidebar. */
    'ui-brand-fiwen': BrandKey
  }
}

/** Required services: the UI slot registry and localized brand copy. */
export const inject = ['slots', 'locale']

/**
 * Fill the sidebar and hero brand slots as one declaration-aware registration
 * set, so the occupants mount only while their declaring shells are live.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const namespace = 'ui-brand-fiwen'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-brand-fiwen: dictionaries')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, FiwenBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name', locale: namespace }, FiwenBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, FiwenHeroBrandMark)
      })))
}

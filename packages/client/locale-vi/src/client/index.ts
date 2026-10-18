/**
 * Vietnamese language pack, browser half: adds `vi` (Tiếng Việt) to the
 * language catalog — falling back to English — and registers one Vietnamese
 * dictionary per client locale namespace. Every registration lands through
 * `ctx.effect` so disposing the fiber removes the language and its texts.
 *
 * @module @deepseek-ai/dsh-client-locale-vi/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { VI_DICTIONARIES } from '../locales/index.ts'

/** Required services: the shared locale runtime only. */
export const inject = ['locale']

/**
 * Register the language and every Vietnamese dictionary as one effect.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const disposers = [ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })]
    try {
      for (const [ns, dict] of Object.entries(VI_DICTIONARIES)) {
        disposers.push(ctx.locale.register(ns, 'vi', dict))
      }
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose()
      throw error
    }
    return () => { for (const dispose of disposers) dispose() }
  }, 'locale-vi: dictionaries')
}

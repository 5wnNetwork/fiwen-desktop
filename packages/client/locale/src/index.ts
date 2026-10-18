/** Host registration for the browser locale preference. */
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'

import type { Volatile, Context } from '@deepseek-ai/cordis'

import z from '@deepseek-ai/schemastery'
import { LOCALE_ID_PATTERN, LOCALE_PREFERENCE_FIELD } from './locale-settings.ts'
import { LOCALE_CONFIG_GLOBAL } from './boot-config.ts'

import { LocaleSettingsFields } from './locale-settings.ts'

export {
  LOCALE_IDS, LOCALE_PREFERENCE_FIELD, LOCALE_SETTINGS_NAMESPACE,
  type BuiltInLocaleId, type LocaleId, type LocaleSettings,
} from './locale-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Explicit locale; omission follows the browser. */
  preference: Volatile<string | undefined>
  /**
   * Deployment default for browsers holding no explicit preference, ahead of
   * browser or OS detection; an unregistered id changes nothing.
   */
  defaultLocale?: string
}

/** Live preferences projected to the browser. */
export const Config = z.object({
  [LOCALE_PREFERENCE_FIELD]: LocaleSettingsFields[LOCALE_PREFERENCE_FIELD].volatile(),
  defaultLocale: z.string().pattern(LOCALE_ID_PATTERN).required(false),
})

/** Host preferences are consumed through the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 * @param config - row options; `defaultLocale` reaches the browser through the
 * page bootstrap because roster entries carry no per-row config.
 */
export function apply(ctx: Context, config?: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'global',
      name: LOCALE_CONFIG_GLOBAL,
      value: { defaultLocale: config?.defaultLocale },
    })
  })
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}

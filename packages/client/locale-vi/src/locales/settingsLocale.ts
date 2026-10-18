/** Vietnamese dictionary for `settings.locale`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-locale/src/locales/settings.ts'

export const vi = {
  'language.title': 'Ngôn ngữ',
} satisfies Partial<Record<keyof typeof en, string>>

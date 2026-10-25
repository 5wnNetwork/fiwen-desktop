import type { en } from '@deepseek-ai/dsh-client-ui-secret-mask/src/client/locales.ts'

/** Vietnamese dictionary for `secretMask`, key-checked against upstream `en`. */
export const vi = {
  'secret.reveal': 'Hiện nội dung bí mật',
  'secret.hide': 'Ẩn nội dung bí mật',
} satisfies Partial<Record<keyof typeof en, string>>

/** Vietnamese dictionary for `settings.plugins`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-settings-plugins/src/client/locales.ts'

export const vi = {
  'nav': 'Plugin tích hợp',
  'title': 'Plugin tích hợp',
  'intro': 'Xem các plugin mà bản triển khai này cung cấp.',
  'tabs': 'Chế độ xem plugin',
  'empty': 'Bản triển khai này không có chế độ xem plugin nào.',
} satisfies Partial<Record<keyof typeof en, string>>

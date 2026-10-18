/** Vietnamese dictionary for `sidebar`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar/src/client/locales.ts'

export const vi = {
  'session.new': 'Phiên mới',
  'session.new.label': 'Phiên mới',
  'toggle.open': 'Mở thanh bên',
  'toggle.collapse': 'Thu gọn thanh bên',
  'panels.label': 'Bảng toàn cục',
} satisfies Partial<Record<keyof typeof en, string>>

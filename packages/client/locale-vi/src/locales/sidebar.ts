import type { en } from '@deepseek-ai/dsh-client-ui-sidebar/src/client/locales.ts'

/** Vietnamese dictionary for `sidebar`, key-checked against upstream `en`. */
export const vi = {
  'session.new': 'Session mới',
  'session.new.label': 'Session mới',
  'toggle.open': 'Mở thanh bên',
  'toggle.collapse': 'Thu gọn thanh bên',
  'panels.label': 'Bảng toàn cục',
  'panels.unpinTooltip': 'Bỏ ghim khỏi thanh bên trái',
  'panels.unpin': 'Bỏ ghim {name} khỏi thanh bên',
  'navigation.label': 'Điều hướng',
  'panels.more': 'Thêm',
  'version.copied': 'Đã sao chép phiên bản',
} satisfies Partial<Record<keyof typeof en, string>>

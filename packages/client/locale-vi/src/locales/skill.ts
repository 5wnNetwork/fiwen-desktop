import type { en } from '@deepseek-ai/dsh-client-ui-skill/src/client/locales.ts'

/** Vietnamese dictionary for `skill`, key-checked against upstream `en`. */
export const vi = {
  'row.title': 'Kỹ năng',
  'row.running': 'Đang tải kỹ năng',
  'row.preparing': 'Đang chuẩn bị tải kỹ năng',
  'row.failed': 'Tải kỹ năng thất bại',
  'row.stopped': 'Đã dừng tải kỹ năng',
  'row.instructions': 'Hướng dẫn',
  'row.inspect': 'Kiểm tra',
  'menu.userOnly': 'chỉ người dùng',
} satisfies Partial<Record<keyof typeof en, string>>

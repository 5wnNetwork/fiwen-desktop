/** Vietnamese dictionary for `slash.menu`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-input-trigger/src/client/locales.ts'

export const vi = {
  'command': 'Lệnh',
  'skill': 'Kỹ năng',
  'subagent': 'Subagent',
  'loading': 'Đang tải…',
  'drill.aria': 'Duyệt thư mục',
  'drill.hint': 'Duyệt thư mục',
  'drill.key': 'Tab',
  'crumbs.aria': 'Điều hướng thư mục',
  'suggestions.aria': 'Gợi ý kích hoạt',
} satisfies Partial<Record<keyof typeof en, string>>

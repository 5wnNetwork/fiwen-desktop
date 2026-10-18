/** Vietnamese dictionary for `documentHtml`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/html/locales.ts'

export const vi = {
  'title': 'HTML',
  'frame': 'Xem trước tài liệu HTML',
  'loading': 'Đang kết xuất tài liệu...',
  'failed': 'Không thể xem trước tài liệu HTML này.',
} satisfies Partial<Record<keyof typeof en, string>>

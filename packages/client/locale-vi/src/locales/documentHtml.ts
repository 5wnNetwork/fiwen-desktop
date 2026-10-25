import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/html/locales.ts'

/** Vietnamese dictionary for `documentHtml`, key-checked against upstream `en`. */
export const vi = {
  'title': 'HTML',
  'frame': 'Xem trước tài liệu HTML',
  'loading': 'Đang kết xuất tài liệu...',
  'failed': 'Không thể xem trước tài liệu HTML này.',
} satisfies Partial<Record<keyof typeof en, string>>

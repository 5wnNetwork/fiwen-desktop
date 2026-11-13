import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/image/locales.ts'

/** Vietnamese dictionary for `sidebarImage`, key-checked against upstream `en`. */
export const vi = {
  'title': 'Hình ảnh',
  'preview': 'Xem trước hình ảnh: {name}',
  'loading': 'Đang kết xuất tài liệu...',
  'failed': 'Không thể hiển thị hình ảnh này.',
  'unsupported': 'Xem trước hình ảnh cần toàn bộ nội dung tệp.',
} satisfies Partial<Record<keyof typeof en, string>>

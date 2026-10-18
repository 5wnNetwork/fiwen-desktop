/** Vietnamese dictionary for `sidebarImage`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/image/locales.ts'

export const vi = {
  'title': 'Hình ảnh',
  'preview': 'Xem trước hình ảnh: {name}',
  'loading': 'Đang kết xuất tài liệu...',
  'failed': 'Không thể hiển thị hình ảnh này.',
  'unsupported': 'Xem trước hình ảnh cần toàn bộ nội dung tệp.',
  'zoomControls': 'Điều khiển thu phóng',
  'zoomMenu': 'Chọn mức thu phóng',
  'zoomOut': 'Thu nhỏ',
  'zoomIn': 'Phóng to',
  'zoomFitWidth': 'Vừa chiều rộng',
  'zoomValue': '{percent}%',
} satisfies Partial<Record<keyof typeof en, string>>

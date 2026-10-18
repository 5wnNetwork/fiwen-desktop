/** Vietnamese dictionary for `sidebarPdf`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/pdf/locales.ts'

export const vi = {
  'title': 'PDF',
  'pageImage': 'Trang PDF {page}',
  'loading': 'Đang kết xuất tài liệu...',
  'rendering': 'Đang kết xuất trang…',
  'failed': 'Không thể hiển thị PDF: {message}',
  'password': 'Tệp PDF này yêu cầu mật khẩu; không hỗ trợ xem trước tệp có mật khẩu.',
  'workerFailed': 'Quá trình kết xuất PDF không thể tiếp tục. Vui lòng thử lại.',
  'unsupported': 'Xem trước PDF cần toàn bộ nội dung tệp.',
  'retry': 'Thử lại',
  'zoomControls': 'Điều khiển thu phóng',
  'zoomMenu': 'Chọn mức thu phóng',
  'zoomOut': 'Thu nhỏ',
  'zoomIn': 'Phóng to',
  'zoomFitWidth': 'Vừa chiều rộng',
  'zoomValue': '{percent}%',
} satisfies Partial<Record<keyof typeof en, string>>

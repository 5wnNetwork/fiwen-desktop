/** Vietnamese dictionary for `sidebarFiles`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-files/src/client/locales.ts'

export const vi = {
  'shortcut.noSession': 'Hãy chọn một phiên trước',
  'type.label': 'Tệp',
  'guide.title': 'Tệp trong không gian làm việc',
  'guide.description': 'Duyệt các tệp trong không gian làm việc của phiên này',
  'loading': 'Đang đọc…',
  'empty': 'Thư mục trống',
  'truncated': 'Quá nhiều mục, chỉ hiển thị một phần.',
  'noWorkspace': 'Phiên này không có thư mục không gian làm việc.',
  'reload': 'Tải lại',
  'autoRefresh': 'Tự động làm mới',
  'autoRefresh.enable': 'Bật tự động làm mới',
  'autoRefresh.disable': 'Tắt tự động làm mới',
  'entry.other': 'Không phải tệp hay thư mục nên không thể mở.',
  'error.notFound': 'Thư mục đó không còn tồn tại. Có thể đã bị di chuyển hoặc xóa.',
  'error.outsideWorkspace': 'Thư mục đó nằm ngoài không gian làm việc nên thanh bên sẽ không đọc.',
  'error.notDirectory': 'Đó không phải thư mục.',
  'error.unavailable': 'Đọc thất bại: {message}',
} satisfies Partial<Record<keyof typeof en, string>>

/** Vietnamese dictionary for `sidebarFiles`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-files/src/client/locales.ts'

export const vi = {
  'shortcut.noSession': 'Hãy chọn một session trước',
  'type.label': 'Tệp',
  'guide.title': 'Tệp trong workspace',
  'guide.description': 'Duyệt các tệp trong workspace của session này',
  'loading': 'Đang đọc…',
  'empty': 'Thư mục trống',
  'truncated': 'Quá nhiều mục, chỉ hiển thị một phần.',
  'noWorkspace': 'Session này không có thư mục workspace.',
  'reload': 'Tải lại',
  'autoRefresh': 'Tự động làm mới',
  'autoRefresh.enable': 'Bật tự động làm mới',
  'autoRefresh.disable': 'Tắt tự động làm mới',
  'entry.other': 'Không phải tệp hay thư mục nên không thể mở.',
  'error.notFound': 'Thư mục đó không còn tồn tại. Có thể đã bị di chuyển hoặc xóa.',
  'error.outsideWorkspace': 'Thư mục đó nằm ngoài workspace nên thanh bên sẽ không đọc.',
  'error.notDirectory': 'Đó không phải thư mục.',
  'error.unavailable': 'Đọc thất bại: {message}',
} satisfies Partial<Record<keyof typeof en, string>>

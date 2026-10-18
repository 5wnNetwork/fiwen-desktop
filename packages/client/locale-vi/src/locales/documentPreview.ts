/** Vietnamese dictionary for `sidebarDocumentPreview`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/locales.ts'

export const vi = {
  'loading': 'Đang kết xuất tài liệu...',
  'loadMore': 'Tải thêm',
  'changed': 'Tệp đã thay đổi, đang hiển thị nội dung trước đó.',
  'reloadNow': 'Tải lại',
  'reload': 'Đọc lại tệp',
  'autoRefresh': 'Tự động làm mới',
  'autoRefresh.enable': 'Bật tự động làm mới',
  'autoRefresh.disable': 'Tắt tự động làm mới',
  'wrap.enable': 'Bật xuống dòng',
  'wrap.disable': 'Tắt xuống dòng',
  'wrap.aria': 'Xuống dòng',
  'openWith': 'Mở bằng',
  'viewer.text': 'Văn bản thuần',
  'resourceUnavailable': 'Dịch vụ tài nguyên tệp không khả dụng.',
  'rendererUnavailable': 'Bản xem trước {name} không khả dụng.',
  'unsupportedFile': 'Chưa hỗ trợ xem trước loại tệp này.',
  'error.notFound': 'Không tìm thấy tệp. Có thể đã bị di chuyển hoặc xóa.',
  'error.tooLarge': 'Trang này vượt quá giới hạn {limit} nên không thể đọc.',
  'error.notText': 'Chưa hỗ trợ xem trước loại tệp này.',
  'error.notRegularFile': 'Không phải tệp thường, không có gì để hiển thị.',
  'error.unavailable': 'Đọc thất bại: {message}',
  'retry': 'Thử lại',
} satisfies Partial<Record<keyof typeof en, string>>

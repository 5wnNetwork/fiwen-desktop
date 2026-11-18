import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/locales.ts'

/** Vietnamese dictionary for `sidebarDocumentPreview`, key-checked against upstream `en`. */
export const vi = {
  'autoRefresh.enable': 'Bật tự động làm mới',
  'autoRefresh.disable': 'Tắt tự động làm mới',
  'wrap.enable': 'Bật xuống dòng',
  'wrap.disable': 'Tắt xuống dòng',
  'wrap.aria': 'Xuống dòng',
  'viewer.text': 'Văn bản thuần',
  'error.notFound': 'Không tìm thấy tệp. Có thể đã bị di chuyển hoặc xóa.',
  'error.tooLarge': 'Trang này vượt quá giới hạn {limit} nên không thể đọc.',
  'error.notText': 'Chưa hỗ trợ xem trước loại tệp này.',
  'error.notRegularFile': 'Không phải tệp thường, không có gì để hiển thị.',
  'error.unavailable': 'Đọc thất bại: {message}',
} satisfies Partial<Record<keyof typeof en, string>>

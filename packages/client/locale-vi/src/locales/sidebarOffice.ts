/** Vietnamese dictionary for `sidebarOffice`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/office/locales.ts'

export const vi = {
  'title': 'Tài liệu Office',
  'loading': 'Đang kết xuất tài liệu...',
  'retry': 'Thử lại',
  'viewMissingFonts': 'Thiếu phông chữ: {count}. Nhấn để xem.',
  'missingFontsTitle': 'Thiếu phông chữ',
  'missingFontsDescription': 'Các phông chữ này không khả dụng cho bản xem trước. Văn bản và bố cục có thể khác với tài liệu gốc.',
  'missingFontsCount': 'Phông chữ: {count}',
  'closeDetails': 'Đóng chi tiết phông chữ',
  'unavailable': 'Không thể xem trước tài liệu Office. Hãy bật dịch vụ xem trước tài liệu trên máy đang chạy Fiwen Desktop.',
  'invalid': 'Không thể xem trước tệp Office này. Tệp có thể bị hỏng, được bảo vệ bằng mật khẩu hoặc sai phần mở rộng.',
  'tooLarge': 'Tệp Office hoặc PDF đã chuyển đổi vượt quá giới hạn kích thước xem trước. Hãy giảm kích thước tệp hoặc điều chỉnh cấu hình xem trước.',
  'failed': 'Chuyển đổi Office không tạo ra PDF dùng được. Hãy kiểm tra tệp và thử lại.',
  'timeout': 'Chuyển đổi Office quá thời gian chờ. Thử lại.',
  'busy': 'Trình xem trước Office đang bận. Thử lại sau ít phút.',
  'changed': 'Tệp đã thay đổi trong khi đọc. Hãy mở lại bản xem trước.',
} satisfies Partial<Record<keyof typeof en, string>>

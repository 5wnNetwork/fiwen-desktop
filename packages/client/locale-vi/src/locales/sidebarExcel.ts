/** Vietnamese dictionary for `sidebarExcel`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/excel/locales.ts'

export const vi = {
  'title': 'Bảng tính',
  'language': 'vi',
  'loading': 'Đang kết xuất tài liệu...',
  'invalid': 'Không thể mở bảng tính này. Hãy kiểm tra định dạng, nội dung hoặc mật khẩu bảo vệ.',
  'tooLarge': 'Sổ làm việc này vượt quá giới hạn kích thước xem trước.',
  'timeout': 'Mở sổ làm việc này quá thời gian chờ. Hãy thử tệp nhỏ hơn.',
  'encoding': 'Không thể đọc bảng mã văn bản này. Hãy lưu tệp dưới dạng UTF-8 hoặc UTF-16 có BOM rồi thử lại.',
  'formulaWarning': 'Sổ làm việc này chứa công thức. Kết quả hiển thị có thể thiếu hoặc không chính xác.',
  'unsupportedNotice': 'Bản xem trước này không hỗ trợ {features} trong sổ làm việc. Hãy mở bằng ứng dụng hệ thống để có trải nghiệm đầy đủ.',
  'charts': 'biểu đồ',
  'images': 'hình ảnh',
  'shapes': 'hình dạng',
  'conditionalFormatting': 'định dạng có điều kiện',
  'featureSeparator': ', ',
  'retry': 'Thử lại',
} satisfies Partial<Record<keyof typeof en, string>>

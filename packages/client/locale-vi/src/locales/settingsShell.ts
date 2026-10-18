/** Vietnamese dictionary for `settings.shell`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-settings-shell/src/client/locales.ts'

export const vi = {
  'title': 'Shell',
  'description': 'Giới hạn thời gian chạy và lượng đầu ra của mỗi lệnh.',
  'timeoutMs': 'Thời gian chờ lệnh (ms)',
  'timeoutMsHint': 'Thời gian tối đa một lệnh được chạy trước khi bị kết thúc.',
  'maxOutputBytes': 'Giới hạn đầu ra mỗi luồng (byte)',
  'maxOutputBytesHint': 'Đầu ra vượt quá giới hạn sẽ được ghi vào tệp tạm thay vì bị mất.',
  'overridden': 'Đã ghi đè',
  'reset': 'Đặt lại về mặc định',
  'readOnly': 'Bản triển khai này lưu cài đặt ở chế độ chỉ đọc.',
  'unavailable': 'Plugin này chưa được tải nên hiện không thể cấu hình.',
  'save': 'Lưu',
  'saving': 'Đang lưu…',
  'saveFailed': 'Bản triển khai không chấp nhận các giá trị này; chúng được giữ lại để bạn sửa.',
  'invalidNumber': 'Nhập một số, hoặc để trống để dùng giá trị mặc định.',
} satisfies Partial<Record<keyof typeof en, string>>

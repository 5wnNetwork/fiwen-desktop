/** Vietnamese dictionary for `settings.agentLoop`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-settings-agent-loop/src/client/locales.ts'

export const vi = {
  'title': 'Vòng lặp agent',
  'description': 'Kiểm soát cách agent phát các lời gọi công cụ.',
  'maxParallel': 'Lời gọi công cụ song song',
  'maxParallelHint': 'Giới hạn trên số lời gọi an toàn chạy song song trong một bước.',
  'overridden': 'Đã ghi đè',
  'reset': 'Đặt lại về mặc định',
  'readOnly': 'Bản triển khai này lưu cài đặt ở chế độ chỉ đọc.',
  'unavailable': 'Plugin này chưa được tải nên hiện không thể cấu hình.',
  'save': 'Lưu',
  'saving': 'Đang lưu…',
  'saveFailed': 'Bản triển khai không chấp nhận các giá trị này; chúng được giữ lại để bạn sửa.',
  'invalidNumber': 'Nhập một số, hoặc để trống để dùng giá trị mặc định.',
} satisfies Partial<Record<keyof typeof en, string>>

import type { en } from '@deepseek-ai/dsh-session-log-export/src/client/locales.ts'

/** Vietnamese dictionary for `session-log-download`, key-checked against upstream `en`. */
export const vi = {
  'menu.download': 'Tải nhật ký session',
  'menu.feedback': 'Phản hồi',
  'dialog.preparingTitle': 'Đang xuất session',
  'dialog.preparingDescription': 'Đang chuẩn bị tệp ZIP chứa session này, các session con và tệp đính kèm.',
  'dialog.successTitle': 'Đã bắt đầu tải session',
  'dialog.successDescription': 'Trình duyệt đang tải xuống tệp ZIP của session.',
  'dialog.errorTitle': 'Xuất session thất bại',
  'dialog.close': 'Đóng',
  'dialog.commandFailed': 'Không thể bắt đầu xuất session.',
  'menu.copyMarkdown': 'Sao chép phiên dưới dạng Markdown',
  'toast.copied': 'Đã sao chép phiên dưới dạng Markdown.',
  'toast.preparationFailed': 'Không đọc được phiên để sao chép. Hãy thử lại.',
  'toast.clipboardFailed': 'Không ghi được vào bộ nhớ tạm. Kiểm tra quyền truy cập bộ nhớ tạm rồi thử lại.',
  'dialog.session': 'Phiên: {sessionId}',
} satisfies Partial<Record<keyof typeof en, string>>

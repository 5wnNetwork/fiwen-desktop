/** Vietnamese dictionary for `session-log-download`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-session-log-export/src/client/locales.ts'

export const vi = {
  'header.more': 'Thao tác khác',
  'menu.download': 'Tải nhật ký session',
  'menu.feedback': 'Phản hồi',
  'dialog.preparingTitle': 'Đang xuất session',
  'dialog.preparingDescription': 'Đang chuẩn bị tệp ZIP chứa session này, các session con và tệp đính kèm.',
  'dialog.successTitle': 'Đã bắt đầu tải session',
  'dialog.successDescription': 'Trình duyệt đang tải xuống tệp ZIP của session.',
  'dialog.errorTitle': 'Xuất session thất bại',
  'dialog.close': 'Đóng',
  'dialog.commandFailed': 'Không thể bắt đầu xuất session.',
} satisfies Partial<Record<keyof typeof en, string>>

/** Vietnamese dictionary for `session-log-download`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-session-log-export/src/client/locales.ts'

export const vi = {
  'header.more': 'Thao tác khác',
  'menu.download': 'Tải nhật ký phiên',
  'menu.feedback': 'Phản hồi',
  'dialog.preparingTitle': 'Đang xuất phiên',
  'dialog.preparingDescription': 'Đang chuẩn bị tệp ZIP chứa phiên này, các phiên con và tệp đính kèm.',
  'dialog.successTitle': 'Đã bắt đầu tải phiên',
  'dialog.successDescription': 'Trình duyệt đang tải xuống tệp ZIP của phiên.',
  'dialog.errorTitle': 'Xuất phiên thất bại',
  'dialog.close': 'Đóng',
  'dialog.commandFailed': 'Không thể bắt đầu xuất phiên.',
} satisfies Partial<Record<keyof typeof en, string>>

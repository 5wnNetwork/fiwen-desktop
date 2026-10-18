/** Vietnamese dictionary for `schedule.catalog`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-schedule/src/client/locales.ts'

import { frequencyVi } from './frequency.ts'

export const vi = {
  'trigger.label': 'Lời nhắc',
  'list.loading': 'Đang tải lời nhắc…',
  'list.error': 'Không thể tải lời nhắc.',
  'list.retry': 'Thử lại',
  'delete.action': 'Xóa',
  'delete.pending': 'Đang xóa…',
  'delete.label': 'Xóa lời nhắc: {title}',
  'list.open': 'Mở chi tiết lời nhắc: {title}',
  'trigger.one': '{count} lời nhắc',
  'trigger.other': '{count} lời nhắc',
  'list.aria': 'Lời nhắc đang hoạt động',
  'list.nextRun': 'Lần chạy tiếp theo',
  'frequency.once': 'Một lần',
  'frequency.every': 'Mỗi {value} {unit}',
  ...frequencyVi,
  'mark.aria': '{count} tác vụ đã lên lịch',
  'hover.more': '{count} mục khác',
} satisfies Partial<Record<keyof typeof en, string>>

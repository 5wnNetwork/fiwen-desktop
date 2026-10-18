/** Vietnamese dictionary for `goal`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-goal/src/client/locales.ts'

export const vi = {
  'phase.active': 'Mục tiêu đang chạy',
  'phase.active.disarmed': 'Mục tiêu không hoạt động',
  'phase.paused': 'Mục tiêu đã tạm dừng',
  'phase.blocked': 'Mục tiêu bị chặn',
  'objective.aria': 'Nội dung mục tiêu',
  'commandInput.aria': 'Nhập lệnh',
  'action.save': 'Lưu mục tiêu',
  'action.cancel': 'Hủy chỉnh sửa',
  'action.pause': 'Tạm dừng mục tiêu',
  'action.resume': 'Tiếp tục mục tiêu',
  'action.edit': 'Sửa mục tiêu',
  'action.clear': 'Xóa mục tiêu',
} satisfies Partial<Record<keyof typeof en, string>>

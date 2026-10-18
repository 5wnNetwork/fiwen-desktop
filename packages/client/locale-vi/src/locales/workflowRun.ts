/** Vietnamese dictionary for `workflowRun`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-workflow-run/src/client/locales.ts'

export const vi = {
  'run.title': '{name}',
  'run.members.one': '{count} thành viên',
  'run.members.other': '{count} thành viên',
  'run.empty': 'Chưa có thành viên nào bắt đầu',
  'phase.unassigned': 'Chưa phân pha',
  'phase.empty': 'Tên pha trống',
  'statusCount.running': 'Đang chạy {count}',
  'statusCount.completed': 'Hoàn thành {count}',
  'statusCount.failed': 'Thất bại {count}',
  'statusCount.cancelled': 'Đã hủy {count}',
  'statusCount.interrupted': 'Bị gián đoạn {count}',
  'member.empty': 'Tên thành viên trống',
  'member.open': 'Mở {name}',
  'status.running': 'Đang chạy',
  'status.completed': 'Hoàn thành',
  'status.failed': 'Thất bại',
  'status.cancelled': 'Đã hủy',
  'status.interrupted': 'Bị gián đoạn',
} satisfies Partial<Record<keyof typeof en, string>>

/** Vietnamese dictionary for `approval`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-approval/src/client/locales.ts'

export const vi = {
  'waiting': 'Đang chờ phê duyệt',
  'detail.aria': 'Chi tiết phê duyệt',
  'escalation': 'Công cụ {toolName} yêu cầu thực thi với quyền nâng cao',
  'reject': 'Từ chối',
  'allowOnce': 'Cho phép một lần',
} satisfies Partial<Record<keyof typeof en, string>>

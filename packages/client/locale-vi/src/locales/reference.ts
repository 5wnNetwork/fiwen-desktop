/** Vietnamese dictionary for `reference`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-reference/src/client/locales.ts'

export const vi = {
  'section.files': 'Tệp & thư mục',
  'section.subagents': 'Subagent',
  'section.sessions': 'Session',
  'candidate.noCwd': '(không có cwd)',
  'crumb.root': 'Workspace',
  'fileOpen.title': 'Không thể mở tệp',
  'fileOpen.failed': 'Không thể mở “{path}”. Thử lại hoặc đóng thông báo này.',
  'fileOpen.close': 'Đóng',
  'fileOpen.retry': 'Thử lại',
  'time.now': 'bây giờ',
  'time.minutes': '{n}ph',
  'time.hours': '{n}g',
  'time.days': '{n}ng',
  'time.months': '{n}th',
  'time.years': '{n}n',
} satisfies Partial<Record<keyof typeof en, string>>

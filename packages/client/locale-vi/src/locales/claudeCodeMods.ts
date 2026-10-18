/** Vietnamese dictionary for `claude-code-mods`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-experimental-client-ui-claude-code-mods/src/client/locales.ts'

export const vi = {
  'band': 'Claude Code mods',
  'pressing': 'Đang xử lý…',
  'press.failed': 'Nút bấm thất bại: {message}',
  'press.stale': 'Nút đó thuộc về một bản vẽ cũ; thanh công cụ đã được làm mới',
} satisfies Partial<Record<keyof typeof en, string>>

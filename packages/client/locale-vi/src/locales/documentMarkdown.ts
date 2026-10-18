/** Vietnamese dictionary for `documentMarkdown`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/markdown/locales.ts'

export const vi = {
  'viewer.label': 'Markdown',
  'code.copy': 'Sao chép',
  'code.copied': 'Đã sao chép',
  'footnotes': 'Chú thích cuối trang',
} satisfies Partial<Record<keyof typeof en, string>>

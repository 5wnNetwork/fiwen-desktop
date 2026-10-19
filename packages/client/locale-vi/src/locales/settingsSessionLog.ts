/** Vietnamese dictionary for `session-log-deepseek`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-settings-session-log/src/client/locales.ts'

export const vi = {
  'title': 'Tải Session Log lên khi dùng API mô hình chính thức',
  'description': 'Giúp cải thiện các mô hình và sản phẩm của Fiwen.',
  'saved': 'Đã lưu tùy chọn',
  'failed': 'Không thể lưu tùy chọn',
} satisfies Partial<Record<keyof typeof en, string>>

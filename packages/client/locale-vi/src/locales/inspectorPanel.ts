/** Vietnamese dictionary for `inspectorPanel`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-experimental-inspector/src/client/bottom/locales.ts'

export const vi = {
  'title': 'NodeJS Inspector',
  'toggle': 'Bật/tắt NodeJS Inspector',
  'close': 'Thu gọn',
  'resize': 'Đổi kích thước bảng NodeJS Inspector',
  'frameTitle': 'NodeJS Inspector',
} satisfies Partial<Record<keyof typeof en, string>>

/** Vietnamese dictionary for `plan`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-plan/src/client/locales.ts'

export const vi = {
  'chip.label': 'Kế hoạch',
  'preview.title': 'Kế hoạch',
  'preview.document': 'Kế hoạch · Markdown',
  'preview.action': 'Mở',
  'preview.open': 'Mở kế hoạch trong thanh bên',
  'preview.full': 'Xem toàn bộ kế hoạch',
  'preview.openNamed': 'Mở kế hoạch: {title}',
  'preview.loading': 'Đang tải kế hoạch…',
  'preview.failed': 'Không thể tải kế hoạch',
  'preview.invalidAddress': 'Địa chỉ kế hoạch không hợp lệ',
  'preview.historyUnavailable': 'Không có lịch sử session',
  'preview.notFound': 'Không tìm thấy kế hoạch này',
  'preview.unavailable': 'Không thể xem trước kế hoạch',
  'preview.expired': 'Bản xem trước kế hoạch tạm thời này đã hết hạn. Hãy mở lại từ thẻ đánh giá đang chờ.',
  'chip.on.aria': 'Chế độ kế hoạch đang bật, nhấn để tắt',
  'chip.on.title': 'Chế độ kế hoạch đang bật — nhấn để tắt (/plan off)',
  'chip.exitFailed': 'Không thể thoát chế độ kế hoạch',
} satisfies Partial<Record<keyof typeof en, string>>

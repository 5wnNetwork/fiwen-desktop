/** Vietnamese dictionary for `model`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-model-selection/src/client/locales.ts'

export const vi = {
  'provider.account': 'Tài khoản DeepSeek',
  'command.label': 'Mô hình',
  'command.description': 'Chọn mô hình cho cuộc hội thoại này',
  'option.loadError': 'Tải danh mục thất bại: {message}',
  'trigger.fallback': 'Chọn mô hình',
  'trigger.loading': 'Đang tải mô hình…',
  'trigger.selectAria': 'Chọn mô hình',
  'trigger.aria': 'Chọn mô hình, hiện tại {model}',
  'trigger.ariaEffort': 'Chọn mô hình, hiện tại {model}, mức suy luận {effort}',
  'menu.aria': 'Mô hình và mức suy luận',
  'menu.model': 'Mô hình',
  'menu.effort': 'Mức suy luận',
  'effort.providerDefault': 'Mặc định',
  'status.loading': 'Đang làm mới danh sách mô hình…',
  'error.action': 'Thao tác mô hình thất bại: {message}',
  'error.sessionInUse': 'Phiên này đang được sử dụng, có thể bởi một phiên bản DSH khác đang chạy (như dsh web hoặc ứng dụng desktop). Hãy thoát các phiên bản DSH khác rồi thử lại.',
  'action.reload': 'Tải lại',
  'warning.groupLoad': '{name} tải thất bại: {message}',
  'search.placeholder': 'Tìm mô hình…',
  'search.clear': 'Xóa tìm kiếm',
  'search.empty': 'Không có mô hình phù hợp.',
  'empty.models': 'Không có mô hình nào.',
  'empty.efforts': 'Mô hình này không có mức suy luận.',
} satisfies Partial<Record<keyof typeof en, string>>

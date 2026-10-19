/** Vietnamese dictionary for `settings.permission`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-permission-presets/src/client/locales.ts'

export const vi = {
  'title': 'Quyền',
  'description': 'Chọn chế độ quyền mặc định cho session mới',
  'loading': 'Đang tải',
  'unavailable': 'Không khả dụng',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Bật Full access?',
  'confirm.description': 'Full access cho phép các session mới giảm bước xác nhận và thực hiện trực tiếp nhiều thao tác hơn, kể cả các thao tác nhạy cảm, thay đổi tệp hoặc lệnh bên ngoài. Chỉ dùng khi bạn tin tưởng các task tiếp theo.',
  'confirm.acknowledge': 'Tôi hiểu rủi ro và muốn tiếp tục',
  'confirm.cancel': 'Hủy',
  'confirm.enable': 'Bật Full access',
} satisfies Partial<Record<keyof typeof en, string>>

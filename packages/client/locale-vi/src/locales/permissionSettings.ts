/** Vietnamese dictionary for `settings.permission`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-permission-presets/src/client/locales.ts'

export const vi = {
  'title': 'Quyền',
  'description': 'Chọn chế độ quyền mặc định cho phiên mới',
  'loading': 'Đang tải',
  'unavailable': 'Không khả dụng',
  'preset.readOnly': 'Chỉ đọc',
  'preset.workspaceWrite': 'Ghi trong không gian làm việc',
  'preset.fullAccess': 'Toàn quyền truy cập',
  'confirm.title': 'Bật Toàn quyền truy cập?',
  'confirm.description': 'Toàn quyền truy cập cho phép các phiên mới giảm bước xác nhận và thực hiện trực tiếp nhiều thao tác hơn, kể cả các thao tác nhạy cảm, thay đổi tệp hoặc lệnh bên ngoài. Chỉ dùng khi bạn tin tưởng các tác vụ tiếp theo.',
  'confirm.acknowledge': 'Tôi hiểu rủi ro và muốn tiếp tục',
  'confirm.cancel': 'Hủy',
  'confirm.enable': 'Bật Toàn quyền truy cập',
} satisfies Partial<Record<keyof typeof en, string>>

/** Vietnamese dictionary for `permission.access`, key-checked against upstream `accessEn`. */
import type { accessEn } from '@deepseek-ai/dsh-client-ui-permission-presets/src/client/locales.ts'

export const vi = {
  'mode': 'Chế độ truy cập, hiện tại: {name}',
  'close': 'Đóng',
  'preset.readOnly': 'Chỉ đọc',
  'preset.workspaceWrite': 'Ghi trong không gian làm việc',
  'preset.fullAccess': 'Toàn quyền truy cập',
  'confirm.title': 'Bật Toàn quyền truy cập?',
  'confirm.description': 'Toàn quyền truy cập giảm bước xác nhận và cho phép tác tử thực hiện trực tiếp nhiều thao tác hơn, kể cả các thao tác nhạy cảm, thay đổi tệp hoặc lệnh bên ngoài. Chỉ dùng khi bạn tin tưởng tác vụ hiện tại.',
  'confirm.acknowledge': 'Tôi hiểu rủi ro và muốn tiếp tục',
  'confirm.cancel': 'Hủy',
  'confirm.enable': 'Bật Toàn quyền truy cập',
  'auto.label': 'Tự động duyệt',
  'auto.badge': 'EXP',
  'auto.description': 'Chạy không cần sandbox sau khi mô hình hiện tại duyệt thử nghiệm mọi lời gọi công cụ gốc và lời gọi PTC bên trong.',
  'auto.confirm.title': 'Bật Tự động duyệt (thử nghiệm)?',
  'auto.confirm.description': 'Tự động duyệt chạy không cần sandbox. Trước mỗi lời gọi công cụ gốc và lời gọi PTC bên trong, chính mô hình của tác tử hiện tại xem xét có cho phép hay không; bạn phê duyệt hoặc từ chối từng lời gọi bị chặn. Tính năng này đang thử nghiệm, có thể cho phép hoặc từ chối nhầm, và tốn thêm token.',
  'auto.confirm.acknowledge': 'Tôi hiểu các rủi ro này và muốn tiếp tục',
  'auto.confirm.enable': 'Bật Tự động duyệt',
} satisfies Partial<Record<keyof typeof accessEn, string>>

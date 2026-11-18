import type { accessEn } from '@deepseek-ai/dsh-client-ui-permission-presets/src/client/locales.ts'

/** Vietnamese dictionary for `permission.access`, key-checked against upstream `accessEn`. */
export const vi = {
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Bật Full access?',
  'confirm.description': 'Full access giảm bước xác nhận và cho phép agent thực hiện trực tiếp nhiều thao tác hơn, kể cả các thao tác nhạy cảm, thay đổi tệp hoặc lệnh bên ngoài. Chỉ dùng khi bạn tin tưởng task hiện tại.',
  'confirm.acknowledge': 'Tôi hiểu rủi ro và muốn tiếp tục',
  'confirm.cancel': 'Hủy',
  'confirm.enable': 'Bật Full access',
} satisfies Partial<Record<keyof typeof accessEn, string>>

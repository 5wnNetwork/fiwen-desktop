import type { en } from '@deepseek-ai/dsh-client-ui-shortcuts/src/client/locales.ts'

/** Vietnamese dictionary for `shortcuts`, key-checked against upstream `en`. */
export const vi = {
  'edit-label': 'Sửa phím tắt cho {command}',
  'web-help': 'Tổ hợp trình duyệt: Mod+/, Mod+Shift+,, Mod+Shift+.. Mod là Command trên Mac và Ctrl ở nơi khác.',
  'unsupported-key': 'Phím này không được hỗ trợ.',
  'modifier-required': 'Hãy thêm Command, Ctrl hoặc Alt vào tổ hợp.',
  'too-many-keys': 'Giữ tối đa hai phím không phải phím bổ trợ. Thả phím để thử lại.',
  'macos-web-help': 'Dùng Command+/, Command+,, Command+Backslash, Control+Backquote, Command+Option+phím hoặc Command+Shift+phím. Cũng hỗ trợ tổ hợp ba hoặc bốn phím bổ trợ khác nhau. Phím tắt của trình duyệt hoặc hệ thống có thể không tới được trang.',
  'windows-web-help': 'Dùng Ctrl+/, Ctrl+,, Ctrl+Alt+phím hoặc Ctrl+Shift+phím. Cũng hỗ trợ tổ hợp ba hoặc bốn phím bổ trợ khác nhau. Phím tắt của trình duyệt hoặc hệ thống có thể không tới được trang.',
  'unsupported-browser': 'Trình duyệt này chưa hỗ trợ tổ hợp này.',
  'reset-all': 'Khôi phục tất cả mặc định',
  'reset-title': 'Khôi phục tất cả phím tắt mặc định?',
  'reset-description': 'Khôi phục phím tắt mặc định cho nền tảng này. Mọi phím tắt đã sửa hoặc gỡ sẽ được khôi phục. Nền tảng khác không bị ảnh hưởng.',
  'close-confirmation': 'Đóng xác nhận',
  'write-failed': 'Không thể lưu. Phím tắt trước đó và bản nháp hiện tại được giữ nguyên. Vui lòng thử lại.',
  'not-ready': 'Phím tắt chưa sẵn sàng. Vui lòng thử lại.',
  'web-document': 'mục localStorage dsh.keybindings.v1 của trang này',
  'web-reload': 'tải lại trang',
  'using-defaults': 'Đang dùng gán phím mặc định.',
  'native-failed': 'Không thể bảo vệ quá trình ghi phím trên desktop. Thoát ghi phím rồi thử lại.',
  'global-hint': 'Mở từ mọi nơi',
} satisfies Partial<Record<keyof typeof en, string>>

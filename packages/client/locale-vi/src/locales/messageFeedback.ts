/** Vietnamese dictionary for `feedback`, key-checked against upstream `en`. */
import type { en } from '@deepseek-ai/dsh-client-ui-message-feedback/src/client/locales.ts'

export const vi = {
  'action.like': 'Phản hồi tốt',
  'action.likeActive': 'Bỏ đánh giá',
  'action.dislike': 'Phản hồi chưa tốt',
  'action.dislikeActive': 'Bỏ đánh giá',
  'dialog.title': 'Gửi phản hồi',
  'dialog.categories': 'Danh mục phản hồi',
  'dialog.detail': 'Chi tiết phản hồi',
  'dialog.hint': 'Thêm chi tiết để giúp chúng tôi cải thiện. Nội dung gửi sẽ kèm theo nhật ký hội thoại hiện tại.',
  'category.task-result': 'Kết quả tác vụ',
  'category.instruction-following': 'Khả năng hiểu và tuân theo chỉ dẫn',
  'category.product-interaction': 'Tính năng và tương tác sản phẩm',
  'category.service-stability': 'Độ ổn định và tốc độ',
  'category.resource-cost': 'Tài nguyên và chi phí',
  'category.security-privacy-permission': 'Bảo mật, quyền riêng tư và quyền hạn',
  'category.other': 'Khác',
  'toast.recorded': 'Cảm ơn phản hồi của bạn',
  'error.conflict': 'Phản hồi này đã thay đổi ở nơi khác; đang hiển thị trạng thái mới nhất',
  'error.load': 'Không thể tải phản hồi',
  'error.generic': 'Không thể lưu phản hồi',
  'error.noteTooLarge': 'Phần mô tả quá dài; hãy rút ngắn rồi gửi lại',
} satisfies Partial<Record<keyof typeof en, string>>

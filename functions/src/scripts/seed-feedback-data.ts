/**
 * Static product-feedback fixtures for the seed script.
 *
 * These are real observations from the 2026-10-08 Playwright review of ScanGo
 * (see `docs/feedback/comparative-review-2026-10.md`), written as the reports an
 * Owner, Kitchen, Cashier, or Staff member would have sent from inside the app.
 * They are demo data, not customer data: no name, phone, or email appears.
 *
 * Ids are deterministic and `seed-`-prefixed so the seed script can be re-run
 * without creating duplicates and without touching a real report.
 */
import type { ProductFeedbackCategory, ProductFeedbackSeverity } from '../../../shared/contracts/product-feedback.contract.js';

export interface SeedProductFeedback {
  /** Deterministic suffix; the stored id is `seed-<id>`. */
  id: string;
  category: ProductFeedbackCategory;
  severity: ProductFeedbackSeverity;
  actorRole: 'owner' | 'staff' | 'kitchen' | 'cashier';
  /** Route the reporter was on, used for triage context. */
  screenContext: string;
  message: string;
  /** Days before "now" the report was written; keeps the inbox ordered. */
  daysAgo: number;
  /**
   * Optional screenshot. The seed script writes the object to Storage at
   * `tenants/{tenantId}/feedbackAttachments/{uid}/{fileName}` first, so the
   * inbox has a working image instead of a broken link.
   */
  screenshot?: {
    fileName: string;
    contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    /** Small solid-colour PNG, base64. Keeps the seed self-contained. */
    base64: string;
  };
}

/**
 * A 16x16 orange PNG. Small, valid, and obviously a placeholder, so a reviewer
 * never mistakes the seeded screenshot for a real one.
 */
const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVR42u3RMQEAAAgDoJnc6BpjDyQgd2XmzMyZmTMzZ2bOzJyZOTNzZubMzJmZMzNnZs7MnJk5M3Nm5szMmZkzM2cGqBwB0QAAAABJRU5ErkJggg==';

export const SEED_PRODUCT_FEEDBACK: readonly SeedProductFeedback[] = [
  {
    id: 'dashboard-empty-after-reload',
    category: 'bug',
    severity: 'critical',
    actorRole: 'owner',
    screenContext: '/dashboard/menu',
    message:
      'Tôi tải lại trang Thực đơn và danh sách trống trơn dù món vẫn còn. Bấm "Thêm món", lưu xong có thông báo thành công nhưng danh sách vẫn rỗng. Đi sang trang khác rồi quay lại thì món mới hiện ra. Nhìn như trang không đọc được dữ liệu ngay sau khi tải lại.',
    daysAgo: 0,
    screenshot: {
      fileName: 'seed-dashboard-menu-empty.png',
      contentType: 'image/png',
      base64: PLACEHOLDER_PNG_BASE64,
    },
  },
  {
    id: 'kitchen-permission-error-english',
    category: 'bug',
    severity: 'high',
    actorRole: 'kitchen',
    screenContext: '/simulator/kitchen',
    message:
      'Sau khi nhập PIN ở màn hình bếp, phía trên danh sách đơn hiện dòng chữ tiếng Anh "Missing or insufficient permissions." trong khi phần còn lại là tiếng Việt. Không rõ là lỗi gì và có phải bếp đang mất kết nối hay không. Nên dịch và nói rõ cần làm gì.',
    daysAgo: 0,
  },
  {
    id: 'simulator-customer-cannot-submit',
    category: 'ux',
    severity: 'high',
    actorRole: 'owner',
    screenContext: '/simulator/customer',
    message:
      'Trong phần mô phỏng, khách chọn món và bấm "Gửi đơn" thì báo "Đơn chỉ được gửi qua liên kết bàn chính thức." Vậy là không thể trình diễn trọn luồng đặt món cho người mới xem. Đề nghị cho phép gửi đơn demo trong chế độ mô phỏng, có ghi rõ là đơn thử.',
    daysAgo: 0,
  },
  {
    id: 'order-complete-message-too-early',
    category: 'ux',
    severity: 'high',
    actorRole: 'cashier',
    screenContext: '/menu/:tableId',
    message:
      'Khách vừa bấm gửi đơn xong là màn hình theo dõi hiện dấu tích xanh và dòng "Bữa ăn đã hoàn tất". Trong khi bếp còn chưa nhận đơn. Khách tưởng đã xong nên không gọi thêm và hỏi nhân viên. Cần hiện đúng trạng thái "Đã nhận đơn" trước.',
    daysAgo: 1,
    screenshot: {
      fileName: 'seed-order-tracking-done.png',
      contentType: 'image/png',
      base64: PLACEHOLDER_PNG_BASE64,
    },
  },
  {
    id: 'first-paint-two-second-splash',
    category: 'performance',
    severity: 'medium',
    actorRole: 'owner',
    screenContext: '/',
    message:
      'Mỗi lần mở hoặc tải lại trang đều phải chờ khoảng hai giây ở màn hình chờ có logo ScanGo, dù trang đã tải xong rất nhanh. Trên điện thoại 4G cảm giác còn lâu hơn. Nên bỏ màn chờ cố định hoặc giảm xuống dưới 300ms.',
    daysAgo: 1,
  },
  {
    id: 'settings-inputs-without-labels',
    category: 'ux',
    severity: 'medium',
    actorRole: 'owner',
    screenContext: '/dashboard/settings',
    message:
      'Trang Cấu hình có nhiều ô nhập và ô chọn không gắn nhãn nên trình đọc màn hình chỉ đọc là "edit text" hoặc "combobox". Nút biểu tượng như đóng/mở menu cũng không có tên. Đề nghị thêm nhãn cho tất cả ô nhập và nút chỉ có biểu tượng.',
    daysAgo: 2,
  },
  {
    id: 'table-list-missing-after-refresh',
    category: 'bug',
    severity: 'high',
    actorRole: 'staff',
    screenContext: '/dashboard/tables',
    message:
      'Tôi mở thẳng đường dẫn Sơ đồ Bàn sau khi đăng nhập thì trang báo "Chưa có bàn nào được thiết lập" dù quán đã có bàn. Không có thông báo lỗi nào. Bấm sang Doanh thu rồi quay lại thì danh sách hiện đúng. Có vẻ lần đọc đầu tiên bị bỏ qua.',
    daysAgo: 2,
  },
  {
    id: 'new-shop-empty-qr-menu',
    category: 'ux',
    severity: 'medium',
    actorRole: 'owner',
    screenContext: '/menu/:tableId',
    message:
      'Sau khi tạo quán mới và tạo bàn, tôi quét thử mã QR thì menu trống và chỉ ghi "Thử đổi bộ lọc hoặc tìm từ khóa khác". Lúc đó quán chưa có món nào nên đổi bộ lọc cũng vô ích. Nên hướng dẫn thêm món trước khi phát mã QR.',
    daysAgo: 3,
  },
  {
    id: 'no-print-bill-or-kitchen-ticket',
    category: 'feature',
    severity: 'high',
    actorRole: 'cashier',
    screenContext: '/dashboard/tables',
    message:
      'Quán tôi vẫn cần in phiếu bếp và in bill cho khách. Hiện chưa có cách in, nên bếp phải nhìn màn hình và thu ngân phải ghi tay. Đề nghị hỗ trợ in qua Bluetooth hoặc in từ trình duyệt mà không cần cài thêm phần mềm.',
    daysAgo: 3,
  },
  {
    id: 'offline-blocks-order-submit',
    category: 'feature',
    severity: 'high',
    actorRole: 'owner',
    screenContext: '/menu/:tableId',
    message:
      'Mạng quán chập chờn, khách bấm gửi đơn là bị chặn và phải làm lại từ đầu. Mong hệ thống lưu đơn tạm trên máy rồi tự gửi lại khi có mạng, có ghi rõ là đang chờ đồng bộ.',
    daysAgo: 4,
  },
  {
    id: 'weighted-average-cost-clarity',
    category: 'feature',
    severity: 'low',
    actorRole: 'owner',
    screenContext: '/dashboard/inventory',
    message:
      'Tôi muốn thấy rõ giá vốn bình quân gia quyền được tính lại sau mỗi lần nhập kho, kèm lịch sử thay đổi giá vốn của từng nguyên liệu. Hiện tôi phải tự đoán xem con số đang dùng là giá nào.',
    daysAgo: 5,
  },
  {
    id: 'no-staff-account-after-register',
    category: 'ux',
    severity: 'medium',
    actorRole: 'owner',
    screenContext: '/dashboard/staff',
    message:
      'Quán mới tạo chỉ có tài khoản chủ. Tôi muốn thử màn hình bếp và thu ngân nhưng chưa biết tạo tài khoản nhân viên ở đâu, cũng chưa có hướng dẫn ngay trên trang Nhân sự. Nên có nút mời tạo nhân viên đầu tiên.',
    daysAgo: 6,
  },
  {
    id: 'kds-fee-per-tenant-not-device',
    category: 'feature',
    severity: 'medium',
    actorRole: 'owner',
    screenContext: '/dashboard/subscription',
    message:
      'Tôi có hai màn hình bếp và một màn hình thu ngân. Đề nghị tính phí theo quán chứ không theo từng thiết bị, để tôi mở thêm màn hình mà không lo phát sinh.',
    daysAgo: 7,
  },
  {
    id: 'no-404-page',
    category: 'ux',
    severity: 'low',
    actorRole: 'staff',
    screenContext: '/khong-co-trang-nay',
    message:
      'Gõ sai đường dẫn thì trang trắng, không có tiêu đề, không có nút quay về. Nên có trang 404 riêng có nút về Doanh thu và về trang chủ.',
    daysAgo: 8,
  },
  {
    id: 'public-price-list',
    category: 'feature',
    severity: 'medium',
    actorRole: 'owner',
    screenContext: '/',
    message:
      'Trước khi đăng ký tôi muốn thấy bảng giá Free/Lite/Pro bằng số cụ thể và ghi rõ không phí khởi tạo, không hợp đồng dài hạn. Hiện phải vào trong ứng dụng mới xem được gói.',
    daysAgo: 9,
  },
  {
    id: 'image-upload-feedback-widget',
    category: 'other',
    severity: 'low',
    actorRole: 'owner',
    screenContext: '/dashboard',
    message:
      'Tôi vừa dùng nút Gửi phản hồi ở góc dưới bên trái và đính kèm được ảnh chụp màn hình. Thao tác nhanh và rõ ràng. Mong phần hộp thư phản hồi cho tôi lọc theo loại và mức độ.',
    daysAgo: 0,
  },
];

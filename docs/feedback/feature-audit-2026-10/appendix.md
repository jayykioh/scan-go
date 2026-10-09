# Phụ lục

Đính chính so với đợt 1, danh sách harness, cách chạy lại, và trạng thái dữ liệu QA.

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

## Đính chính so với báo cáo đợt 1

**BUG-02 đợt 1 cần đọc lại.** Báo cáo đợt 1 ghi: *"`/simulator/customer` cannot submit — shows
'Đơn chỉ được gửi qua liên kết bàn chính thức.'"* Trong đợt này, luồng khách trong simulator
**chạy trọn vẹn**: chọn bàn → chọn món → chọn topping → "Add to cart" → giỏ hiện "1 items 65.000đ"
→ tab "Track order" → màn theo dõi `Your order #ORD_1` với các bước `New / Cooking / Done / Served`.
Không gặp thông báo chặn nào.

Cách hiểu đúng hơn: **đơn của simulator là đơn demo cục bộ**. `SimulatorRole.tsx:46` vẫn render
`CustomerView` **không** truyền `onSubmitOrder`, nên đơn không bao giờ đi vào Firestore. Vấn đề
thật không phải "khách không gửi được" mà là **"bản demo không nối vào dữ liệu thật"**: người xem
thử đặt món trong simulator rồi mở dashboard sẽ thấy 0 đơn. Đề nghị sửa lại mô tả lỗi này trong
báo cáo đợt 1 để đội không đi tìm nhầm chỗ.

## Danh sách harness

| File | Vai trò |
|---|---|
| [`discover-surface.mjs`](../harness/discover-surface.mjs) | Dump toàn bộ phần tử tương tác của 9 trang dashboard + 6 vai trò simulator |
| [`run-feature-audit.mjs`](../harness/run-feature-audit.mjs) | 16 luồng tính năng dashboard (báo cáo này) |
| [`run-simulator-audit.mjs`](../harness/run-simulator-audit.mjs) | 7 luồng simulator + đo độ phủ ngôn ngữ |
| [`run-workflows.mjs`](../harness/run-workflows.mjs) | Quét 24 bước (đợt 1) |
| [`run-workflows-interactive.mjs`](../harness/run-workflows-interactive.mjs) | 7 luồng tương tác (đợt 1) |
| [`run-feedback-feature.mjs`](../harness/run-feedback-feature.mjs) | Kiểm tính năng phản hồi kèm ảnh (đợt 1) |
| [`inspect-firestore.mjs`](../harness/inspect-firestore.mjs) | Đọc Firestore thật để đối chứng (chỉ đọc) |

## Chạy lại

```bash
# 1. Dev server + functions emulator
npm run dev            # http://127.0.0.1:3000
npm run emulators      # http://127.0.0.1:5001

# 2. Bộ kiểm chứng đợt 2
XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs
XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-simulator-audit.mjs

# 3. Chạy riêng một luồng
XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f2
```

Một số luồng **tạo dữ liệu thật** trong tenant QA (món, nguyên liệu, bàn, tài khoản nhân sự) và
đều đặt tiền tố `[AUDIT]`. Luồng Bàn và luồng Thực đơn tự dọn qua chính giao diện. Với những lần
chạy bị ngắt giữa đường, dọn thủ công bằng cách xoá mọi tài liệu có tiền tố `[AUDIT]` trong
`tenants/<tenantId>/{menuItems,ingredients,tables,stockMovements,publicMenuItems}`.

## Trạng thái dữ liệu QA sau đợt kiểm

Tenant `first-g43h5hgnc4RJ0FJrYHxmd3g7qXl1` đã được trả về đúng trạng thái trước khi kiểm:
1 món (`Trà đá QA`), 1 bàn (`Bàn QA 01`), 1 đơn `pending`, 0 nguyên liệu, 0 phiếu kho,
1 thành viên (chủ quán). Không có tài liệu `[AUDIT]` nào còn lại.

**Còn tồn:** hai tài khoản Firebase Auth `audit.staff.*@example.com` và `audit.six.*@example.com`
không xoá được bằng Application Default Credentials (thiếu quyền Identity Toolkit). Dữ liệu
Firestore của chúng đã bị xoá nên chúng không truy cập được tenant nào, nhưng vẫn tồn tại trong
danh sách người dùng. Nên xoá thủ công trong Firebase Console → Authentication.

---

[← Về mục lục](README.md)

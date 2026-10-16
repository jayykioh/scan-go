# Kế hoạch: Khu vực bàn và phạm vi xem theo khu

**Nguồn:** SRS REQ-TBL-002, REQ-TBL-004, REQ-TBL-009, REQ-TBL-010; ADR 0025.
**Phạm vi:** P1. Không đổi P0.
**Trạng thái:** đã triển khai và có bằng chứng (xem §5).

**Vì sao:** REQ-TBL-004 đã được duyệt từ 2026-10-13 nhưng chưa có mã. Chủ quán
cần gom bàn thành khu, gán nhân viên phục vụ cho từng khu, và nhân viên được gán
chỉ nên thấy khu mình phụ trách — nếu chỉ ẩn ở giao diện thì dữ liệu khu khác vẫn
đọc được.

---

## 1. Phân công và phạm vi

| Việc | REQ | Khu vực |
|---|---|---|
| Gán nhân viên phục vụ cho khu | REQ-TBL-004 | `tableAreas` + callable + Rules + UI chủ quán |
| Tạo khu bằng cách chọn bàn, thêm nhiều bàn một lần | REQ-TBL-009 | `ZoneEditorDialog`, `zoneEditor.ts`, khung khu trên sơ đồ |
| Nhân viên được gán chỉ thấy khu mình | REQ-TBL-010 | Rules `tables`, store scope, callable Ordering/Fulfilment |

`docs/adr/0025-table-zones-and-per-staff-area-scope.md` ghi lại 6 quyết định.

## 2. Mô hình dữ liệu

- `tenants/{t}/tableAreas/{areaId}`: `label`, `waiterUids`, `updatedAt`,
  `updatedBy`. Nguồn sự thật của phân công; `waiterUids` rỗng thì xoá document.
- `tenants/{t}/tables/{tableId}.areaWaiterUids`: chiếu xuống bàn, server ghi.
- `members/{uid}.assignedAreas`: chiếu xuống member, server ghi.

## 3. Luồng lưu một lần

1. Tạo các bàn ảo trong hộp thoại (mỗi bàn một ô trống, `allocateFreePositions`).
2. Đổi nhãn các bàn được tick; bàn bị bỏ tick rời khu (về khu mặc định).
3. Đổi tên khu: gỡ document nhãn cũ, ghi document nhãn mới.
4. Gán nhân viên **sau cùng**, để lệnh này chiếu lại `areaWaiterUids` cho mọi bàn
   của khu và `assignedAreas` cho nhân viên.

Vòng lặp không nguyên tử — đã ghi `shortcut:` trong `zoneEditor.ts`; lỗi giữa
chừng thì hộp thoại ở lại, danh sách tự làm mới, và thông báo nói rõ.

## 4. Phạm vi theo khu

- Rules `tables`: chủ quán/ADMIN đọc tất cả; member chưa được gán giữ nguyên
  quyền đọc toàn quán; member đã được gán chỉ đọc bàn có `areaWaiterUids` chứa
  uid mình.
- Store: `assignedAreas` nằm trong `membershipAccessKey`, nên đổi phân công là
  store tự reset và nghe lại `tables` với truy vấn `array-contains`.
- Server chặn thêm: `callableOrderStaffCreate` (đơn dine-in ngoài khu) và
  `callableFulfilmentListReady` (món cần bưng của khu khác).

## 5. Bằng chứng

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm test` | pass (61 file / 404 test) |
| `npm run typecheck:functions`, unit functions | pass (50 file / 556 test) |
| `npm run test:rules` | pass (13 test bàn/khu, gồm truy vấn `array-contains`) |
| `npm run test:emulator` (table-access, ordering, fulfilment) | pass (33 test) |
| `verify-tables-page.mjs` (chủ quán) | 43/43, gồm vòng tạo/đổi tên/xoá khu |
| `verify-operation-pages.mjs` (nhân viên) | 87/87, gồm sàn chỉ còn khu được gán |

## 6. Triển khai (đã chạy 2026-10-16)

- `firebase deploy --only firestore:indexes` — thêm index `tables(areaWaiterUids CONTAINS, archivedAt, name)` và `orders(status, tableId, createdAt)`.
- `firebase deploy --only firestore:rules` — luật đọc `tables` theo khu và collection `tableAreas`.
- `firebase deploy --only functions:<tên>` — **từng hàm một**: `callableTableCreate`, `callableTableConfigure`, `callableTableAreaAssign`, `callableOrderStaffCreate`, `callableFulfilmentListReady`. CLI bỏ qua một số hàm khi truyền nhiều tên trong một lệnh `--only`.
- Hàm mới `callableTableAreaAssign` cần quyền gọi công khai ở tầng Cloud Run; nếu gặp 401 khi gọi, chạy:
  `gcloud run services add-iam-policy-binding callabletableareaassign --region=asia-southeast1 --member=allUsers --role=roles/run.invoker`.
- `firebase deploy --only functions` (toàn bộ) hiện đang dừng vì production còn 4 hàm không còn trong mã nguồn (`callableLoyaltyGetConfig`, `callablePromotionList`, `callableReportingGetSummary`, `callableStaffList`). Cần quyết định xoá riêng, không nằm trong lượt này.

## 7. Không làm trong lượt này

- Không làm đặt bàn (REQ-TBL-005..007).
- Không siết các callable lấy `tableId` khác (hoá đơn theo bàn, danh sách chưa
  thu, trạng thái bàn) — ghi trong ADR 0025 là nợ kỹ thuật có ý thức.
- Không tự động xếp lại bàn khi hai khu chồng lấn; màn hình cảnh báo và để chủ
  quán kéo bàn.
- Không đụng luồng khách tự đặt qua QR.

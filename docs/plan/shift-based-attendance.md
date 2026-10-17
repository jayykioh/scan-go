# Kế hoạch: Chấm công theo ca làm

**Nguồn:** SRS REQ-HRM-001..REQ-HRM-005; ADR 0026.
**Phạm vi:** P2. Không đổi P0/P1.
**Trạng thái:** đã triển khai và có bằng chứng (xem §6).

**Vì sao:** module workforce (ca làm, chấm công, sửa công) đã có từ đợt M3 và SRS
ghi Done, nhưng không file nào trong `src/` gọi tới
(`docs/feedback/feature-audit-2026-10/reachability.md`): chủ quán **không thể**
xếp ca, nhân viên **không thể** chấm công. Yêu cầu: chủ quán chia ca và gán ca cho
nhân viên, **nhân viên không tự chọn ca**, và giờ công chỉ bắt đầu tính từ lúc
nhân viên nhận ca.

---

## 1. Phân công và phạm vi

| Việc | REQ | Khu vực |
|---|---|---|
| Chủ quán xếp ca cho nhiều nhân viên trong một lần lưu | REQ-HRM-001, REQ-HRM-004 | contract, `callableWorkforceScheduleShift`, adapter, `ShiftSchedulePanel` |
| Chủ quán xoá ca chưa chấm công; nhân viên không tự xếp ca | REQ-HRM-004 | `callableWorkforceCancelShift`, Rules `shifts` |
| Nhân viên "Nhận ca" mới tính giờ, giờ do server đóng dấu | REQ-HRM-002, REQ-HRM-005 | `callableWorkforceClockIn/ClockOut`, `ShiftClockBar` |
| Chỉ phút công, không lương | REQ-HRM-003 | `attendanceSummarySchema`, bảng "Giờ công tuần này" |

`docs/adr/0026-owner-planned-shifts-and-server-time-attendance.md` ghi lại 7 quyết định.

## 2. Mô hình dữ liệu

- `tenants/{t}/shifts/{shiftId}`: `staffUid`, `date` (khoá ngày `yyyymmdd` theo
  giờ máy chủ quán), `startAt`, `endAt` (UTC), `label` (tuỳ chọn), `role`.
  Một ca là **một nhân viên**; xếp ca cho 5 người là 5 document trong một
  transaction.
- `tenants/{t}/attendance/{attendanceId}`: `attendance_{staffUid}_{shiftId}` khi
  chấm công theo ca (một bản ghi mỗi ca), giữ khoá theo ngày cho đường không có ca.
  `clockInAt`/`clockOutAt` do server ghi.
- Không thêm index: `(staffUid, date)` và `(staffUid, clockInAt desc)` đã có sẵn.

## 3. Lệnh và quyền

- `callableWorkforceScheduleShift` (chủ quán): kiểm tra trùng giờ của **mọi** nhân
  viên được chọn trong một transaction; trùng một người là hỏng cả lượt, không ghi
  gì. `staffUids` trùng nhau bị schema từ chối.
- `callableWorkforceCancelShift` (chủ quán, mới): ca đã có chấm công thì giữ lại.
- `callableWorkforceClockIn` (chính nhân viên): giờ server; đọc ca trong cùng
  transaction và bắt buộc ca thuộc về người gọi; chặn khi còn bản ghi chưa tan ca.
- `callableWorkforceClockOut` (chính nhân viên): giờ server, ghi lại người thao tác.
- Rules `shifts`: chủ quán/ADMIN đọc cả tuần; nhân viên chỉ đọc ca của mình
  (`staffUid == uid`), nên listener không giới hạn bị **từ chối**. Ghi trực tiếp
  luôn `false`.

## 4. Giao diện

- `/dashboard/staff` thêm tab **Ca làm**: điều hướng tuần, mỗi ngày một mục, mỗi ca
  một dòng (giờ, tên ca, nhân viên, `Chưa nhận ca | Đang làm | Đã xong | Thiếu chấm
  công` kèm số phút), nút xoá 44px, bảng "Giờ công tuần này" theo nhân viên.
  Nút **Thêm ca** mở hộp thoại: ngày, giờ bắt đầu/kết thúc, tên ca, tick nhiều nhân
  viên — chỉ ghi khi bấm Lưu.
- Màn hình làm việc của nhân viên (`/staff`) thêm thanh **Ca làm**: ca hôm nay và
  nút **Nhận ca**, hoặc `Đang làm từ HH:MM · XhYY` và nút **Tan ca**. Không có ca
  thì không có nút chấm công.

## 5. Giới hạn đã ghi nhận

- Không chặn nhận ca sớm/muộn so với giờ ca (`shortcut:` trong `ShiftClockBar`).
- Chưa có màn hình yêu cầu/duyệt sửa công: lệnh đã có và đã kiểm thử, chỉ thiếu UI.
- `date` của ca lấy theo ngày local của máy chủ quán; quán đặt `timezone` khác máy
  thì ca có thể nằm sai cột ngày (ADR 0026 ghi hướng nâng cấp).
- Chỉ chủ quán xếp ca: mã nguồn chưa có vai trò quản lí.

## 6. Bằng chứng

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm test` | pass (65 file / 425 test) |
| `npm run typecheck:functions`, `npm run lint:functions`, unit functions | pass (50 file / 559 test) |
| `npm run test:rules` | pass (19 file / 133 test, gồm ca của người khác bị từ chối và listener không giới hạn bị từ chối) |
| `npm run test:emulator` | 42 file pass + 2 test promotion hỏng sẵn (đã đối chiếu trên commit trước khi sửa) |
| `test/workforce/workforce.emulator.test.ts` | pass (9 test: xếp ca theo lô, huỷ ca, giờ server, ca của người khác, tan ca trùng) |
| `verify-operation-pages.mjs` (production) | xem §7 |

## 7. Triển khai

Thứ tự: `firestore:rules` (không thêm index) → 4 hàm
(`callableWorkforceScheduleShift`, `callableWorkforceCancelShift`,
`callableWorkforceClockIn`, `callableWorkforceClockOut`), mỗi hàm một lệnh vì
`deploy --only functions` vẫn bị chặn bởi 4 hàm mồ côi ở production → build web →
chạy lại harness trên production. Hàm mới cần quyền gọi công khai ở tầng Cloud Run
(`allUsers` → `roles/run.invoker`), giống `callableTableAreaAssign`.

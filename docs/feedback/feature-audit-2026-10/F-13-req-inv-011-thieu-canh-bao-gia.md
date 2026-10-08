# F-13 — REQ-INV-011 ghi "Done" nhưng cảnh báo giá nhập tăng trên 10% không tồn tại

**Mức độ:** TRUNG BÌNH · **Luồng kiểm chứng:** `--only=f7` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

Đây là phát hiện quan trọng nhất về mặt truy vết yêu cầu.

**Yêu cầu đã được duyệt.**

> **REQ-INV-011 (P1) SHOULD** warn the Owner when a new stock-in lot price exceeds the previous
> Cost per base unit by more than ten percent. **Acceptance:** Given a previous Cost of 100 VND per
> g, when a new lot is 115 VND per g, then the system **records a price-increase warning with both
> prices and the change percentage**; given 105 VND per g, then no warning occurs.
> — `docs/SRS.md:159`

Và trạng thái được ghi là hoàn thành:

> `REQ-INV-011 | Done | G3-07: a stock-in lot price above the previous Cost by more than ten percent
> records a price-increase warning with both prices, the delta, and the percentage. Unit evidence pass.`
> — `docs/SRS.md:397`

`docs/traceability.md:95` cũng khẳng định lại điều này.

**Thực tế kiểm chứng.**

1. Giao diện **hứa** có cảnh báo: *"Giá vốn sẽ đổi thành bình quân gia quyền giữa hàng đang có và
   đợt này. Nếu giá cao hơn giá trước trên 10%, hệ thống sẽ cảnh báo."*
   (`src/components/InventoryPanel.tsx:758-759`)
2. Thực hiện đúng tình huống trong tiêu chí: giá vốn 100 000/kg, nhập lô mới 150 000/kg (**+50%**).
   Giá vốn bình quân cập nhật đúng thành 250đ/g (đối với lô 10 kg + 10 kg), nhưng
   **không có cảnh báo nào xuất hiện** — không toast, không dòng chữ, không dấu hiệu.
3. Hàm tính toán **có tồn tại**, nhưng **không nơi nào gọi**:

```ts
// functions/src/modules/inventory/service.ts:319 — định nghĩa
export function lotPriceIncreasePercent(input: { previousUnitCostVnd: number; lotUnitCostVnd: number }): number | null
```

```
$ grep -rn "lotPriceIncreasePercent" --include=*.ts --include=*.tsx .
./functions/src/modules/inventory/service.ts:319      ← định nghĩa
./functions/src/modules/inventory/service.test.ts:16,676,680,684,688,692   ← chỉ có test
```

Không có tham chiếu nào trong `functions/src/modules/inventory/index.ts` (callable), trong
`shared/contracts/inventory.contract.ts`, trong `src/data/adapters/inventory.adapter.ts`, hay trong
bất kỳ component nào. Bản ghi `stockMovement` chỉ lưu `lotUnitCostVnd` và `note` — không có trường
cảnh báo nào (`functions/src/modules/inventory/index.ts:314-345`).

**Kết luận.** REQ-INV-011 được đánh dấu "Done" trên cơ sở **một unit test cho hàm trợ giúp mà
không mã sản xuất nào gọi**. Tiêu chí nghiệm thu đòi "records a price-increase warning with both
prices and the change percentage" — không có bản ghi nào như vậy được tạo, và chủ quán không bao
giờ thấy cảnh báo. Đây là khoảng cách giữa "có hàm" và "tính năng chạy được".

**Hướng sửa.** Gọi `lotPriceIncreasePercent` trong `functions/src/modules/inventory/index.ts` ngay
sau khi tính `lotUnitCostVnd`, lưu cảnh báo lên `stockMovement` (giá cũ, giá mới, phần trăm), trả
về trong kết quả callable, và hiển thị ở `InventoryPanel` cùng báo cáo thay đổi. Bổ sung test ở
tầng callable/emulator để trạng thái "Done" có bằng chứng tương xứng.

**REQ liên quan:** REQ-INV-011 (và cần rà lại cách đánh dấu "Done" — xem §6).

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f7` (từ thư mục gốc repo)

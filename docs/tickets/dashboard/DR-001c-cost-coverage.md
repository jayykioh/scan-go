# DR-001c — Độ phủ giá vốn (sức khoẻ dữ liệu)

## Requirement links

REQ-RPT-004 (đề xuất mới), REQ-RPT-001 (acceptance đã đặt điều kiện "complete recipes"),
NFR-SEC-001, NFR-PRIV-001, **REQ-AI-003** (AI chỉ đọc dữ liệu được phép).

## Owning module

Reporting sở hữu phép đếm độ phủ. Được phép đọc `catalog`, `inventory` và `config` **chỉ để đếm**;
không sở hữu và không ghi dữ liệu của các module đó. Cập nhật `docs/module/reporting.md` ở DR-001j.

## Allowed file paths

- `src/data/adapters/data-health.adapter.ts` (mới)
- `src/data/adapters/data-health.adapter.test.ts` (mới)
- `src/data/firestoreRead.ts` (chỉ để đọc `menuItems`, `recipes`, `ingredients`, `stockCounts`)

Do not change `firestore.rules` (quyền đọc đã đủ: Owner/Kitchen gate ở dòng 95, 109, 116, 277).
Do not write to any Catalog or Inventory collection. Do not change `functions/**`.

## Dependencies

**REQ-RPT-004 phải có trong SRS trước** (DR-001j giai đoạn 1) — `AGENTS.md` cấm implement khi chưa có REQ ID được duyệt. Sau đó **song song được** với DR-001a/DR-001b.

## Atomic acceptance checklist

- Given `menuItems` và `recipes`, when tính `menuCostCoveragePercent`, then món đang bán **không** có `recipeId` bị đếm là thiếu giá vốn.
- Given một món đã archive, when đếm, then không nằm trong mẫu số.
- Given `ingredients` có `unitCostVnd = 0` và chưa archive, when đếm, then được liệt kê là nguyên liệu thiếu giá.
- Given chưa có món nào, when tính, then trả `null` — không `0`.
- Given `stockCounts`, when đếm, then trả về số ngày đã kiểm kê trong kỳ, kèm số ngày **chưa** kiểm kê.
- Given một tài khoản Cashier, Waiter hoặc Kitchen không có quyền đọc Cost, when adapter chạy, then việc đọc bị Rules từ chối và adapter trả trạng thái "không đủ quyền", không trả số.
- **Given bất kỳ dữ liệu Cost hoặc độ phủ nào, when dựng ngữ cảnh cho AI, then dữ liệu đó chỉ vào ngữ cảnh nếu caller được phép đọc; AI không được nhận Cost qua đường này (REQ-AI-003).**

## Test plan

- Unit: fixture `menuItems`/`recipes`/`ingredients`/`stockCounts` cho các nhánh trên, gồm món thiếu `recipeId`, nguyên liệu thiếu giá, và mẫu rỗng.
- Unit: test rằng adapter **không** trả dữ liệu Cost khi thiếu quyền (mock read bị từ chối).
- Unit: test rằng ngữ cảnh AI không chứa trường Cost nào từ adapter này.
- Verify: `npm run test -- data-health` và `npm run typecheck`.

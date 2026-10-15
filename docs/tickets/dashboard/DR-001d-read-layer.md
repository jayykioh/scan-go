# DR-001d — Tầng đọc phơi danh sách món đầy đủ

## Requirement links

REQ-RPT-001, REQ-RPT-004, NFR-PERF-001 (không thêm lượt đọc).

## Owning module

Reporting. Tầng đọc chỉ tách phép tổng hợp khỏi phép cắt; không đổi dữ liệu trả về cho màn hình cũ.

## Allowed file paths

- `src/data/firestoreRead.ts`
- `src/data/firestoreRead.test.ts`

Do not change the Firestore query shape, the `limit(MAX_ITEMS_PER_DAY)` bound, or any Rules.

## Dependencies

DR-001b (cần định nghĩa phân loại để biết phải phơi gì). **Và REQ-RPT-004 phải có trong SRS trước** (DR-001j giai đoạn 1).

## Atomic acceptance checklist

- Given một kỳ, when đọc, then danh sách món đã tổng hợp **đầy đủ** được trả cho phân loại.
- Given cùng kỳ đó, when đọc `popularItems`, then kết quả **không đổi**: cùng 20 món, cùng thứ tự (sort theo `revenueVnd` rồi `paidQuantity`).
- Given dữ liệu đủ nhiều, when đọc, then danh sách đầy đủ có nhiều hơn 20 phần tử.
- Given một lượt đọc, when so với trước, then **không thêm** truy vấn Firestore nào (số `getDocs` không tăng).
- Given `MAX_ITEMS_PER_DAY = 100` bị chạm, when trả danh sách, then có cờ báo "một phần" để màn hình gắn nhãn.
- Given `reportingSummaryResultSchema`, when parse, then schema **không đổi** (danh sách đầy đủ không đi vào contract đã đóng).

## Test plan

- Unit trong `firestoreRead.test.ts`: kết quả `popularItems` giữ nguyên so với trước khi sửa (test hồi quy).
- Unit: danh sách đầy đủ > 20 phần tử khi fixture có hơn 20 món.
- Unit: cờ "một phần" bật khi fixture chạm `MAX_ITEMS_PER_DAY`.
- Verify: `npm run test -- firestoreRead`.

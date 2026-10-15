# Dashboard trust wave — ticket set

Nguồn: [dashboard-data-research-2026-10.md](../../feedback/dashboard-data-research-2026-10.md) (`DB-01…DB-40`),
SRS 1.2, ADR 0005, ADR 0015, và đọc trực tiếp `src/pages/dashboard/OverviewPage.tsx`,
`shared/contracts/reporting.contract.ts`, `firestore.rules`.

## Bản đồ capability — đã duyệt 2026-10-13

| Capability | Trách nhiệm | Phụ thuộc | DB |
|---|---|---|---|
| `reporting` | Mô hình đọc + định nghĩa chỉ số dẫn xuất: độ phủ giá vốn, huỷ/hoàn, AOV, lợi nhuận theo món/bàn, so sánh kỳ. Sau này: theo giờ, hình thức thanh toán, kênh, thời gian chế biến, khuyến mãi | — | DB-01…DB-08, DB-26 |
| `catalog` | Sửa nhanh, bật/tắt món, đổi giá hàng loạt, nhập menu từ file | — | DB-28…DB-31 |
| `config` | Mục tiêu doanh thu, giờ mở cửa/ngày nghỉ, ngưỡng cảnh báo | — | DB-32…DB-34 |
| `notification` | Cảnh báo + digest (đã có REQ-NOT-001) | `reporting`, `config` | DB-25 |
| `admin` | "Thay đổi gần đây" — chiếu audit cho Owner | — | DB-38 |
| `owner-dashboard` | **Lớp composition, không sở hữu dữ liệu**: trang tổng quan hợp nhất, danh mục báo cáo phân nhóm, thẻ sức khoẻ dữ liệu, nút AI, xuất báo cáo, mobile | `reporting`, `catalog`, `config`, `admin` | DB-09, DB-27, DB-35…DB-37 |

**Thứ tự build:** `reporting` → `catalog`, `config` (song song) → `notification`, `owner-dashboard` → `admin` (độc lập).

## Phạm vi đợt này — đã duyệt 2026-10-13

Nhóm A + DB-26 + DB-27: **sửa niềm tin số liệu trước khi thêm chỉ số**.
Kế hoạch đầy đủ, đồ thị phụ thuộc và rủi ro: [dashboard-trust-plan.md](../../plan/dashboard-trust-plan.md).

### DR-001 — capability `reporting`

| Ticket | Nội dung | Phụ thuộc | DB |
|---|---|---|---|
| [DR-001a](DR-001a-derived-metrics.md) | Chỉ số dẫn xuất: doanh thu thuần, food cost %, AOV, tỷ lệ huỷ/hoàn | — | DB-02, DB-05, DB-06 |
| [DR-001b](DR-001b-menu-engineering.md) | Phân loại menu engineering, loại dòng quà tặng | a | DB-03 |
| [DR-001c](DR-001c-cost-coverage.md) | Độ phủ giá vốn (sức khoẻ dữ liệu) | — | DB-26 |
| [DR-001d](DR-001d-read-layer.md) | Tầng đọc phơi danh sách món đầy đủ | b | DB-03 |
| [DR-001e](DR-001e-period-comparison.md) | So sánh kỳ trước | a | DB-07 |
| [DR-001f](DR-001f-kpi-cards.md) | Thẻ KPI đúng cơ sở + nhãn độ phủ | a, c | DB-01, DB-02 |
| [DR-001g](DR-001g-table-performance.md) | Bảng hiệu suất theo bàn ← **lỗ hổng REQ-RPT-001** | — | DB-04 |
| [DR-001h](DR-001h-menu-engineering-panel.md) | Ma trận menu engineering trên màn hình | b, d | DB-03 |
| [DR-001i](DR-001i-period-comparison-panel.md) | Khối so sánh kỳ trước trên màn hình | e | DB-07 |
| [DR-001j](DR-001j-docs-traceability.md) | SRS §4.7 (**giai đoạn 1, làm TRƯỚC a**) + traceability, module doc (giai đoạn 2, làm cuối) | — / a…i | — |

### DR-002 — capability `owner-dashboard` *(chưa viết)*

Trang tổng quan hợp nhất, danh mục báo cáo phân nhóm, thẻ sức khoẻ dữ liệu, nút "Xem AI Báo Cáo" chết,
"thay đổi gần đây" — DB-09, DB-27, DB-38.

**Thứ tự làm — đọc kỹ, có một ràng buộc cứng:**

`AGENTS.md` cấm implement khi chưa có REQ ID được duyệt. Phân loại theo REQ mà mỗi ticket cần:

| Nhóm | Ticket | REQ cần | Khởi động được khi |
|---|---|---|---|
| **Không cần REQ mới** | `DR-001a`, `DR-001g` | REQ-RPT-001 (đã có) | **Ngay bây giờ** |
| **Cần REQ-RPT-004** | `DR-001b`, `DR-001c`, `DR-001d`, `DR-001f`, `DR-001h` | REQ-RPT-004 (đề xuất) | Sau `DR-001j` giai đoạn 1 |
| **Cần REQ-RPT-003** | `DR-001e`, `DR-001i` | REQ-RPT-003 (đề xuất) | Sau `DR-001j` giai đoạn 1 |
| **Chính là bước mở khoá** | `DR-001j` giai đoạn 1 | — | **Ngay bây giờ** |

Trình tự:

1. **Chạy song song ngay:** `DR-001j` giai đoạn 1 (thêm REQ vào SRS) · `DR-001a` · `DR-001g`.
2. **Sau khi có REQ trong SRS:** `DR-001a → DR-001b → DR-001d`; song song `DR-001c`; rồi `DR-001e → DR-001i`;
   `DR-001f` sau a+c; `DR-001h` sau b+d.
3. **`DR-001j` giai đoạn 2** cuối cùng.

Bốn ticket UI (`f`, `g`, `h`, `i`) **dùng chung `src/pages/dashboard/OverviewPage.tsx`** để gắn khối,
nên phần gắn phải tuần tự; mỗi khối nằm trong component riêng để giảm đụng độ.

## Quyết định đã chốt

1. Bản đồ capability như trên; `owner-dashboard` là capability composition riêng.
2. Phạm vi: nhóm A + DB-26/27. Nhóm C và nhóm D để đợt sau.
3. Mọi chỉ số mới ở tầng dữ liệu sẽ đi theo **contract v2 + mapper** (`mapReportingV1ToV2`), theo mẫu promotion đã dùng. **Đợt này chưa cần**, xem ghi chú bên dưới.
4. Vai trò **không đổi**: chỉ Owner, Solo và ADMIN xem được dữ liệu tiền. Không thêm vai trò quản lý ca.
5. Tách **lỗ hổng acceptance của REQ có sẵn** khỏi **REQ mới**; SRS §4 và §15 chỉ sửa khi spec được duyệt.
6. `reporting` được đọc `catalog`, `inventory`, `config` để tính độ phủ dữ liệu; cập nhật `docs/module/reporting.md` khi implement.

## Ghi chú làm giảm chi phí đợt này

**Đợt này KHÔNG cần đổi reporting contract.** `firestore.rules` cho Owner đọc trực tiếp `menuItems`,
`recipes`, `ingredients` và `stockCounts` (dòng 95–135, 277), nên độ phủ giá vốn (DB-26) tính được ở
client. Contract v2 chỉ cần khi làm nhóm C (theo giờ, hình thức thanh toán, kênh, thời gian chế biến).

## Không thuộc đợt này

- **DB-10…DB-16** đã có ticket trong [insight-growth-plan.md](../../plan/insight-growth-plan.md):
  `G2-02`, `G2-05`, `G3-01`…`G3-05`. Việc còn lại là nối UI, không viết spec mới.
- **DB-17…DB-25, DB-40** (nhóm C): cần tổng hợp mới ở máy chủ và contract v2.
- **DB-28…DB-39** (nhóm D): `catalog`, `config`, `notification`, `owner-dashboard` đợt sau.
- Payroll/labour cost: ngoài phạm vi v1 (SRS §1.2). Không hứa "prime cost".

## Ràng buộc dùng chung

- Tiền là **integer VND**; thời gian lưu **UTC**, hiển thị theo múi giờ tenant (RULES §4).
- Mọi ghi vào business collection là **server-only**; client chỉ đọc (RULES_FIREBASE §3).
- Zod ở biên; `strictObject` cho mọi contract mới.
- Rules theo tenant; không nới quyền đọc `dailyStats` (đang Owner/ADMIN).
- **Không hardcode ngưỡng benchmark** (food cost 28–35% của Mỹ không đúng cho VN — thực tế 44,8%).
- **AI chỉ đọc trên dữ liệu được phép** — yêu cầu trực tiếp của chủ dự án, 2026-10-13. DR-001c mở quyền
  đọc `recipes`/`ingredients` (có Cost) cho Reporting **chỉ để đếm độ phủ**; dữ liệu Cost đó **không
  được** đi vào ngữ cảnh AI. AI vẫn đi qua permission filter của REQ-AI-003, và REQ-AI-008 (đã thêm vào
  SRS ngày 2026-10-13) ghi rõ: *"given a caller without the Cost permission, then no margin is computed
  or returned"*.
- Test: `npm run test`, `npm run test:rules`, `npm run test:emulator`, `npm run typecheck`, `npm run lint`.

## Traceability map (điền khi implement)

| REQ | Ticket |
|---|---|
| REQ-RPT-001 (lỗ hổng acceptance) | DR-001 |
| REQ-RPT-003 (đề xuất mới) | DR-001 |
| REQ-RPT-004 (đề xuất mới) | DR-001 |

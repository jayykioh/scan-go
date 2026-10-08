# Đánh giá ScanGo bằng Playwright + so sánh đối thủ — 2026-10-08

**Phạm vi:** chạy các workflow thật của người dùng trên bản `release/mvp` đang chạy tại
`http://127.0.0.1:3000`, ghi lại bằng chứng (ảnh chụp, snapshot ARIA, log console,
lỗi mạng, số đo thời gian), rồi đối chiếu với 8 sản phẩm cùng phân khúc.

**Môi trường:** Vite dev server + Firebase Functions emulator; Firebase Auth và Firestore
thật (`scango-8f0e9`) với một tài khoản QA do harness tự tạo
(`qa.playwright+…@example.com`, tenant `Quán QA Playwright`). Bước kiểm tra tính năng
phản hồi chạy hoàn toàn hermetic trên emulator (Firestore + Functions + Storage).

**Bằng chứng thô:** [`docs/feedback/artifacts/`](artifacts/) — 24 bước khảo sát trang,
7 workflow tương tác, 6 bước kiểm tra tính năng mới, kèm `workflow-report.json`,
`interactive-report.json`, `feedback-feature-report.json`.

**Harness tái sử dụng:**

```bash
node docs/feedback/harness/run-workflows.mjs              # khảo sát trang + a11y + timing
node docs/feedback/harness/run-workflows-interactive.mjs  # workflow tương tác
node docs/feedback/harness/run-feedback-feature.mjs       # kiểm tra phản hồi + upload ảnh
```

---

## 1. Kết luận ngắn

ScanGo chạy được và luồng cốt lõi **thật sự hoạt động end-to-end**: tạo quán → tạo bàn →
khách quét link `/menu/<token>` → chọn món kèm topping → gửi đơn → đơn được ghi vào
Firestore (`status: pending`) → chủ quán thấy trong dashboard. Đây là điểm mạnh lớn nhất
và ít sản phẩm Việt Nam làm được luồng này mượt như vậy trên web, không cần cài app.

Nhưng có **hai lỗi nghiêm trọng chặn đúng hai con đường mà người đánh giá sẽ đi đầu tiên**:

1. Sau khi **tải lại trang** (F5 hoặc mở trực tiếp đường dẫn), danh sách Thực đơn / Sơ đồ
   bàn **rỗng** dù dữ liệu vẫn còn, và **không có thông báo lỗi nào**.
2. Trong **chế độ mô phỏng** — nút CTA chính trên trang chủ — khách **không thể gửi đơn**,
   bếp báo lỗi tiếng Anh `Missing or insufficient permissions.`

Cả hai đều là lỗi im lặng: người dùng không biết mình đang gặp lỗi hay ứng dụng chỉ đang
trống. Với một sản phẩm đang bán cho quán nhỏ, đây là loại lỗi làm mất niềm tin nhanh nhất.

---

## 2. Bảng lỗi theo mức độ

| ID | Mức độ | Tiêu đề | Bằng chứng |
|---|---|---|---|
| BUG-01 | **Nghiêm trọng** | Danh sách rỗng sau khi tải lại trang, không có thông báo lỗi | [tables-after-create](artifacts/w4-owner-end-to-end-03-tables-after-create.png), [menu-after-save](artifacts/w5-owner-create-menu-item-04-menu-after-save.png) |
| BUG-02 | **Nghiêm trọng** | Simulator: khách không thể gửi đơn | [after-submit](artifacts/w1-customer-order-06-after-submit.png) |
| BUG-03 | Cao | Simulator: KDS/Thu ngân hiện `Missing or insufficient permissions.` bằng tiếng Anh | [kds-after-login](artifacts/w2-kitchen-02-kds-after-login.png) |
| BUG-04 | Cao | Màn hình theo dõi báo "Bữa ăn đã hoàn tất" ngay sau khi gửi đơn còn `pending` | [after-submit](artifacts/w7-public-04-after-submit.png) |
| BUG-05 | Cao | Quán mới: QR mở menu trống, thông báo "Thử đổi bộ lọc" sai hướng | [w7-public-01-menu](artifacts/w7-public-01-menu.png) |
| BUG-06 | Trung bình | Không có trang 404; lộ lỗi React Router ra console | [public-404](artifacts/public-404.png) |
| BUG-07 | Trung bình | Splash 2 giây cố định trên mọi lần tải, dù DOM xong sau ~60ms | `workflow-report.json` |
| BUG-08 | Trung bình | 21 lỗi a11y: ô nhập thiếu nhãn, nút chỉ có icon thiếu tên | Cấu hình: 10 lỗi trong 1 trang |
| BUG-09 | Thấp | Cảnh báo React `An empty string ("") was passed to the %s attribute` | `feedback` → console |
| BUG-10 | Thấp | Toast góc dưới phải bị widget AI che | [tables-after-create](artifacts/w4-owner-end-to-end-03-tables-after-create.png) |
| BUG-11 | Trung bình | Storage emulator crash tiến trình `firebase` khi thiếu Firestore emulator | log `Cannot determine host and port of firestore` |

---

## 3. Chi tiết từng lỗi

### BUG-01 — Danh sách rỗng sau khi tải lại trang (Nghiêm trọng)

**Cách tái hiện**

1. Đăng nhập chủ quán, vào **Thực đơn**, thêm một món → toast "ĐÃ THÊM MÓN MỚI".
2. Danh sách vẫn ghi **"Chưa có món ăn nào."**
3. Bấm sang **Doanh thu** rồi quay lại **Thực đơn** → món hiện ra bình thường.

Kiểm tra trực tiếp Firestore xác nhận bản ghi **đã được ghi**:

```
menuItems: [ { id: 'mQ8oVjYLL2RaBIxWBom3', name: 'Trà đá QA', priceVnd: 10000 } ]
tables:    [ { id: 'aSXum1V3IFEXmAlsJZR7', name: 'Bàn QA 01', archivedAt: null } ]
```

Thí nghiệm đối chứng (cùng một tài khoản, cùng một trang):

| Cách vào trang | Kết quả |
|---|---|
| Điều hướng trong app (click menu trái) | Hiện đúng 1 bàn |
| **Tải lại trang (F5)** | **0 bàn, không có thông báo lỗi** |
| Đi trang khác rồi quay lại | Hiện đúng 1 bàn |

**Nguyên nhân gốc**

`src/data/adapters/table.adapter.ts:163` (và 11 chỗ tương tự trong `catalog`, `config`,
`inventory`, `fulfilment`, `subscription`, `tenant`, `onboarding`) thoát sớm khi
`getFirebaseAuth()?.currentUser` còn `null`:

```ts
const uid = getFirebaseAuth()?.currentUser?.uid;
if (!db || !uid) {
  onChange([]);        // trả về danh sách rỗng, không báo lỗi
  return () => undefined;
}
```

Khi tải lại trang, Firebase Auth còn đang khôi phục phiên từ IndexedDB, nên `currentUser`
là `null` trong khoảnh khắc đó. `TablesPage` gọi listener trong `useEffect(..., [])` — chạy
đúng một lần — nên **không bao giờ thử lại**. Kết quả là rỗng vĩnh viễn cho tới khi
component unmount.

**Ảnh hưởng:** chủ quán mở app buổi sáng, thấy quán mình trống trơn. Tệ hơn, thao tác
"thêm" vẫn báo thành công, nên họ sẽ tạo trùng bàn/món.

**Hướng sửa**

- Chờ phiên xác thực rồi mới mở listener: dùng `onAuthStateChanged` (đã có `useAuthSession`)
  hoặc cho `useEffect` phụ thuộc `user?.uid`.
- Phân biệt ba trạng thái trong UI: **đang tải** / **trống thật** / **lỗi**. Hiện tại cả ba
  đều render cùng một khối "Chưa có …".
- Thêm test: adapter không được trả `[]` khi chưa có `currentUser`; phải chờ và mở listener.

### BUG-02 — Simulator không thể hoàn tất đơn của khách (Nghiêm trọng)

`/simulator/customer` cho chọn bàn, xem menu, chọn topping, mở giỏ hàng — mọi thứ rất tốt.
Bấm **Gửi đơn** thì hiện lỗi đỏ:

> Đơn chỉ được gửi qua liên kết bàn chính thức.

**Nguyên nhân:** `src/pages/SimulatorRole.tsx` render `<CustomerView … />` mà **không truyền
`onSubmitOrder`**. `CustomerView.submitOrder` thấy thiếu callback nên báo
`t('customer.submit.linkOnly')` (`src/components/CustomerView.tsx:203-208`). Đây là hành vi
đúng về mặt bảo mật (trình duyệt không được tự tạo Order), nhưng nó biến chế độ mô phỏng —
nút CTA "XEM MÔ PHỎNG" trên trang chủ — thành ngõ cụt.

**Hướng sửa (chọn một)**

- Thêm callable `callableOrderSimulate` chỉ hoạt động cho tenant demo, ghi Order có cờ
  `isSimulated: true` để báo cáo doanh thu loại trừ.
- Hoặc cho simulator tạo đơn trong state cục bộ và ghi rõ "Đơn mô phỏng, không gửi lên máy chủ".
- Hoặc đổi CTA trang chủ thành "Mở bàn demo" trỏ tới một `/menu/<token>` thật của tenant demo.

### BUG-03 — KDS/Thu ngân simulator hiện lỗi tiếng Anh (Cao)

Sau khi nhập PIN ở `/simulator/kitchen`, phía trên danh sách đơn hiện nguyên văn:

> `Missing or insufficient permissions.`

Nút **"+ Đơn ảo"** báo "ĐÃ THÊM 1 ĐƠN HÀNG ẢO" nhưng KDS vẫn "0 Đơn Chờ". Nguyên nhân cùng
họ với BUG-01/BUG-02: `KitchenView` và `CashierView` đọc **Firestore thật** bằng
`activeTenantId` — mà trong simulator giá trị này là của tenant thật của người đang đăng
nhập, hoặc rỗng — trong khi phần còn lại của simulator dùng `src/mockData.ts`. Hai nguồn dữ
liệu bị trộn trong cùng một màn hình.

**Hướng sửa:** trong simulator, hoàn toàn dùng mock (như CustomerView/OwnerView đang làm);
dịch và hành động hoá thông báo lỗi ("Không đọc được dữ liệu bếp — thử đăng nhập lại").

### BUG-04 — "Bữa ăn đã hoàn tất" hiện quá sớm (Cao)

Đơn thật vừa gửi xong (`status: pending` trong Firestore), màn hình theo dõi của khách đã
hiện dấu tích xanh và dòng **"Bữa ăn đã hoàn tất"**. `TrackingScreen` hiển thị
`customer.tracking.doneTitleShort` khi `orders.length === 0`
(`src/components/CustomerView.tsx:585-590`) — không phân biệt được "chưa có đơn nào" với
"mọi đơn đã phục vụ".

**Hướng sửa:** thêm trạng thái `loading` cho lần đọc đầu, hiện "Đã nhận đơn" khi đơn tồn tại
và chưa `served`, chỉ hiện "hoàn tất" khi mọi đơn ở `served`.

### BUG-05 — QR của quán mới dẫn tới menu trống (Cao)

Quy trình đăng ký → tạo bàn → quét QR cho ra màn hình trống với dòng
**"Thử đổi bộ lọc hoặc tìm từ khóa khác."** — trong khi nguyên nhân thật là quán chưa có món
nào, nên đổi bộ lọc không giúp gì. Không có hướng dẫn quay lại thêm món.

**Hướng sửa:** empty state của menu công khai đọc `itemCount` của tenant: nếu bằng 0, hiện
"Quán chưa cập nhật thực đơn" (khách quan) và ở phía chủ quán, chặn nút "In mã QR" cho tới
khi có ít nhất một món, kèm deep-link tới `/dashboard/menu`.

### BUG-06 — Không có trang 404 (Trung bình)

`/khong-co-trang-nay` render gần như trắng (`textLength: 207`), **không có `h1`**, và bắn
hai lỗi console `Error handled by React Router default ErrorBoundary`. Không có đường quay về.

### BUG-07 — Splash 2 giây cố định (Trung bình)

`src/App.tsx:118-125` đặt `setTimeout(() => setInitialLoading(false), 2000)` — một hằng số,
không liên quan tới việc ứng dụng đã sẵn sàng hay chưa. Số đo thật:

| Trang | DOMContentLoaded | Nội dung hiện ra |
|---|---|---|
| `/` | 202 ms | ~2,3 s |
| `/login` | 54 ms | ~2,1 s |
| `/dashboard/tables` | 58 ms | ~2,1 s |

Ứng dụng đã sẵn sàng sau ~60 ms nhưng luôn bắt người dùng chờ 2 giây. Đây là chi phí cảm
nhận lớn nhất trên mobile 4G và là thứ dễ sửa nhất trong danh sách này. Ngoài ra animation
`whileInView` của khối "Cấu trúc hệ thống" giữ nội dung ở `opacity: 0` cho tới khi cuộn tới;
không có nhánh `prefers-reduced-motion`.

### BUG-08 — Khuyết tật trợ năng (Trung bình)

Harness kiểm tra mỗi trang bằng DOM thật. Kết quả:

| Trang | Số lỗi | Ví dụ |
|---|---|---|
| `/dashboard/settings` | 10 | 6 ô `<input>`/`<select>` không có `<label for>` hay `aria-label` |
| `/staff` | 2 | ô email và mật khẩu không có nhãn |
| `/simulator/*` | 2–3 mỗi trang | `<select>` đổi vai trò và mũi tên quay lại không có tên truy cập |
| `/menu/:token` | 1 | ô "Tìm món..." không có nhãn |
| `/dashboard/menu` | 1 | ô "Tìm kiếm món ăn..." không có nhãn |

Ngoài ra `/simulator/owner` có **6 mục bấm nhỏ hơn 32×32 px** — dưới ngưỡng chạm tối thiểu.

### BUG-09, BUG-10 — Lỗi nhỏ nhưng dễ sửa

- Console cảnh báo `An empty string ("") was passed to the %s attribute` khi khách vào menu —
  có phần tử nhận `src=""`/`href=""`, khiến trình duyệt có thể tải lại cả trang.
- Toast trạng thái ở góc dưới phải **bị nút trợ lý AI che** (ảnh `w4-…-03-tables-after-create.png`).

### BUG-11 — Trải nghiệm nhà phát triển với emulator (Trung bình)

`firebase emulators:start --only functions,storage` **giết cả tiến trình CLI** khi Storage
Rules gọi `firestore.exists(...)`: storage rules runtime cần Firestore emulator và ném
`Cannot determine host and port of firestore` (xem log debug). Vì `storage.rules` phụ thuộc
Firestore, tài liệu nên nói rõ phải chạy:

```bash
firebase emulators:start --only firestore,functions,storage
```

Hai điểm đau nhỏ khác đã gặp: CLI cần `XDG_CONFIG_HOME` ghi được (nếu không, `configstore`
làm sập tiến trình khi thoát), và jar của Firestore emulator cần
`FIREBASE_EMULATORS_PATH=$PWD/.emu-cache` khi `~/.cache` chỉ đọc. `.gitignore` đã có sẵn
`.emu-cache/` nhưng README chưa hướng dẫn.

---

## 4. Những gì đang làm tốt (nên giữ)

- **Luồng khách thật chạy trọn vẹn.** Menu → tuỳ chọn → giỏ → gửi đơn → theo dõi; Order
  được máy chủ định giá và ghi vào Firestore. Ít đối thủ Việt cho khách đặt món trên web
  mà không cần cài app.
- **Ngôn ngữ thiết kế nhất quán** (neo-brutalist: viền đen, đổ bóng cứng, chữ mono) — nhìn
  khác biệt hẳn so với các POS nội địa vốn nặng nề. Tốc độ tải DOM rất tốt (~55–80 ms).
- **Trạng thái rỗng thân thiện** ở hầu hết màn hình, có hướng dẫn nhanh dạng
  "ScanGo Assistant" (dù đôi khi che nút cần bấm — xem BUG-10).
- **Giá vốn bình quân gia quyền được ghi rõ trong tài liệu.** Khảo sát đối thủ cho thấy chỉ
  Bota ghi rõ điều tương tự; iPOS, Sapo, KiotViet, PosApp, CukCuk đều không công bố. Đây là
  lợi thế kỹ thuật thật, nên nói ra trong tài liệu bán hàng.
- **Trợ lý AI có dẫn nguồn + ngân sách theo tenant** — không đối thủ Việt nào có.
- **Pipeline đối chiếu giá thị trường** (`market:survey`, `market:drift`) là duy nhất trên
  thị trường; hiện chỉ nằm trong script, chưa lên UI (xem khuyến nghị B-9).
- **Kỷ luật bảo mật:** mọi ghi nghiệp vụ qua callable, Rules chặn ghi trực tiếp, có audit,
  và bộ test Rules chạy thật trên emulator.

---

## 5. So sánh với đối thủ

Bảng đầy đủ và nguồn từng dòng nằm ở
[`competitor-report-2026-10.md`](competitor-report-2026-10.md) (8 sản phẩm × 11 tiêu chí,
có URL nguồn, ghi rõ chỗ `chưa xác minh`).

### 5.1 Định vị: ScanGo đang ở đâu

| | ScanGo | iPOS | Sapo FnB | KiotViet | PosApp | CukCuk | Toast | Square |
|---|---|---|---|---|---|---|---|---|
| QR tự gọi món | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Không cần phần cứng hãng** | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ (bộ 7–15,4 tr) | ❌ bắt buộc | ⚠️ iPad |
| KDS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ tính theo thiết bị |
| **In bill / phiếu bếp** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Bán được khi mất mạng** | ❌ chặn gửi đơn | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ 72 h |
| **Hoá đơn điện tử** | ❌ | ✅ | ✅ | ✅ miễn phí | ✅ | ✅ | — | — |
| Giá công khai | ✅ 99 k/tháng | ❌ | ✅ 160 k | ✅ 270 k+ | ✅ 220 k+ | ✅ 199 k+ | ✅ $0/$69 | ✅ $0/$49 |
| Hợp đồng dài hạn | ✅ không | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ theo năm | ❌ 2–3 năm | ✅ không |
| Bình quân gia quyền | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Thu review khách | ✅ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ |
| **Gửi phản hồi SP kèm ảnh** | ✅ **mới** | — | — | — | — | — | — | — |
| AI cho chủ quán | ✅ dẫn nguồn | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |

### 5.2 Ba khoảng trống lớn nhất

1. **Không in được bill / phiếu bếp.** 100% đối thủ đều có. Đây là lỗ hổng vận hành lớn
   nhất: bếp phải nhìn màn hình, thu ngân phải ghi tay. Đề xuất: ESC/POS qua Web
   Bluetooth/USB từ chính trình duyệt, cộng một "print bridge" chạy trên máy cũ trong quán
   để bếp vẫn nhận phiếu khi màn hình KDS hỏng (iPOS cũng đẩy đơn "qua máy in **hoặc** KDS").
2. **Chặn gửi đơn khi mất mạng** (REQ-ORD-004). PosApp, Bota, MISA eShop, Toast, Square đều
   bán được offline. Quán 5–15 bàn ở Việt Nam có wifi chập chờn; đây là lý do mất khách thật.
3. **Không có hoá đơn điện tử.** KiotViet tặng miễn phí 5.000–50.000 hoá đơn/năm; PosApp nêu
   rõ tuân thủ NĐ 70/2025. Đây là **rào cản pháp lý**, không phải tính năng phụ.

### 5.3 Cơ hội định vị rõ nhất

Khảo sát cho thấy Toast bị phàn nàn nặng trên Reddit/BBB vì **hợp đồng 2–3 năm + phí chấm
dứt sớm + khoá cứng bộ xử lý thanh toán + phần cứng độc quyền mất giá**, còn Square thắng
đúng phân khúc quán nhỏ nhờ **$0 khởi đầu và không hợp đồng**. ScanGo đang có lợi thế cấu
trúc y hệt Square nhưng **chưa nói ra**. Nên công khai ngay trên trang chủ:

> 99.000 ₫/tháng · không phí khởi tạo · không hợp đồng dài hạn · không tính phí theo màn
> hình KDS · không cần mua máy POS.

Đối thủ Việt không công bố giá (iPOS) hoặc bán bộ máy 7–15 triệu (CukCuk) — đây là chỗ
ScanGo thắng bằng thông điệp, không cần thêm tính năng.

---

## 6. Khuyến nghị ưu tiên

**Đợt 1 — sửa trong 1–2 ngày (chặn đánh giá sản phẩm)**

1. Sửa BUG-01: mở listener sau khi Auth khôi phục phiên; phân biệt "đang tải / trống / lỗi".
2. Sửa BUG-02: cho simulator gửi được đơn demo (hoặc đổi CTA sang link bàn thật).
3. Sửa BUG-03: simulator dùng mock hoàn toàn; dịch thông báo lỗi.
4. Sửa BUG-04: thêm trạng thái "Đã nhận đơn"; chỉ "hoàn tất" khi `served`.
5. Sửa BUG-07: bỏ `setTimeout(2000)`, thay bằng tín hiệu sẵn sàng thật.

**Đợt 2 — trong tuần**

6. BUG-05: chặn phát QR khi chưa có món + empty state đúng nguyên nhân.
7. BUG-06: trang 404 có thương hiệu và đường quay về.
8. BUG-08: thêm nhãn cho toàn bộ ô nhập; `aria-label` cho nút icon; nâng mục bấm lên ≥ 44 px.
9. BUG-09/10: `src`/`href` nhận `undefined`; dời toast lên trên widget AI.
10. BUG-11: ghi vào README cách chạy emulator đúng (kèm `FIREBASE_EMULATORS_PATH`).

**Đợt 3 — tạo khác biệt (theo đối thủ)**

11. **In bill và phiếu bếp** qua Web Bluetooth/USB + print bridge.
12. **Hàng đợi offline** cho gửi đơn và KDS cục bộ, có nhãn "chưa đồng bộ" và chống trùng.
13. **Hoá đơn điện tử** theo NĐ 70/2025 (hoặc tích hợp nhà cung cấp HĐĐT).
14. **Công bố bảng giá** Free/Lite/Pro bằng số cụ thể ngay trên trang chủ.
15. **Không tính phí KDS theo thiết bị** — bán theo tenant, ghi rõ trong bảng giá.
16. **Đưa `market:survey` lên UI**: cảnh báo khi giá nhập cao hơn giá tham chiếu vùng > 10 %,
    kèm nguồn và ngày khảo sát. Đây là tính năng không đối thủ nào có.
17. **Mời đánh giá Google sau khi thanh toán**: QR 1 chạm, **không tặng quà đổi review**
    (Google cấm tường minh) — gộp review Google + review nội bộ về một màn hình, dùng AI
    phân nhóm chủ đề (đã có REQ-FDB-002).
18. **Màn hình "Sức khoẻ vận hành" cho chuỗi**: giá vốn, hao hụt, thời gian ra món, doanh thu
    theo chi nhánh — đối thủ tính thêm 270–375 k mỗi chi nhánh.

---

## 7. Tính năng đã thêm trong đợt này: phản hồi sản phẩm kèm ảnh

Vì khảo sát cho thấy **không đối thủ nào công bố kênh gửi phản hồi sản phẩm kèm ảnh chụp**,
và vì chính việc đánh giá này cần một kênh như vậy, tôi đã thêm nó vào ứng dụng.

- **Yêu cầu:** REQ-FDB-004, REQ-FDB-005, REQ-FDB-006 (`docs/SRS.md` §4.8.1), đã ghi vào
  `docs/traceability.md`.
- **Ai dùng được:** mọi thành viên đã đăng nhập (Owner, Staff, Kitchen, Cashier) qua nút nổi
  **"Gửi phản hồi"**; hộp thư **`/dashboard/feedback`** dành cho Owner/ADMIN.
- **Ảnh:** tối đa 3 ảnh PNG/JPEG/WEBP/GIF, mỗi ảnh ≤ 5 MB, tải thẳng lên
  `tenants/{tenantId}/feedbackAttachments/{uid}/{fileName}` — đúng prefix của người gửi.
- **Bảo mật:** Storage Rules là cổng ghi (allowlist raster, chặn SVG, chặn xoá); máy chủ kiểm
  tra lại đường dẫn nằm trong prefix của người gửi; bản ghi server-written, Owner/ADMIN đọc;
  đổi trạng thái ghi append-only actor + thời gian + lý do.
- **Bằng chứng chạy thật** (trình duyệt → Storage emulator → Functions emulator):

  | Bước | Kết quả |
  |---|---|
  | Mở widget | ✅ `dialog visible = true` |
  | Tải ảnh lên Storage | ✅ `thumbnail rendered = 1` |
  | Gửi | ✅ `success toast = true`, dialog đóng |
  | Hộp thư hiện bản ghi + ảnh | ✅ `inbox image count = 1` |
  | Chuyển trạng thái kèm lý do | ✅ `status moved to resolved = true` |

  Ảnh: [widget có ảnh](artifacts/feature-feedback-03-image-attached.png) ·
  [hộp thư](artifacts/feature-feedback-05-inbox.png)

- **Test:** 10 test contract, 14 test service, 5 test Rules Firestore, 2 test Rules Storage
  (ADMIN + token thiếu claim), 10 test emulator, 10 test seed. Tổng bộ Rules: **18 file / 120
  test**; bộ emulator: **40 file / 248 test**.
- **Seed dữ liệu mẫu:** `npm run seed:feedback` (và `seed:feedback:emulator`) ghi 16 phản hồi
  thật lấy từ chính đợt đánh giá này — xem `functions/src/scripts/seed-feedback-data.ts`.

---

## 8. Phụ lục: cách chạy lại toàn bộ bằng chứng

```bash
# 1. Dịch vụ nền (Storage Rules gọi firestore.exists nên phải có Firestore emulator)
export FIREBASE_EMULATORS_PATH="$PWD/.emu-cache"   # nếu ~/.cache chỉ đọc
npm run build:functions
npx firebase emulators:start --only firestore,functions,storage --project scango-8f0e9

# 2. App (Vite). Bật cờ Storage emulator nếu muốn kiểm tra upload ảnh cục bộ.
npm run dev

# 3. Bằng chứng
node docs/feedback/harness/run-workflows.mjs
node docs/feedback/harness/run-workflows-interactive.mjs
npx firebase emulators:exec --only firestore,functions,storage --project scango-8f0e9 \
  "bash docs/feedback/harness/run-feature-verification.sh"

# 4. Seed phản hồi mẫu
npm run seed:feedback -- --tenant-id <tenantId> --with-images --confirm
```

`docs/feedback/harness/` chứa 4 script Playwright và 1 script đọc Firestore chỉ để xem
(không ghi). Chúng dùng `playwright-core` đã cài sẵn trong máy qua biến `PLAYWRIGHT_CORE`.

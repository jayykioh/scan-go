# Bộ tổng hợp cần cải thiện — ScanGo (2026-10)

Đây là **một danh sách duy nhất** gom toàn bộ phản hồi về dự án từ ba nguồn, đã loại bỏ trùng lặp
và xếp theo thứ tự nên làm. Dùng file này để lập kế hoạch; bấm vào mã nguồn ở cột "Nguồn" khi cần
chi tiết, bằng chứng và nguyên nhân gốc.

| Nguồn | Nội dung | Ở đâu |
|---|---|---|
| **Đợt 1** | 11 lỗi `BUG-01…BUG-11` khi chạy workflow thật bằng Playwright | [comparative-review-2026-10.md](comparative-review-2026-10.md) |
| **Đợt 2** | 19 phát hiện `F-01…F-19` khi kiểm từng module tính năng | [feature-audit-2026-10/](feature-audit-2026-10/README.md) |
| **Đối thủ** | 16 khuyến nghị `#1…#16` từ khảo sát 8 sản phẩm | [competitor-report-2026-10.md](competitor-report-2026-10.md) |

**Cách đọc.** Mỗi việc có mã `IMP-xx` (ổn định, dùng được trong commit và ticket). Mức độ theo
mức thiệt hại cho người dùng, không theo độ khó: **Nghiêm trọng** = chặn hẳn một luồng,
**Cao** = làm sai hoặc mất niềm tin, **Trung bình** = gây khó chịu thật, **Thấp** = nhỏ nhưng nên
sửa. Ước lượng là thô, để so sánh tương đối.

**Bức tranh chung.** Dự án **chạy được** — luồng cốt lõi tạo quán → tạo bàn → khách quét QR → gửi
đơn → chủ quán thấy đơn trong dashboard hoạt động thật end-to-end, và có những thứ không đối thủ
Việt nào có (AI dẫn nguồn, bình quân gia quyền, phản hồi sản phẩm kèm ảnh). Vấn đề không nằm ở
tính năng thiếu, mà ở **độ hoàn thiện**: nhiều thứ đã viết xong nhưng người dùng không tới được,
hoặc hiển thị sai. **40 việc** dưới đây, trong đó **10 việc đầu là chặn đánh giá sản phẩm**.

---

## Top 10 làm trước

| # | Mã | Việc | Vì sao trước | Ước lượng |
|---|---|---|---|---|
| 1 | [IMP-03](#imp-03) | Lọc `archivedAt` cho danh sách Thực đơn | **Một dòng lệnh.** Nút Xoá hiện không có tác dụng gì | 15 phút |
| 2 | [IMP-02](#imp-02) | Đồng bộ độ dài PIN giữa form Nhân sự và máy chủ | Chặn hoàn toàn luồng P0: tạo tài khoản nhân viên | 2 giờ |
| 3 | [IMP-04](#imp-04) | Bỏ `transform` khỏi keyframe `fadeIn` | Thẻ hướng dẫn đang che nút chính, không bấm được | 1 giờ |
| 4 | [IMP-01](#imp-01) | Lớp "chờ Auth sẵn sàng" dùng chung cho adapter | Gốc của 4 triệu chứng ở 4 trang; sửa một lần | 1–2 ngày |
| 5 | [IMP-05](#imp-05) | Simulator không gọi máy chủ thật khi chưa đăng nhập | Nút CTA chính trên trang chủ đang lộ lỗi tiếng Anh | 1 ngày |
| 6 | [IMP-09](#imp-09) | Nút "Lưu thay đổi" ở Cấu hình phải ghi lên máy chủ | Chủ quán sửa cấu hình mà thiết bị khác không thấy | 1 ngày |
| 7 | [IMP-12](#imp-12) | Cảnh báo giá nhập tăng >10% (REQ-INV-011) | SRS ghi "Done" nhưng tính năng không tồn tại | 1 ngày |
| 8 | [IMP-10](#imp-10) | Nhãn nút gói cước đúng chiều + lối về Free | Sai về thương mại; rủi ro tranh chấp với khách | 3 giờ |
| 9 | [IMP-08](#imp-08) | Không báo "hoàn tất" khi đơn còn `pending` | Khách tưởng đơn đã xong, bỏ đi | 3 giờ |
| 10 | [IMP-15](#imp-15) | In bill + phiếu bếp | 100% đối thủ có; lỗ hổng vận hành lớn nhất | 1–2 tuần |

---

## Nhóm A — Chặn dùng (blocker)

### IMP-01
**Lớp "chờ Auth sẵn sàng" dùng chung cho mọi adapter đọc dữ liệu** · Nghiêm trọng · 1–2 ngày
**Nguồn:** [BUG-01](comparative-review-2026-10.md) · [F-01](feature-audit-2026-10/F-01-tai-cung-rong-du-lieu.md)

Tải cứng (F5 hoặc mở link đã lưu) làm **rỗng** danh sách Thực đơn, Sơ đồ bàn, bảng "Cấu hình đang
áp dụng", và thoáng hiện "chưa có cửa hàng" ở trang Nhân sự — trong khi dữ liệu vẫn còn nguyên
trong Firestore. Điều hướng trong app thì hiện đủ. Nguyên nhân: adapter trả về danh sách rỗng khi
`getFirebaseAuth()?.currentUser` còn `null` lúc Auth đang khôi phục phiên, và effect không thử lại.

**Việc cần làm:** tạo một tín hiệu "Auth đã sẵn sàng" (`onAuthStateChanged` hoặc context) và cho
mọi adapter đọc chờ nó; hoặc trả về trạng thái "đang chờ" để component tự thử lại. Phân biệt ba
trạng thái **đang tải / trống / lỗi** — hiện cả ba đều hiển thị như "trống".
**Nghiệm thu:** mở trực tiếp từng trang dashboard bằng URL, dữ liệu vẫn hiện; có test tải cứng
cho mỗi trang (xem [IMP-38](#imp-38)).

> **Cập nhật 2026-10 — Sơ đồ bàn đã xong, kèm cả mặt bằng và trạng thái bàn.** Xem thêm
> [ADR 0018](../adr/0018-table-floor-plan-and-live-table-status.md): bàn nay có khu vực, số ghế, vị
> trí trên lưới 12×10 (REQ-TBL-002) và trạng thái phục vụ lấy từ đơn thật (REQ-TBL-003). Nút
> **"In mã QR" giả đã bị bỏ** — nó chỉ hiện toast và không in gì; in QR thật vẫn nằm ở
> [IMP-15](#imp-15).
>
> **Cập nhật 2026-10 — Sơ đồ bàn đã xong.** Tín hiệu "Auth đã sẵn sàng" **đã có sẵn trong repo**:
> `src/data/tenantStore.ts` là store dùng chung, nghe `onAuthStateChanged`, chờ `activeTenantId`
> rồi mới mở listener, và **đã có sẵn slice `tables`**. Trang Sơ đồ bàn là trang duy nhất còn tự mở
> listener trong `useEffect(…, [])`; chuyển sang `useStoreSlice('tables')` là hết lỗi. Ba trạng
> thái nay tách bạch bằng hàm thuần `src/pages/dashboard/tableListView.ts` (có test). Đo lại trên
> tenant thật: mở bằng URL và F5 đều hiện đủ bàn, không còn màn "Chưa có bàn nào" giả;
> `docs/feedback/harness/verify-tables-page.mjs` **27/27**. Ảnh trước/sau:
> `artifacts/tables-before-empty-hard-load.png` (trắng bàn) và
> `artifacts/tables-t1-hard-load.png` (hiện đủ bàn). **Còn lại:** Thực đơn, Cấu hình, Nhân
> sự, Kho vẫn dùng adapter riêng — cùng một cách sửa, chưa làm.

### IMP-02
**Đồng bộ độ dài PIN giữa form Nhân sự và chính sách máy chủ** · Nghiêm trọng · 2 giờ
**Nguồn:** [F-04](feature-audit-2026-10/F-04-do-dai-pin-nhan-su.md)

Form mời PIN 4 số (`placeholder="0000"`, không `minlength`), chính sách mặc định là **6**, và máy
chủ đòi đúng bằng chính sách. Đã kiểm chứng: PIN `4321` → `[400] Mã PIN không đúng định dạng`;
PIN `123456` → đăng nhập thành công. Chủ quán tạo tài khoản mà nhân viên **không bao giờ** vào được.

**Việc cần làm:** form đọc `pinPolicy.length` từ resolved config và hiển thị đúng; thắt
`staffCreateInputSchema` để PIN sai độ dài bị từ chối **ngay ở bước tạo**; sửa
`MOCK_STAFF_ACCOUNTS` sang 6 số.
**Nghiệm thu:** tạo PIN 4 số bị chặn ở bước tạo kèm thông báo rõ; test emulator cho cả hai nhánh.

### IMP-03
**Lọc `archivedAt` cho danh sách Thực đơn** · Nghiêm trọng · 15 phút
**Nguồn:** [F-02](feature-audit-2026-10/F-02-xoa-mon-khong-bien-mat.md)

Bấm Xoá món → xác nhận → **món vẫn nằm nguyên**, không thông báo. Kiểm Firestore: `archivedAt`
**đã được ghi**, tức lệnh thành công; chỉ có listener của trang Thực đơn là không lọc món đã lưu
trữ. Module Bàn làm đúng (`table.adapter.ts:182`), menu công khai cũng đúng — nên **khách không
còn thấy món, chủ quán vẫn thấy**.

**Việc cần làm:** thêm `where('archivedAt', '==', null)` vào `subscribeOwnerMenu`. Nếu muốn xem
lại món đã lưu trữ, tách thành tab "Đã lưu trữ" riêng.
**Nghiệm thu:** xoá món → món biến mất; có test khẳng định món đã lưu trữ không hiện.

### IMP-04
**Bỏ `transform` khỏi keyframe `fadeIn` (hoặc portal mọi modal)** · Nghiêm trọng · 1 giờ
**Nguồn:** [F-03](feature-audit-2026-10/F-03-fixed-bi-animate-fadein-giam.md) · [BUG-10](comparative-review-2026-10.md)

`@keyframes fadeIn` đặt `transform: translateY(0)` và `animation-fill-mode: both`, nên **mọi
container `.animate-fadeIn` trở thành containing block cho `position: fixed`** bên trong nó. Hệ quả
đo được: thẻ hướng dẫn **che nút "THÊM MÓN"** (chồng 8.691 px², không bấm được), trên Sơ đồ bàn
thẻ trôi lên **y = −50** khỏi màn hình, và modal "Thêm nguyên liệu" chỉ phủ 1152×339 thay vì
1440×900. Modal Nhân sự làm đúng vì có `createPortal`.

**Việc cần làm:** bỏ `transform` khỏi keyframe (chỉ giữ `opacity`) — cách này chữa gốc cho mọi chỗ
một lần; hoặc portal mọi modal/thẻ nổi ra `document.body` như `StaffPage` đang làm (chữa từng chỗ).
**Kiểm luôn:** [BUG-10](comparative-review-2026-10.md) — toast góc dưới phải từng bị widget AI che;
cần xác nhận đã hết sau khi sửa họ overlay này.
**Nghiệm thu:** nút chính trên Thực đơn và Sơ đồ bàn bấm được ngay lần đầu; mọi modal phủ kín
khung nhìn.

> **Cập nhật 2026-10 — đã chữa gốc.** `@keyframes fadeIn` trong `src/index.css` nay **chỉ còn
> `opacity`**; thẻ hướng dẫn thêm `createPortal(…, document.body)`. Đo lại trên Sơ đồ bàn: thẻ từ
> **y = −50** (ngoài màn hình, chồng nút chính **8.500 px²**) về **góc dưới phải, chồng 0 px²**,
> hit test ở tâm nút "Thêm Bàn" trả về chính nút đó. Vì sửa ở keyframe nên mọi trang hưởng chung.
> Ảnh trước/sau: `artifacts/tables-before-guide-over-cta.png` (thẻ che nút) và
> `artifacts/tables-t3-guide-overlay.png` (thẻ ở góc dưới phải, chồng 0 px²).
> **Còn phải xác nhận:** Thực đơn và modal "Thêm nguyên liệu" (chưa đo lại trong lần này).

### IMP-05
**Simulator không gọi máy chủ thật khi chưa đăng nhập** · Cao · 1 ngày
**Nguồn:** [BUG-03](comparative-review-2026-10.md) · [F-08](feature-audit-2026-10/F-08-kds-loi-tieng-anh-tho.md) · [F-10](feature-audit-2026-10/F-10-nhan-vien-simulator-401.md)

Các route `/simulator/*` là công khai, nhưng `KitchenView`/`StaffView` lại mở listener Firestore và
gọi callable cần phiên. Kết quả: KDS hiện `0 Đơn Chờ` kèm dòng **tiếng Anh thô**
`Missing or insufficient permissions.` giữa giao diện tiếng Việt; vai trò Nhân viên trả
`Cần đăng nhập để thực hiện thao tác này. [401]` và không dùng được.

**Việc cần làm:** cho simulator nhận dữ liệu mock qua props như `CustomerView`/`OwnerView` đang
làm, không mở listener thật. Nếu vẫn muốn gọi thật thì phải bọc lỗi thành câu tiếng Việt nói rõ
tình trạng và việc cần làm.
**Nghiệm thu:** không còn chuỗi tiếng Anh nào lọt ra UI; cả 6 vai trò simulator đều dùng được.

### IMP-06
**Nối đơn demo của simulator vào dữ liệu thật — hoặc nói rõ đây là demo** · Cao · 2 ngày
**Nguồn:** [BUG-02](comparative-review-2026-10.md) (đã đính chính — xem [phụ lục đợt 2](feature-audit-2026-10/appendix.md))

Đợt 1 mô tả "khách không gửi được đơn". Kiểm lại đợt 2: luồng khách trong simulator **chạy trọn
vẹn** (chọn bàn → món → topping → "Add to cart" → `Your order #ORD_1` với các bước
New/Cooking/Done/Served). Vấn đề thật khác: đơn đó là **demo cục bộ**, `SimulatorRole.tsx:46`
không truyền `onSubmitOrder`, nên **không bao giờ vào Firestore**. Người xem thử đặt món rồi mở
dashboard sẽ thấy 0 đơn.

**Việc cần làm:** hoặc nối đơn demo vào Ordering thật để demo khép kín, hoặc ghi rõ ngay trên màn
hình "đây là dữ liệu mô phỏng, không ghi vào hệ thống". Đừng để người xem tự đoán.
**Nghiệm thu:** đặt món trong simulator → mở dashboard → hoặc thấy đơn, hoặc thấy nhãn "mô phỏng".

### IMP-07
**PIN của Bếp/Thu ngân trong simulator: kiểm tra thật hoặc ghi rõ là demo** · Cao · 3 giờ
**Nguồn:** [F-09](feature-audit-2026-10/F-09-pin-simulator-hinh-thuc.md)

PIN `9999` và `0000` đều được chấp nhận; chỉ kiểm tra độ dài (`activePin.length !== 4`), không đối
chiếu tài khoản nào. Vai trò Nhân viên thì làm đúng (gọi máy chủ xác minh). PIN đang được **trình
bày như một cơ chế bảo vệ** trong khi bất kỳ 4 số nào cũng qua — tín hiệu xấu với người đang cân
nhắc mua.
**Việc cần làm:** kiểm PIN với `MOCK_STAFF_ACCOUNTS` và hiện tên nhân viên đăng nhập; hoặc ghi rõ
"chế độ demo — PIN không được kiểm tra".

---

## Nhóm B — Hiển thị sai và mất niềm tin

### IMP-08
**Không báo "hoàn tất" khi đơn còn `pending`** · Cao · 3 giờ
**Nguồn:** [BUG-04](comparative-review-2026-10.md)

Màn hình theo dõi hiện "Bữa ăn đã hoàn tất" **ngay sau khi gửi**, trong khi Order vẫn `pending`.
Khách tưởng xong và bỏ đi.
**Việc cần làm:** thêm trạng thái "Đã nhận đơn"; chỉ hiện "hoàn tất" khi `served`.

### IMP-09
**Nút "Lưu thay đổi" ở Cấu hình phải ghi lên máy chủ** · Cao · 1 ngày
**Nguồn:** [F-05](feature-audit-2026-10/F-05-cau-hinh-chi-luu-localstorage.md)

Form duy nhất trên trang chỉ gọi `setTenantConfig` → **localStorage**. Kiểm chứng: profile trình
duyệt trống vẫn thấy tên cũ. Hàm ghi lên máy chủ (`handleSaveResolvedConfig` → `updateTenantConfig`)
**tồn tại nhưng không được nối vào giao diện** (0 tham chiếu) — mã chết. Trớ trêu là ngay trên form
đó, khối "Cấu hình đang áp dụng" cam kết *"Giá trị thật đang chạy cho cửa hàng."*
**Việc cần làm:** nối nút vào `updateTenantConfig` cho các khoá tenant được phép ghi đè
(`locale`, `timezone`, `pinPolicy.*`, `ai.*`); với nhóm trường chỉ-cục-bộ thì hoặc cho chúng đường
ghi thật, hoặc đổi nhãn thành "Lưu trên thiết bị này".

### IMP-10
**Nhãn nút gói cước đúng chiều + có lối quay về Free** · Cao · 3 giờ
**Nguồn:** [F-07](feature-audit-2026-10/F-07-nut-goi-cuoc-sai-chieu.md)

Đang ở gói **FREE**, thẻ Lite hiện nút **"HẠ CẤP LITE"** — từ Free lên Lite là *nâng cấp*. Và sau
khi nâng cấp thì **không có cách nào về Free** (đo được: 0 nút liên quan Free), dù hợp đồng và máy
chủ đều nhận `'free'`. Đây là rủi ro thương mại và niềm tin — đúng loại phàn nàn mà đối thủ Toast
đang hứng.
**Việc cần làm:** so sánh theo thứ tự gói (`free < lite < pro`) để chọn nhãn Nâng cấp/Hạ cấp/Đang
dùng; thêm nút "Về gói Free" kèm xác nhận nêu rõ sẽ mất tính năng nào.

### IMP-11
**Cổng Loyalty theo entitlement, bỏ Enterprise khỏi ô chọn gói** · Cao · 3 giờ
**Nguồn:** [F-06](feature-audit-2026-10/F-06-cong-loyalty-nguoc.md)

Bảng quyền lợi: `free.features = []`, `lite.features = ['promotions','loyalty']`. Nhưng giao diện
**khoá đúng gói Lite** và ghi "(không khả dụng ở Lite)", còn gói Free thì mở. Ngoài ra ô chọn gói
có "Enterprise" — SRS ghi rõ Enterprise **ngoài phạm vi v1**.
**Việc cần làm:** dùng `allowsFeature(entitlements, 'loyalty')` như `SubscriptionPage` đang làm,
thay vì so sánh chuỗi `pricingTier`; bỏ Enterprise khỏi ô chọn.

### IMP-12
**Cảnh báo giá nhập tăng trên 10% (REQ-INV-011)** · Cao · 1 ngày
**Nguồn:** [F-13](feature-audit-2026-10/F-13-req-inv-011-thieu-canh-bao-gia.md) · [đối thủ #10](competitor-report-2026-10.md)

SRS ghi **REQ-INV-011 = Done** ("records a price-increase warning with both prices and the change
percentage"), giao diện cũng hứa "hệ thống sẽ cảnh báo". Nhập lô tăng **+50%** → không có cảnh báo
nào. Hàm `lotPriceIncreasePercent` **chỉ xuất hiện ở định nghĩa và file test** — không callable,
không contract, không UI nào gọi. Đây là ví dụ rõ nhất của "có hàm" bị nhầm với "tính năng chạy".
**Việc cần làm:** gọi hàm trong callable inventory, lưu cảnh báo lên `stockMovement` (giá cũ, giá
mới, %), trả về trong kết quả và hiển thị ở màn Kho + báo cáo thay đổi. Sửa lại trạng thái SRS cho
tới khi có bằng chứng tầng callable. Sau đó mới mở rộng đẩy qua Zalo OA ([đối thủ #10](competitor-report-2026-10.md)).

### IMP-13
**QR của quán mới: chặn phát QR khi chưa có món** · Cao · 4 giờ
**Nguồn:** [BUG-05](comparative-review-2026-10.md)

Quán mới tạo bàn → QR mở ra menu **trống**, kèm thông báo sai hướng "Thử đổi bộ lọc hoặc tìm từ
khoá khác" (trong khi thật ra chưa có món nào).
**Việc cần làm:** chặn phát QR khi thực đơn rỗng, hoặc empty state nói đúng nguyên nhân kèm nút
dẫn tới màn Thực đơn.

### IMP-14
**Đơn vị trong Kho: ghi vào nhãn và thống nhất khi hiển thị** · Trung bình · 4 giờ
**Nguồn:** [F-12](feature-audit-2026-10/F-12-don-vi-kho-khong-nhat-quan.md)

Hai ô nằm cạnh nhau dùng hai đơn vị khác nhau và **không ô nào ghi đơn vị**: "Tồn ban đầu" hiểu
theo đơn vị nhập (kg), "Ngưỡng cảnh báo" theo đơn vị gốc (g). Nhập "10000" tưởng 10.000 g → lưu
**10 tấn**. Và cột giá hiển thị `100.000đ/kg` cạnh `Vốn 250đ/g` — không so sánh được bằng mắt.
**Việc cần làm:** ghi đơn vị trong nhãn (`Tồn ban đầu (kg)`), hoặc quy mọi thứ về đơn vị nhập khi
hiển thị (`Vốn 250.000đ/kg`).

---

## Nhóm C — Khoảng trống vận hành so với thị trường

Đây là nhóm **không phải lỗi** mà là thiếu tính năng. Ba việc đầu là ba khoảng trống lớn nhất so
với 8 đối thủ đã khảo sát.

### IMP-15
**In bill và phiếu bếp** · Cao · 1–2 tuần
**Nguồn:** [đợt 1 #11](comparative-review-2026-10.md) · [đối thủ #1, #2](competitor-report-2026-10.md) · [§5.2.1](comparative-review-2026-10.md)

**100% đối thủ đều in được**; ScanGo để printers ngoài phạm vi v1 — đây là lỗ hổng vận hành lớn
nhất: bếp phải nhìn màn hình, thu ngân phải ghi tay.
**Việc cần làm:** ESC/POS qua Web Bluetooth/WebUSB ngay từ trình duyệt (không cần app cài), cộng
một **print bridge** chạy trên máy cũ trong quán để bếp vẫn nhận phiếu khi màn hình KDS hỏng.
**Nghiệm thu:** thu ngân in được bill từ Chrome trên Android trong ≤3 giây; ngắt KDS, đơn mới vẫn
in ra phiếu bếp trong ≤10 giây.

### IMP-16
**Bán được khi mất mạng: hàng đợi offline + thông báo rõ** · Cao · 2–3 tuần
**Nguồn:** [đợt 1 #12](comparative-review-2026-10.md) · [đối thủ #3](competitor-report-2026-10.md) · [F-14](feature-audit-2026-10/F-14-mat-mang-trang-trang.md)

Hai mặt của cùng một vấn đề. **Mặt lỗi:** mất mạng rồi tải lại app → **trang trắng hoàn toàn**,
không một câu thông báo, không nút thử lại. **Mặt thiếu tính năng:** ScanGo **chặn gửi đơn** khi
mất mạng (REQ-ORD-004), trong khi PosApp, Bota, MISA eShop, Toast, Square đều bán được offline —
quán 5–15 bàn ở Việt Nam có wifi chập chờn, đây là lý do mất khách thật.
**Việc cần làm:** (1) banner "Mất kết nối — đang thử lại" + nút thử lại; (2) hàng đợi offline cho
gửi đơn và KDS cục bộ, có nhãn "chưa đồng bộ" và chống trùng theo idempotency.
**Nghiệm thu:** rút mạng, tạo 5 đơn, cắm mạng lại, cả 5 đồng bộ đúng một lần, không trùng.

### IMP-17
**Hoá đơn điện tử theo NĐ 70/2025** · Cao · 2–4 tuần
**Nguồn:** [đợt 1 #13](comparative-review-2026-10.md) · [đối thủ #5](competitor-report-2026-10.md)

KiotViet tặng miễn phí 5.000–50.000 hoá đơn/năm; PosApp nêu rõ tuân thủ NĐ 70/2025. Đây là **rào
cản pháp lý**, không phải tính năng phụ.
**Việc cần làm:** tích hợp nhà cung cấp HĐĐT, hoặc tự phát hành nếu đủ điều kiện.
**Nghiệm thu:** một đơn đã thanh toán xuất được hoá đơn hợp lệ có mã CQT trong luồng thu ngân.

### IMP-18
**Xác nhận thanh toán VietQR tự động** · Cao · 1 tuần
**Nguồn:** [đối thủ #4](competitor-report-2026-10.md) · REQ-PAY-002 (đang PARTIAL)

Hiện thu ngân phải xác nhận tay. Đối thủ đã có ví/QR tự động (Sapo VNPay/VietQR, PosApp).
**Việc cần làm:** webhook ngân hàng/Casso/sepay qua adapter có chữ ký đã có sẵn; bật feature flag.
**Nghiệm thu:** một chuyển khoản thật tạo Payment trong ≤15 giây không cần bấm; có test chống trùng.

### IMP-19
**Kiểm kê bằng quét QR/mã vạch trên điện thoại** · Trung bình · 1 tuần
**Nguồn:** [đối thủ #11](competitor-report-2026-10.md) · REQ-INV-003

`count.service.ts` có ở máy chủ, nhưng UI Kho hiện chỉ có `Tồn / Sửa / Lưu trữ` — chưa tìm thấy
luồng kiểm kê (xem [reachability](feature-audit-2026-10/reachability.md)). PosApp bán "đối soát
cuối ca", KiotViet/eShop dùng mã vạch.
**Việc cần làm:** xác nhận luồng kiểm kê có tồn tại ở màn khác không; nếu chưa có UI thì mở UI,
kèm chế độ "kiểm nhanh cuối ca".
**Nghiệm thu:** kiểm kê 20 nguyên liệu bằng điện thoại trong ≤5 phút; sai lệch tự tính và lưu audit.

### IMP-20
**Kênh thông báo đơn qua Zalo OA/ZNS cho khách** · Trung bình · 1 tuần
**Nguồn:** [đối thủ #14](competitor-report-2026-10.md)

Zalo Mini App tiếp cận 70 triệu người dùng, không cần tải app. Dùng Zalo như **kênh thông báo**,
không thay lõi — vì phí ZNS và ~1,1% ZaloPay là chi phí thật.
**Việc cần làm:** thông báo trạng thái đơn ("món đã ra") + mời đánh giá; có hạn mức tin/tháng theo
gói để kiểm soát chi phí.

### IMP-21
**Public REST API + webhook cho đối tác** · Trung bình · 2–3 tuần
**Nguồn:** [đối thủ #15](competitor-report-2026-10.md)

Square có marketplace 50+; Toast có API + partner directory; **hầu hết đối thủ Việt chưa có API
công khai** — lợi thế cạnh tranh dài hạn.
**Việc cần làm:** API key theo tenant, webhook `order.paid` có chữ ký.
**Nghiệm thu:** một tenant đọc được doanh thu ngày qua REST; key của tenant khác bị từ chối.

### IMP-22
**Màn hình "Sức khoẻ vận hành" hợp nhất cho chuỗi** · Trung bình · 1–2 tuần
**Nguồn:** [đợt 1 #18](comparative-review-2026-10.md) · [đối thủ #16](competitor-report-2026-10.md)

KiotViet tính +270k/375k **mỗi chi nhánh**, CukCuk tính đúng giá gói mỗi chi nhánh. ScanGo có thể
gộp giá vốn, hao hụt, thời gian ra món, doanh thu theo chi nhánh vào một màn.
**Nghiệm thu:** chủ 3 chi nhánh so sánh được 3 chi nhánh trong 1 màn; có test cách ly dữ liệu.

---

## Nhóm D — Trải nghiệm, trợ năng, ngôn ngữ

### IMP-23
**Trang 404 có thương hiệu và đường quay về** · Trung bình · 2 giờ
**Nguồn:** [BUG-06](comparative-review-2026-10.md) — hiện không có trang 404, lộ lỗi React Router ra console.

### IMP-24
**Bỏ splash 2 giây cố định** · Trung bình · 3 giờ
**Nguồn:** [BUG-07](comparative-review-2026-10.md) — DOM sẵn sàng sau ~55–80 ms nhưng app vẫn chờ
`setTimeout(2000)` trên **mọi** lần tải. Thay bằng tín hiệu sẵn sàng thật.

### IMP-25
**Trợ năng: nhãn ô nhập, tên nút icon, vùng bấm ≥44 px** · Trung bình · 1 ngày
**Nguồn:** [BUG-08](comparative-review-2026-10.md) (21 lỗi, Cấu hình chiếm 10) · [F-15](feature-audit-2026-10/F-15-nut-icon-thieu-ten.md)

Nút Sửa/Xoá món **chỉ có icon, không `title`, không `aria-label`** (đo được: 0). Module Bàn làm
đúng — có cả hai — nên chỉ cần theo mẫu đó.
**Việc cần làm:** `aria-label` động theo tên món (`Sửa {item.name}` / `Xoá {item.name}`); rà toàn
bộ nút chỉ-có-icon trong `MenuPage` và `InventoryPanel`; thêm nhãn cho ô nhập ở Cấu hình.

### IMP-26
**Quyết định phạm vi i18n và nói đúng phạm vi đó** · Trung bình · 2 ngày (nếu chỉ nói đúng) / 2 tuần (nếu làm thật)
**Nguồn:** [F-11](feature-audit-2026-10/F-11-do-phu-ngon-ngu.md)

Cơ chế i18n **chạy** (có lưu máy chủ, đổi thật): simulator Owner/Customer và nút feedback đổi ngôn
ngữ đúng. Nhưng **9 trang dashboard, KDS và Thu ngân hardcode tiếng Việt** — nên nút "English" gần
như không có tác dụng với người dùng chính. Ở chế độ Tiếng Việt, màn khách vẫn còn `Member`,
`Sign in`, `Track order`, `Add to cart`, `items`.
**Việc cần làm:** nếu chưa cần đa ngôn ngữ thật, đổi nhãn khu vực thành "Ngôn ngữ màn hình khách"
và ghi chú dashboard hiện chỉ có tiếng Việt. Nếu làm thật, đưa chuỗi vào catalog theo trang, ưu
tiên điều hướng và tiêu đề.

### IMP-27
**Sửa cảnh báo React `An empty string ("") was passed to the %s attribute`** · Thấp · 1 giờ
**Nguồn:** [BUG-09](comparative-review-2026-10.md) — cho `src`/`href` nhận `undefined` thay vì `""`.

### IMP-28
**Thay `window.prompt` bằng modal tạo cửa hàng** · Thấp · 3 giờ
**Nguồn:** [F-16](feature-audit-2026-10/F-16-tao-cua-hang-window-prompt.md)

Đây là **hành động đầu tiên của mọi chủ quán mới**, nhưng dùng hộp thoại gốc của trình duyệt:
không style được, không kiểm tra tên, một số trình duyệt di động chặn. Đã có sẵn pattern `Modal` và
`createPortal` trong repo để dùng lại.

### IMP-29
**Trang từ chối ADMIN có lối quay lại** · Thấp · 1 giờ
**Nguồn:** [F-17](feature-audit-2026-10/F-17-trang-tu-choi-admin.md) — đo được chỉ 1 phần tử bấm
được. Cân nhắc ẩn luôn mục "QUẢN LÝ QUÁN" khỏi sidebar khi tài khoản không có ADMIN claim.

---

## Nhóm E — Định vị và tăng trưởng

### IMP-30
**Công bố bảng giá VND trên trang chủ kèm "không phí khởi tạo, không hợp đồng"** · Cao · 1 ngày
**Nguồn:** [đợt 1 #14](comparative-review-2026-10.md) · [đối thủ #12](competitor-report-2026-10.md) · [§5.3](comparative-review-2026-10.md)

Đây là việc **rẻ nhất và lãi nhất** trong cả danh sách: không cần thêm tính năng, chỉ cần nói ra
lợi thế đang có. Khảo sát cho thấy Toast bị phàn nàn nặng vì hợp đồng 2–3 năm + phí chấm dứt sớm +
khoá cứng bộ xử lý thanh toán + phần cứng độc quyền mất giá; Square thắng đúng phân khúc quán nhỏ
nhờ $0 khởi đầu và không hợp đồng. **ScanGo có lợi thế cấu trúc y hệt Square nhưng chưa nói ra.**
Đối thủ Việt thì không công bố giá (iPOS) hoặc bán bộ máy 7–15 triệu (CukCuk).

> 99.000 ₫/tháng · không phí khởi tạo · không hợp đồng dài hạn · không tính phí theo màn hình KDS ·
> không cần mua máy POS.

**Nghiệm thu:** trang pricing có 3 gói bằng số cụ thể; gói Free/Lite không có bước "liên hệ báo giá".

### IMP-31
**Không tính phí KDS theo thiết bị — và ghi rõ điều đó** · Trung bình · 3 giờ
**Nguồn:** [đợt 1 #15](comparative-review-2026-10.md) · [đối thủ #13](competitor-report-2026-10.md)

Square tính **$30/thiết bị/tháng** cho KDS; Toast bán phần cứng KDS riêng — đây là điểm đau của
khách. Entitlement của ScanGo đã theo tenant, chỉ cần khẳng định trong bảng giá và kiểm chứng.
**Nghiệm thu:** một tenant mở 3 màn KDS cùng lúc không phát sinh phí.

### IMP-32
**Đưa `market:survey` lên UI kho** · Trung bình · 1 tuần
**Nguồn:** [đợt 1 #16](comparative-review-2026-10.md) · [đối thủ #9](competitor-report-2026-10.md)

ScanGo **đã có** pipeline đối chiếu giá thị trường (WinMart/Co.op/Kamereo) mà **không đối thủ nào
có**, nhưng nó đang nằm trong script, chưa lên giao diện. Biến tài sản sẵn có thành tính năng bán được.
**Việc cần làm:** màn Kho cảnh báo khi giá nhập cao hơn giá tham chiếu vùng >10%, kèm nguồn và ngày
khảo sát. Gộp chung với [IMP-12](#imp-12) thành một khối "cảnh báo giá".

### IMP-33
**Mời đánh giá Google sau thanh toán + gộp review + AI phân nhóm** · Trung bình · 1 tuần
**Nguồn:** [đợt 1 #17](comparative-review-2026-10.md) · [đối thủ #6, #7](competitor-report-2026-10.md)

Sau khi đơn `paid`: QR 1 chạm mở Google review, **không tặng quà đổi review** (Google cấm tường
minh). Gộp review Google + review nội bộ về một màn hình, dùng AI phân nhóm chủ đề (REQ-FDB-002).
Không đối thủ Việt nào làm; Toast có "Guest CRM, Insights and Feedback".

### IMP-34
**Đưa lợi thế kỹ thuật vào tài liệu bán hàng** · Thấp · 2 giờ
**Nguồn:** [đợt 1 §4](comparative-review-2026-10.md)

Bình quân gia quyền giá vốn (chỉ Bota ghi rõ điều tương tự; iPOS/Sapo/KiotViet/PosApp/CukCuk không
công bố) và trợ lý AI có dẫn nguồn + ngân sách theo tenant (không đối thủ Việt nào có). Hai thứ
này đang bị "giấu" trong tài liệu kỹ thuật.

### IMP-35
**Xác nhận tên model AI hiển thị đúng** · Thấp · 30 phút
**Nguồn:** [F-18](feature-audit-2026-10/F-18-ten-model-ai.md) — khung AI hiện
`GEMINI · GEMINI-3.5-FLASH-LITE`, chuỗi này không khớp định danh Gemini công khai nào. Nếu là giá
trị mẫu thì cơ chế minh bạch (một điểm mạnh) đang vô tình nói sai.

---

## Nhóm F — Kỷ luật kỹ thuật và quy trình

Nhóm này không sửa lỗi trước mắt mà ngăn lỗi tái diễn.

### IMP-36
**Mở đường UI cho Workforce và Promotion — hoặc sửa trạng thái SRS** · Cao · 1–2 tuần
**Nguồn:** [reachability](feature-audit-2026-10/reachability.md)

> **Đã xử lý một nửa — 2026-10-08.** Phần **Promotion** đã xong: có trang riêng
> `/dashboard/promotions`, adapter đầy đủ, 6 loại khuyến mãi, và khuyến mãi **áp thật vào đơn**
> (đơn ghi `discountVnd` + `promotionSnapshot`). Xem
> [ADR 0016](../adr/0016-promotion-engine-and-order-snapshot.md) và
> `REQ-PRO-001…REQ-PRO-006` trong [SRS](../SRS.md). Phần **Workforce** (`REQ-HRM-001/002`) vẫn
> chưa có UI và vẫn đang ghi **Done** trong SRS — việc còn lại của IMP-36 là phần này.

SRS ghi **Done** kèm "Emulator evidence pass" cho `REQ-HRM-001/002` (xếp ca, chấm công) và
`REQ-PRO-001` (khuyến mãi). Thực tế: `functions/src/modules/workforce/index.ts` có 6 callable,
**không có** `src/data/adapters/workforce.adapter.ts`, và **không file nào trong `src/` tham chiếu
chúng**. Chủ quán **không thể** xếp ca; nhân viên **không thể** chấm công.
**Việc cần làm:** hoặc mở UI cho Workforce, hoặc đổi trạng thái SRS của `REQ-HRM-001/002` thành
"Server done, UI pending" để không ai tin nhầm là xong.

Phần Promotion của mục này **không còn** thuộc dạng "Done nhưng không tới được người dùng": adapter
có đủ lệnh ghi, trang riêng có thật, và khuyến mãi áp thật vào đơn.

### IMP-37
**Thêm cột `UI` vào bảng trạng thái SRS + bài kiểm CI** · Cao · 4 giờ
**Nguồn:** [reachability](feature-audit-2026-10/reachability.md) (đề xuất)

Với người dùng, một yêu cầu chỉ "done" khi họ **chạm được vào nó**. Đề xuất cụ thể: một script nhỏ
duyệt mọi callable đã export trong `functions/src/index.ts` và xác nhận mỗi cái có ít nhất một
tham chiếu trong `src/`; chạy trong CI. Bài kiểm này sẽ bắt đúng loại khoảng cách của IMP-36 và
IMP-12.

### IMP-38
**Test tải cứng cho mọi trang dashboard** · Trung bình · 1 ngày
**Nguồn:** [BUG-01](comparative-review-2026-10.md) · [F-01](feature-audit-2026-10/F-01-tai-cung-rong-du-lieu.md)

Lỗi này đã tồn tại **từ đợt 1 sang đợt 2** và vẫn còn. Nó chỉ lộ ra khi mở trang trực tiếp, còn
test điều hướng trong app thì luôn xanh — nên không ai phát hiện. Đã có sẵn harness
`run-feature-audit.mjs` (luồng `f1`) để đưa vào CI.

### IMP-39
**Ghi cách chạy emulator đúng vào README** · Trung bình · 1 giờ
**Nguồn:** [BUG-11](comparative-review-2026-10.md)

Storage Rules gọi `firestore.exists(...)` nên **phải chạy kèm Firestore emulator**; chạy thiếu sẽ
làm sập tiến trình `firebase` với `Cannot determine host and port of firestore`. Đợt 1 đã ghi một
phần vào `README.md` và `docs/feedback/README.md`; cần rà lại cho đủ, kèm `FIREBASE_EMULATORS_PATH`
khi `~/.cache` chỉ đọc.

### IMP-40
**Tạo tài khoản ADMIN QA và luồng harness cho khu ADMIN** · Thấp · 3 giờ
**Nguồn:** [F-19](feature-audit-2026-10/F-19-thieu-tai-khoan-admin.md)

Không có tài khoản nào mang ADMIN claim, nên toàn bộ khu ADMIN (`ManagementPage`, callable
`callableAdmin*`, bảng audit) **chưa từng được chạy thật** trong cả hai đợt. Chỉ kiểm được nhánh từ
chối. Cần set claim `admin: true` cho một tài khoản QA, ghi UID vào `docs/demo-runbook.md`, và thêm
luồng harness kiểm cả nhánh đọc-không-ghi-audit (ADR 0010).

---

## Việc KHÔNG nên làm

Khảo sát đối thủ cho thấy có những thứ trông hấp dẫn nhưng sẽ phá định vị. **11 mục** dưới đây đã
được phân tích kỹ ở [phần C của báo cáo đối thủ](competitor-report-2026-10.md) — không nên sao chép:

| Không nên | Ai đang làm | Vì sao không hợp với ScanGo |
|---|---|---|
| Bán/buộc dùng phần cứng POS của hãng | Toast, Ocha, iPOS, CukCuk | Phá định vị "không cần máy POS" và lợi thế 99k/tháng; phần cứng độc quyền còn mất giá |
| Khoá cứng vào một bộ xử lý thanh toán | Toast, Square | ScanGo dùng VietQR động, ngân hàng-agnostic |
| Hợp đồng 2–3 năm + phí chấm dứt sớm | Toast | Bị phàn nàn nhiều nhất trên Reddit/BBB — xem [IMP-30](#imp-30) |
| Tính phí KDS theo từng thiết bị | Square ($30/$20), Toast | Quán nhỏ cần 1–2 màn; chi phí khó dự đoán — xem [IMP-31](#imp-31) |
| Workflow fine dining: chia course, chia ghế, sơ đồ 100 chỗ | Toast, Square, CukCuk | ScanGo nhắm **5–15 bàn**; đốt nguồn lực vào phân khúc không phải khách hàng |
| Payroll, tính lương, thuế, bảo hiểm | Toast Payroll, Sapo, KiotViet, MISA | SRS đã **cấm rõ**: REQ-HRM-003 "MUST NOT derive or export payroll" |
| Kiosk tự phục vụ tại quán | Toast, Square | Là phần cứng đặt tại quán; ngược định vị "khách dùng điện thoại của khách" |
| Onboarding phụ thuộc đào tạo trả phí | CukCuk (3.950.000 ₫), iPOS | ScanGo đã cam kết onboarding ≤15 phút (REQ-ONB-002) |
| Tổng đài hỗ trợ thu phí theo phút | KiotViet, POS365, CukCuk | Đi ngược lợi thế "AI tự trả lời + dẫn nguồn" |
| Tồn kho bán lẻ: serial/IMEI, bảo hành, mã vạch hàng hoá | MISA eShop, Bota, KiotViet | Là bài toán bán lẻ, làm loãng mô hình nguyên liệu–công thức–giá vốn |
| Bắt khách cài app native | Ocha | "Không cần tải app" là lợi thế trực tiếp |

---

## Điểm mạnh phải giữ khi sửa

Sửa lỗi dễ làm hỏng thứ đang tốt. Những điểm dưới đây **đã được kiểm chứng chạy đúng** — đừng đánh
đổi khi thực hiện các việc trên.

- **Luồng khách thật chạy trọn vẹn:** tạo quán → tạo bàn → quét `/menu/<token>` → chọn món kèm
  topping → gửi đơn → Order được máy chủ định giá và ghi vào Firestore → chủ quán thấy trong
  dashboard. Ít đối thủ Việt cho khách đặt món trên web mà không cần cài app.
- **Bình quân gia quyền giá vốn tính đúng:** 10 kg @ 200k + 10 kg @ 300k → `Vốn 250đ/g`. Chỉ Bota
  ghi rõ điều tương tự.
- **Trợ lý AI trung thực và có dẫn nguồn:** khi chưa có đơn đã thu, trả lời *"Chưa có đơn đã thanh
  toán trong kỳ. Không kết luận về lợi nhuận."* kèm độ tin cậy 30% và nhãn "thiếu dữ liệu" — thay
  vì bịa số.
- **Kho kiểm soát hao hụt chặt:** giảm tồn bắt buộc chọn lý do **và** ghi chú; báo cáo thay đổi ghi
  actor, hành động, thời gian, số lượng, lý do.
- **Sơ đồ bàn có vòng QR khép kín:** tạo bàn → link `/menu/<token>` mở đúng menu công khai và hiện
  đúng tên bàn → lưu trữ bàn thì bàn biến mất khỏi danh sách (đúng hành vi mà Thực đơn đang thiếu —
  xem [IMP-03](#imp-03)).
- **Nhân sự có luồng end-to-end thật:** tạo tài khoản → nhân viên đăng nhập email + mật khẩu tạm +
  PIN → vào màn hình với đúng quyền theo vai trò. Xác thực ở máy chủ, có phân quyền.
- **ADMIN chặn đúng hai lớp:** giao diện từ chối **và** máy chủ từ chối (ADR 0010, REQ-ADM-001).
- **Kỷ luật bảo mật:** mọi ghi nghiệp vụ qua callable, Rules chặn ghi trực tiếp, có audit, bộ test
  Rules chạy thật trên emulator.
- **Ngôn ngữ thiết kế nhất quán** (neo-brutalist) và **tốc độ tải DOM rất tốt** (~55–80 ms).
- **Kênh phản hồi sản phẩm kèm ảnh chụp màn hình** — không tìm thấy đối thủ nào công bố tính năng
  này. **Đã xong ở đợt 1, không cần làm lại.**

---

## Thứ tự thực thi đề xuất

**Đợt 1 — sửa ngay (ước tính 3–5 ngày).** Chặn đánh giá sản phẩm.
[IMP-03](#imp-03) · [IMP-02](#imp-02) · [IMP-04](#imp-04) · [IMP-01](#imp-01) ·
[IMP-08](#imp-08) · [IMP-10](#imp-10) · [IMP-11](#imp-11) · [IMP-12](#imp-12) ·
[IMP-23](#imp-23) · [IMP-24](#imp-24) · [IMP-30](#imp-30)

**Đợt 2 — trong sprint tới (ước tính 2–3 tuần).** Hoàn thiện cái đang dở, đóng lỗ hổng niềm tin.
[IMP-05](#imp-05) · [IMP-06](#imp-06) · [IMP-07](#imp-07) · [IMP-09](#imp-09) ·
[IMP-13](#imp-13) · [IMP-14](#imp-14) · [IMP-25](#imp-25) · [IMP-26](#imp-26) ·
[IMP-27](#imp-27) · [IMP-28](#imp-28) · [IMP-29](#imp-29) · [IMP-31](#imp-31) ·
[IMP-36](#imp-36) · [IMP-37](#imp-37) · [IMP-38](#imp-38) · [IMP-39](#imp-39)

**Đợt 3 — tạo khác biệt (ước tính 1–2 tháng).** Bám vào ba khoảng trống lớn nhất và hai lợi thế
chưa nói ra.
[IMP-15](#imp-15) · [IMP-16](#imp-16) · [IMP-17](#imp-17) · [IMP-18](#imp-18) ·
[IMP-19](#imp-19) · [IMP-20](#imp-20) · [IMP-21](#imp-21) · [IMP-22](#imp-22) ·
[IMP-32](#imp-32) · [IMP-33](#imp-33) · [IMP-34](#imp-34) · [IMP-35](#imp-35) ·
[IMP-40](#imp-40)

**Nguyên tắc xếp thứ tự.** Việc nào làm người dùng **tin** sản phẩm thì làm trước, kể cả khi nhỏ
(IMP-03 chỉ 15 phút nhưng đang làm hỏng niềm tin vào nút Xoá). Việc thêm tính năng mới xếp sau,
vì sản phẩm hiện thiếu độ hoàn thiện chứ không thiếu tính năng.

---

## Phụ lục — Truy vết IMP ↔ nguồn

| IMP | Mức độ | Nguồn đợt 1 | Nguồn đợt 2 | Nguồn đối thủ |
|---|---|---|---|---|
| IMP-01 | Nghiêm trọng | BUG-01 | F-01 | — |
| IMP-02 | Nghiêm trọng | — | F-04 | — |
| IMP-03 | Nghiêm trọng | — | F-02 | — |
| IMP-04 | Nghiêm trọng | BUG-10 | F-03 | — |
| IMP-05 | Cao | BUG-03 | F-08, F-10 | — |
| IMP-06 | Cao | BUG-02 (đã đính chính) | phụ lục đợt 2 | — |
| IMP-07 | Cao | — | F-09 | — |
| IMP-08 | Cao | BUG-04 | — | — |
| IMP-09 | Cao | — | F-05 | — |
| IMP-10 | Cao | — | F-07 | — |
| IMP-11 | Cao | — | F-06 | — |
| IMP-12 | Cao | — | F-13 | #10 |
| IMP-13 | Cao | BUG-05 | — | — |
| IMP-14 | Trung bình | — | F-12 | — |
| IMP-15 | Cao | #11 | — | #1, #2 |
| IMP-16 | Cao | #12 | F-14 | #3 |
| IMP-17 | Cao | #13 | — | #5 |
| IMP-18 | Cao | — | — | #4 |
| IMP-19 | Trung bình | — | reachability | #11 |
| IMP-20 | Trung bình | — | — | #14 |
| IMP-21 | Trung bình | — | — | #15 |
| IMP-22 | Trung bình | #18 | — | #16 |
| IMP-23 | Trung bình | BUG-06 | — | — |
| IMP-24 | Trung bình | BUG-07 | — | — |
| IMP-25 | Trung bình | BUG-08 | F-15 | — |
| IMP-26 | Trung bình | — | F-11 | — |
| IMP-27 | Thấp | BUG-09 | — | — |
| IMP-28 | Thấp | — | F-16 | — |
| IMP-29 | Thấp | — | F-17 | — |
| IMP-30 | Cao | #14 | — | #12 |
| IMP-31 | Trung bình | #15 | — | #13 |
| IMP-32 | Trung bình | #16 | — | #9 |
| IMP-33 | Trung bình | #17 | — | #6, #7 |
| IMP-34 | Thấp | §4 | — | — |
| IMP-35 | Thấp | — | F-18 | — |
| IMP-36 | Cao | — | reachability | — |
| IMP-37 | Cao | — | reachability | — |
| IMP-38 | Trung bình | BUG-01 | F-01 | — |
| IMP-39 | Trung bình | BUG-11 | — | — |
| IMP-40 | Thấp | — | F-19 | — |

**Đã xong, không làm lại:** phản hồi sản phẩm kèm ảnh chụp màn hình (đối thủ #8) — đã triển khai ở
đợt 1 với REQ-FDB-004/005/006.

**Tổng:** 40 việc · **4 Nghiêm trọng · 16 Cao · 14 Trung bình · 6 Thấp**.

Phân bố theo nhóm: A — Chặn dùng 7 · B — Hiển thị sai 7 · C — Khoảng trống vận hành 8 ·
D — Trải nghiệm & trợ năng 7 · E — Định vị & tăng trưởng 6 · F — Kỷ luật kỹ thuật 5.

---

[← Mục lục feedback](README.md) · [Báo cáo đợt 1](comparative-review-2026-10.md) ·
[Đợt 2](feature-audit-2026-10/README.md) · [Đối thủ](competitor-report-2026-10.md)

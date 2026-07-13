# **SCANGO LITE**

**Blueprint Sản Phẩm — Phần Mềm Order & Thanh Toán QR Cho Quán Ăn Quy Mô Nhỏ**  
 Gói khởi điểm 99.000đ/tháng — Tích hợp AI hỗ trợ vận hành — Nền tảng Firebase  
 Phiên bản Blueprint 2.0 — Tháng 6, 2026

# **1\. Tóm Tắt Định Vị Sản Phẩm**

ScanGo Lite là phiên bản tái cấu trúc của dự án ScanGo, được thiết kế lại theo hướng "tối giản đến mức tối đa" để cạnh tranh trực tiếp với KiotViet, iPOS và Sapo ở phân khúc mà các sản phẩm này phục vụ kém nhất: quán ăn, quán cà phê và nhà hàng nhỏ với 1-10 bàn, ngân sách công nghệ gần như bằng không, và chủ quán không có thời gian học một hệ thống quản trị phức tạp.  
 Thay vì bán một bộ tính năng đồ sộ, ScanGo Lite bán đúng ba thứ: (1) một trải nghiệm gọi món bằng QR và chạm NFC mượt như đặt món qua app giao đồ ăn, (2) một bộ não AI nhỏ giúp chủ quán nhìn ra món nào lời, món nào lỗ mà không cần biết kế toán, và (3) một cấu trúc phân quyền rõ ràng giữa chủ quán, người quản lý/thu ngân và đầu bếp để tránh thất thoát mà không cần thuê thêm người giám sát.  
 **Khác biệt cốt lõi so với bản phân tích gốc:** blueprint này hạ tầng hoá toàn bộ phần "giao diện tùy biến theo ngành" thành một engine template (nhà hàng / quán ăn / quán cà phê) thay vì assume một mô hình quán nhậu hải sản duy nhất. Đặc biệt, tính năng chạm NFC được giữ lại và định nghĩa như một tiện ích phần mềm bảo mật (chỉ cần nạp code URL/Token vào thẻ sticker NFC siêu rẻ) chứ không đòi hỏi thiết bị phần cứng cồng kềnh.

## **1.1. Ba Trụ Cột Giá Trị**

* **Trụ cột 1 — Order chạm NFC & QR nhanh, không cần nhân viên:** khách tự quét QR hoặc chạm điện thoại vào sticker NFC, gọi món, theo dõi trạng thái món theo thời gian thực. NFC giúp thao tác nhanh hơn và chống tình trạng phá đơn ảo hiệu quả.  
* **Trụ cột 2 — AI giúp nhìn ra tiền:** AI lai (rule-based \+ LLM) tự tính lời/lỗ theo món, tự ẩn món khi hết nguyên liệu, và trả lời câu hỏi vận hành bằng ngôn ngữ tự nhiên cho chủ quán.  
* **Trụ cột 3 — Phân quyền rõ ràng, không thất thoát:** chủ quán luôn nhìn thấy toàn bộ doanh thu thực; thu ngân và bếp chỉ thấy đúng phần việc của mình.

## **1.2. Đối Tượng Khách Hàng Mục Tiêu**

Giữ nguyên phân tích chân dung khách hàng, mở rộng ra 3 nhóm ngành để engine template có lý do tồn tại:

* **Quán ăn / quán cơm / bún phở:** thực đơn ít món, biến động nguyên liệu theo ngày, ưu tiên tốc độ ra món.  
* **Quán cà phê / trà sữa:** thực đơn nhiều biến thể (size, đá, đường, topping), ưu tiên giao diện chọn món dạng tùy chỉnh nhanh.  
* **Nhà hàng nhỏ / quán nhậu mini:** thực đơn theo nhóm món (khai vị, món chính, lai rai), ưu tiên gọi nhiều món một lúc và theo dõi theo bàn.

# **2\. Mô Hình 4 Actor & Ma Trận Phân Quyền**

Hệ thống có bốn vai trò cố định ở tầng kiến trúc — ba vai trò vận hành nội bộ (Owner, Quản lý/Thu ngân, Bếp) và một vai trò mới đại diện cho người dùng cuối là **Khách hàng (Customer)**. Quyền hạn của ba vai trò nội bộ do chính Owner cấu hình; vai trò Khách hàng được giới hạn chặt ở tầng kiến trúc vì đây là tài khoản công khai, không qua xác thực nội bộ.

## **2.1. Owner (Chủ quán)**

Owner là tài khoản gốc, không thể bị giới hạn quyền bởi ai khác. Owner luôn nhìn thấy toàn bộ doanh thu thực tế.

* Xem dashboard doanh thu real-time, theo ngày/tuần/tháng, theo ca.  
* Toàn quyền cấu hình menu, giá, công thức nguyên liệu (recipe).  
* Toàn quyền quản lý tài khoản nhân viên và gán sticker NFC cho từng bàn.  
* Là người duy nhất truy cập được AI Chat phân tích vận hành.  
* Bật/tắt mô hình thanh toán: "Trả trước" (Pay-First) hoặc "Trả sau" (Pay-Later).

## **2.2. Quản Lý / Thu Ngân (Manager / Cashier)**

Vai trò vận hành ca làm, có thể là chính Owner kiêm nhiệm hoặc nhân viên.

* Xem danh sách order đang vào, trạng thái thanh toán của từng bàn.  
* Xác nhận thanh toán tiền mặt.  
* Có thể được cấp quyền sửa menu/giá tạm thời (ẩn món).  
* Không có quyền truy cập AI Chat phân tích lời/lỗ.

## **2.3. Bếp (Kitchen Staff)**

Vai trò hẹp nhất, tối ưu cho tốc độ.

* Chỉ thấy màn hình hàng đợi món cần làm (Kitchen Display).  
* Bấm chuyển trạng thái món: Đang chờ → Đang làm → Sẵn sàng.  
* Bấm "Hết món" thủ công để ẩn món.  
* Không thấy giá tiền, doanh thu.

## **2.4. Khách Hàng (Customer)**

Vai trò duy nhất không thuộc nội bộ quán, được tạo ra ngay tại thời điểm khách quét QR hoặc chạm NFC — không bắt buộc đăng nhập để gọi món (giữ trải nghiệm "không ma sát" như đặt món qua app giao đồ ăn), nhưng có thể tự nguyện định danh (số điện thoại hoặc Zalo) để tích điểm.

* Quét QR hoặc chạm NFC để xem menu theo template ngành (list/grid/grouped) tương ứng quán.  
* Gọi món, theo dõi trạng thái món real-time (Đang chờ → Đang làm → Sẵn sàng) — không thấy thông tin vận hành nội bộ (giá vốn, lời/lỗ, dữ liệu bàn khác).  
* Thanh toán theo mô hình Pay-First hoặc Pay-Later do Owner cấu hình.  
* (Tùy chọn, gắn với mục 6 — Loyalty) Nhập số điện thoại để tích điểm, xem điểm tích lũy hiện tại và đổi ưu đãi ngay trên giao diện gọi món, không cần tải app riêng.  
* Không có quyền truy cập bất kỳ màn hình quản trị, Kitchen Display, hay AI Chat nào.

**Lưu ý kiến trúc:** Customer không có "tài khoản" theo nghĩa truyền thống có mật khẩu. Định danh khách dùng số điện thoại tự khai báo, không xác thực OTP ngay (giữ trải nghiệm không ma sát) — OTP chỉ bắt buộc khi đổi điểm lấy ưu đãi (xem mục 6.1). Dữ liệu lưu trên một collection `customers` riêng theo từng Owner (tenant), tách biệt hoàn toàn với hệ thống tài khoản nhân viên (`staff_accounts`) để không phát sinh rủi ro bảo mật chéo.

## **2.5. Ma Trận Phân Quyền Chi Tiết (Owner Tùy Biến)**

| Quyền hạn | Owner | Quản lý/Thu ngân | Bếp | Khách hàng |
| ----- | ----- | ----- | ----- | ----- |
| **Xem tổng doanh thu thực** | Luôn có | Tùy chọn (mặc định: Không) | Không | Không |
| **Xem & xử lý order/thanh toán** | Có | Có | Không | Chỉ order/thanh toán của chính mình |
| **Sửa menu, giá, cấu hình NFC** | Có | Tùy chọn | Không | Không |
| **Ẩn/hiện món (hết hàng)** | Có | Có | Có | Không |
| **Quản lý tài khoản nhân viên** | Có | Không | Không | Không |
| **Truy cập AI Chat phân tích** | Có | Không | Không | Không |
| **Xem màn hình bếp (Kitchen Display)** | Có (xem) | Tùy chọn | Có | Không |
| **Xem & đổi điểm Loyalty** | Có (xem toàn quán) | Tùy chọn (xác nhận đổi điểm) | Không | Có (chỉ điểm của mình) |

# **3\. Cấu Trúc Gói Giá**

Bảng giá được rút gọn từ 4 tier xuống 3 tier, giữ nguyên các tính năng chống phá đơn bằng NFC và Split Bill nhưng cấu trúc lại để phù hợp với định vị Zero-Hardware.

| Gói | Giá/tháng | Số bàn tối đa | Tính năng chính |
| ----- | ----- | ----- | ----- |
| **Free** | 0đ | 3 bàn / 15 đơn/ngày | QR menu cơ bản, order, trạng thái món real-time. Không AI. |
| **Lite (Khởi điểm)** | 99.000đ | Không giới hạn bàn | QR & chạm NFC order, thanh toán Pay-First/Pay-Later, phân quyền 3 actor, Kitchen Display, AI rule-based (lời/lỗ, tự ẩn món). Có thể tự mua sticker NFC ngoài để nạp code. |
| **Pro** | 199.000đ | Không giới hạn | Gồm Lite \+ AI Chat hỏi-đáp (LLM), xuất báo cáo, Split Bill (chia tiền), đổi template ngành không giới hạn. Tích hợp quản lý NFC nâng cao. |

## **3.1. Sự Tích Hợp Của NFC: Bản Chất Là Phần Mềm Chứ Không Phải Phần Cứng**

NFC được quyết định giữ lại trong blueprint và đưa vào ngay từ gói Lite. Lý do cốt lõi: **NFC không phải là thiết bị phần cứng cồng kềnh.** Bản chất của NFC trong ScanGo Lite chỉ là những thẻ sticker dán bàn siêu rẻ (vài ngàn đồng/chiếc). Chủ quán dùng app ScanGo trên điện thoại quét để "nạp code" (ghi NDEF record chứa URL và mã bảo mật) vào sticker. Khi khách chạm vào, hệ thống sinh ra một Token dùng một lần, giải quyết hoàn toàn bài toán "Fake Order" (người ngoài lấy link QR cũ để phá đơn) mà không làm tăng độ phức tạp phần cứng.

## **3.2. So Sánh Định Vị Với KiotViet**

| Tiêu chí | KiotViet (gói nhỏ) | ScanGo Lite |
| ----- | ----- | ----- |
| **Giá khởi điểm** | \~180.000 \- 250.000đ/tháng | 99.000đ/tháng |
| **Phần cứng bắt buộc** | Khuyến nghị POS, máy in | Chỉ cần QR in giấy hoặc Sticker NFC dán bàn |
| **Bảo mật chống phá đơn** | Thường yêu cầu NV ra tận bàn | Tự động bằng Token mã hóa qua chạm NFC |
| **AI phân tích lời/lỗ tự động** | Không có sẵn ở gói rẻ | Có sẵn từ gói Lite (rule-based) |
| **Chat hỏi-đáp AI cho chủ quán** | Không có | Có ở gói Pro |

# **4\. Engine Tùy Biến Giao Diện Theo Ngành (Template Engine)**

Sử dụng config JSON lưu trên Firestore để quyết định cách giao diện hiển thị.

## **4.1. Cấu Trúc Một Template Ngành**

* **category\_type:** "quan\_an" | "quan\_cafe" | "nha\_hang" — quyết định layout menu mặc định.  
* **menu\_layout:** "list\_don\_gian" (quán ăn), "grid\_bien\_the" (cafe), "grouped\_category" (nhà hàng).  
* **default\_payment\_mode:** Pay-First hoặc Pay-Later.  
* **modifier\_groups:** danh sách nhóm tùy chọn món (Size, Mức đường, Topping).  
* **theme\_tokens:** màu chủ đạo, font, logo.

# **5\. Hệ Thống AI Hỗ Trợ Owner (Hybrid: Rule-Based \+ LLM)**

## **5.1. Lớp 1 — Rule-Based Engine (Tính Toán Chính Xác)**

* **Trừ kho tự động & Auto 86:** Tự động ẩn món khỏi menu khi nguyên liệu không đủ. Logic chạy độc lập trên Cloud Functions.  
* **Phân tích món bán chạy & lợi nhuận:** Nhân dữ liệu order với giá vốn nguyên liệu để ra báo cáo lời lỗ thực tế hàng ngày.

## **5.2. Lớp 2 — LLM Chat Hỏi-Đáp (Gói Pro)**

Sử dụng LLM để đọc báo cáo từ Lớp 1 và trả lời câu hỏi bằng ngôn ngữ tự nhiên (Ví dụ: "Vì sao món Bún Bò tuần này lãi ít?").

## **5.3. Nhập Liệu Nguyên Liệu**

Owner nhập tay để đảm bảo độ chuẩn xác 100%. AI chỉ đóng vai trò chuẩn hóa tên nguyên liệu (gợi ý gộp "chanh", "chanh tươi" về một nhóm) và đơn vị đo lường để hệ thống kho không bị phân mảnh.

# **6\. Loyalty Member — Tích Điểm Khách Hàng**

Với việc bổ sung actor Khách hàng (mục 2.4), ScanGo Lite có sẵn hạ tầng định danh cần thiết để triển khai loyalty mà không cần app riêng hay thiết bị thẻ từ — tận dụng đúng luồng QR/NFC đã có.

## **6.1. Nguyên Lý Vận Hành**

* **Định danh không ma sát:** Lần đầu order, khách được mời nhập số điện thoại (không bắt buộc) để bắt đầu tích điểm. Hệ thống **chưa yêu cầu xác thực OTP ngay** — chỉ lưu tạm vào collection `customers/{tenant_id}/{phone_hash}` để giữ trải nghiệm nhanh, không ma sát.  
* **Vấn đề SĐT ảo và cách xử lý:** Vì không xác thực ngay từ đầu, khách có thể nhập số điện thoại ảo hoặc của người khác. ScanGo Lite xử lý rủi ro này bằng nguyên tắc **"xác thực tại điểm rút giá trị, không phải tại điểm tích lũy"**:  
  * Điểm vẫn được cộng bình thường dù SĐT chưa xác thực — quán không mất gì ở bước này.  
  * Khi khách muốn **đổi điểm lấy ưu đãi** (giảm giá, tặng món) — thời điểm quán thực sự phát sinh chi phí — hệ thống mới bắt buộc xác thực OTP qua SMS hoặc Zalo gửi đến đúng số đó.  
  * Nếu SĐT là ảo hoặc không phải của khách, OTP sẽ không đến đúng người → điểm tích được không thể đổi → tự động vô hiệu hoá gian lận mà không cần chặn ngay từ đầu.  
* **Chống lạm dụng bổ sung (Rule-Based, áp dụng từ gói Lite):** Cloud Function giám sát các mẫu hình bất thường, ví dụ cùng một bàn/thiết bị tạo nhiều SĐT khác nhau trong thời gian ngắn, hoặc một SĐT tích điểm với tần suất cao bất hợp lý trong ngày. Các trường hợp này được gắn cờ để Owner xem trong dashboard, không tự động khoá để tránh chặn nhầm khách thật.  
* **Nhận diện lần sau:** Vì khách order chủ yếu qua chạm NFC sticker tại bàn (không phải tài khoản cố định trên 1 thiết bị), hệ thống nhận diện khách quay lại bằng số điện thoại đã nhập — khách chỉ cần xác nhận lại số ở bước thanh toán, không cần đăng nhập lại từ đầu. Bước OTP đầy đủ chỉ kích hoạt khi đổi điểm như mô tả trên.  
* **Tự động cộng điểm:** Cloud Function lắng nghe sự kiện đơn hàng hoàn tất (`order.status == paid`), tính điểm theo công thức Owner cấu hình (ví dụ: 1.000đ \= 1 điểm) và cộng vào hồ sơ khách.  
* **Đổi điểm tại quầy hoặc tự đổi:** Khách xem điểm và đổi ưu đãi (giảm giá, tặng món) ngay trên giao diện gọi món ở lần ghé sau, sau khi xác thực OTP; Quản lý/Thu ngân xác nhận đổi điểm khi thanh toán.

## **6.2. Cấu Trúc Dữ Liệu Đề Xuất (Firestore)**

* `tenants/{tenant_id}/customers/{phone_hash}` — hồ sơ khách: tên (tùy chọn), điểm hiện tại, tổng chi tiêu lũy kế, lịch sử ghé quán (số lần, ngày gần nhất).  
* `tenants/{tenant_id}/loyalty_config` — cấu hình do Owner đặt: tỉ lệ tích điểm, danh sách ưu đãi đổi điểm, hạn dùng điểm (nếu có).  
* `tenants/{tenant_id}/loyalty_transactions` — log cộng/trừ điểm, dùng để Owner kiểm tra và để AI (Lớp 1, mục 5.1) đưa vào báo cáo khách hàng thân thiết.

## **6.3. Tích Hợp Vào Engine Tùy Biến & AI**

* Engine template (mục 4.1) thêm trường `loyalty_enabled` và `loyalty_rate` vào config JSON theo từng ngành, vì hành vi khách quay lại của quán cà phê (mua hàng ngày) khác quán ăn (mua theo tuần).  
* Rule-Based Engine (mục 5.1) có thể mở rộng để tự động gợi ý ưu đãi cá nhân hoá đơn giản, ví dụ: "Khách quen 5 lần ghé, gợi ý tặng 1 món miễn phí" — vẫn theo logic if/else, không cần LLM, để giữ tính năng này khả dụng từ gói Lite.  
* AI Chat (Lớp 2, gói Pro) có thể trả lời câu hỏi dạng: "Khách thân thiết tháng này chiếm bao nhiêu % doanh thu?" dựa trên dữ liệu `loyalty_transactions`.

## **6.4. Đề Xuất Phân Bổ Theo Gói Giá**

| Gói | Tính năng Loyalty |
| ----- | ----- |
| **Free** | Không có. |
| **Lite (99.000đ)** | Tích điểm cơ bản (1 công thức quy đổi cố định), khách tự xem điểm, Owner xem danh sách khách thân thiết. |
| **Pro (199.000đ)** | Thêm: nhiều mức ưu đãi tùy chỉnh, gợi ý ưu đãi tự động (rule-based mở rộng), AI Chat phân tích khách hàng thân thiết, xuất danh sách khách để chạy khuyến mãi ngoài hệ thống (Zalo OA, SMS). |

**Lý do đặt Loyalty cơ bản ở gói Lite chứ không phải Free:** đây là tính năng giữ chân khách trả tiền trực tiếp ra lợi nhuận cho quán, phù hợp làm lý do nâng cấp từ Free lên Lite, đồng thời không đòi hỏi hạ tầng phần cứng mới — chỉ là một collection Firestore và một Cloud Function, giữ đúng định vị "Zero-Hardware" của toàn bộ sản phẩm.


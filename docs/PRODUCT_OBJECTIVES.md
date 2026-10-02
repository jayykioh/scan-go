# ScanGo — Mục tiêu và định hướng sản phẩm

> Cập nhật: 2026-09-29. Tài liệu định hướng theo ý tưởng của Founder, dùng để thống nhất giá trị sản phẩm và các cơ hội mở rộng. Đây không phải kế hoạch triển khai hay bản sửa đổi SRS. Các đề xuất mới cần được chuyển thành yêu cầu có tiêu chí nghiệm thu trước khi viết code.
>
> **Đã chốt 2026-09-30:** cọc full nghĩa là đủ tiền món; đặt bàn để sau (ADR 0009). Nhóm thử đầu tiên: quán cà phê/trà sữa và quán có bếp. AI giữ Gemini làm mặc định và đánh giá TypeSafe Jev sau adapter (ADR 0008). Các mở rộng đã thành yêu cầu trong SRS 1.2 và `docs/plan/insight-growth-plan.md`.

## 1. Mục tiêu chung

**ScanGo giúp chủ quán nắm được hoạt động kinh doanh, biết việc gì cần ưu tiên và phục vụ khách tốt hơn để khách quay lại.**

Từ nền tảng gọi món và vận hành, sản phẩm hướng tới kết nối đơn hàng, thanh toán, nguyên liệu, nhân sự, phản hồi khách và loyalty. AI đọc dữ liệu có sẵn, chỉ ra điểm đáng chú ý, giải thích nguyên nhân có thể có và gợi ý hành động phù hợp với từng quán.

Chủ quán có thể hỏi bằng ngôn ngữ tự nhiên: “Tuần này cần xử lý gì trước?”, “Vì sao món này bán nhiều nhưng lời ít?”, “Bếp đang hao hụt ở đâu?”, “Nên chạy ưu đãi nào để khách quay lại?”. Câu trả lời cần ngắn, có căn cứ, nêu dữ liệu còn thiếu và cho phép xem chi tiết khi cần. Không bắt buộc tạo báo cáo dài hoặc một kế hoạch tổng thể mỗi tuần.

## 2. Phù hợp với các nhóm khách hàng F&B

“Toàn bộ loại khách hàng” trong định hướng này được hiểu là các mô hình F&B và các vai trò tham gia vận hành, không mở rộng mặc định sang mọi ngành kinh doanh. Phạm vi nền tảng hiện tại vẫn theo [SRS](SRS.md), tập trung quán nhỏ khoảng 5–15 bàn.

| Mô hình | Nhu cầu nổi bật | Cách ScanGo tạo giá trị |
|---|---|---|
| Quán cà phê, trà sữa | Phục vụ giờ cao điểm, định lượng, khách quen | Gọi món nhanh, theo dõi Cost từng món, ưu đãi quay lại |
| Quán ăn | Tốc độ ra món, nguyên liệu, ca làm | Đồng bộ bếp và phục vụ, nhận diện hao hụt, hiểu tải công việc |
| Tiệm bánh | Hàng làm theo mẻ, tồn cuối ngày, đặt trước | Phân tích tồn và sức bán, gợi ý ưu đãi phù hợp, điều phối món đặt trước |
| Nhà hàng | Đặt bàn, món cần chuẩn bị lâu, trải nghiệm phục vụ | Phối hợp lịch khách đến, điều kiện làm món và phản hồi khách |
| Quán một người vận hành | Ít thao tác, ít thời gian xem số liệu | Giao diện Solo và danh sách ngắn những việc đáng xử lý nhất |
| Chủ có nhiều quán | Nắm tình hình từng quán và phân quyền | Phân tích đúng tenant được phép truy cập; tổng hợp liên quán là mở rộng cần đặc tả riêng |

Các khả năng theo mẻ, đặt trước và tổng hợp liên quán ở bảng trên là hướng mở rộng, không phải tuyên bố tính năng đã có. Mỗi quán chỉ bật những phần cần dùng; quán nhỏ không phải nhập dữ liệu như một nhà hàng lớn.

| Vai trò | Giá trị cần nhận được |
|---|---|
| Owner / người quản lý được phân quyền | Biết doanh thu, lãi gộp, vấn đề và hành động ưu tiên trong phạm vi quyền |
| Kitchen | Hàng đợi rõ ràng, thời điểm được làm món, cảnh báo nguyên liệu |
| Cashier / Waiter | Thanh toán, phục vụ và xử lý phản hồi có trạng thái rõ ràng |
| Staff | Ca làm, chấm công và trách nhiệm minh bạch |
| Customer | Đặt bàn, gọi món, biết tình trạng xác nhận, gửi phản hồi và nhận ưu đãi phù hợp |
| ADMIN | Theo dõi chất lượng dịch vụ và chi phí AI theo quyền hệ thống |

## 3. AI chủ động mỗi tuần và trả lời khi được hỏi

### Phân tích định kỳ

Định hướng là chạy một tác vụ theo lịch mỗi tuần cho từng quán, theo múi giờ của quán. Hệ thống tổng hợp số liệu trước, sau đó AI đọc phần cần thiết để phát hiện thay đổi và đề xuất ưu tiên.

Đầu vào gồm doanh thu đã thanh toán và điều chỉnh hoàn tiền, Cost, món bán chạy/chậm, tồn kho, phản hồi khách, hiệu quả ưu đãi và dữ liệu nhân sự nếu đã có. Có thể so sánh với các tuần tương đương khi đủ dữ liệu; tuần ít dữ liệu phải nêu hạn chế.

Đầu ra là danh sách ngắn các điểm đáng chú ý, không bắt buộc có báo cáo hay kế hoạch chính thức. Mỗi điểm có:

- Vấn đề hoặc cơ hội và bộ phận liên quan.
- Mức ưu tiên vận hành: cần xử lý sớm, nên xử lý trong tuần, hoặc tiếp tục theo dõi.
- Số liệu, kỳ phân tích và nguồn để chủ quán kiểm tra.
- Mức độ chắc chắn, dữ liệu còn thiếu và nguyên nhân mới chỉ là giả thuyết.
- Hành động gợi ý, người phụ trách do chủ quán giao và chỉ số để kiểm tra kết quả.

Ưu tiên dựa trên tác động dự kiến, tính cấp bách, mức lặp lại, độ tin cậy dữ liệu và công sức xử lý. Chưa chốt trọng số khi chưa có dữ liệu thực tế. Một phản hồi nghiêm trọng vẫn có thể cần xử lý sớm dù mới xuất hiện một lần; một biến động nhỏ, ít mẫu không tự động trở thành vấn đề lớn.

AI đề xuất thứ tự cho từng mảng: bếp/kho, phục vụ/nhân sự, giá/món và chăm sóc khách. Chủ quán có thể điều chỉnh và đánh dấu đã xử lý. Đây là ưu tiên vận hành của quán, không thay thế P0–P3 của kế hoạch phát triển ScanGo. Những sự kiện cần xử lý ngay như thanh toán hoặc đơn đến bếp không chờ tác vụ hằng tuần.

### Hỏi đáp theo nhu cầu

Chủ quán có thể hỏi mọi mảng mà hệ thống có dữ liệu và họ có quyền xem. AI nêu thời điểm cập nhật, phân biệt kết quả tuần trước với dữ liệu mới; nếu cần thì truy vấn bổ sung trong phạm vi câu hỏi.

Ví dụ: “Hôm nay có bao nhiêu bàn đặt trước?”, “Khách chê điều gì nhiều nhất?”, “Món nào nên xem lại giá?”, “Ca nào thường chậm ra món?”. Nếu chưa có dữ liệu, AI trả lời rõ chưa thể kết luận và cho biết cần bổ sung gì.

### Chi phí AI và công cụ “jev”

“jev” là tên Founder nhắc tới, hiện chưa xác định công cụ hoặc nhà cung cấp cụ thể. Chưa có cơ sở khẳng định mức giảm chi phí hoặc dùng đầu ra của công cụ này làm nguồn quyết định cuối cùng.

Định hướng tối ưu gồm tổng hợp bằng logic xác định trước khi gọi AI, chỉ gửi dữ liệu liên quan, xử lý phần thay đổi và đặt ngân sách theo tenant. Đánh giá công cụ dựa trên tổng chi phí cho một phân tích hữu ích, chất lượng tiếng Việt, khả năng dẫn nguồn, độ trễ và cách xử lý dữ liệu.

Nếu “jev” phù hợp, đầu ra của nó có thể hỗ trợ đề xuất ưu tiên theo tiêu chí trên. [TECH_STACK](TECH_STACK.md) hiện chọn Gemini qua adapter phía server; thay nhà cung cấp cần quyết định riêng. Việc lưu kết quả tuần hoặc tái sử dụng câu trả lời cũng cần đặc tả lưu trữ và thời hạn lưu, vì [module AI](module/ai.md) hiện không lưu câu trả lời mặc định.

## 4. Hiểu hao hụt, giá vốn và hiệu quả món ăn

Chủ quán cần phân biệt nguyên liệu tiêu hao theo công thức với tiêu hao thực tế. Muốn nhận diện hao hụt, hệ thống cần có số liệu kiểm kê, nhập kho, xuất dùng, hủy bỏ và điều chỉnh bên cạnh đơn hàng và định lượng.

Ở mức định hướng, lượng tiêu hao thực tế được đối chiếu từ tồn đầu kỳ, nhập và điều chuyển trong kỳ, tồn cuối kỳ. So sánh với tiêu hao theo món đã chế biến, các lần hủy và điều chỉnh đã biết để tìm chênh lệch chưa giải thích. Thiếu kiểm kê thì chưa thể kết luận bếp hao hụt cao chỉ từ lượng bán.

AI có thể chỉ ra nguyên liệu, món, khung giờ hoặc ca có chênh lệch đáng kiểm tra; gợi ý kiểm tra định lượng, bảo quản, ghi nhận hủy và quy trình nhập kho. Chênh lệch không tự chứng minh lỗi hoặc gian lận của nhân viên.

Về giá món, AI xem sức bán, giá thực thu sau giảm giá, Cost và lãi gộp để đề xuất giữ giá, thử tăng/giảm giá, đổi khẩu phần hoặc điều chỉnh combo. Mỗi đề xuất cần nêu giả định, mức ảnh hưởng ước tính và cách theo dõi sau thử nghiệm. Không hứa chắc tăng doanh thu khi chưa có bằng chứng về phản ứng của khách.

Lãi gộp theo SRS là doanh thu đã thanh toán trừ Cost nguyên liệu. Không gọi đây là lợi nhuận ròng nếu chưa có tiền thuê, lương, điện nước và các chi phí khác. Đơn cũ giữ nguyên giá và Cost đã ghi nhận khi thay đổi giá bán hoặc giá nguyên liệu.

## 5. Nhà cung cấp và giá trị tiền của đơn hàng

Cần phân biệt hai nhu cầu để không chọn sai đối tác:

- **Nhà cung cấp nguyên liệu:** có dữ liệu giá nhập, đơn vị tính, lịch sử giá và chất lượng giao hàng để hiểu giá vốn. Mua nguyên liệu và quản lý nhà cung cấp là mở rộng ngoài v1 hiện tại.
- **Nhà cung cấp xác nhận thanh toán:** giúp kiểm tra tiền thực nhận, liên kết với đơn hàng và hỗ trợ theo dõi phần còn phải trả cho đơn đặt trước. Chưa chọn tên nhà cung cấp; nền tảng hiện có Cashier xác nhận Cash/VietQR và định hướng adapter tự động ở P2.

Giá trị đơn phải được tính bằng quy tắc xác định từ món, số lượng, mức giá đã chốt và promotion hợp lệ. AI giải thích hoặc mô phỏng kịch bản, không tự tạo số tiền giao dịch. Khi đánh giá đối tác thanh toán, cần làm rõ khả năng đối soát từng đơn, thanh toán nhiều lần, hoàn tiền, phí và xử lý thông báo trùng.

## 6. Nhân sự và chấm công

Mục tiêu là giúp chủ quán biết ai đang làm, ca nào thiếu người và khâu nào cần cải thiện. Định hướng gồm lịch ca, vào/ra ca, thời gian nghỉ, ghi nhận đi muộn hoặc thiếu chấm công, và sửa công có người xác nhận cùng lịch sử thay đổi.

AI có thể kết hợp lượng đơn, thời gian ra món, tải phục vụ và số người trong ca để gợi ý bố trí nhân sự. Không xếp hạng nhân viên chỉ từ một đánh giá của khách hoặc số đơn xử lý; cần xét vai trò, tải công việc và dữ liệu đầy đủ.

Chấm công là đề xuất mới. Không mặc định kéo theo tính lương, vốn đang ngoài phạm vi v1. Nhân viên cần xem và đề nghị sửa bản ghi liên quan đến mình theo quyền được định nghĩa.

## 7. Phản hồi khách thành việc cải thiện

Khách có thể gửi đánh giá hoặc ticket phản hồi về món ăn, thời gian chờ, phục vụ và trải nghiệm. Liên kết với đơn khi có thể xác minh, đồng thời phân biệt phản hồi chưa xác minh.

AI đọc phản hồi, gom các chủ đề lặp lại, nhận diện mức độ cần xử lý và đưa ra thông tin hữu ích cho chủ quán. Mỗi kết luận có tham chiếu về phản hồi gốc; loại thông tin cá nhân không cần thiết khỏi phần phân tích.

Một vấn đề có thể được giao cho bộ phận phụ trách, chuyển từ mới nhận sang đang xử lý và đã giải quyết. Tuần sau hệ thống kiểm tra vấn đề còn lặp lại hay không. Nội dung khách gửi là dữ liệu để phân tích, không phải chỉ dẫn để AI thay đổi quyền hoặc thực hiện thao tác.

Ví dụ: nhiều khách phản ánh đồ uống quá ngọt trong cùng giai đoạn → đề xuất kiểm tra định lượng và tùy chọn mức đường; chưa đủ căn cứ quy trách nhiệm cho một nhân viên cụ thể.

## 8. Promotion và loyalty để khách quay lại

AI đề xuất chiến dịch theo mục tiêu cụ thể: khách mới quay lại lần hai, khách lâu chưa ghé, lấp giờ vắng hoặc giới thiệu món phù hợp. Chủ quán chọn đối tượng, ngân sách, thời gian và duyệt trước khi áp dụng.

Mỗi gợi ý cần chỉ ra nhóm khách đủ điều kiện, loại ưu đãi, giới hạn sử dụng, ảnh hưởng dự kiến đến lãi gộp và cách đo kết quả. Không mặc định giảm giá toàn menu; có thể cân nhắc combo, điểm thưởng hoặc quyền lợi theo lượt quay lại.

Hiệu quả được xem qua tỷ lệ quay lại, sử dụng ưu đãi, giá trị đơn, lãi gộp sau ưu đãi và tổng chi phí chiến dịch. So sánh với giai đoạn hoặc nhóm tương đương khi có thể; không xem mọi đơn dùng ưu đãi là doanh thu tăng thêm do chiến dịch tạo ra.

Quy tắc tiền và điểm vẫn do Promotion/Loyalty tính xác định. Việc phân nhóm và tiếp cận khách cần dựa trên dữ liệu cùng lựa chọn nhận liên hệ phù hợp; chưa mặc định tích hợp SMS, Zalo hoặc email marketing.

## 9. Đặt bàn và gọi món trước

Khách chọn thời gian đến, số người và món muốn đặt trước. Quán kiểm tra sức chứa, khả năng phục vụ và tồn nguyên liệu trước khi xác nhận. Khách thấy rõ đặt bàn đã được nhận hay còn chờ, tiền đã xác nhận và món đã được phép chế biến hay chưa.

Tách trạng thái đặt bàn, thanh toán và chế biến: gửi yêu cầu không đồng nghĩa giữ bàn thành công, trả tiền không đồng nghĩa phải làm món ngay nếu giờ đến còn xa.

**Giả định cần xác nhận:** “cọc full” tạm hiểu là đã thanh toán đủ giá trị món đặt trước, không chỉ nộp đủ khoản cọc mà quán yêu cầu. Hai cách hiểu dẫn tới điều kiện vào bếp khác nhau.

| Tình huống | Hướng xử lý đề xuất |
|---|---|
| Yêu cầu đặt bàn chưa được quán xác nhận | Chờ xác nhận; chưa tự động làm món |
| Quán đã xác nhận, đã trả đủ tiền món đặt trước | Cho phép chuẩn bị theo giờ đến và thời gian chế biến của từng món |
| Quán đã xác nhận, chưa trả hoặc chỉ trả một phần | Giữ yêu cầu món; chờ khách tới trước khi bắt đầu làm |
| Khách đã tới, số tiền còn thiếu | Xác nhận khách đến; Pay-First vẫn cần đủ tiền, Pay-Later cho phép làm rồi thanh toán sau |
| Khách trả đủ tiền nhưng quán chưa xác nhận khả năng phục vụ | Chờ quán xử lý, không tự đẩy vào bếp; cần luồng hoàn tiền nếu không nhận được |
| Khách đổi giờ, đổi món, hủy hoặc không đến | Áp dụng chính sách đã công bố; khoản thu và hoàn tiền có lịch sử đối soát |

Xác nhận giữ bàn không tự cho phép làm món chưa trả đủ trước khi khách đến. Nếu Founder muốn nhân viên có quyền duyệt ngoại lệ làm trước, cần xác định quyền và điều kiện riêng.

Tiền đặt cọc cần được theo dõi tách khỏi trạng thái món và doanh thu phục vụ; cách ghi nhận, cấn trừ vào đơn, hoàn tiền và tính loyalty phải được đặc tả để tránh cộng hai lần. Đặt bàn và đơn đặt trước chưa có REQ được duyệt, nên không sửa vòng đời đơn hiện tại bằng tài liệu định hướng này.

## 10. Cách đánh giá giá trị sản phẩm

| Mục tiêu | Dấu hiệu cần đo |
|---|---|
| Chủ quán hiểu tình hình nhanh hơn | Thời gian tìm câu trả lời, tỷ lệ câu trả lời có nguồn và được đánh giá hữu ích |
| Ưu tiên đúng vấn đề | Tỷ lệ gợi ý được chủ chấp nhận, việc đã xử lý và vấn đề tái diễn |
| Giảm thất thoát và cải thiện món | Chênh lệch kiểm kê được giải thích, lãi gộp món, tỷ lệ hủy |
| Phục vụ và nhân sự rõ ràng hơn | Thời gian ra món, độ đầy đủ chấm công, phản hồi được giải quyết |
| Khách quay lại | Tỷ lệ quay lại theo nhóm, lãi gộp sau ưu đãi, chi phí trên lượt quay lại |
| Đặt trước hoạt động tốt | Tỷ lệ xác nhận, khách đến, món đúng giờ, hủy và hoàn tiền |
| AI có chi phí hợp lý | Chi phí mỗi tenant và mỗi phân tích hữu ích, chất lượng câu trả lời |

Chưa đặt chỉ tiêu tăng trưởng hoặc tiết kiệm cụ thể khi chưa có số liệu nền. Kết quả cần được xem theo loại quán và mức đầy đủ dữ liệu.

## 11. Liên hệ với yêu cầu hiện hành

| Nhóm định hướng | Nền tảng đã được duyệt | Phần cần bổ sung yêu cầu |
|---|---|---|
| Hiểu hoạt động qua AI | REQ-AI-001, REQ-RPT-001, REQ-RPT-002 | Lịch phân tích tuần, ưu tiên theo bộ phận, hỏi đáp mở rộng, lưu kết quả |
| Hao hụt và giá món | REQ-INV-001, REQ-INV-002, REQ-RPT-001 | Đối chiếu kiểm kê, nguyên nhân hao hụt, kịch bản giá, dữ liệu nhà cung cấp |
| Nhân sự | REQ-AUTH-002, REQ-ACL-001 | Ca làm, chấm công, sửa công, phân tích tải công việc |
| Phản hồi khách | Chưa có REQ chuyên biệt | Đánh giá, ticket, phân loại AI và theo dõi cải thiện |
| Khách quay lại | REQ-PRO-001, REQ-LOY-001 | Gợi ý chiến dịch, phân nhóm, đo hiệu quả và lựa chọn nhận liên hệ |
| Đặt bàn và gọi trước | REQ-TBL-001, REQ-ORD-002, REQ-PAY-001, REQ-PAY-002 là nền tảng liên quan | Sức chứa theo thời gian, xác nhận đặt bàn, cọc/trả đủ, thời điểm vào bếp, hủy/no-show |

REQ hiện có chỉ bao phủ hành vi trong SRS, không tự bao phủ các phần mở rộng ở bảng này. Trước triển khai, từng mở rộng cần SRS amendment, REQ ổn định, tiêu chí nghiệm thu, traceability và ADR khi thay đổi quyết định kiến trúc. Tài liệu này không thay thế lịch triển khai P0 hiện tại.

## 12. Các điểm cần làm rõ khi đặc tả

- Tên hoặc link chính xác của “jev”, chức năng dự kiến và bằng chứng tiết kiệm chi phí.
- “Nhà cung cấp giá trị tiền của đơn hàng” là bên dữ liệu giá nguyên liệu, bên thanh toán hay nhu cầu khác.
- “Cọc full” là đủ giá trị món hay đủ khoản cọc; ai được xác nhận cho làm trước.
- Chính sách giữ bàn, đến muộn, không đến, hủy và hoàn tiền khi bếp đã bắt đầu làm.
- Mức dữ liệu mỗi loại quán sẵn sàng nhập để phân tích kho, nhân sự và khách quay lại có ích.

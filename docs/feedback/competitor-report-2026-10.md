# Phân tích đối thủ cạnh tranh cho ScanGo — 2026

> Ngày khảo sát: **2026-10-08**. Toàn bộ giá là giá niêm yết công khai tại thời điểm khảo sát và **có thể đã thay đổi**; nhiều mức giá là giá khuyến mãi có thời hạn.

## 0. Phương pháp và giới hạn (đọc trước)

**Cách thu thập:** công cụ `web_search` của phiên này **không hoạt động** (thiếu API key), nên toàn bộ dữ liệu được lấy bằng cách tải trực tiếp trang gốc (`curl`) và bằng proxy văn bản `r.jina.ai` cho các site chặn bot (Toast, G2, Capterra…). Tìm kiếm dùng Bing/Brave/DuckDuckGo Lite. Điều này nghĩa là: **những gì không tải được thì không được báo cáo**, chứ không phải "không tồn tại".

**Giới hạn cần biết:**

- `pos.toasttab.com` chặn mọi truy cập trực tiếp (HTTP 403, kể cả với user-agent Googlebot); số liệu Toast lấy qua proxy văn bản nên chỉ đọc được phần marketing công bố.
- **G2, Capterra, TrustRadius, Facebook group, Reddit API đều chặn bot.** Mục "UX yếu theo người dùng thật" vì vậy dựa vào: một luồng diễn đàn Tinhte, các bài review của bên thứ ba, và các bài tổng hợp có trích dẫn Reddit. Đây là **nguồn yếu hơn** so với đọc trực tiếp review.
- Nhiều bài "so sánh/review" tiếng Việt là **do chính nhà cung cấp đối thủ viết** (pos365.vn, posapp.vn, salex.vn, quanlycuahang.cloud, nplgcorp.com). Đã ghi rõ nguồn nào là bên bán.
- Giá iPOS và CukCuk phần lớn lấy từ **đại lý/bên thứ ba**, không phải trang chính thức.
- **`chưa xác minh`** = đã tìm nhưng không có tài liệu công khai xác nhận. Không suy đoán.

**Nguồn ScanGo:** `docs/SRS.md` (v1.2, 2026-09-30), `docs/POSITIONING_STATEMENT.md` (định vị "99K/month, no POS hardware needed"), `docs/features.md` (trạng thái mockup).

---

## 1. iPOS.vn (Việt Nam)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | Chuyên biệt F&B, phân tầng rõ: **iPOS FABi** cho mô hình vừa–lớn, **iPOS FABiBox** cho mô hình nhỏ (app + POS). 15+ năm, 12 chi nhánh, đại lý 34 tỉnh thành. | [ipos.vn](https://ipos.vn/), [FABiBox](https://ipos.vn/app-quan-ly-ban-hang-fabibox/) |
| **QR self-ordering** | ✅ **CÓ** — "iPOS O2O": khách quét QR trên bàn, **không cần tải app**, gọi món/thêm món trên điện thoại khách, đồng bộ tức thì với bếp/thu ngân. Thanh toán online: có tích hợp ví/QR (MoMo, VNPay, VinID, Grab by Moca) theo [huongdan.ipos.vn](https://huongdan.ipos.vn/), nhưng **việc khách tự trả tiền trên trang QR order: chưa xác minh**. | [iPOS O2O](https://ipos.vn/menu-dien-tu-goi-do-tai-ban-ipos-o2o/) |
| **Phần cứng** | ⚠️ **Không bắt buộc** cho FABiBox ("Không tốn chi phí đầu tư thiết bị"), nhưng iPOS bán nguyên bộ phần cứng: máy tính tiền **5.500.000 – 14.900.000 ₫**, máy in nhiệt **1.550.000 ₫**, máy in tem, soundbox, màn hiển thị QR. | [thietbi.ipos.vn](https://thietbi.ipos.vn/) |
| **KDS** | ✅ **CÓ** — iPOS KDS: thay phiếu bếp bằng màn hình, tách món theo khu vực (bếp nóng/bếp lạnh/bar), hiển thị ghi chú chế biến, đổi màu theo thời gian chế biến, có chuông báo. Đẩy đơn qua **máy in hoặc màn hình KDS**. | [iPOS KDS](https://ipos.vn/phan-mem-quan-ly-che-bien-bep-bar-ipos-kds/) |
| **Giá** | ❌ **Không công bố giá** — mọi trang đều ghi "Nhận mức giá tốt nhất và ưu đãi độc quyền chỉ khi liên hệ trực tiếp". Đại lý bên thứ ba nêu **6.400.000 – 6.700.000 ₫/năm**, có cả bản quyền trọn đời on-premise hoặc thuê bao cloud. Diễn đàn Tinhte nêu phí khởi tạo **2.000.000 ₫**, **+2 triệu/thiết bị**, quản lý từ xa **+2 triệu/năm**. | [Đại lý](https://www.sanphanmemquanly.com/sp-798-phan-mem-quan-ly-nha-hang-cafe-ipos.html), [Tinhte](https://tinhte.vn/thread/so-sanh-pos365-ipos-cukcuk-dantrisoft-sapo-kiotviet.3565503/) |
| **Kho / COGS** | ✅ Mạnh. iPOS Inventory: định mức nguyên liệu theo từng món, **tự động trừ kho theo số lượng bán ra**, báo cáo chi phí NVL, **tỷ lệ hao hụt**, kiểm kê định kỳ/đột xuất + ghi nhận chênh lệch, theo dõi hạn sử dụng, so sánh nhà cung cấp theo giá. **Có dùng bình quân gia quyền không: chưa xác minh** (tài liệu chỉ nói "định mức", không nêu phương pháp tính giá vốn). | [iPOS Inventory](https://ipos.vn/phan-mem-quan-ly-kho-ipos-inventory/) |
| **Phản hồi/đánh giá** | ⚠️ iPOS CRM lưu "phản hồi" của khách trong hồ sơ thành viên và có "báo cáo biến động và phản hồi khách hàng". Không thấy cơ chế **gửi phản hồi sản phẩm kèm ảnh chụp màn hình** cho nhà cung cấp: **chưa xác minh**. | [iPOS CRM](https://ipos.vn/phan-mem-crm-quan-ly-khach-hang-ipos-crm/) |
| **Loyalty/KM** | ✅ iPOS CRM: lưu thành viên (tên, ngày sinh, SĐT, lịch sử đơn, **điểm tích lũy**, phản hồi), **tích điểm tự động qua SĐT hoặc mã thành viên**, phân tích hành vi chi tiêu. | [iPOS CRM](https://ipos.vn/phan-mem-crm-quan-ly-khach-hang-ipos-crm/) |
| **Chuỗi / phân quyền** | ✅ Có mô hình chuỗi (chuỗi nhà hàng, chuỗi đồ uống), FABi Manager quản lý từ xa; phân quyền theo vị trí: phục vụ, thu ngân, quản lý ca, chủ thương hiệu. | [iPOS Inventory](https://ipos.vn/phan-mem-quan-ly-kho-ipos-inventory/), [iPOS POS](https://ipos.vn/phan-mem-pos/) |
| **Offline / PWA** | ⚠️ Có bản on-premise (bản quyền trọn đời) theo đại lý; FABiBox là app trên điện thoại. Hành vi khi mất mạng của bản cloud: **chưa xác minh**. | [Đại lý](https://www.sanphanmemquanly.com/sp-798-phan-mem-quan-ly-nha-hang-cafe-ipos.html) |
| **UX mạnh/yếu** | Yếu (nguồn diễn đàn, có thể đã cũ): trong 5 phần mềm so sánh, **iPOS bị xếp cuối về độ đơn giản** của app order ("DanTriSoft, Pos365, Cukcuk, Kiotviet và cuối cùng là iPOS"). Mạnh: có nhân viên hỗ trợ riêng suốt quá trình dùng, hỗ trợ qua điện thoại/online **miễn phí** — được người dùng đánh giá cao. | [Tinhte](https://tinhte.vn/thread/so-sanh-pos365-ipos-cukcuk-dantrisoft-sapo-kiotviet.3565503/) |
| **API / tích hợp** | ✅ Có iPOS FoodHub kết nối **ShopeeFood và GrabFood**, iPOS WebOrder, CallCenter, hóa đơn điện tử, kế toán. **API công khai cho bên thứ ba: chưa xác minh**. | [ipos.vn](https://ipos.vn/), [iPOS POS](https://ipos.vn/phan-mem-pos/) |

---

## 2. Sapo FnB / Sapo POS (Việt Nam)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | Sapo POS gốc **bán lẻ/đa kênh**, mở rộng sang F&B bằng **Sapo FnB**. Có trang riêng cho nhà hàng, quán cafe, trà sữa, bida, tiệm bánh. | [Sapo nhà hàng](https://www.sapo.vn/phan-mem-quan-ly-nha-hang.html), [fnb.sapo.vn](https://fnb.sapo.vn/fnb) |
| **QR self-ordering** | ✅ **CÓ** — "Khách hàng gọi món qua QR order", "Khách chủ động order qua menu điện tử"; khách "xem thực đơn, đặt món **và thanh toán** tiện lợi ngay trên điện thoại". Có "Thông báo chuyển khoản". Thanh toán QR qua **VNPay và VietQR**. | [Sapo nhà hàng](https://www.sapo.vn/phan-mem-quan-ly-nha-hang.html), [fnb.sapo.vn](https://fnb.sapo.vn/fnb), [bảng giá](https://www.sapo.vn/bang-gia.html) |
| **Phần cứng** | ⚠️ Không bắt buộc (chạy trên máy tính, iPad, điện thoại, laptop), nhưng Sapo **bán thiết bị nhà hàng** (máy in hóa đơn, ngăn kéo tiền, máy S3 FnB) và đang khuyến mãi "Tặng máy bán hàng trị giá 6,9 triệu đồng". | [fnb.sapo.vn](https://fnb.sapo.vn/fnb), [shop.sapo.vn](https://shop.sapo.vn/) |
| **KDS** | ✅ **CÓ** — tài liệu trợ giúp có phân hệ **"Bar/ bếp"**, "Thu ngân", "Màn QR"; sản phẩm nêu "Đồng bộ order về bộ phận bếp và thu ngân", "Hỗ trợ bộ phận bếp quản lý chế biến". Chạy trên màn hình/thiết bị thường, **không cần box chuyên dụng**. | [support.sapo.vn](https://support.sapo.vn/tong-quan-phan-mem-quan-ly-nha-hang-va-quan-cafe-fnb), [Sapo nhà hàng](https://www.sapo.vn/phan-mem-quan-ly-nha-hang.html) |
| **Giá** | ✅ **Công bố**: **Sapo FnB 160.000 ₫/tháng** ("chỉ 6.000 ₫/ngày"). Sapo POS bán lẻ: StartUp **170.000 ₫**, Pro **249.000 ₫**, Omni **449.000 ₫**/tháng. Phí khởi tạo 1.000.000–3.000.000 ₫ **đang được miễn phí**. Dùng thử 7 ngày. | [fnb.sapo.vn](https://fnb.sapo.vn/fnb), [bảng giá](https://www.sapo.vn/bang-gia.html) |
| **Kho / COGS** | ✅ Có tồn kho + **hao hụt** ("theo dõi tồn kho và hao hụt hải sản theo thời gian thực"). **Bình quân gia quyền: chưa xác minh**. | [Sapo nhà hàng](https://www.sapo.vn/phan-mem-quan-ly-nha-hang.html) |
| **Phản hồi/đánh giá** | ❌ Không thấy cơ chế thu review khách hàng hay gửi phản hồi kèm screenshot. **Chưa xác minh** (không có tài liệu). | — |
| **Loyalty/KM** | ⚠️ Có "Quản lý khách hàng — lưu thông tin và chăm sóc sau bán", khuyến mãi, tích điểm qua hệ sinh thái Sapo; mức độ chi tiết trong gói FnB: **chưa xác minh**. | [Sapo nhà hàng](https://www.sapo.vn/phan-mem-quan-ly-nha-hang.html) |
| **Chuỗi / phân quyền** | ✅ "Quản lý nhiều cửa hàng trong cùng một hệ thống quản trị", phân quyền nhân viên, chấm công–tính lương theo gói. | [bảng giá](https://www.sapo.vn/bang-gia.html) |
| **Offline / PWA** | ⚠️ Nêu "phù hợp cả bán online và offline", dùng trên trình duyệt. Hành vi khi mất mạng: **chưa xác minh**. | [fnb.sapo.vn](https://fnb.sapo.vn/fnb) |
| **UX mạnh/yếu** | Mạnh: "Giao diện hiện đại, dễ học, dễ dùng", "thành thạo sau 15 phút". Yếu (bài so sánh 2026): "Tính năng kế toán không sâu bằng CukCuk" và **"Giá tăng theo thời gian qua các năm"**. Diễn đàn: đội sales rất đông và **gọi điện chào mời "hơi quá, khiến không ít chủ quán bực bội"**; hỗ trợ sau khi mua "không nhiệt tình như lúc chào mời". | [quanlycuahang.cloud](https://quanlycuahang.cloud/blog/so-sanh-6-phan-mem-quan-ly-nha-hang-2026.html), [Tinhte](https://tinhte.vn/thread/so-sanh-pos365-ipos-cukcuk-dantrisoft-sapo-kiotviet.3565503/) |
| **API / tích hợp** | ✅ VNPay, VietQR, ZaloPay, Ecopay, VNPT Epay, KBank; VPBankPOS; cổng vận chuyển; sàn TMĐT (Shopee, TikTok Shop); GrabFood; hóa đơn điện tử; **Sapo Partner** và **apps.sapo.vn** (kho ứng dụng). | [bảng giá](https://www.sapo.vn/bang-gia.html), [sapo.vn/partner.html](https://www.sapo.vn/partner.html) |

---

## 3. KiotViet FnB (Việt Nam)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | Gốc **bán lẻ/đa kênh**, mở rộng F&B. Tự nhận "50.000+ quán ăn, nhà hàng", 10+ năm, 34 tỉnh thành. Bài so sánh độc lập nhận xét: KiotViet và Sapo "xuất phát từ bài toán bán lẻ… sau đó mở rộng sang F&B", nên **yếu hơn iPOS/CukCuk ở sơ đồ bàn, bếp và định lượng**. | [KiotViet cafe](https://www.kiotviet.vn/quan-ly-cafe-tra-sua), [OneXEOS](https://onexeos.com/vi/so-sanh-kiotviet-sapo-ipos-cukcuk) |
| **QR self-ordering** | ✅ **CÓ** — "Tạo website gọi món & thực đơn điện tử" trong bảng phí ngành ăn uống; hỗ trợ "order tại quầy, tại bàn hoặc đặt trước qua app". Khách tự trả tiền online: **chưa xác minh** (thanh toán QR Napas VietQR có, nhưng không rõ luồng khách tự trả). | [Bảng phí](https://www.kiotviet.vn/phi-dich-vu), [KiotViet cafe](https://www.kiotviet.vn/quan-ly-cafe-tra-sua) |
| **Phần cứng** | ⚠️ Không bắt buộc; bán kèm máy in, máy quét, thiết bị. | [kiotviet.vn](https://www.kiotviet.vn/) |
| **KDS** | ✅ **CÓ** — "Order tự động chuyển xuống **màn hình pha chế**", có "Lọc đơn" theo Tại quán/Mang đi/Giao app/Đặt trước. | [KiotViet cafe](https://www.kiotviet.vn/quan-ly-cafe-tra-sua) |
| **Giá** | ✅ **Công bố**: ngành ăn uống, giải trí **270.000 / 330.000 / 490.000 ₫/tháng**. Thêm chi nhánh **+270k hoặc +375k**/chi nhánh; thêm kho **+150k**/kho. Gói cơ bản **tối đa 3 tài khoản**. Hóa đơn điện tử miễn phí 5.000–50.000 hóa đơn/năm, chữ ký số miễn phí, phần mềm kế toán HKD miễn phí. Miễn phí khởi tạo. | [Bảng phí](https://www.kiotviet.vn/phi-dich-vu) |
| **Kho / COGS** | ✅ "Tự động trừ nguyên liệu theo **định lượng từng món**", "quản lý **công thức riêng cho từng size**", cảnh báo nguyên liệu sắp hết, "giảm hao hụt". **Bình quân gia quyền: chưa xác minh**. | [KiotViet cafe](https://www.kiotviet.vn/quan-ly-cafe-tra-sua) |
| **Phản hồi/đánh giá** | ❌ Không có tài liệu. **Chưa xác minh**. | — |
| **Loyalty/KM** | ✅ Khuyến mãi, tích điểm khách hàng, quản lý khách hàng; phân tích kinh doanh thông minh **có AI** ở gói cao cấp. | [Bảng phí](https://www.kiotviet.vn/phi-dich-vu) |
| **Chuỗi / phân quyền** | ✅ Nhiều chi nhánh (tính phí theo chi nhánh), nhiều kho, phân quyền theo vai trò, chấm công–tính lương (15–50 NV/cửa hàng theo gói). | [Bảng phí](https://www.kiotviet.vn/phi-dich-vu) |
| **Offline / PWA** | ⚠️ Có chế độ bán khi mất mạng theo bài so sánh diễn đàn ("Đều có chức năng bán hàng khi mất internet"). Web + app. | [Tinhte](https://tinhte.vn/thread/so-sanh-pos365-ipos-cukcuk-dantrisoft-sapo-kiotviet.3565503/) |
| **UX mạnh/yếu** | Mạnh: "phổ biến, dễ triển khai", ổn định, chi phí hợp lý. Yếu: **không đẩy mạnh tính năng F&B**; gói cơ bản **giới hạn 3 người dùng**; **tổng đài hỗ trợ tính phí 3.000–5.000 ₫/phút** và mỗi lần gọi gặp một nhân viên mới; đội sales "đông đảo nhưng ít kinh nghiệm, tỉ lệ nghỉ việc cao". | [Tinhte](https://tinhte.vn/thread/so-sanh-pos365-ipos-cukcuk-dantrisoft-sapo-kiotviet.3565503/), [OneXEOS](https://onexeos.com/vi/so-sanh-kiotviet-sapo-ipos-cukcuk) |
| **API / tích hợp** | ✅ Napas VietQR / Visa / Master; **ShopeeFood, GrabFood** tích hợp trong hệ thống; Shopee, TikTok Shop, Facebook, Instagram, Zalo; hãng vận chuyển; **API công khai: chưa xác minh**. | [Bảng phí](https://www.kiotviet.vn/phi-dich-vu) |

---

## 4. PosApp (Việt Nam)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | F&B + dịch vụ (cafe, nhà hàng, khách sạn, karaoke, spa, salon). "30.000+ chủ cửa hàng", "300+ chuỗi cửa hàng tin dùng". | [posapp.vn](https://posapp.vn/), [bảng giá](https://posapp.vn/bang-gia) |
| **QR self-ordering** | ✅ **CÓ, và khách trả tiền online** — "**QR tự order**: Khách ngồi tại bàn tự quét mã order **và thanh toán** tiện lợi mà không cần chờ đợi nhân viên phục vụ". Không cần phần cứng riêng: chạy trên điện thoại, máy tính bảng, PC, laptop, máy POS. | [posapp.vn/phan-mem-order-goi-mon](https://posapp.vn/phan-mem-order-goi-mon), [tính năng](https://posapp.vn/tinh-nang) |
| **Phần cứng** | ⚠️ Không bắt buộc, nhưng có bán "Máy POS thu ngân", "Máy POS cầm hồi (di động)", máy order. | [posapp.vn](https://posapp.vn/) |
| **KDS** | ✅ **CÓ, gọi tên rõ ràng** — "**Màn hình bếp KDS**: Đồng bộ tức thì order từ quầy thu ngân. Bếp chế biến đúng thứ tự, không lo mất bill hay nhầm món." Có cả **in tách món theo khu vực** (đồ uống in tại Bar, thức ăn in bếp nóng/lạnh). | [posapp.vn/phan-mem-order-goi-mon](https://posapp.vn/phan-mem-order-goi-mon) |
| **Giá** | ✅ **Công bố**: **Khởi đầu 220.000 ₫/tháng** (đã gồm quản lý kho, **định lượng nguyên vật liệu**, tích điểm Loyalty cơ bản, hóa đơn điện tử); **Nâng Cao 299.000 ₫/tháng** (kho chuyên sâu, nhiều kho, kho sản xuất–chế biến, hạng thẻ thành viên); **PRO: liên hệ** (chuỗi, nhượng quyền, E-Menu điện tử, thẻ trả trước, tồn kho liên chi nhánh). Dùng thử 14 ngày. | [bảng giá](https://posapp.vn/bang-gia) |
| **Kho / COGS** | ✅ "Quản lý kho, **định lượng nguyên vật liệu**"; gói Nâng Cao có "**kho sản xuất, chế biến**". Đối soát hao hụt cuối ca ("Đối chiếu tức thì doanh thu thực tế và **hàng tồn** khi kết thúc ca, dễ dàng quy trách nhiệm nếu có hao hụt"). **Bình quân gia quyền: chưa xác minh**. | [bảng giá](https://posapp.vn/bang-gia), [order](https://posapp.vn/phan-mem-order-goi-mon) |
| **Phản hồi/đánh giá** | ❌ Không có tài liệu. **Chưa xác minh**. | — |
| **Loyalty/KM** | ✅ Tích điểm cơ bản (gói Khởi đầu) → **tích điểm + hạng thẻ thành viên + Loyalty-CRM chuyên sâu** (Nâng Cao) → **thẻ trả trước** + marketing cá nhân hóa (PRO). | [bảng giá](https://posapp.vn/bang-gia) |
| **Chuỗi / phân quyền** | ✅ Mạnh: "**Phân quyền triệt để** — thiết lập quyền hạn chi tiết cho từng vị trí, ngăn chặn gian lận qua việc hủy đơn, xóa món hay tự ý áp dụng giảm giá"; lưu vết lịch sử sửa hóa đơn; gói PRO quản lý chuỗi/nhượng quyền. | [order](https://posapp.vn/phan-mem-order-goi-mon) |
| **Offline / PWA** | ✅ **CÓ, nêu rõ**: "Bán hàng liên tục **ngay cả khi mất điện, mất kết nối Internet** trên điện thoại, máy tính bảng"; dữ liệu lưu Cloud. | [tính năng](https://posapp.vn/tinh-nang) |
| **UX mạnh/yếu** | Mạnh: đa nền tảng, offline, KDS + in tách món, tích hợp Zalo MiniApp. Yếu: các bài "review" tìm được đều do **chính PosApp viết** để hạ đối thủ (Ocha, CukCuk) → **thiếu đánh giá độc lập: chưa xác minh**. | [posapp.vn/phan-mem-ocha-co-tot-khong](https://posapp.vn/phan-mem-ocha-co-tot-khong) |
| **API / tích hợp** | ✅ Đơn online từ **Grab / Shopee / Zalo MiniApp**; hóa đơn điện tử theo **Nghị định 70/2025/NĐ-CP và Thông tư 88**; thanh toán thẻ, ví điện tử, QR. **API công khai: chưa xác minh**. | [order](https://posapp.vn/phan-mem-order-goi-mon) |

---

## 5. Ocha (ocha.vn, Việt Nam)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | **POS trên máy tính bảng Android**, thương hiệu "máy bán hàng". Meta của site: "Ocha là **Nhãn Hiệu Máy Bán Hàng** Hàng Đầu Thế Giới". Nhắm quán nhỏ/vừa; app Ocha Boss cho chủ quán xem báo cáo từ xa. | [ocha.vn](https://ocha.vn/), [posapp.vn/phan-mem-ocha-co-tot-khong](https://posapp.vn/phan-mem-ocha-co-tot-khong) |
| **QR self-ordering** | ⚠️ **Chưa xác minh.** Website là SPA (React) nên không đọc được nội dung tính năng; tài liệu công khai không nêu tính năng khách quét QR tự gọi món. Có "Kết nối giữ quầy thu ngân và khu vực bếp". | [Google Play](https://play.google.com/store/apps/details?id=com.ochapos.vn) |
| **Phần cứng** | ❌ **Phụ thuộc máy tính bảng Android** — app chạy trên tablet, kết nối quầy thu ngân và khu vực bếp. Bài của đối thủ nêu lịch sử: 2018 cho thuê máy **4,5 triệu ₫/năm + 100.000 ₫/tháng** phần mềm; 2019 **bắt mua "đứt" bộ máy tính tiền + 125.000 ₫/tháng**. | [Google Play](https://play.google.com/store/apps/details?id=com.ochapos.vn), [posapp.vn](https://posapp.vn/phan-mem-ocha-co-tot-khong) |
| **KDS** | ⚠️ Có "kết nối với **khu vực bếp**" và màn hình order; **không có tài liệu về KDS chuyên dụng**. | [Google Play](https://play.google.com/store/apps/details?id=com.ochapos.vn) |
| **Giá** | ⚠️ **Mâu thuẫn nguồn**: Google Play (cập nhật 05/03/2026) ghi "**Hoàn toàn MIỄN PHÍ!**"; bài của PosApp (đối thủ) mô tả **mua máy + 125.000 ₫/tháng**. Giá hiện hành: **chưa xác minh**. | [Google Play](https://play.google.com/store/apps/details?id=com.ochapos.vn), [posapp.vn](https://posapp.vn/phan-mem-ocha-co-tot-khong) |
| **Kho / COGS** | ⚠️ "Quản lý hàng tồn kho **theo thời gian thực**", "quản lý kho theo từng đầu mục, tự do thiết lập mã hàng hóa". **Công thức/định lượng/bình quân gia quyền: chưa xác minh**. | [Google Play](https://play.google.com/store/apps/details?id=com.ochapos.vn), [posapp.vn](https://posapp.vn/phan-mem-ocha-co-tot-khong) |
| **Phản hồi/đánh giá** | ❌ Không có tài liệu. **Chưa xác minh**. | — |
| **Loyalty/KM** | ⚠️ "Quản lý dữ liệu khách hàng, dễ dàng áp dụng các chương trình khuyến mãi, ưu đãi". Tích điểm: **chưa xác minh**. | [posapp.vn](https://posapp.vn/phan-mem-ocha-co-tot-khong) |
| **Chuỗi / phân quyền** | ❌ Yếu: nguồn đối thủ nêu hạn chế với "mô hình lớn, chuỗi chuyên nghiệp" ở các mảng **công nợ, nhà phân phối, quản lý chuỗi, CRM**. Có "quản lý nhân viên theo ca làm việc". | [posapp.vn](https://posapp.vn/phan-mem-ocha-co-tot-khong) |
| **Offline / PWA** | ⚠️ App native Android (Play Store), không phải PWA. Offline: **chưa xác minh**. | [Google Play](https://play.google.com/store/apps/details?id=com.ochapos.vn) |
| **UX mạnh/yếu** | Play Store: **4,2★ / 44 bài đánh giá**, cập nhật gần nhất 05/03/2026. Nội dung review cụ thể: **không tải được** (Play Store chặn trích xuất review) → **chưa xác minh**. | [Google Play](https://play.google.com/store/apps/details?id=com.ochapos.vn) |
| **API / tích hợp** | ❌ **Chưa xác minh** — không có tài liệu API công khai. | — |

---

## 6. MISA CukCuk (Việt Nam)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | F&B chuyên sâu theo mô hình: quán cafe, trà sữa, đồ ăn nhanh, nhà hàng, quán ăn, bar-pub, karaoke-billiard, spa-nails, **mô hình chuỗi**. Tự nhận **54.000+ thương hiệu F&B tại 25 quốc gia**. Có cả CukCuk POS, CukCuk Lomas, CukCuk Web. | [cukcuk.vn](https://www.cukcuk.vn/), [bảng giá](https://www.cukcuk.vn/bang-gia/) |
| **QR self-ordering** | ✅ **CÓ, có tài liệu hướng dẫn chi tiết** — "Gọi món tại bàn": khách **quét mã QR để tự gọi món tại bàn**, nhà hàng in QR dán theo từng số bàn, có cập nhật Hết món/Còn món, có logo/footer/mạng xã hội. **Lưu ý quan trọng:** hệ thống **bắt buộc kết nối Internet liên tục** và **không cho tự động xác nhận order** — thu ngân phải xác nhận tay rồi mới chuyển xuống bếp/bar. Tài liệu cập nhật **23/09/2026**. Khách tự trả tiền online: **chưa xác minh**. | [helpv2.cukcuk.vn](https://helpv2.cukcuk.vn/vi/kb/thiet-lap-goi-mon-tai-ban), [help.cukcuk.us](https://help.cukcuk.us/kb/thiet-lap-qr-ordering) |
| **Phần cứng** | ⚠️ Phần mềm chạy trên **PC, POS, máy tính bảng, điện thoại**, nhưng CukCuk **bán trọn bộ phần mềm + thiết bị**: Basic **7.000.000 ₫/bộ**, Essential **8.888.000 ₫**, Standard **14.200.000 ₫**, Professional **15.400.000 ₫**. | [bảng giá](https://www.cukcuk.vn/bang-gia/), [bộ phần mềm & thiết bị](https://www.cukcuk.vn/bao-gia-tron-bo-phan-mem-kem-thiet-bi-cho-cac-mo-hinh/) |
| **KDS** | ✅ **CÓ** — "Gửi yêu cầu chế biến cho **bếp/bar**", "Theo dõi danh sách các món đã chế biến xong". Không nêu box phần cứng riêng. | [bảng giá](https://www.cukcuk.vn/bang-gia/) |
| **Giá** | ✅ **Công bố**: **Standard 199.000 ₫/tháng** (bán hàng đầy đủ, thực đơn, nhân viên, khuyến mãi, order tại bàn, 12 báo cáo); **Professional 299.000 ₫/tháng** (thêm Thu-chi, Mua hàng, **Kho**, Công nợ, 48 báo cáo); **Enterprise 499.000 ₫/tháng** (thêm **MISA Lomas** CRM). **Thêm 1 nhà hàng = đúng giá gói** (199k/299k/499k mỗi chi nhánh). **CukCuk Web 1.500.000 ₫/năm**. CukCuk **đã bỏ phí khởi tạo**; **không bán trọn đời**, thu theo năm; dùng thử 15 ngày. Lomas: **499.000 ₫/tháng/chi nhánh**. | [bảng giá](https://www.cukcuk.vn/bang-gia/), [Lomas](https://www.cukcuk.vn/cukcuk-lomas/) |
| **Kho / COGS** | ✅ Có: gói Professional mới có "Quản lý kho", "Quản lý mua hàng"; có **công cụ tính COGs** với các cột **Định lượng, Giá mua đơn vị, % hao hụt**, và khuyến nghị COGs 20–25% doanh thu. **Bình quân gia quyền: chưa xác minh** (công cụ là bảng tính giá vốn theo công thức, không phải tài liệu về phương pháp kế toán kho). | [Tính COGs](https://www.cukcuk.vn/tinh-cogs-gia-von-hang-ban), [bảng giá](https://www.cukcuk.vn/bang-gia/) |
| **Phản hồi/đánh giá** | ⚠️ Không có cơ chế thu review khách hàng dạng chuyên biệt. Lomas có "tương tác khách hàng trên nhiều phương tiện (offline, Facebook, Zalo, SMS, mini game)" và **"Điều hướng khách hàng từ online thành offline và ngược lại bằng mã QR code"**. Gửi phản hồi sản phẩm kèm screenshot: **chưa xác minh**. | [Lomas](https://www.cukcuk.vn/cukcuk-lomas/) |
| **Loyalty/KM** | ✅ Mạnh (Enterprise/Lomas): kết nạp thành viên qua SĐT/email, **tích điểm**, **thẻ nạp tiền điện tử** (mua điểm, dùng điểm để thanh toán), voucher, **vòng quay may mắn**, tự động phân phối qua Facebook/Zalo. | [Lomas](https://www.cukcuk.vn/cukcuk-lomas/) |
| **Chuỗi / phân quyền** | ✅ Mạnh: "Quản lý chuỗi nhà hàng" trong bảng so sánh; **kho tổng chuỗi**, nhà cung cấp, đối tác giao hàng; phân quyền nhân viên chính xác, có tra cứu **lịch sử truy cập và thao tác**. | [bảng giá](https://www.cukcuk.vn/bang-gia/), [quản lý chuỗi](https://www.cukcuk.vn/13618/phan-mem-quan-ly-chuoi-cua-hang-fb/) |
| **Offline / PWA** | ❌ Tài liệu QR order ghi rõ **"Đảm bảo nhà hàng luôn kết nối mạng Internet liên tục"**. Offline: **chưa xác minh / có dấu hiệu không hỗ trợ**. Chạy trên PC/POS/tablet/điện thoại (app). | [helpv2.cukcuk.vn](https://helpv2.cukcuk.vn/vi/kb/thiet-lap-goi-mon-tai-ban) |
| **UX mạnh/yếu** | Yếu: "**Giao diện có phần cũ, học sử dụng mất thời gian hơn**" (bài so sánh 2026); **không có đối thủ thì khó tính** — bài của PosApp nêu "điểm trừ… nằm ở việc không thấu hiểu nhu cầu của khách hàng… tính năng còn nhiều chỗ cần hoàn thiện". Diễn đàn: đăng ký dùng thử phải **chờ xác nhận/kích hoạt** mới vào được; **tổng đài 1900 tính phí 3.000–5.000 ₫/phút**, mỗi lần gọi gặp nhân viên mới. Mạnh: **quản lý kho/nguyên vật liệu "vô cùng chặt chẽ, chính xác"**. | [quanlycuahang.cloud](https://quanlycuahang.cloud/blog/so-sanh-6-phan-mem-quan-ly-nha-hang-2026.html), [posapp.vn](https://posapp.vn/phan-mem-ocha-co-tot-khong), [Tinhte](https://tinhte.vn/thread/so-sanh-pos365-ipos-cukcuk-dantrisoft-sapo-kiotviet.3565503/) |
| **API / tích hợp** | ✅ **CukCuk Kết nối**, kết nối **GrabFood**, MISA Lomas, hóa đơn điện tử, kế toán MISA. **API công khai cho bên thứ ba: chưa xác minh**. | [cukcuk.vn](https://www.cukcuk.vn/) |

---

## 7. MShopKeeper → nay là MISA eShop (Việt Nam)

> **Phát hiện quan trọng:** `mshopkeeper.vn` hiện **chuyển hướng sang thương hiệu MISA eShop** (`misaeshop.vn`), và sản phẩm này **nghiêng về bán lẻ/đa kênh**; với F&B, MISA đẩy khách sang **CukCuk**. Không tìm thấy sản phẩm "MShopKeeper" riêng còn hoạt động.

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | Nền tảng **quản lý bán hàng đa kênh** cho hộ kinh doanh (bán lẻ, thời trang, mỹ phẩm, tạp hoá… và có nhánh "Nhà hàng, quán ăn / Cà phê, Trà sữa"). Có **AI bán hàng** (gợi ý mô tả hàng hóa, chỉnh ảnh, tự động chốt đơn, dự báo nhu cầu). | [misaeshop.vn](https://www.misaeshop.vn/) |
| **QR self-ordering** | ❌ **Không có tài liệu** về khách quét QR tự gọi món tại bàn. **Chưa xác minh**. | — |
| **Phần cứng** | ⚠️ Không bắt buộc; có eShop POS và bán thiết bị. | [eShop POS](https://www.misaeshop.vn/eshop-pos/) |
| **KDS** | ❌ **Không có tài liệu**. **Chưa xác minh**. | — |
| **Giá** | ✅ **Công bố**: STARTER **199.000 ₫/tháng/chi nhánh** (2 tài khoản: chủ + thu ngân) → STANDARD **299.000 ₫** → PROFESSIONAL **499.000 ₫** → ENTERPRISE **599.000 ₫**/tháng/chi nhánh. Bảng so sánh của MISA còn nêu dải **99.000 / 299.000 / 699.000 ₫/tháng**. Add-on **eShop Lomas**. | [eShop POS](https://www.misaeshop.vn/eshop-pos/), [báo giá](https://payment.mshopkeeper.vn/), [so sánh giá](https://www.misaeshop.vn/24283/gia-phan-mem-quan-ly-ban-hang/) |
| **Kho / COGS** | ✅ "Tra cứu tồn kho bằng **mã vạch**", "**Tự động trừ kho** khi có phát sinh giao dịch", báo cáo tồn kho, mua hàng. **Định lượng/công thức/bình quân gia quyền: chưa xác minh**. | [eShop POS](https://www.misaeshop.vn/eshop-pos/) |
| **Phản hồi/đánh giá** | ❌ Không có tài liệu. **Chưa xác minh**. | — |
| **Loyalty/KM** | ✅ "**Quản lý thẻ thành viên điện tử (tích điểm, đổi điểm, nhận hóa đơn…)**", tự động phát hành mã ưu đãi, kho kịch bản tin nhắn; add-on eShop Lomas cho chăm sóc khách hàng tự động. | [eShop POS](https://www.misaeshop.vn/eshop-pos/) |
| **Chuỗi / phân quyền** | ✅ "**Phân quyền theo vai trò**, quản lý ca làm và theo dõi hiệu quả bán hàng của nhân viên"; báo cáo so sánh hiệu quả **theo sản phẩm, chi nhánh**. | [eShop POS](https://www.misaeshop.vn/eshop-pos/) |
| **Offline / PWA** | ✅ **CÓ, nêu rõ**: "Điều hành mọi lúc mọi nơi trên mọi thiết bị, **hoạt động ổn định ngay cả khi mất internet**". | [eShop POS](https://www.misaeshop.vn/eshop-pos/) |
| **UX mạnh/yếu** | Chưa tìm được đánh giá độc lập dành riêng cho bản F&B. **Chưa xác minh**. | — |
| **API / tích hợp** | ✅ "Đồng bộ dữ liệu bán hàng với **phần mềm kế toán, hóa đơn điện tử**"; kết nối sàn TMĐT (Shopee, Lazada, Sendo), mạng xã hội, đơn vị vận chuyển (GHN, GHTK, VNPost, ViettelPost, Ahamove, J&T); hóa đơn điện tử theo **Nghị định 254/2026/NĐ-CP**. | [eShop POS](https://www.misaeshop.vn/eshop-pos/), [so sánh giá](https://www.misaeshop.vn/24283/gia-phan-mem-quan-ly-ban-hang/) |

---

## 8. Bota (Việt Nam)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | POS bán hàng **đa ngành** ("phù hợp với nhiều ngành hàng"), không định vị riêng F&B; tài liệu không có khái niệm bàn/bếp/quán. | [bota.vn](https://bota.vn/phan-mem-quan-ly-ban-hang/) |
| **QR self-ordering** | ❌ **Không tìm thấy** bất kỳ tài liệu nào về QR gọi món, order tại bàn hay bếp. **Có dấu hiệu KHÔNG có** (đã grep toàn bộ trang bảng giá và trang tính năng: 0 kết quả cho "QR", "gọi món", "order", "bếp"). | [bảng giá](https://bota.vn/bang-gia-bota-pos/), [tính năng](https://bota.vn/tinh-nang-bota-pos) |
| **Phần cứng** | ⚠️ Không bắt buộc (web/app), có hỗ trợ **đầu đọc mã vạch** và in mã vạch. | [bảng giá](https://bota.vn/bang-gia-bota-pos/) |
| **KDS** | ❌ **Không có** tài liệu. | — |
| **Giá** | ✅ **Công bố**: **Tiêu chuẩn 99.000 ₫/tháng** (1.000 mã hàng, 1 cửa hàng) → **Cơ bản 199.000 ₫** → **Chuyên nghiệp 299.000 ₫** → **Combo 599.000 ₫**/tháng. Phí khởi tạo **1.000.000–1.500.000 ₫ nhưng đang miễn phí**. Giảm **10% khi đăng ký 2 năm, 15% khi 3 năm**. | [bảng giá](https://bota.vn/bang-gia-bota-pos/) |
| **Kho / COGS** | ✅ **Điểm mạnh bất ngờ — có ghi rõ bình quân**: "**Cho phép giá vốn trung bình sau mỗi lần nhập xuất kho**". Có **Kiểm kho**, **Xuất hủy** (hao hụt), phiếu yêu cầu xuất nhập kho, chuyển hàng giữa các kho, lịch sử xóa phiếu. | [bảng giá](https://bota.vn/bang-gia-bota-pos/) |
| **Phản hồi/đánh giá** | ❌ Không có tài liệu. **Chưa xác minh**. | — |
| **Loyalty/KM** | ⚠️ "Tự tạo ra chương trình khuyến mãi theo yêu cầu", khuyến mại theo từng cửa hàng, quà tặng kèm sản phẩm, khách hàng–công nợ. Tích điểm/thành viên: **chưa xác minh**. | [bảng giá](https://bota.vn/bang-gia-bota-pos/) |
| **Chuỗi / phân quyền** | ✅ Giá bán khác nhau giữa các chi nhánh, tồn kho theo từng cửa hàng, "**Tạo tài khoản, phân quyền cho từng nhân viên**", ghi nhận nhân viên trên hóa đơn. | [bảng giá](https://bota.vn/bang-gia-bota-pos/) |
| **Offline / PWA** | ✅ **CÓ, nêu rõ**: "**Bán offline (khi mất mạng)**". | [bảng giá](https://bota.vn/bang-gia-bota-pos/) |
| **UX mạnh/yếu** | **Chưa xác minh** — không tìm được review độc lập đáng tin. | — |
| **API / tích hợp** | ❌ **Chưa xác minh** — không có tài liệu API công khai. | — |

---

## 9. Toast POS (Mỹ)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | Từ **1 địa điểm** đến **chuỗi/nhượng quyền/enterprise**. Có gói riêng cho nhà hàng mới, và Multi-Location Management cho "restaurant groups, franchises, and enterprise operators". | [Toast pricing](https://pos.toasttab.com/pricing), [Multi-location](https://pos.toasttab.com/products/multi-location-management) |
| **QR self-ordering** | ✅ **CÓ** — **Toast Mobile Order & Pay®**: khách **quét QR để xem menu, gọi món và trả tiền trên điện thoại của khách**; "runs on Toast POS", đơn chảy thẳng xuống bếp. ❌ **Nhưng gắn chặt phần cứng**: "you cannot use third-party terminals, tablets, or card readers with Toast. Every piece of hardware must come from Toast." | [Mobile Order & Pay](https://pos.toasttab.com/products/mobile-order-and-pay), [sleftpayments](https://www.sleftpayments.com/learning-hub/toast-pos-problems-complaints-2026) |
| **Phần cứng** | ❌ **Bắt buộc, độc quyền, dùng Android riêng của Toast**. Toast Flex (countertop) **từ $799**. Không thể dùng lại phần cứng Toast cho POS khác. | [sleftpayments](https://www.sleftpayments.com/learning-hub/toast-pos-problems-complaints-2026) |
| **KDS** | ✅ **CÓ, là sản phẩm phần cứng riêng** — "durable, real-time kitchen display", cấu hình màn hình theo station/menu/service model, hỗ trợ Runner Fulfillment và Assembly Lines. | [Toast KDS](https://pos.toasttab.com/hardware/kitchen-display-system) |
| **Giá** | ✅ **Công bố (2026)**: **Starter Kit từ $0/tháng** (kèm kit phần cứng, 1 location, tối đa 2 terminal, "no upfront costs" — đổi lại là ràng buộc hợp đồng); **Point of Sale từ $69/tháng**; **Build Your Own: báo giá riêng**. Bundle payroll **$69/tháng + $9/nhân viên/tháng**. Xử lý thanh toán **2,49% + $0,15** (Starter) tới **2,99% + $0,15**. ❌ **Hợp đồng 2–3 năm + phí chấm dứt sớm**; hợp đồng tài chính thiết bị **tách riêng**, hủy phần mềm vẫn còn nợ thiết bị. | [Toast pricing](https://pos.toasttab.com/pricing), [sleftpayments](https://www.sleftpayments.com/learning-hub/toast-pos-problems-complaints-2026) |
| **Kho / COGS** | ✅ Mạnh, qua **xtraCHEF by Toast**: tự động hóa hóa đơn nhà cung cấp, **recipe costing**, quản lý tồn kho, báo cáo chi phí, "perpetual inventory management", giảm waste. **Bình quân gia quyền: chưa xác minh** (tài liệu không nêu phương pháp tính giá). | [Inventory](https://pos.toasttab.com/products/inventory-management), [xtraCHEF](https://pos.toasttab.com/products/xtrachef) |
| **Phản hồi/đánh giá** | ✅ **CÓ** — bảng so sánh gói ghi rõ hạng mục **"Guest CRM, Insights and Feedback"**. | [Toast pricing](https://pos.toasttab.com/pricing) |
| **Loyalty/KM** | ✅ **Marketing Essentials**: email marketing, **loyalty**, gift cards; Toast Mobile Order & Pay nhắc khách đăng ký loyalty khi thanh toán. | [Toast pricing](https://pos.toasttab.com/pricing), [Mobile Order & Pay](https://pos.toasttab.com/products/mobile-order-and-pay) |
| **Chuỗi / phân quyền** | ✅ Mạnh: quản lý menu, báo cáo, cấu hình vận hành **tập trung nhiều địa điểm**; payroll, scheduling, tips management, HR. | [Multi-location](https://pos.toasttab.com/products/multi-location-management) |
| **Offline / PWA** | ✅ Có **"offline mode"** trong bộ tính năng POS (bảng so sánh gói). App native (Toast Now trên App Store/Google Play) + web. | [Toast pricing](https://pos.toasttab.com/pricing) |
| **UX mạnh/yếu** | **Yếu (nhiều nguồn độc lập):** (1) **khoá cứng vào Toast Payments** — "you cannot bring your own payment processor", một chủ quán trên r/restaurantowners: *"When I asked Toast to lower my processing rate, they basically said take it or leave it. Where am I going to go? My entire operation runs on their hardware."* (2) **Phần cứng độc quyền đắt** và **mất giá**: iPad 2 năm còn bán lại $300–500, Toast Flex 2 năm chỉ $50–100. (3) **Hợp đồng 2–3 năm, phí chấm dứt sớm**: trên r/ToastPOS — *"Early termination fees are insane with Toast. Wish I had read the fine print before signing."* (4) Nhiều khiếu nại trên BBB. | [sleftpayments](https://www.sleftpayments.com/learning-hub/toast-pos-problems-complaints-2026), [Reddit r/ToastPOS](https://www.reddit.com/r/ToastPOS/comments/tlxmxp/i_want_to_leave_toast_after_8_months_what_will/), [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/), [BBB](https://www.bbb.org/us/ma/boston/profile/point-of-sale-systems/toast-inc-0021-164973/complaints) |
| **API / tích hợp** | ✅ Mạnh: "Toast's all-in-one platform integrates with top restaurant software **through our API**", có partner directory (Apicbase, Appfront, v.v.). | [Integrations](https://pos.toasttab.com/integrations) |

---

## 10. Square for Restaurants (Mỹ)

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Định vị** | Quán **độc lập, nhỏ và vừa**: cafe, tiệm bánh, food truck, bar, QSR, fast-casual. Điểm số 3,83/5, "best free restaurant POS". **Không nhắm fine dining nhiều course.** | [Restaurant HQ](https://www.therestauranthq.com/technology/square-for-restaurants-review/), [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |
| **QR self-ordering** | ✅ **CÓ** — hỗ trợ "dine-in, takeout, online, delivery, **QR**, and kiosk ordering"; "tableside and QR ordering". Khách trả trên điện thoại/thiết bị Square. **Không khoá cứng phần cứng như Toast**: chạy trên **iPad** thường + Square Reader ($49)/Stand ($149)/Terminal ($299). | [Restaurant HQ](https://www.therestauranthq.com/technology/square-for-restaurants-review/), [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |
| **Phần cứng** | ⚠️ **Không bắt buộc nhưng khuyến khích**: iPad + Square Reader/Stand/Terminal/Kiosk. iPad có giá trị bán lại. | [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |
| **KDS** | ✅ **CÓ, tính phí theo từng thiết bị** — Square KDS app: **$30/tháng/thiết bị** (Plus) hoặc **$20/tháng/thiết bị** (Premium); **không có ở gói Free**. Kiosk app: $50/$30 per device. | [Square pricing](https://squareup.com/us/en/pricing) |
| **Giá** | ✅ **Công bố**: **Square Free $0/tháng/địa điểm**; **Square Plus $49/tháng/địa điểm**; **Square Premium $149/tháng/địa điểm**. ❌ **Không hợp đồng dài hạn, không phí chấm dứt** — "month-to-month at every tier. Cancel today, done tomorrow." Xử lý: **2,6% + $0,15** (Free), **2,5% + $0,15** (Plus), **2,4% + $0,15** (Premium); online **2,9% + $0,30**. Payroll add-on $35/tháng + $6/NV. | [Square pricing](https://squareup.com/us/en/pricing), [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |
| **Kho / COGS** | ⚠️ **Yếu hơn Toast**: Square có tồn kho real-time, par level, cảnh báo sắp hết, trừ nguyên liệu theo món — "**functional, though not as granular as dedicated restaurant inventory platforms**". **Tồn kho cấp nguyên liệu (ingredient-level) phải trả thêm qua MarketMan** (đối tác, không phải Square). **Bình quân gia quyền: chưa xác minh**. | [Restaurant HQ](https://www.therestauranthq.com/technology/square-for-restaurants-review/), [Square pricing](https://squareup.com/us/en/pricing) |
| **Phản hồi/đánh giá** | ⚠️ Không thấy cơ chế thu guest review/survey trong tài liệu đã đọc. **Chưa xác minh**. | — |
| **Loyalty/KM** | ✅ Square Loyalty + Marketing: chương trình rewards tuỳ chỉnh gắn POS, email không giới hạn, **500 tin SMS miễn phí rồi 3¢/tin** (Plus), 2.500 tin rồi 1,5¢/tin (Premium). | [Square pricing](https://squareup.com/us/en/pricing) |
| **Chuỗi / phân quyền** | ✅ Có multi-location tools; phí theo **từng địa điểm**; remote device management. **Trần quản lý bàn ~40–50 chỗ** với mô hình phục vụ phức tạp. | [Square pricing](https://squareup.com/us/en/pricing), [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |
| **Offline / PWA** | ✅ **CÓ** — offline payments lưu giao dịch locally, xử lý khi có mạng lại; **chip/swipe lưu offline tới 72 giờ**; **tap-to-pay cần Internet**; giao dịch offline bị từ chối nếu không kết nối lại trong 24 giờ. | [Square pricing](https://squareup.com/us/en/pricing), [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |
| **UX mạnh/yếu** | Mạnh: **$0 khởi đầu, không hợp đồng, học nhanh** ("most floor staff can handle basic order-taking after a 30-minute walkthrough"), hệ sinh thái lớn. Yếu: (1) **khoá vào Square Payments**; (2) **tồn kho nguyên liệu phải mua thêm qua MarketMan**; (3) **KDS và kiosk tính phí theo thiết bị**; (4) nhiều công cụ nằm ở sản phẩm Square riêng; (5) **trần quản lý bàn ~40–50 chỗ**; (6) **KDS tích hợp nông hơn Toast**, phụ thuộc phần cứng bên thứ ba, ít routing native. | [Restaurant HQ](https://www.therestauranthq.com/technology/square-for-restaurants-review/), [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |
| **API / tích hợp** | ✅ Mạnh: **Square App Marketplace 50+ tích hợp** (7shifts, Homebase, OpenTable, Resy, QuickBooks, Xero, Mailchimp, MarketMan) và **API cho tích hợp tùy chỉnh**. | [restaurantlaunchpad](https://restaurantlaunchpad.io/square-for-restaurants-review/) |

---

## 11. Kênh lân cận: Google Business Profile reviews + Zalo Mini App

### 11.1 Google Business Profile reviews

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Vai trò** | Kênh **thu hút khách mới** (review hiện cạnh Trang doanh nghiệp trên Maps và Tìm kiếm). Bổ trợ, không thay thế phần mềm quản lý. | [Google support](https://support.google.com/business/answer/3474122) |
| **Thu review** | ✅ Google **chủ động hướng dẫn mời review bằng link hoặc QR**: "bạn có thể yêu cầu khách hàng truy cập vào một đường liên kết trên Google hoặc **quét mã QR**". | [Google support](https://support.google.com/business/answer/3474122) |
| **Ràng buộc pháp lý/quan trọng** | ❌ **Cấm tặng quà/giảm giá để đổi lấy review** — bị coi là "tương tác giả mạo" và "bị nghiêm cấm". Khách **phải đăng nhập Tài khoản Google** mới viết được review. | [Google support](https://support.google.com/business/answer/3474122) |
| **API** | ✅ **Business Profile APIs** (My Business API v4): `accounts.locations.reviews.list` để **liệt kê tất cả review của một địa điểm**, và API để **trả lời/xoá trả lời review**. Yêu cầu **đăng ký ứng dụng + OAuth 2.0**. Endpoint: `https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews`. **Quota cụ thể và điều kiện được duyệt: chưa xác minh** (không có trong trang đã đọc). | [Review data](https://developers.google.com/my-business/content/review-data), [REST reference](https://developers.google.com/my-business/reference/rest) |
| **Chi phí** | Miễn phí (Google Business Profile không thu phí để có/trả lời review). **Gói trả tiền cho review: chưa xác minh**. | [Google support](https://support.google.com/business/answer/3474122) |
| **Rủi ro cần biết** | Google **không cho phép can thiệp xoá review tiêu cực qua đổi quà**; chất lượng review do khách quyết định. Với ScanGo, tích hợp Google review nên là **mời trung thực**, không thưởng. | [Google support](https://support.google.com/business/answer/3474122) |

### 11.2 Zalo Mini App ordering

| Mục | Dữ kiện | Nguồn |
|---|---|---|
| **Vai trò** | Kênh **B2C trên Zalo**: "tiếp cận hơn **70 triệu khách hàng**", "dễ dàng chuyển đổi, **không cần tải app**", tiết kiệm chi phí/thời gian/nhân lực. | [mini.zalo.me](https://mini.zalo.me/) |
| **Gọi món / thanh toán** | ✅ Có **Checkout SDK (V1)** hỗ trợ tích hợp **ZaloPay, Momo, VNPay, PayME**, COD và chuyển khoản ngân hàng. Luồng: đối tác tạo đơn bằng PrivateKey → `createOrder` → khách chọn phương thức → Mini App gọi `checkTransaction` để kiểm tra trạng thái. ⚠️ **Cần đăng ký tài khoản Merchant với đối tác thanh toán** mới được phân phối app có tích hợp thanh toán. QR gọi món tại bàn: **chưa xác minh** (Mini App là app trong Zalo, không phải QR tại bàn mặc định). | [Payment docs](https://mini.zalo.me/documents/payment/) |
| **Ràng buộc kỹ thuật** | ❌ **Không phải "làm cái là xong"**: phải tạo **Zalo App** trên Zalo for Developer, kích hoạt ứng dụng, rồi tạo **Mini App** trong Zalo App, dùng trang quản lý `mini.zalo.me/developers`, có DevTools, ZaUI Component, API, Open APIs, eKYC APIs. Framework cụ thể (React hay không): **chưa xác minh trong các trang đã đọc**. | [Getting started](https://mini.zalo.me/documents/intro/getting-started/), [Docs hub](https://mini.zalo.me/documents/) |
| **Chi phí** | ⚠️ **Zalo không công bố bảng giá Mini App trên trang chính thức đã đọc.** Chi phí thực tế theo **agency bên thứ ba (ZIMO, 31/05/2026)**: **phát triển một lần 3–30 triệu ₫** (tuỳ độ phức tạp: đặt bàn, menu, đặt món, thanh toán, tích điểm, tích hợp ZaloPay/ZNS/QR); **duy trì 500.000 – 2.000.000 ₫/tháng**; **phí giao dịch ZaloPay ~1,1%/giao dịch**; **phí tin ZNS/ZBS theo số tin**. Một agency khác báo gói **từ 399.000 ₫/tháng**. Đây là **giá agency, không phải giá nền tảng Zalo**. | [ZIMO](https://www.zimo.vn/resources/blog/chi-phi-lam-zalo-mini-app-cho-nha-hang), [GiftyTech](https://www.giftytech.com/kien-thuc/lam-zalo-mini-app-gia-bao-nhieu) |
| **Zalo OA** | ✅ Zalo OA: nhắn tin hai chiều, nhóm do OA quản lý, OA Manager (web + app), MiniCRM, dashboard, **phân quyền nhiều vai trò**, "sẵn sàng kết nối với các hệ thống khác". Trang bảng giá OA **không hiển thị số** (SPA). Phí ZNS cụ thể: **chưa xác minh**. | [Zalo OA](https://oa.zalo.me/bang-gia) |
| **Điểm mạnh/yếu thực tế** | Mạnh: 70 triệu người dùng, không cần tải app, thanh toán quen thuộc. Yếu: **chi phí ẩn theo tin nhắn ZNS và % giao dịch**, phụ thuộc hạ tầng Zalo, cần Merchant account, và **không giải quyết vận hành nội bộ quán** (bếp, kho, giá vốn). | [ZIMO](https://www.zimo.vn/resources/blog/chi-phi-lam-zalo-mini-app-cho-nha-hang) |

---

## A) Bảng so sánh: ScanGo vs đối thủ

**Chú giải:** ✅ có/đầy đủ · ⚠️ một phần hoặc chưa xác minh · ❌ không có · **chưa xác minh** = không có tài liệu công khai.

### A.1 ScanGo vs nhóm Việt Nam

| Tiêu chí | **ScanGo** (SRS 1.2) | iPOS | Sapo FnB | KiotViet FnB | PosApp | Ocha | CukCuk | MISA eShop | Bota |
|---|---|---|---|---|---|---|---|---|---|
| **QR tự gọi món** | ✅ QR + **NFC** (REQ-TBL-001, REQ-NFC-001) | ✅ | ✅ | ✅ | ✅ | ⚠️ chưa xác minh | ✅ (thu ngân phải xác nhận tay) | ❌ | ❌ |
| **Khách tự trả tiền online** | ⚠️ VietQR động + thu ngân xác nhận tay (REQ-CAS-001); tự động ở M3 | ⚠️ có ví/QR, luồng khách tự trả chưa xác minh | ✅ VNPay/VietQR | ⚠️ chưa xác minh | ✅ | ⚠️ chưa xác minh | ⚠️ chưa xác minh | ❌ | ❌ |
| **Không cần phần cứng của hãng** | ✅ **Định vị cốt lõi** ("no POS hardware needed") | ⚠️ FABiBox không cần, nhưng bán máy 5,5–14,9tr | ⚠️ không bắt buộc, có bán thiết bị | ⚠️ không bắt buộc | ⚠️ không bắt buộc | ❌ chạy trên tablet Android | ⚠️ không bắt buộc, bán bộ 7–15,4tr | ⚠️ không bắt buộc | ⚠️ không bắt buộc |
| **KDS** | ✅ màn hình bếp 1–2 cột (REQ-KDS-001/002) | ✅ | ✅ | ✅ màn hình pha chế | ✅ | ⚠️ | ✅ | ❌ | ❌ |
| **Máy in bếp / in bill** | ❌ **ngoài scope v1** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Giá công khai** | ✅ 99.000 ₫/tháng (định vị) | ❌ chỉ báo giá | ✅ 160.000 ₫ | ✅ 270/330/490k | ✅ 220/299k | ⚠️ mâu thuẫn nguồn | ✅ 199/299/499k | ✅ 199–599k | ✅ 99–599k |
| **Ràng buộc hợp đồng** | ✅ không nêu | ⚠️ gói năm | ⚠️ gói tháng/năm | ⚠️ gói tháng | ⚠️ gói tháng | ⚠️ chưa xác minh | ⚠️ theo năm, **không trọn đời** | ⚠️ theo năm | ⚠️ 2–3 năm giảm giá |
| **Giá vốn bình quân gia quyền** | ✅ **có, ghi rõ** (REQ-INV-010) | ⚠️ chưa xác minh | ⚠️ chưa xác minh | ⚠️ chưa xác minh | ⚠️ chưa xác minh | ⚠️ chưa xác minh | ⚠️ chưa xác minh | ⚠️ chưa xác minh | ✅ **có, ghi rõ** |
| **Kiểm kê + hao hụt** | ✅ kiểm kê, waste, variance (REQ-INV-003/009) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ kiểm kho + xuất hủy |
| **Thu review khách hàng** | ✅ (REQ-FDB-001) | ⚠️ lưu "phản hồi" trong CRM | ❌ | ❌ | ❌ | ❌ | ⚠️ Lomas | ❌ | ❌ |
| **Ticket phản hồi + phân nhóm AI** | ✅ (REQ-FDB-002/003) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Gửi phản hồi SP kèm screenshot** | ❌ chưa có | chưa xác minh | chưa xác minh | chưa xác minh | chưa xác minh | chưa xác minh | chưa xác minh | chưa xác minh | chưa xác minh |
| **Loyalty / thành viên** | ✅ tích điểm + xác minh SĐT (REQ-LOY-001) | ✅ | ⚠️ | ✅ | ✅ hạng thẻ, thẻ trả trước | ⚠️ | ✅ thẻ nạp tiền, vòng quay | ✅ thẻ điện tử | ⚠️ |
| **Promotion** | ✅ deterministic, server-side (REQ-PRO-001) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| **Multi-tenant / nhiều chi nhánh** | ✅ 1 user nhiều tenant (REQ-TEN-001) | ✅ | ✅ | ✅ +270/375k mỗi chi nhánh | ✅ PRO | ❌ yếu | ✅ kho tổng chuỗi | ✅ | ✅ |
| **Phân quyền nhân viên** | ✅ 7 vai trò + PIN + giảm quyền (REQ-ACL-001) | ✅ | ✅ | ✅ | ✅ "triệt để" | ⚠️ theo ca | ✅ + lịch sử thao tác | ✅ | ✅ |
| **Offline** | ❌ **chặn submit**, chỉ xem menu cache (REQ-ORD-004) | ⚠️ | ⚠️ | ✅ bán khi mất mạng | ✅ | ⚠️ | ❌ cần Internet liên tục | ✅ | ✅ |
| **PWA / web (không cần cài app)** | ✅ web responsive, không app native | ⚠️ app + web | ✅ web | ✅ web + app | ✅ web + app | ❌ app native | ⚠️ app trên PC/POS/tablet | ✅ | ✅ |
| **AI assistant cho chủ quán** | ✅ có, dẫn nguồn, ngân sách, tuần (REQ-AI-001…007) | ❌ | ❌ | ⚠️ "phân tích thông minh với AI" gói cao cấp | ❌ | ❌ | ❌ | ✅ AI bán hàng (mô tả SP, chốt đơn) | ❌ |
| **Hóa đơn điện tử / thuế** | ❌ **ngoài scope v1** | ✅ | ✅ | ✅ **miễn phí 5–50k hóa đơn/năm** | ✅ NĐ 70/2025 | ⚠️ | ✅ | ✅ NĐ 254/2026 | ⚠️ |
| **Tích hợp app giao đồ ăn** | ❌ ngoài scope v1 | ✅ ShopeeFood, GrabFood | ✅ GrabFood | ✅ ShopeeFood, GrabFood | ✅ Grab/Shopee/Zalo | ❌ | ✅ GrabFood | ✅ Shopee/Lazada/Sendo | ❌ |
| **API công khai** | ⚠️ Cloud Functions callable, chưa có public API | chưa xác minh | ⚠️ partner/apps | chưa xác minh | chưa xác minh | ❌ | chưa xác minh | ⚠️ kết nối kế toán/sàn | ❌ |

### A.2 ScanGo vs nhóm Mỹ + kênh lân cận

| Tiêu chí | **ScanGo** | Toast POS | Square for Restaurants | Google Business Profile | Zalo Mini App |
|---|---|---|---|---|---|
| **QR tự gọi món** | ✅ | ✅ Mobile Order & Pay | ✅ tableside + QR | ❌ (chỉ QR mời review) | ⚠️ app trong Zalo |
| **Khách tự trả tiền online** | ⚠️ xác nhận tay ở M1 | ✅ | ✅ | — | ✅ ZaloPay/Momo/VNPay/PayME |
| **Không cần phần cứng của hãng** | ✅ | ❌ **bắt buộc, độc quyền** | ⚠️ iPad + Reader/Stand | ✅ | ✅ |
| **KDS** | ✅ | ✅ phần cứng riêng | ✅ **$30/$20 mỗi thiết bị/tháng** | — | ❌ |
| **Giá** | ✅ 99k ₫/tháng | ✅ $0 / $69 / báo giá + **2,49–2,99%+$0,15** | ✅ $0 / $49 / $149 mỗi địa điểm + 2,4–2,6%+$0,15 | ✅ miễn phí | ⚠️ 3–30tr một lần + 500k–2tr/tháng (agency) + ~1,1% ZaloPay + ZNS |
| **Ràng buộc hợp đồng** | ✅ không | ❌ **2–3 năm + phí chấm dứt sớm** | ✅ **không hợp đồng** | ✅ không | ⚠️ theo OA/Merchant |
| **Bình quân gia quyền** | ✅ | ⚠️ chưa xác minh (xtraCHEF recipe costing) | ⚠️ ingredient-level phải mua MarketMan | — | — |
| **Kiểm kê + waste** | ✅ | ✅ xtraCHEF | ⚠️ có, kém chi tiết hơn | — | ❌ |
| **Thu review khách hàng** | ✅ + phân nhóm AI | ✅ Guest CRM/Insights/Feedback | ⚠️ chưa xác minh | ✅ (nền tảng review) | ⚠️ |
| **Loyalty** | ✅ | ✅ Marketing Essentials | ✅ Loyalty + SMS | — | ⚠️ qua Zalo OA/MiniCRM |
| **Nhiều chi nhánh** | ✅ | ✅ multi-location | ✅ multi-location (trần ~40–50 chỗ/bàn) | ✅ nhiều location qua API | ⚠️ |
| **Offline** | ❌ chặn submit | ✅ offline mode | ✅ 72 giờ chip/swipe | — | ⚠️ |
| **API công khai** | ⚠️ chưa có public API | ✅ Toast API + partners | ✅ **API + marketplace 50+** | ✅ Business Profile API v4 (OAuth) | ✅ Open APIs + Checkout SDK |

---

## B) 16 khuyến nghị cụ thể, có thể kiểm chứng cho ScanGo

Mỗi khuyến nghị nêu **việc cần làm**, **lý do từ đối thủ**, và **cách kiểm chứng**.

1. **Hỗ trợ máy in nhiệt qua Web Bluetooth/WebUSB ESC-POS, không cần app cài đặt.**
   *Lý do:* 100% đối thủ VN và Mỹ đều in bill/in bếp; ScanGo để printers ngoài scope v1 là lỗ hổng vận hành lớn nhất. *Kiểm chứng:* thu ngân in được bill từ Chrome trên Android trong ≤3 giây tới máy in Bluetooth; có test tự động cho lệnh ESC/POS.

2. **Bổ sung "cầu in bếp" (print bridge) chạy trên một thiết bị bất kỳ trong quán** — tablet/PC cũ — để bếp vẫn nhận phiếu khi màn hình KDS hỏng.
   *Lý do:* iPOS đẩy đơn "qua máy in **hoặc** màn hình KDS"; PosApp in tách món theo khu vực. *Kiểm chứng:* ngắt kết nối KDS, đơn mới vẫn in ra phiếu bếp trong ≤10 giây.

3. **Hàng đợi offline cho submit đơn + KDS offline cục bộ, có đánh dấu "chưa đồng bộ".**
   *Lý do:* PosApp ("bán liên tục ngay cả khi mất điện, mất kết nối"), Bota ("bán offline khi mất mạng"), MISA eShop ("ổn định ngay cả khi mất internet"), Toast/Square đều có offline. ScanGo hiện **chặn submit** (REQ-ORD-004) — đây là bất lợi rõ rệt. *Kiểm chứng:* rút mạng, tạo 5 đơn, cắm mạng lại, cả 5 đơn đồng bộ đúng một lần, không trùng; có test idempotency.

4. **Xác nhận thanh toán VietQR tự động (webhook ngân hàng/Casso/sepay) thay vì chỉ xác nhận tay.**
   *Lý do:* REQ-PAY-002 mới ở M3 và đang PARTIAL; đối thủ đã có ví/QR tự động (Sapo VNPay/VietQR, PosApp thanh toán khi QR order). *Kiểm chứng:* một chuyển khoản thật tạo Payment trong ≤15 giây không cần thu ngân bấm; có test chống trùng thông báo.

5. **In hóa đơn điện tử theo Nghị định 70/2025 và Thông tư 88 (hoặc tích hợp nhà cung cấp HĐĐT).**
   *Lý do:* KiotViet tặng miễn phí 5.000–50.000 hóa đơn/năm, PosApp nêu rõ tuân thủ NĐ 70/2025, MISA eShop theo NĐ 254/2026. Đây là **rào cản pháp lý**, không phải tính năng phụ. *Kiểm chứng:* một đơn đã thanh toán xuất được hóa đơn điện tử hợp lệ với mã CQT trong luồng thu ngân.

6. **Trang "mời đánh giá" sau thanh toán: QR tới Google review + form review nội bộ, không thưởng.**
   *Lý do:* Google hướng dẫn đúng cách này (link hoặc QR) và **cấm tặng quà đổi review**; ScanGo đã có REQ-FDB-001 nhưng chưa nối ra Google. *Kiểm chứng:* sau khi đơn `paid`, khách thấy màn hình 1 chạm mở Google review; nội bộ lưu review riêng; test khẳng định không có logic thưởng/khuyến mãi gắn với review.

7. **Gộp review nội bộ + review Google về một màn hình, có AI phân nhóm chủ đề.**
   *Lý do:* không đối thủ VN nào làm; Toast có "Guest CRM, Insights and Feedback"; ScanGo đã có REQ-FDB-002. *Kiểm chứng:* nạp 20 review trộn hai nguồn, AI trả về ≥3 chủ đề, mỗi chủ đề trích ID nguồn, không lộ SĐT.

8. **Gửi phản hồi sản phẩm kèm ảnh chụp màn hình ngay trong app (nút "Báo lỗi/Góp ý" chụp màn hình).**
   *Lý do:* **không tìm thấy đối thủ nào công bố tính năng này** — đây là khoảng trống và là kênh học hỏi sản phẩm rẻ. *Kiểm chứng:* người dùng chụp màn hình trong 2 chạm; ticket kèm ảnh + phiên bản + tenant ID; không chứa dữ liệu khách.

9. **Hiển thị "chênh lệch giá vốn so với thị trường" trên màn hình kho.**
   *Lý do:* ScanGo **đã có** pipeline `market:survey` + `market:drift` (WinMart/Co.op/Kamereo) mà **không đối thủ nào có**. Biến nó thành tính năng bán được. *Kiểm chứng:* màn hình kho hiện cảnh báo khi giá nhập cao hơn giá tham chiếu vùng >10%, kèm nguồn và ngày khảo sát.

10. **Cảnh báo tăng giá nhập theo lô ngay trên điện thoại (đã có REQ-INV-011) + đẩy qua Zalo OA.**
    *Lý do:* đối thủ chỉ có báo cáo; cảnh báo chủ động theo thời gian thực là khác biệt. *Kiểm chứng:* lô mới cao hơn 15% sinh thông báo Zalo OA trong ≤1 phút, có cả hai mức giá và % tăng.

11. **Kiểm kê bằng quét QR/mã vạch trên điện thoại, có chế độ "kiểm nhanh cuối ca".**
    *Lý do:* PosApp bán "đối soát cuối ca"; KiotViet/eShop dùng mã vạch; iPOS có kiểm kê định kỳ/đột xuất. ScanGo có REQ-INV-003 nhưng cần rút ngắn thời gian thao tác. *Kiểm chứng:* kiểm kê 20 nguyên liệu bằng điện thoại trong ≤5 phút; sai lệch tự tính và lưu audit.

12. **Công bố bảng giá Free/Lite/Pro bằng VND ngay trên trang chủ, kèm "không phí khởi tạo, không hợp đồng".**
    *Lý do:* đối thủ đối lập trực tiếp với điều này: Toast có hợp đồng 2–3 năm + phí chấm dứt sớm và bị phàn nàn nặng trên Reddit/BBB; Square thắng nhờ "no contract, ever"; iPOS **không công bố giá** và bị chê. *Kiểm chứng:* trang pricing có 3 gói số cụ thể; kiểm tra không có bước "liên hệ báo giá" cho gói Free/Lite.

13. **Không tính phí theo thiết bị cho KDS — bán theo tenant, không giới hạn số màn hình.**
    *Lý do:* Square tính **$30/thiết bị/tháng** cho KDS, Toast bán phần cứng KDS riêng; đây là điểm đau của khách. *Kiểm chứng:* một tenant mở 3 màn hình KDS cùng lúc không phát sinh phí; entitlement theo tenant.

14. **Kênh thông báo đơn qua Zalo OA/ZNS cho khách (trạng thái đơn, mời đánh giá) — không bắt khách tải app.**
    *Lý do:* Zalo Mini App tiếp cận 70 triệu người dùng, không cần tải app; nhưng phí ZNS và ~1,1% ZaloPay là chi phí thật, nên dùng Zalo như **kênh thông báo**, không thay lõi. *Kiểm chứng:* khách nhận thông báo "món đã ra" qua Zalo OA; có hạn mức tin/tháng theo gói để kiểm soát chi phí.

15. **Public REST API + webhook cho đối tác (kế toán, app giao đồ ăn, loyalty), có khoá API theo tenant.**
    *Lý do:* Square có marketplace 50+ và API; Toast có Toast API + partner directory; **hầu hết đối thủ VN chưa có API công khai** — đây là lợi thế cạnh tranh dài hạn cho ScanGo. *Kiểm chứng:* một tenant tạo API key, đọc được doanh thu ngày qua REST, và nhận webhook `order.paid` có chữ ký; test từ chối key của tenant khác.

16. **Màn hình "Sức khỏe vận hành" hợp nhất cho chuỗi: giá vốn, hao hụt, thời gian ra món, doanh thu theo chi nhánh.**
    *Lý do:* KiotViet tính +270k/375k mỗi chi nhánh, PosApp để quản lý chuỗi ở gói PRO "liên hệ", CukCuk tính đúng giá gói mỗi chi nhánh, iPOS có iPOS Manager. *Kiểm chứng:* một chủ 3 chi nhánh xem được bảng so sánh 3 chi nhánh trong 1 màn hình, dữ liệu đúng theo tenant, có test cách ly dữ liệu.

---

## C) Tính năng của đối thủ mà ScanGo KHÔNG nên sao chép

| # | Không nên copy | Ai đang làm | Vì sao không hợp với ScanGo |
|---|---|---|---|
| 1 | **Bán/cho thuê máy POS độc quyền và buộc dùng phần cứng của hãng** | Toast (bắt buộc, Toast Flex $799+, không dùng được thiết bị bên thứ ba); Ocha (tablet Android); iPOS/CukCuk bán bộ 5,5–15,4 triệu | Phá vỡ định vị "no POS hardware needed" và lợi thế chi phí 99k/tháng. Phần cứng độc quyền còn **mất giá** (Toast Flex 2 năm còn $50–100) và tạo quan hệ khách–nhà cung cấp kiểu "khoá cứng". |
| 2 | **Khoá cứng vào một bộ xử lý thanh toán** | Toast ("you cannot bring your own payment processor"); Square ("locked in with Square Payments") | ScanGo dùng VietQR động, ngân hàng-agnostic. Khoá cứng làm mất tự do của chủ quán và tạo rủi ro pháp lý/phí. |
| 3 | **Hợp đồng 2–3 năm + phí chấm dứt sớm** | Toast | Bị phàn nàn nhiều nhất trên Reddit và BBB. Chủ quán 5–15 bàn rất nhạy với rủi ro đóng cửa trong 18 tháng đầu; Square thắng ở phân khúc này nhờ month-to-month. |
| 4 | **Tính phí KDS theo từng thiết bị** | Square ($30/$20 mỗi thiết bị/tháng), Toast (bán màn hình KDS riêng) | Quán nhỏ cần 1–2 màn hình; tính theo thiết bị làm chi phí khó dự đoán. ScanGo nên tính theo tenant. |
| 5 | **Workflow fine dining: chia theo course, chia ghế, sơ đồ bàn 100 chỗ** | Toast, Square (trần ~40–50 chỗ), CukCuk cho mô hình lớn | ScanGo nhắm **5–15 bàn**; đầu tư vào coursing/seat-level là đốt nguồn lực vào phân khúc không phải khách hàng. |
| 6 | **Payroll, chấm công–tính lương, nộp thuế, bảo hiểm, 401(k)** | Toast Payroll ($69 + $9/NV), Sapo/KiotViet chấm công–tính lương, MISA eShop kế toán–thuế | ScanGo đã **cấm rõ** điều này: REQ-HRM-003 "MUST NOT derive or export payroll". Mở rộng sẽ kéo theo nghĩa vụ pháp lý và độ phức tạp lớn. |
| 7 | **Kiosk tự phục vụ tại quán (màn hình đặt món)** | Toast self-ordering kiosk, Square Kiosk ($50/$30 mỗi thiết bị) | Là phần cứng đặt tại quán, không cần thiết cho quán 5–15 bàn và đi ngược định vị "khách dùng điện thoại của khách". |
| 8 | **Onboarding phụ thuộc đào tạo trả phí, triển khai tại chỗ** | CukCuk từng thu 3.950.000 ₫ phí đào tạo; iPOS thu phí đào tạo theo gói và +2 triệu/thiết bị | ScanGo đã cam kết onboarding ≤15 phút (REQ-ONB-002). Nhân bản mô hình đào tạo trả phí sẽ làm hỏng cam kết tự phục vụ. |
| 9 | **Tổng đài hỗ trợ thu phí theo phút** | KiotViet, POS365, CukCuk (1900…, 3.000–5.000 ₫/phút) | Bị người dùng phàn nàn trực tiếp trên diễn đàn; đi ngược lợi thế "AI tự trả lời + dẫn nguồn" của ScanGo. |
| 10 | **Tồn kho bán lẻ: serial/IMEI, bảo hành điện tử, mã vạch hàng hoá** | MISA eShop, Bota, KiotViet | Là bài toán bán lẻ, không phải F&B; làm loãng mô hình dữ liệu nguyên liệu–công thức–giá vốn mà ScanGo đang làm tốt. |
| 11 | **Bắt khách cài app native** | Ocha (app Android/iOS) | ScanGo là web/PWA; "không cần tải app" là lợi thế trực tiếp so với Ocha và là cách giảm ma sát tại bàn. |

---

## Phụ lục: nguồn chính

**Trang chính thức:** [ipos.vn](https://ipos.vn/) · [iPOS O2O](https://ipos.vn/menu-dien-tu-goi-do-tai-ban-ipos-o2o/) · [iPOS KDS](https://ipos.vn/phan-mem-quan-ly-che-bien-bep-bar-ipos-kds/) · [iPOS Inventory](https://ipos.vn/phan-mem-quan-ly-kho-ipos-inventory/) · [iPOS CRM](https://ipos.vn/phan-mem-crm-quan-ly-khach-hang-ipos-crm/) · [thietbi.ipos.vn](https://thietbi.ipos.vn/) · [sapo.vn/bang-gia](https://www.sapo.vn/bang-gia.html) · [fnb.sapo.vn](https://fnb.sapo.vn/fnb) · [support.sapo.vn](https://support.sapo.vn/tong-quan-phan-mem-quan-ly-nha-hang-va-quan-cafe-fnb) · [kiotviet.vn/phi-dich-vu](https://www.kiotviet.vn/phi-dich-vu) · [KiotViet cafe](https://www.kiotviet.vn/quan-ly-cafe-tra-sua) · [posapp.vn/bang-gia](https://posapp.vn/bang-gia) · [PosApp order](https://posapp.vn/phan-mem-order-goi-mon) · [ocha.vn](https://ocha.vn/) · [cukcuk.vn/bang-gia](https://www.cukcuk.vn/bang-gia/) · [CukCuk QR tại bàn](https://helpv2.cukcuk.vn/vi/kb/thiet-lap-goi-mon-tai-ban) · [CukCuk Lomas](https://www.cukcuk.vn/cukcuk-lomas/) · [misaeshop.vn](https://www.misaeshop.vn/) · [eShop POS](https://www.misaeshop.vn/eshop-pos/) · [bota.vn/bang-gia-bota-pos](https://bota.vn/bang-gia-bota-pos/) · [Toast pricing](https://pos.toasttab.com/pricing) · [Toast Mobile Order & Pay](https://pos.toasttab.com/products/mobile-order-and-pay) · [Toast KDS](https://pos.toasttab.com/hardware/kitchen-display-system) · [Toast inventory](https://pos.toasttab.com/products/inventory-management) · [Square pricing](https://squareup.com/us/en/pricing) · [Google review policy](https://support.google.com/business/answer/3474122) · [Business Profile API](https://developers.google.com/my-business/content/review-data) · [Zalo Mini App](https://mini.zalo.me/) · [Zalo payment](https://mini.zalo.me/documents/payment/) · [Zalo OA](https://oa.zalo.me/bang-gia)

**Bên thứ ba / đánh giá:** [sleftpayments — Toast complaints 2026](https://www.sleftpayments.com/learning-hub/toast-pos-problems-complaints-2026) · [Reddit r/ToastPOS](https://www.reddit.com/r/ToastPOS/comments/tlxmxp/i_want_to_leave_toast_after_8_months_what_will/) · [BBB Toast](https://www.bbb.org/us/ma/boston/profile/point-of-sale-systems/toast-inc-0021-164973/complaints) · [Restaurant HQ — Square](https://www.therestauranthq.com/technology/square-for-restaurants-review/) · [Restaurant Launchpad — Square](https://restaurantlaunchpad.io/square-for-restaurants-review/) · [Tinhte — so sánh POS](https://tinhte.vn/thread/so-sanh-pos365-ipos-cukcuk-dantrisoft-sapo-kiotviet.3565503/) · [quanlycuahang.cloud — so sánh 2026](https://quanlycuahang.cloud/blog/so-sanh-6-phan-mem-quan-ly-nha-hang-2026.html) · [OneXEOS — so sánh](https://onexeos.com/vi/so-sanh-kiotviet-sapo-ipos-cukcuk) · [ZIMO — chi phí Zalo Mini App](https://www.zimo.vn/resources/blog/chi-phi-lam-zalo-mini-app-cho-nha-hang) · [sanphanmemquanly — giá iPOS](https://www.sanphanmemquanly.com/sp-798-phan-mem-quan-ly-nha-hang-cafe-ipos.html) · [posapp.vn — review Ocha (đối thủ viết)](https://posapp.vn/phan-mem-ocha-co-tot-khong)

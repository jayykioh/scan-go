# F-18 — Tên model AI cần xác nhận

**Mức độ:** THẤP · **Luồng kiểm chứng:** `--only=f11` trong
[`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Khung trợ lý AI hiển thị dòng định danh:

```
TRỢ LÝ AI
GEMINI · GEMINI-3.5-FLASH-LITE
```

Chuỗi model `GEMINI-3.5-FLASH-LITE` trông không khớp với bất kỳ định danh Gemini công khai nào
(Google dùng dạng `gemini-2.5-flash`, `gemini-2.0-flash-lite`…).

**Vì sao đáng ghi lại.** Đây là **điểm mạnh** của ScanGo — mỗi câu trả lời đều nói rõ provider,
model và độ tin cậy, đúng REQ-AI-004. Nhưng nếu chuỗi này là giá trị mặc định đặt cứng trong mã
chứ không phải model thật đang gọi, thì nó vô tình **nói sai** với người dùng, và làm mất giá trị
của chính cơ chế minh bạch đó.

**Bằng chứng.** Ảnh: [audit-f11-ai-answer.png](../artifacts/audit-f11-ai-answer.png). Phản hồi kèm
`ĐỘ TIN CẬY 30%` và `THIẾU DỮ LIỆU`, nội dung trung thực: *"Chưa có đơn đã thanh toán trong kỳ.
Không kết luận về lợi nhuận."*

**Cần làm.** Xác nhận `GEMINI-3.5-FLASH-LITE` là model đang được cấu hình thật trong
`shared/config/defaults.ts` / Config của tenant. Nếu là giá trị mẫu, sửa lại cho khớp model thật
hoặc hiển thị "chưa cấu hình provider".

**REQ liên quan:** REQ-AI-004 (ghi lại provider, model, token, chi phí mỗi lần gọi).

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f11` (từ thư mục gốc repo)

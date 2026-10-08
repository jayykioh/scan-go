# F-12 — Đơn vị không nhất quán trong Kho

**Mức độ:** TRUNG BÌNH · **Luồng kiểm chứng:** `--only=f7` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Trong form "Thêm nguyên liệu", hai ô nằm **cạnh nhau trong cùng một hàng** dùng hai
đơn vị khác nhau và **không ô nào ghi đơn vị**:

| Nhãn hiển thị | Đơn vị thực tế khi lưu |
|---|---|
| `TỒN BAN ĐẦU` | theo **đơn vị nhập** (kg) → đổi sang gam |
| `NGƯỠNG CẢNH BÁO` | theo **đơn vị gốc** (g) |

Trong khi hộp thoại điều chỉnh tồn thì ghi rõ đơn vị: `Số lượng thay đổi (g)`.

**Bằng chứng đo được.** Nhập "Tồn ban đầu = 10000" (ý là 10 000 g) → Firestore lưu
`stockQuantity: 10000000` (10 000 000 g = **10 tấn** thịt bò). Nhập lại "10" (ý là 10 kg) → lưu
`10000` g, đúng như mong đợi. Cùng một ô, hai cách hiểu.

**Vấn đề thứ hai, cùng bản chất.** Cột "Giá nhập" hiển thị hai đơn vị cạnh nhau mà không quy đổi:

```
GIÁ NHẬP
100.000đ/kg          ← giá nhập theo kg
Vốn 250đ/g           ← giá vốn bình quân theo gam
```

Chủ quán phải tự nhân chia trong đầu mới biết giá vốn đã nhảy từ 100 000 lên 250 000/kg.

**Hướng sửa.** Ghi đơn vị ngay trong nhãn (`Tồn ban đầu (kg)`, `Ngưỡng cảnh báo (g)`), hoặc quy
đổi mọi thứ về đơn vị nhập khi hiển thị (`Vốn 250.000đ/kg`). Kiểm tra lại `formatVnd` +
`displayUnit` để mọi cột tiền trong Kho dùng cùng một đơn vị.

**REQ liên quan:** REQ-INV-005, REQ-INV-012.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f7` (từ thư mục gốc repo)

# F-04 — Form Nhân sự mời PIN 4 số, máy chủ đòi đúng 6 số

**Mức độ:** CAO · **Luồng kiểm chứng:** `--only=f16,f9` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Chủ quán tạo tài khoản nhân sự thành công (tài khoản hiện trong bảng Nhân sự),
nhưng khi nhân viên đăng nhập tại `/staff` và nhập PIN thì bị từ chối:
`Mã PIN không đúng định dạng. [400]`.

**Bằng chứng đo được.** Ba nguồn nói ba kiểu khác nhau:

| Nguồn | Giá trị |
|---|---|
| Cấu hình đang áp dụng (chính app hiển thị) | **"Độ dài PIN — 6 chữ số"** |
| Form Nhân sự | `placeholder="0000"`, `minlength=null`, `maxlength=10`, nhãn chỉ ghi "PIN ĐĂNG NHẬP CA" |
| Dữ liệu demo | `MOCK_STAFF_ACCOUNTS` dùng PIN 4 số: `'1111'`, `'2222'`, `'3333'` |

Và phép đối chứng trực tiếp:

| PIN đã tạo | Kết quả đăng nhập |
|---|---|
| `4321` (4 số, đúng như placeholder gợi ý) | **Thất bại** — `Mã PIN không đúng định dạng. [400]` |
| `123456` (6 số) | **Thành công** — vào thẳng màn hình nhân viên ("Lên món tại quầy / Tại bàn / Mang về") |

**Nguyên nhân gốc.** Hai module bất đồng về hợp đồng:

```ts
// shared/contracts/staff.contract.ts:56,82 — nhận 4 đến 10 số
pin: z.string().regex(/^\d{4,10}$/),

// shared/config/defaults.ts:11-16 — mặc định chính sách là 6
pinPolicy: { length: 6, maxFailedAttempts: 5, lockMinutes: 15, sessionHours: 8 },

// functions/src/modules/auth/index.ts:186-187 — xác minh đòi ĐÚNG bằng chính sách
if (input.pin.length !== policy.length) {
  throw new HttpsError('invalid-argument', STAFF_PIN_LENGTH_MESSAGE);
}
```

Nên lệnh tạo nhân sự chấp nhận PIN 4 số, còn lệnh xác minh PIN thì luôn từ chối nó. Giá trị chính
sách **đã có sẵn trong app** (trang Cấu hình hiển thị nó) nhưng form Nhân sự không đọc.

**Hướng sửa.**

1. Form Nhân sự đọc `pinPolicy.length` từ resolved config và hiển thị đúng: nhãn
   "PIN đăng nhập ca (6 chữ số)", `minLength`/`maxLength` theo chính sách, `placeholder="000000"`.
2. Thắt `staffCreateInputSchema`/`staffUpdateInputSchema` để PIN phải đúng độ dài chính sách, hoặc
   chuyển việc kiểm tra độ dài vào chính lệnh tạo để hai đầu không bao giờ lệch nhau.
3. Sửa `MOCK_STAFF_ACCOUNTS` sang PIN 6 số để dữ liệu demo không dạy sai.

**REQ liên quan:** REQ-AUTH-002 (phiên nhân viên theo PIN), REQ-STAFF-001 (tài khoản do chủ quán tạo).

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f16,f9` (từ thư mục gốc repo)

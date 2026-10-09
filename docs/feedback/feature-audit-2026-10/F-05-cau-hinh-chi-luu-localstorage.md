# F-05 — "Lưu thay đổi" ở Cấu hình chỉ ghi vào localStorage

**Mức độ:** CAO · **Luồng kiểm chứng:** `--only=f2` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Chủ quán đổi "Tên cửa hàng" trên `/dashboard/settings`, bấm "Lưu thay đổi", thấy
thông báo "ĐÃ LƯU CẤU HÌNH CỬA HÀNG". Nhưng mở cùng tài khoản trên **trình duyệt khác** thì vẫn
thấy tên cũ.

**Bằng chứng đo được.**

| Kiểm tra | Kết quả |
|---|---|
| Cùng trình duyệt, sau khi tải lại | `Audit Shop 870230` — còn |
| Profile trình duyệt trống (như thiết bị khác) | `Bún Phở Kinh Kỳ` — **giá trị cũ** |
| Khoá lưu trữ tìm thấy | `scango:tenant:v1` (localStorage) |

**Nguyên nhân gốc.** Form duy nhất trên trang có `onSubmit={handleSave}` (`SettingsPage.tsx:397`),
và `handleSave` chỉ gọi `setTenantConfig` — tức ghi localStorage:

```ts
// src/pages/dashboard/SettingsPage.tsx:334-348
const handleSave = (e) => {
  e.preventDefault();
  const normalized = { ...draft, /* … */ };
  setTenantConfig(normalized);      // ← usePersistentState → localStorage
  setDraft(normalized);
  toast.success('Đã lưu cấu hình cửa hàng');
};
```

Hàm **thật sự** ghi lên máy chủ thì tồn tại nhưng **không được nối vào giao diện**:

```ts
const handleSaveResolvedConfig = async () => {   // SettingsPage.tsx:184
  /* … */ await updateTenantConfig(overrides);  // ← gọi callable máy chủ
};
```

`grep -c handleSaveConfig src/pages/dashboard/SettingsPage.tsx` → **0 tham chiếu**. Đây là mã chết.

Điều này đặc biệt gây nhầm vì ngay trên form đó, khối "Cấu hình đang áp dụng" cam kết:
*"Giá trị thật đang chạy cho cửa hàng. Mỗi dòng ghi rõ ai đặt giá trị đó."*

**Hướng sửa.** Nối nút "Lưu thay đổi" vào `updateTenantConfig` cho những khoá tenant được phép
ghi đè (`locale`, `timezone`, `pinPolicy.*`, `ai.*`), và hoặc bỏ hẳn nhóm trường chỉ-cục-bộ
(`shopName`, `industry`, `pricingTier`, `loyalty*`, `discount*`) khỏi form này, hoặc chuyển chúng
thành trường cấu hình thật sự có đường ghi lên máy chủ. Trước mắt, đổi nhãn nút thành
"Lưu trên thiết bị này" để không hứa sai.

**REQ liên quan:** REQ-CON-001, REQ-CON-003 (ghi đè cấu hình theo tenant).

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f2` (từ thư mục gốc repo)

# F-09 — PIN của Bếp và Thu ngân trong simulator chỉ là hình thức

**Mức độ:** CAO · **Luồng kiểm chứng:** `--only=s2,s3` trong [`harness/run-simulator-audit.mjs`](../harness/run-simulator-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Ở `/simulator/kitchen`, PIN `9999` được chấp nhận. Ở `/simulator/cashier`, PIN
`0000` được chấp nhận. Cả hai đều **không** kiểm tra với tài khoản nhân sự nào.

**Nguyên nhân gốc.** Chỉ kiểm tra độ dài:

```ts
// src/components/KitchenView.tsx:219-228
const handleKitchenSignIn = (e) => {
  e.preventDefault();
  if (activePin.length !== 4) { setPinError('Vui lòng nhập đủ 4 số để nhận ca.'); return; }
  setActiveShift(true);
  setPinError('');
  setOnboardCompleted(true);        // ← còn đánh dấu đã hoàn tất onboarding
};

// src/components/CashierView.tsx:135-143
const handleCashierLogin = (e) => {
  e.preventDefault();
  if (cashierPin.length >= 4) { setCashierActiveShift(true); setCashierPinError(''); }
  else { setCashierPinError('Vui lòng nhập mã PIN đủ 4 số!'); }
};
```

Trong khi vai trò Nhân viên làm đúng — gọi máy chủ để xác minh:

```ts
// src/components/StaffView.tsx:163-167
const session = await verifyStaffPin({ tenantId, deviceId, pin: pinInput });
```

Vì đây là màn demo, đây không phải lỗ hổng bảo mật sản phẩm; nhưng nó **trình bày PIN như một cơ
chế bảo vệ** trong khi bất kỳ 4 số nào cũng qua. Với người đang cân nhắc mua, đây là tín hiệu xấu
về mức độ hoàn thiện.

**Hướng sửa.** Trong simulator, kiểm tra PIN với `MOCK_STAFF_ACCOUNTS` và hiện tên nhân viên đăng
nhập; hoặc ghi rõ "chế độ demo — PIN không được kiểm tra" để không hứa điều không làm.

**REQ liên quan:** REQ-AUTH-002, REQ-KDS-001.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-simulator-audit.mjs --only=s2,s3` (từ thư mục gốc repo)

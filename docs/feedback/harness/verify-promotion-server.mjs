/**
 * Server-side Promotion verification (REQ-PRO-001…REQ-PRO-006).
 *
 * Drives the emulated callables over HTTPS against the real Firestore tenant:
 * the public evaluation, Order creation recording `discountVnd` and
 * `promotionSnapshot`, idempotent replay, the plan cap enforced in trusted
 * code, and the unpaid-cancellation lifecycle. Created Promotion fixtures are
 * archived at the end, and the test Order is cancelled rather than deleted
 * (ADR 0004).
 *
 * Usage:
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-promotion-server.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'scango-8f0e9';
const REGION = 'asia-southeast1';
const FUNCTIONS_ORIGIN =
  process.env.SCANGO_FUNCTIONS_ORIGIN ?? 'http://127.0.0.1:5001';
const API_KEY =
  process.env.SCANGO_API_KEY ?? 'AIzaSyAxuOZQiw-UQHTQev-xfsdgPJAZVDZo0K8';
const EMAIL =
  process.env.SCANGO_QA_EMAIL ?? 'qa.playwright+1791453969001@example.com';
const PASSWORD = process.env.SCANGO_QA_PASSWORD ?? 'ScanGo-QA-2026!';
const TABLE_TOKEN =
  process.env.SCANGO_TABLE_TOKEN ??
  'Al9lE7Ympn33VlwEdkN93rsTD86Ocjep6QAdkrxZdOU';
const MENU_ITEM_ID = process.env.SCANGO_MENU_ITEM_ID ?? 'mQ8oVjYLL2RaBIxWBom3';
const ARTIFACTS = path.resolve(
  process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts',
);

const findings = [];
const check = (ok, label, detail) => {
  findings.push({ kind: ok ? 'pass' : 'fail', label, detail });
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const info = (label, detail) => console.log(`   · ${label}${detail ? ` — ${detail}` : ''}`);

async function callCallable(name, data, idToken = null) {
  const response = await fetch(
    `${FUNCTIONS_ORIGIN}/${PROJECT}/${REGION}/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ data }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (body.error) {
    const error = new Error(body.error.message ?? 'callable failed');
    error.code = body.error.status;
    throw error;
  }
  return body.result;
}

async function signInOwner() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  if (!body.idToken) {
    throw new Error(`owner sign-in failed: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.idToken;
}

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore(app);

const idToken = await signInOwner();
info('Đăng nhập chủ quán qua Auth thật', EMAIL);

const users = await db
  .collection('users')
  .where('email', '==', EMAIL)
  .limit(1)
  .get();
const tenantId = users.docs[0]?.get('activeTenantId');
if (!tenantId) {
  throw new Error('QA owner has no active tenant');
}
info('Cửa hàng đang hoạt động', tenantId);

// ---------------------------------------------------------------------------
// 1. Owner lists promotions through the callable.
// ---------------------------------------------------------------------------
const list = await callCallable('callablePromotionList', { tenantId }, idToken);
const activePromotion = list.promotions.find((p) => p.status === 'active');
check(
  Boolean(activePromotion),
  'Danh sách khuyến mãi qua callable trả về bản ghi đang chạy',
  activePromotion ? `${activePromotion.name} · ${activePromotion.benefit.type}` : 'không có',
);
check(
  list.promotions.every((p) => p.schemaVersion === 2 && p.source),
  'Bản ghi đọc ra đúng hợp đồng v2 và có trường source',
);
if (!activePromotion) {
  throw new Error('no active promotion to verify');
}

// ---------------------------------------------------------------------------
// 2. Public evaluation returns the server-computed discount.
// ---------------------------------------------------------------------------
const cartLines = [
  { menuItemId: MENU_ITEM_ID, quantity: 1, selectedOptionIds: [] },
];
const before = await callCallable('callablePromotionEvaluate', {
  tenantId,
  lines: cartLines,
});
const expectedDiscount = Math.floor((before.subtotalVnd * activePromotion.benefit.percent) / 100);
check(
  before.appliedPromotion?.promotionId === activePromotion.promotionId,
  'Máy chủ chọn đúng khuyến mãi đang chạy',
  before.appliedPromotion?.name ?? 'không áp dụng',
);
check(
  before.discountVnd === expectedDiscount,
  'Số tiền giảm là số nguyên VND đúng công thức',
  `${before.discountVnd} = floor(${before.subtotalVnd} × ${activePromotion.benefit.percent}%)`,
);
check(
  before.totalVnd === before.subtotalVnd - before.discountVnd,
  'Tổng = tạm tính − giảm giá',
  `${before.subtotalVnd} − ${before.discountVnd} = ${before.totalVnd}`,
);
check(
  before.lines.every((line) => Number.isInteger(line.lineDiscountVnd)),
  'Giảm giá theo dòng là số nguyên VND',
);

// ---------------------------------------------------------------------------
// 3. Order creation records the frozen Promotion snapshot.
// ---------------------------------------------------------------------------
const idempotencyKey = `audit-promo-${Date.now()}`;
const submitted = await callCallable('callableOrderSubmit', {
  token: TABLE_TOKEN,
  paymentMode: 'payLater',
  idempotencyKey,
  lines: cartLines,
});
const order = submitted.order;
check(
  order.discountVnd === before.discountVnd,
  'Đơn ghi đúng số tiền giảm mà khách đã thấy',
  `${order.discountVnd} = ${before.discountVnd}`,
);
check(
  order.totalVnd === order.subtotalVnd - order.discountVnd,
  'Tổng tiền đơn = tạm tính − giảm giá',
  `${order.subtotalVnd} − ${order.discountVnd} = ${order.totalVnd}`,
);
check(
  order.promotionSnapshot?.promotionId === activePromotion.promotionId,
  'Đơn lưu ảnh chụp khuyến mãi đã áp dụng',
  order.promotionSnapshot?.name ?? 'không có',
);
check(
  typeof order.promotionSnapshot?.benefitType === 'string',
  'Ảnh chụp ghi rõ loại quyền lợi',
  order.promotionSnapshot?.benefitType ?? '',
);
check(
  submitted.tracking.discountVnd === order.discountVnd,
  'Trang theo dõi công khai cũng hiện số tiền giảm',
);
check(
  order.items.every((line) => Number.isInteger(line.lineDiscountVnd)) &&
    order.items.every((line) => typeof line.isGift === 'boolean'),
  'Mỗi dòng đơn có lineDiscountVnd và isGift',
);

const storedOrder = await db.doc(`tenants/${tenantId}/orders/${order.orderId}`).get();
check(
  storedOrder.get('discountVnd') === order.discountVnd &&
    storedOrder.get('promotionSnapshot')?.promotionId ===
      activePromotion.promotionId,
  'Firestore thật lưu đúng discountVnd và promotionSnapshot',
  `orders/${order.orderId}`,
);

// ---------------------------------------------------------------------------
// 4. A retried submission replays instead of creating a second Order.
// ---------------------------------------------------------------------------
const replayed = await callCallable('callableOrderSubmit', {
  token: TABLE_TOKEN,
  paymentMode: 'payLater',
  idempotencyKey,
  lines: cartLines,
});
check(
  replayed.replayed === true && replayed.order.orderId === order.orderId,
  'Gửi lại cùng khoá không tạo đơn thứ hai',
  replayed.order.orderId,
);

// ---------------------------------------------------------------------------
// 5. The same idempotency key with a different code is a conflict.
// ---------------------------------------------------------------------------
try {
  await callCallable('callableOrderSubmit', {
    token: TABLE_TOKEN,
    paymentMode: 'payLater',
    idempotencyKey,
    lines: cartLines,
    promotionCode: 'KHACMA',
  });
  check(false, 'Cùng khoá nhưng khác mã ưu đãi phải là xung đột');
} catch (error) {
  check(
    error.code === 'ALREADY_EXISTS' || error.code === 'FAILED_PRECONDITION',
    'Cùng khoá nhưng khác mã ưu đãi bị từ chối',
    String(error.message).slice(0, 90),
  );
}

// ---------------------------------------------------------------------------
// 6. The plan cap is enforced in trusted code, not only in the UI.
// ---------------------------------------------------------------------------
const secondPromotion = list.promotions.find(
  (p) => p.promotionId !== activePromotion.promotionId && p.status !== 'archived',
);
if (secondPromotion) {
  try {
    await callCallable(
      'callablePromotionSetStatus',
      { tenantId, promotionId: secondPromotion.promotionId, status: 'active' },
      idToken,
    );
    check(false, 'Máy chủ phải chặn khuyến mãi đang chạy thứ hai ở gói Free');
  } catch (error) {
    check(
      error.code === 'FAILED_PRECONDITION',
      'Máy chủ chặn khuyến mãi đang chạy thứ hai ở gói Free',
      String(error.message).slice(0, 120),
    );
  }
  const after = await db
    .doc(`tenants/${tenantId}/promotions/${secondPromotion.promotionId}`)
    .get();
  check(after.get('status') === 'inactive', 'Bản ghi bị chặn vẫn ở trạng thái tạm dừng');
} else {
  info('Không có khuyến mãi thứ hai để kiểm tra cổng giới hạn');
}

// ---------------------------------------------------------------------------
// 7. An advanced benefit is rejected on the Free plan in trusted code.
// ---------------------------------------------------------------------------
try {
  await callCallable(
    'callablePromotionUpsert',
    {
      tenantId,
      promotionId: null,
      name: `[AUDIT] GIFT ${Date.now().toString().slice(-6)}`,
      priority: 0,
      eligibility: {
        minSubtotalVnd: null,
        minQuantity: null,
        menuItemIds: null,
        timeWindow: null,
        daysOfWeek: null,
        code: null,
        customerSegment: null,
      },
      benefit: { type: 'freeItem', menuItemIds: [MENU_ITEM_ID], quantity: 1 },
    },
    idToken,
  );
  check(false, 'Máy chủ phải chặn quyền lợi nâng cao ở gói Free');
} catch (error) {
  check(
    error.code === 'FAILED_PRECONDITION',
    'Máy chủ chặn quyền lợi nâng cao ở gói Free',
    String(error.message).slice(0, 120),
  );
}

// ---------------------------------------------------------------------------
// 8. Cancel the test Order through the real lifecycle (ADR 0004: no delete).
// ---------------------------------------------------------------------------
const cancelled = await callCallable(
  'callableOrderCancelUnpaid',
  {
    tenantId,
    orderId: order.orderId,
    reason: 'Kiểm thử tự động tính năng khuyến mãi',
    idempotencyKey: `${idempotencyKey}-cancel`,
  },
  idToken,
);
check(
  cancelled.status === 'cancelled' || cancelled.order.status === 'cancelled',
  'Đơn kiểm thử được huỷ qua vòng đời thật',
  order.orderId,
);
const cancelledDoc = await db
  .doc(`tenants/${tenantId}/orders/${order.orderId}`)
  .get();
check(
  cancelledDoc.get('status') === 'cancelled' &&
    cancelledDoc.get('discountVnd') === order.discountVnd,
  'Đơn đã huỷ vẫn giữ nguyên số tiền giảm đã ghi',
);

// ---------------------------------------------------------------------------
// 9. Archive the Promotion fixtures so the tenant is left clean.
// ---------------------------------------------------------------------------
const fixtures = list.promotions.filter((p) => p.name.startsWith('[AUDIT]'));
for (const fixture of fixtures) {
  await callCallable(
    'callablePromotionSetStatus',
    { tenantId, promotionId: fixture.promotionId, status: 'archived' },
    idToken,
  ).catch((error) => info('Không lưu trữ được', `${fixture.name}: ${error.message}`));
}
const remaining = await db
  .collection(`tenants/${tenantId}/promotions`)
  .where('archivedAt', '==', null)
  .get();
check(
  remaining.size === 0,
  'Đã lưu trữ toàn bộ khuyến mãi kiểm thử',
  `còn ${remaining.size} bản ghi chưa lưu trữ`,
);

const failures = findings.filter((f) => f.kind === 'fail');
const report = {
  generatedAt: new Date().toISOString(),
  tenantId,
  passedOrderId: order.orderId,
  totals: {
    pass: findings.filter((f) => f.kind === 'pass').length,
    fail: failures.length,
  },
  findings,
};
await writeFile(
  path.join(ARTIFACTS, 'promotion-server-verification-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(
  `\nDONE — ${report.totals.pass} pass / ${report.totals.fail} fail`,
);
for (const failure of failures) {
  console.log(` ✗ ${failure.label} ${failure.detail ?? ''}`);
}
process.exit(failures.length === 0 ? 0 : 1);

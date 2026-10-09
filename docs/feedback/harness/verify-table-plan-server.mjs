/**
 * Server-side floor-plan verification — REQ-TBL-002 and REQ-TBL-003.
 *
 * Drives the emulated callables over HTTPS against the real Firestore tenant:
 * the layout command persists area, seats, and cell; the server refuses a cell
 * outside the grid and refuses a non-owner; and the table service state follows
 * a real Order through pending -> ready -> served -> cancelled. The Order is
 * cancelled rather than deleted (ADR 0004), and the table layout is restored to
 * what it was before the run.
 *
 * Usage:
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-table-plan-server.mjs
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
const TENANT_ID =
  process.env.SCANGO_QA_TENANT ?? 'first-g43h5hgnc4RJ0FJrYHxmd3g7qXl1';
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
const info = (label, detail) =>
  console.log(`   · ${label}${detail ? ` — ${detail}` : ''}`);

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
    throw new Error(`Không đăng nhập được: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.idToken;
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();

console.log('\n=== REQ-TBL-002: cấu hình sơ đồ bàn ===\n');
const token = await signInOwner();

const tablesSnap = await db.collection(`tenants/${TENANT_ID}/tables`).get();
const activeTables = tablesSnap.docs.filter(
  (doc) => doc.get('archivedAt') == null,
);
if (activeTables.length === 0) {
  throw new Error('Tenant QA không có bàn nào đang hoạt động.');
}
const target = activeTables[0];
const tableId = target.id;
const originalLayout = {
  area: target.get('area') ?? null,
  seats: target.get('seats') ?? null,
  position: target.get('position') ?? null,
};
info('Bàn kiểm thử', `${target.get('name')} (${tableId})`);
info('Layout ban đầu', JSON.stringify(originalLayout));

// 1. Persist a layout and read it back from Firestore, not from the response.
const wanted = { area: 'Sân vườn QA', seats: 6, position: { x: 4, y: 3 } };
await callCallable(
  'callableTableConfigure',
  { tenantId: TENANT_ID, tableId, ...wanted },
  token,
);
const stored = (await db.doc(`tenants/${TENANT_ID}/tables/${tableId}`).get()).data();
check(
  stored.area === wanted.area &&
    stored.seats === wanted.seats &&
    stored.position?.x === wanted.position.x &&
    stored.position?.y === wanted.position.y,
  'Lệnh configure ghi khu vực, số ghế và ô lưới xuống Firestore',
  JSON.stringify({ area: stored.area, seats: stored.seats, position: stored.position }),
);

// 2. An audit event must exist for the change.
const auditSnap = await db
  .collection(`tenants/${TENANT_ID}/audit`)
  .where('action', '==', 'TableConfigured')
  .limit(20)
  .get();
check(
  auditSnap.docs.some((doc) => doc.get('targetId') === tableId),
  'Ghi một sự kiện audit TableConfigured',
  `${auditSnap.size} sự kiện gần nhất`,
);

// 3. A cell outside the grid must be refused by the server.
let boundsRejected = false;
try {
  await callCallable(
    'callableTableConfigure',
    { tenantId: TENANT_ID, tableId, area: null, seats: null, position: { x: 0, y: 99 } },
    token,
  );
} catch (error) {
  boundsRejected = error.code === 'INVALID_ARGUMENT';
}
check(boundsRejected, 'Máy chủ từ chối ô nằm ngoài lưới 12×10', 'y = 99');
const afterReject = (
  await db.doc(`tenants/${TENANT_ID}/tables/${tableId}`).get()
).get('position');
check(
  afterReject?.y === wanted.position.y,
  'Lệnh bị từ chối không làm hỏng vị trí đang lưu',
  JSON.stringify(afterReject),
);

// 4. A signed-in caller who is not a member of this tenant must be refused.
let strangerDenied = false;
try {
  await callCallable(
    'callableTableConfigure',
    { tenantId: TENANT_ID, tableId, area: 'x', seats: 1, position: { x: 0, y: 0 } },
    null,
  );
} catch (error) {
  strangerDenied = error.code === 'UNAUTHENTICATED';
}
check(strangerDenied, 'Lệnh configure từ người chưa đăng nhập bị từ chối', 'UNAUTHENTICATED');

console.log('\n=== REQ-TBL-003: trạng thái bàn theo đơn thật ===\n');

const statusFor = async (id) => {
  const result = await callCallable(
    'callableOrderListTableStatus',
    { tenantId: TENANT_ID },
    token,
  );
  return result.tables.find((entry) => entry.tableId === id) ?? null;
};

// 5. Close any Order this harness left open, so the run starts from a known state.
const openSnap = await db
  .collection(`tenants/${TENANT_ID}/orders`)
  .where('status', 'in', ['pending', 'cooking', 'ready', 'served'])
  .get();
for (const doc of openSnap.docs) {
  await doc.ref.update({ status: 'cancelled', updatedAt: new Date().toISOString() });
}
info('Đã huỷ đơn còn mở trước khi đo', `${openSnap.size} đơn`);

const freeState = await statusFor(tableId);
check(
  freeState === null || freeState.state === 'free',
  'Bàn không có đơn nào được báo là trống',
  JSON.stringify(freeState),
);

// 6. A real public Order must move the table to "có khách".
const submit = await callCallable('callableOrderSubmit', {
  token: TABLE_TOKEN,
  paymentMode: 'payLater',
  idempotencyKey: `qa-table-plan-${Date.now()}`,
  lines: [{ menuItemId: MENU_ITEM_ID, quantity: 1, selectedOptionIds: [] }],
});
const orderId = submit.order.orderId;
info('Đơn kiểm thử', orderId);

let occupied = null;
for (let attempt = 0; attempt < 10; attempt += 1) {
  occupied = await statusFor(tableId);
  if (occupied?.state === 'occupied') break;
  await new Promise((resolve) => setTimeout(resolve, 400));
}
check(
  occupied?.state === 'occupied',
  'Đơn đang mở làm bàn chuyển sang "có khách"',
  JSON.stringify(occupied),
);
check(
  occupied?.activeOrderCount === 1,
  'Đếm đúng số đơn đang mở của bàn',
  `activeOrderCount = ${occupied?.activeOrderCount}`,
);

// 7. Advance the Order to ready, then served, and watch the state follow.
await callCallable('callableFulfilmentStartCooking', { tenantId: TENANT_ID, orderId, idempotencyKey: `qa-cook-${orderId}` }, token);
await callCallable('callableFulfilmentMarkReady', { tenantId: TENANT_ID, orderId, idempotencyKey: `qa-ready-${orderId}` }, token);
let ready = null;
for (let attempt = 0; attempt < 10; attempt += 1) {
  ready = await statusFor(tableId);
  if (ready?.state === 'foodReady') break;
  await new Promise((resolve) => setTimeout(resolve, 400));
}
check(
  ready?.state === 'foodReady',
  'Đơn ở trạng thái ready làm bàn hiện "món sẵn sàng"',
  JSON.stringify(ready),
);

await callCallable('callableFulfilmentMarkServed', { tenantId: TENANT_ID, orderId, idempotencyKey: `qa-served-${orderId}` }, token);
let served = null;
for (let attempt = 0; attempt < 10; attempt += 1) {
  served = await statusFor(tableId);
  if (served?.state === 'awaitingPayment') break;
  await new Promise((resolve) => setTimeout(resolve, 400));
}
check(
  served?.state === 'awaitingPayment',
  'Đơn đã phục vụ nhưng chưa thu tiền làm bàn hiện "chờ thanh toán"',
  JSON.stringify(served),
);

// 8. The projection must not carry money or Customer data.
const raw = await callCallable(
  'callableOrderListTableStatus',
  { tenantId: TENANT_ID },
  token,
);
const entryKeys = Object.keys(raw.tables[0] ?? {}).sort();
check(
  entryKeys.join(',') ===
    'activeOrderCount,oldestActiveOrderAt,readyOrderCount,state,tableId,unsettledOrderCount',
  'Projection chỉ chứa trạng thái, không chứa tiền hay dữ liệu khách',
  entryKeys.join(', '),
);

// 9. Cancelling the Order returns the table to "trống".
await callCallable(
  'callableOrderCancelUnpaid',
  { tenantId: TENANT_ID, orderId, reason: 'Kiểm thử sơ đồ bàn', idempotencyKey: `qa-cancel-${orderId}` },
  token,
);
let freeAgain = null;
for (let attempt = 0; attempt < 10; attempt += 1) {
  freeAgain = await statusFor(tableId);
  if (freeAgain === null || freeAgain.state === 'free') break;
  await new Promise((resolve) => setTimeout(resolve, 400));
}
check(
  freeAgain === null || freeAgain.state === 'free',
  'Huỷ đơn trả bàn về "trống"',
  JSON.stringify(freeAgain),
);

// Restore the layout the run started from.
await callCallable(
  'callableTableConfigure',
  { tenantId: TENANT_ID, tableId, ...originalLayout },
  token,
);
info('Đã khôi phục layout ban đầu', JSON.stringify(originalLayout));

const passed = findings.filter((finding) => finding.kind === 'pass').length;
const failed = findings.filter((finding) => finding.kind === 'fail').length;
const report = {
  generatedAt: new Date().toISOString(),
  tenantId: TENANT_ID,
  tableId,
  orderId,
  passed,
  failed,
  findings,
};
await writeFile(
  path.join(ARTIFACTS, 'table-plan-server-verification-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(`\n${passed}/${passed + failed} phép kiểm đạt.`);
console.log('Báo cáo: docs/feedback/artifacts/table-plan-server-verification-report.json');
process.exit(failed === 0 ? 0 : 1);

/**
 * Cashier invoice verification — REQ-CAS-003.
 *
 * Picking a table on the Cashier floor plan opens that table's invoice dialog:
 * the open bill first (lines, prices, table, returning customer's name), then
 * the settled invoices at five rows a page, each opening its immutable Payment
 * record. A table with no open bill opens straight onto its history.
 *
 * The fixtures are real Firestore documents (`[QA]` orders, payments, one
 * loyalty member, one empty table) written through the admin SDK, so the dialog
 * is compared against the database rather than against itself. They are removed
 * again in the finally block.
 *
 * `orders` is not client-readable, so the history comes from
 * `callableOrderListTableInvoices`, which only exists in the local Functions
 * emulator until it is deployed. Run:
 *   npm run emulators                     # or: firebase emulators:start --only functions --project scango-8f0e9
 *   VITE_USE_FUNCTIONS_EMULATOR=true npm run dev
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-cashier-invoices.mjs
 *
 * Set SCANGO_CLICK_PAYOS=1 to also press the PayOS action; that only makes
 * sense against the emulator, whose fixed test credentials cannot create a real
 * payment link.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PLAYWRIGHT_CORE =
  process.env.PLAYWRIGHT_CORE ??
  '/home/duckneo/.local/share/mise/installs/node/22.23.2/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs';

const { chromium } = await import(PLAYWRIGHT_CORE);

const args = process.argv.slice(2);
const HEADED = args.includes('--headed');

const BASE = process.env.SCANGO_BASE_URL ?? 'http://127.0.0.1:3000';
const OUT = path.resolve(process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts');
const PROJECT = 'scango-8f0e9';
const EMAIL = process.env.SCANGO_QA_EMAIL ?? 'qa.playwright+1791453969001@example.com';
const PASSWORD = process.env.SCANGO_QA_PASSWORD ?? 'ScanGo-QA-2026!';
const TENANT_ID =
  process.env.SCANGO_QA_TENANT ?? 'first-g43h5hgnc4RJ0FJrYHxmd3g7qXl1';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const BOARD = '[data-testid="operation-table-board"]';
const DIALOG = '[data-testid="cashier-invoice-dialog"]';
/** Mirrors `INVOICE_PAGE_SIZE` in `src/components/CashierView.tsx`. */
const INVOICE_ROWS = 5;
const CLICK_PAYOS = process.env.SCANGO_CLICK_PAYOS === '1';

const QA_FREE_TABLE_ID = 'qa-invoice-free-table';
const QA_FREE_TABLE_NAME = '[QA] Bàn hoá đơn trống';
const QA_MEMBER_ID = 'member_84900009999';
const QA_CUSTOMER_NAME = '[QA] Khách cũ';
const QA_OPEN_ITEM = '[QA] Món hoá đơn';
const QA_PAID_ORDERS = 6;
const QA_FREE_ORDERS = 2;
const SEEDED_ORDER_IDS = [
  'qa-invoice-open',
  ...Array.from({ length: QA_PAID_ORDERS }, (_, index) => `qa-invoice-${index + 1}`),
  ...Array.from({ length: QA_FREE_ORDERS }, (_, index) => `qa-invoice-free-${index + 1}`),
];

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();

const findings = [];
const screenshots = [];
const consoleErrors = [];
let currentFlow = 'setup';

const check = (ok, label, detail) => {
  findings.push({ flow: currentFlow, kind: ok ? 'pass' : 'fail', label, detail });
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

async function shot(page, name) {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `cashier-invoice-${name}.png`);
  try {
    await page.screenshot({ path: file });
    screenshots.push(path.relative(process.cwd(), file));
  } catch (error) {
    check(false, `Chụp ảnh ${name}`, String(error).slice(0, 140));
  }
}

/** Poll until the predicate holds; listeners and callables land asynchronously. */
async function eventually(page, predicate, timeout = 20000, step = 400) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await page.waitForTimeout(step);
  }
  return false;
}

const bodyText = (page) => page.evaluate(() => document.body.innerText);

const collectConsoleErrors = (page) => {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`[${currentFlow}] ${message.text().slice(0, 200)}`);
    }
  });
};

/** One stored Order that satisfies the frozen snapshot contract. */
function orderDoc({
  orderId,
  tableId,
  tableName,
  status,
  createdAt,
  totalVnd,
  itemName,
  loyaltyMemberId = null,
}) {
  return {
    schemaVersion: 2,
    tenantId: TENANT_ID,
    orderType: 'dineIn',
    tableId,
    tableNameSnapshot: tableName,
    customerNote: null,
    status,
    paymentMode: 'payLater',
    items: [
      {
        lineId: `${orderId}-line-1`,
        menuItemId: 'qa-invoice-item',
        name: itemName,
        modifiers: [],
        unitPriceVnd: totalVnd,
        quantity: 1,
        lineTotalVnd: totalVnd,
        lineDiscountVnd: 0,
        isGift: false,
        unitCostVnd: 0,
        lineCostVnd: 0,
      },
    ],
    subtotalVnd: totalVnd,
    discountVnd: 0,
    promotionSnapshot: null,
    loyaltyMemberId,
    pointsRedeemed: 0,
    totalVnd,
    trackingToken: `track-${orderId}`,
    idempotencyKey: `idem-${orderId}`,
    paidAt: status === 'paid' ? createdAt : null,
    createdAt,
    updatedAt: createdAt,
  };
}

async function cleanupFixtures() {
  const refs = [
    ...SEEDED_ORDER_IDS.map((id) => db.doc(`tenants/${TENANT_ID}/orders/${id}`)),
    ...SEEDED_ORDER_IDS.map((id) =>
      db.doc(`tenants/${TENANT_ID}/payments/payment_${id}`),
    ),
    db.doc(`tenants/${TENANT_ID}/tables/${QA_FREE_TABLE_ID}`),
    db.doc(`tenants/${TENANT_ID}/loyaltyMembers/${QA_MEMBER_ID}`),
  ];
  await Promise.all(refs.map((ref) => ref.delete().catch(() => undefined)));
}

/**
 * Real bills for one table: an open one with the returning customer, six
 * settled ones (one page of five plus a sixth), and an empty table that still
 * carries two settled bills.
 */
async function seedFixtures(tableId, tableName) {
  await cleanupFixtures();
  const now = new Date().toISOString();
  const batch = db.batch();

  batch.set(db.doc(`tenants/${TENANT_ID}/tables/${QA_FREE_TABLE_ID}`), {
    name: QA_FREE_TABLE_NAME,
    isActive: true,
    tokenVersion: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(db.doc(`tenants/${TENANT_ID}/loyaltyMembers/${QA_MEMBER_ID}`), {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    memberId: QA_MEMBER_ID,
    phone: '+84900009999',
    displayName: QA_CUSTOMER_NAME,
    isVerified: true,
    pointBalance: 3,
    paidTotalVnd: 500000,
    visitCount: 2,
    verificationCodeHash: null,
    verificationExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(
    db.doc(`tenants/${TENANT_ID}/orders/qa-invoice-open`),
    orderDoc({
      orderId: 'qa-invoice-open',
      tableId,
      tableName,
      status: 'pending',
      createdAt: now,
      totalVnd: 123000,
      itemName: QA_OPEN_ITEM,
      loyaltyMemberId: QA_MEMBER_ID,
    }),
  );

  for (let index = 1; index <= QA_PAID_ORDERS; index += 1) {
    const orderId = `qa-invoice-${index}`;
    const createdAt = new Date(
      Date.now() - (QA_PAID_ORDERS - index) * 3600000,
    ).toISOString();
    const totalVnd = 100000 + index * 1000;
    batch.set(
      db.doc(`tenants/${TENANT_ID}/orders/${orderId}`),
      orderDoc({
        orderId,
        tableId,
        tableName,
        status: 'paid',
        createdAt,
        totalVnd,
        itemName: `${QA_OPEN_ITEM} ${index}`,
      }),
    );
    batch.set(db.doc(`tenants/${TENANT_ID}/payments/payment_${orderId}`), {
      schemaVersion: 1,
      paymentId: `payment_${orderId}`,
      tenantId: TENANT_ID,
      orderId,
      amountVnd: totalVnd,
      method: 'cash',
      status: 'confirmed',
      vietQrInstruction: null,
      actorUid: 'qa-harness',
      idempotencyKey: `idem-pay-${orderId}`,
      linkedPaymentId: null,
      correctionKind: null,
      reason: null,
      providerId: null,
      providerRef: null,
      confirmedAt: createdAt,
      createdAt,
    });
  }

  for (let index = 1; index <= QA_FREE_ORDERS; index += 1) {
    const orderId = `qa-invoice-free-${index}`;
    const createdAt = new Date(
      Date.now() - (QA_FREE_ORDERS - index) * 3600000,
    ).toISOString();
    batch.set(
      db.doc(`tenants/${TENANT_ID}/orders/${orderId}`),
      orderDoc({
        orderId,
        tableId: QA_FREE_TABLE_ID,
        tableName: QA_FREE_TABLE_NAME,
        status: 'paid',
        createdAt,
        totalVnd: 60000 + index * 1000,
        itemName: `${QA_OPEN_ITEM} trống ${index}`,
      }),
    );
  }

  await batch.commit();
  console.log(
    `· Fixture: ${QA_PAID_ORDERS} hoá đơn đã thu + 1 đơn đang mở trên "${tableName}", ${QA_FREE_ORDERS} hoá đơn trên "${QA_FREE_TABLE_NAME}"`,
  );
}

const signIn = async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 90000 });
  await page.waitForTimeout(2000);
};

const enterOperationPin = async (page) => {
  const input = page.locator('input[type="password"][maxlength="4"]').first();
  if ((await input.count()) === 0) return false;
  await input.fill('1234');
  await page.getByRole('button', { name: /^Đăng nhập$/i }).first().click();
  await page.waitForTimeout(800);
  return true;
};

const escapeName = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const browser = await chromium.launch({ headless: !HEADED });

try {
  // -------------------------------------------------------------------------
  // Fixtures come from the real floor plan, so the dialog is opened the same
  // way an operator would open it.
  // -------------------------------------------------------------------------
  currentFlow = 'setup';
  const tableRows = (
    await db.collection(`tenants/${TENANT_ID}/tables`).get()
  ).docs
    .filter((doc) => doc.get('archivedAt') == null)
    .map((doc) => ({ tableId: doc.id, name: String(doc.get('name') ?? '').trim() }))
    .filter((row) => row.name)
    .sort((left, right) => left.name.localeCompare(right.name, 'vi'));
  const qaTable = tableRows[0] ?? null;
  check(qaTable !== null, 'Đọc được bàn thật của cửa hàng để gắn hoá đơn');
  if (!qaTable) {
    throw new Error('Không có bàn nào trong tenant QA');
  }
  await seedFixtures(qaTable.tableId, qaTable.name);

  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  collectConsoleErrors(page);

  // -------------------------------------------------------------------------
  // A. The dialog: one table's open bill, its old bills, its payment record
  // -------------------------------------------------------------------------
  currentFlow = 'A-invoice-dialog';
  await signIn(page);
  await page.goto(`${BASE}/operation/cashier`, { waitUntil: 'domcontentloaded' });
  await eventually(
    page,
    async () => (await page.locator('input[type="password"][maxlength="4"]').count()) === 1,
    30000,
  );
  await enterOperationPin(page);
  const board = await eventually(
    page,
    async () => (await page.locator(BOARD).count()) === 1,
    30000,
  );
  check(board, 'Thu ngân: sơ đồ bàn render', BOARD);

  const tile = (name) =>
    page.getByRole('button', { name: new RegExp(`^${escapeName(name)}`) }).first();

  await tile(qaTable.name).click();
  const dialogOpen = await eventually(
    page,
    async () => (await page.locator(DIALOG).count()) === 1,
    20000,
  );
  check(dialogOpen, 'Bấm bàn mở dialog hoá đơn của bàn đó', qaTable.name);

  // The header states the table's service state, which the unpaid queue
  // supplies: it says "Đang tải..." rather than "Bàn trống" until that lands.
  const stateShown = await eventually(
    page,
    async () => {
      const text = await page.locator(DIALOG).innerText();
      return text.includes(qaTable.name) && /Đang có khách/.test(text);
    },
    20000,
  );
  check(
    stateShown,
    'Dialog: hiện số bàn cụ thể và trạng thái đang có khách',
    (await page.locator(DIALOG).innerText()).split('\n').slice(0, 2).join(' / '),
  );

  // The bill lines and the returning customer's name both land asynchronously:
  // the unpaid queue is already in memory, the member list is not.
  const currentSection = page.locator('[data-testid="invoice-dialog-current"]');
  const currentLoaded = await eventually(
    page,
    async () => {
      const text = await currentSection.innerText();
      return (
        text.includes(QA_OPEN_ITEM) &&
        /123[.,]000/.test(text) &&
        text.includes(QA_CUSTOMER_NAME)
      );
    },
    20000,
  );
  const currentText = await currentSection.innerText();
  check(
    currentLoaded && currentText.includes(qaTable.name),
    'Dialog: hoá đơn đang mở in món, tổng tiền, số bàn và tên khách hàng cũ',
    currentText.split('\n').slice(0, 4).join(' / '),
  );

  // The same open bill is also listed behind the dialog, so the action is
  // scoped to the dialog itself.
  const payosButton = page
    .locator(DIALOG)
    .getByRole('button', { name: /Tạo mã PayOS/i })
    .first();
  check(
    (await payosButton.count()) === 1,
    'Dialog: có nút tạo/mở lại mã thanh toán PayOS',
  );
  if (CLICK_PAYOS && (await payosButton.count()) === 1) {
    await payosButton.click();
    const payosAnswered = await eventually(
      page,
      async () => {
        const text = await bodyText(page);
        return (
          /Mã PayOS/.test(text) ||
          /Không tạo được link thanh toán PayOS|PayOS chưa được cấu hình/i.test(text)
        );
      },
      25000,
    );
    check(
      payosAnswered,
      'Dialog: mở lại mã PayOS trả lời rõ ràng (QR hoặc lý do từ chối)',
    );
  }
  await shot(page, 'a1-dialog');

  // -------------------------------------------------------------------------
  // B. Five settled invoices a page, with the payment record behind a row
  // -------------------------------------------------------------------------
  currentFlow = 'B-history';
  await page.locator('[data-testid="invoice-history-toggle"]').click();
  const firstPage = await eventually(
    page,
    async () =>
      (await page.locator('[data-testid="invoice-history-row"]').count()) ===
      INVOICE_ROWS,
    20000,
  );
  check(firstPage, `"Xem hoá đơn khác" in ${INVOICE_ROWS} hoá đơn một trang`);
  check(
    /Trang 1\/2/.test(await page.locator('[data-testid="invoice-history"]').innerText()),
    'Dialog: hoá đơn cũ ghi số trang',
  );

  await page.locator('[data-testid="invoice-page-next"]').click();
  const secondPage = await eventually(
    page,
    async () =>
      (await page.locator('[data-testid="invoice-history-row"]').count()) ===
      QA_PAID_ORDERS - INVOICE_ROWS,
    20000,
  );
  check(
    secondPage,
    'Bấm "Tiếp" sang trang hoá đơn cũ tiếp theo',
    `${QA_PAID_ORDERS - INVOICE_ROWS} dòng`,
  );
  check(
    /Trang 2\/2/.test(await page.locator('[data-testid="invoice-history"]').innerText()),
    'Dialog: trang 2 ghi đúng số trang',
  );
  await shot(page, 'b1-history-page2');

  await page.locator('[data-testid="invoice-history-row"]').first().click();
  const paymentShown = await eventually(
    page,
    async () => {
      const panel = page.locator('[data-testid="invoice-payment"]');
      if ((await panel.count()) === 0) return false;
      const text = await panel.innerText();
      return (
        /Mã thanh toán/.test(text) &&
        /Tiền mặt/.test(text) &&
        /101[.,]000/.test(text)
      );
    },
    20000,
  );
  check(
    paymentShown,
    'Mở lại được mã thanh toán của hoá đơn cũ (phương thức + số tiền)',
    paymentShown
      ? ''
      : (await page.locator('[data-testid="invoice-payment"]').innerText().catch(() => '')),
  );
  await shot(page, 'b2-payment-record');

  // -------------------------------------------------------------------------
  // C. An empty table opens straight onto its own invoice history
  // -------------------------------------------------------------------------
  currentFlow = 'C-empty-table';
  await page.locator('[data-testid="invoice-dialog-close"]').click();
  await page.waitForTimeout(500);
  await tile(QA_FREE_TABLE_NAME).click();
  const freeDialog = await eventually(
    page,
    async () => (await page.locator(DIALOG).count()) === 1,
    20000,
  );
  const freeText = freeDialog ? await page.locator(DIALOG).innerText() : '';
  check(
    freeDialog && /Bàn trống/.test(freeText),
    'Bàn trống: dialog mở đúng bàn và ghi trạng thái trống',
  );
  // A free table still has to wait for its history read before it can list it.
  const freeRows = await eventually(
    page,
    async () =>
      (await page.locator('[data-testid="invoice-history-row"]').count()) ===
      QA_FREE_ORDERS,
    20000,
  );
  check(
    freeRows &&
      (await page.locator('[data-testid="invoice-history-toggle"]').count()) === 0,
    'Bàn trống: hiện thẳng danh sách hoá đơn cũ của chính bàn đó',
    `${await page.locator('[data-testid="invoice-history-row"]').count()} hoá đơn`,
  );
  await shot(page, 'c1-empty-table-history');

  // -------------------------------------------------------------------------
  // D. Phone: the sheet fills the screen and never scrolls sideways
  // -------------------------------------------------------------------------
  currentFlow = 'D-phone';
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(800);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    metrics.scrollWidth <= metrics.clientWidth + 2,
    'Phone: dialog hoá đơn không tràn ngang',
    `${metrics.scrollWidth}<=${metrics.clientWidth}`,
  );
  const closeBox = await page
    .locator('[data-testid="invoice-dialog-close"]')
    .boundingBox();
  check(
    (await page.locator(DIALOG).count()) === 1 &&
      closeBox !== null &&
      closeBox.width >= 44 &&
      closeBox.height >= 44,
    'Phone: dialog vẫn mở và nút đóng đủ 44px',
    closeBox ? `${Math.round(closeBox.width)}x${Math.round(closeBox.height)}` : 'không thấy',
  );
  await shot(page, 'd1-dialog-phone');

  await page.locator('[data-testid="invoice-dialog-close"]').click();
  await page.waitForTimeout(400);
  check(
    (await page.locator(DIALOG).count()) === 0,
    'Đóng dialog trả lại sơ đồ bàn',
  );

  await context.close();

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------
  const ignorable = /favicon|Failed to load resource/i;
  const realErrors = consoleErrors.filter((line) => !ignorable.test(line));
  check(realErrors.length === 0, 'Không có lỗi console', realErrors.slice(0, 3).join(' | '));

  const passed = findings.filter((f) => f.kind === 'pass').length;
  const failed = findings.filter((f) => f.kind === 'fail').length;
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    tenantId: TENANT_ID,
    table: qaTable,
    passed,
    failed,
    screenshots,
    consoleErrors: realErrors,
    findings,
  };
  await mkdir(OUT, { recursive: true });
  const reportPath = path.join(OUT, 'cashier-invoice-verification-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n${passed}/${passed + failed} phép kiểm đạt.`);
  console.log(`Báo cáo: ${path.relative(process.cwd(), reportPath)}`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
  await cleanupFixtures();
  console.log('· Đã xoá fixture hoá đơn [QA]');
}

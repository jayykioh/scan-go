/**
 * Operating pages UI verification — REQ-UX-002, REQ-UX-003, REQ-KDS-001,
 * REQ-CAS-001, REQ-WAI-001, REQ-INV-008, REQ-INV-009.
 *
 * The pages must run full-screen with no simulated device frame, the hub must
 * offer exactly the four operating pages, and the Kitchen, Cashier, and Waiter
 * pages must draw the tenant's real floor plan. Expected table names come from
 * Firestore through the admin SDK, so the board is compared against the
 * database rather than against itself.
 *
 * The last flow records a real two-ingredient waste entry from the Kho screen,
 * reads the reduced stock and the negative audit rows back from Firestore, and
 * reads both rows back on the report view. The audit ledger is append-only, so
 * those rows stay after the run; only the `[QA]` ingredient fixtures are removed.
 *
 * The signed-in flows need the app pointed at the deployed callables:
 *   VITE_USE_FUNCTIONS_EMULATOR=false npm run dev
 *
 * Usage:
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-operation-pages.mjs [--headed]
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

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const BOARD = '[data-testid="operation-table-board"]';
const BOARD_SCROLL = '[data-testid="operation-table-scroll"]';
const FRAME = '[data-testid="operation-frame"]';
/** Mirrors `INGREDIENT_PAGE_SIZE` in `src/components/InventoryPanel.tsx`. */
const INGREDIENT_ROWS = 10;
const OPERATING_PAGES = [
  { label: 'Thu Ngân', href: '/operation/cashier' },
  { label: 'KDS Bếp', href: '/operation/kitchen' },
  { label: 'Nhân Viên', href: '/operation/staff' },
  { label: 'Khách Hàng', href: '/operation/customer' },
];
/** Strings that only existed in the removed Test Environment chrome. */
const REMOVED_CHROME = [
  'Test Environment',
  'Đơn ảo',
  'Xóa Data',
  'Reset State',
  'Thêm màn hình',
  'Cấu hình quán',
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
  const file = path.join(OUT, `operation-${name}.png`);
  try {
    await page.screenshot({ path: file });
    screenshots.push(path.relative(process.cwd(), file));
  } catch (error) {
    // A screenshot that fails means the page is gone; say so instead of
    // leaving the next step to time out with no explanation.
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

const tileNames = (page) =>
  page.evaluate((selector) => {
    const board = document.querySelector(selector);
    if (!board) return [];
    return [...board.querySelectorAll('button[aria-label]')].map((tile) =>
      (tile.getAttribute('aria-label') ?? '').split(',')[0].trim(),
    );
  }, BOARD);

/** Visual top edge of the first element whose text contains `needle`. */
const topOf = async (page, needle) => {
  const box = await page.getByText(needle, { exact: false }).first().boundingBox();
  return box ? Math.round(box.y) : null;
};

const signIn = async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 90000 });
  await page.waitForTimeout(2000);
};

/**
 * The Kitchen and Cashier pages open behind their own 4-digit gate. Those two
 * gates are the demo ones (any four digits); the Staff page gate is
 * server-verified and is deliberately left alone.
 */
const enterOperationPin = async (page) => {
  const input = page.locator('input[type="password"][maxlength="4"]').first();
  if ((await input.count()) === 0) return false;
  await input.fill('1234');
  await page.getByRole('button', { name: /^Đăng nhập$/i }).first().click();
  await page.waitForTimeout(800);
  return true;
};

const collectConsoleErrors = (page) => {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`[${currentFlow}] ${message.text().slice(0, 200)}`);
    }
  });
};

// ---------------------------------------------------------------------------
// Stale fixture cleanup (a crashed run must not skew the expectations)
// ---------------------------------------------------------------------------
{
  const staleTables = await db.collection(`tenants/${TENANT_ID}/tables`).get();
  for (const doc of staleTables.docs) {
    const name = String(doc.get('name') ?? '');
    if (name.startsWith('[QA] Bàn trong khu') || name.startsWith('[QA] Bàn ngoài khu')) {
      await doc.ref.set(
        { archivedAt: new Date().toISOString(), isActive: false },
        { merge: true },
      );
    }
  }
  for (const doc of (await db.collection(`tenants/${TENANT_ID}/tableAreas`).get()).docs) {
    if (String(doc.get('label') ?? '').startsWith('[QA] Khu phục vụ') ||
        String(doc.get('label') ?? '').startsWith('[QA] Khu ngoài')) {
      await doc.ref.delete();
    }
  }
  // Shift fixtures from a crashed run: their QA Staff rows carry the marker.
  for (const member of (await db.collection(`tenants/${TENANT_ID}/members`).get()).docs) {
    if (!String(member.get('displayName') ?? '').startsWith('[QA] Ca ')) continue;
    for (const shift of (
      await db.collection(`tenants/${TENANT_ID}/shifts`).where('staffUid', '==', member.id).get()
    ).docs) {
      await shift.ref.delete();
    }
    for (const record of (
      await db.collection(`tenants/${TENANT_ID}/attendance`).where('staffUid', '==', member.id).get()
    ).docs) {
      await record.ref.delete();
    }
  }
}

// ---------------------------------------------------------------------------
// Expected floor plan straight from Firestore
// ---------------------------------------------------------------------------
const expectedTables = (
  await db.collection(`tenants/${TENANT_ID}/tables`).get()
).docs
  .filter((doc) => doc.get('archivedAt') == null)
  .map((doc) => String(doc.get('name') ?? '').trim())
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right, 'vi'));
console.log(`· Sơ đồ bàn thật: ${expectedTables.length} bàn — ${expectedTables.join(', ')}`);

/**
 * The Kitchen's ingredient tab pages at ten rows, and the QA Tenant keeps no
 * ingredients, so the harness seeds `[QA]` fixtures for the pager assertions and
 * archives them again in the finally block.
 */
const SEEDED_INGREDIENTS = 12;
const seededIngredientIds = [];

async function seedIngredients(count) {
  // Remove anything a previous run left behind, so the collection stays clean.
  const existing = await db.collection(`tenants/${TENANT_ID}/ingredients`).get();
  const stale = existing.docs.filter((doc) =>
    String(doc.get('name') ?? '').startsWith('[QA] Nguyên liệu'),
  );
  await Promise.all(
    stale.map((doc) => doc.ref.delete().catch(() => undefined)),
  );

  const now = new Date().toISOString();
  const batch = db.batch();
  for (let index = 1; index <= count; index += 1) {
    const ref = db.collection(`tenants/${TENANT_ID}/ingredients`).doc();
    batch.set(ref, {
      schemaVersion: 1,
      tenantId: TENANT_ID,
      name: `[QA] Nguyên liệu ${String(index).padStart(2, '0')}`,
      baseUnit: 'g',
      purchaseUnit: 'kg',
      countUnitLabel: null,
      purchasePriceVnd: 100000,
      unitCostVnd: 100,
      stockQuantity: 1000 * index,
      lowStockThreshold: 0,
      isActive: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    seededIngredientIds.push(ref.id);
  }
  await batch.commit();
  console.log(`· Đã tạo ${count} nguyên liệu [QA] cho phép kiểm phân trang`);
}

async function cleanupIngredients() {
  if (seededIngredientIds.length === 0) return;
  await Promise.all(
    seededIngredientIds.map((id) =>
      db
        .doc(`tenants/${TENANT_ID}/ingredients/${id}`)
        .delete()
        .catch(() => undefined),
    ),
  );
  console.log(`· Đã xoá ${seededIngredientIds.length} nguyên liệu [QA]`);
}

// ---------------------------------------------------------------------------
// Callable helpers for the area-scope fixture (REQ-TBL-010)
// ---------------------------------------------------------------------------
const WEB_API_KEY =
  process.env.SCANGO_WEB_API_KEY ?? 'AIzaSyAxuOZQiw-UQHTQev-xfsdgPJAZVDZo0K8';

async function callCallable(name, data, idToken) {
  const response = await fetch(
    `https://asia-southeast1-${PROJECT}.cloudfunctions.net/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ data }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${name} ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`,
    );
  }
  return payload.result;
}

async function ownerIdToken() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const payload = await response.json();
  if (!payload.idToken) {
    throw new Error(`Không lấy được ID token: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  return payload.idToken;
}

async function archiveQaTable(name) {
  const snap = await db
    .collection(`tenants/${TENANT_ID}/tables`)
    .where('name', '==', name)
    .get();
  for (const doc of snap.docs) {
    await doc.ref.set(
      { archivedAt: new Date().toISOString(), isActive: false },
      { merge: true },
    );
  }
}

const browser = await chromium.launch({ headless: !HEADED });

try {
  // -------------------------------------------------------------------------
  // A. Hub and redirects, with no session
  // -------------------------------------------------------------------------
  currentFlow = 'A-hub';
  const anon = await browser.newContext({ viewport: DESKTOP });
  const anonPage = await anon.newPage();
  collectConsoleErrors(anonPage);

  await anonPage.goto(`${BASE}/operation`, { waitUntil: 'domcontentloaded' });
  const hubReady = await eventually(
    anonPage,
    async () => (await anonPage.locator('a[href^="/operation/"]').count()) > 0,
    30000,
  );
  check(hubReady, 'Hub render danh sách trang', '');

  const hubText = await bodyText(anonPage);
  const hubLinks = await anonPage.evaluate(() =>
    [...document.querySelectorAll('a[href^="/operation/"]')].map((a) =>
      a.getAttribute('href'),
    ),
  );
  for (const page of OPERATING_PAGES) {
    check(
      hubLinks.includes(page.href),
      `Hub liệt kê trang ${page.label}`,
      page.href,
    );
  }
  check(
    hubLinks.length === OPERATING_PAGES.length,
    'Hub chỉ có 4 trang vận hành',
    `thấy ${hubLinks.length} liên kết`,
  );
  check(
    /chọn trang vận hành/i.test(hubText),
    'Hub có tiêu đề "Chọn trang vận hành"',
  );
  for (const chrome of REMOVED_CHROME) {
    check(!hubText.toLowerCase().includes(chrome.toLowerCase()), `Đã bỏ "${chrome}"`, '');
  }
  await shot(anonPage, 'a1-hub');

  await anonPage.goto(`${BASE}/simulator`, { waitUntil: 'domcontentloaded' });
  const redirectRoot = await eventually(
    anonPage,
    async () => new URL(anonPage.url()).pathname === '/operation',
    30000,
  );
  check(redirectRoot, '/simulator chuyển hướng về /operation', anonPage.url());

  await anonPage.goto(`${BASE}/simulator/kitchen`, { waitUntil: 'domcontentloaded' });
  const redirectDeep = await eventually(
    anonPage,
    async () => new URL(anonPage.url()).pathname === '/operation',
    30000,
  );
  check(redirectDeep, '/simulator/kitchen chuyển hướng về /operation', anonPage.url());

  await anonPage.goto(`${BASE}/operation/cashier`, { waitUntil: 'domcontentloaded' });
  const cashierNotice = await eventually(
    anonPage,
    async () =>
      /Cần đăng nhập và chọn cửa hàng để vận hành/.test(await bodyText(anonPage)),
    30000,
  );
  check(cashierNotice, 'Trang Thu ngân khi chưa đăng nhập hiện thông báo tiếng Việt');
  check(
    !/permission-denied|Missing or insufficient permissions|insufficient/i.test(
      await bodyText(anonPage),
    ),
    'Không lộ lỗi quyền tiếng Anh',
  );
  await shot(anonPage, 'a2-cashier-anon');

  // -------------------------------------------------------------------------
  // B. No device frame, at phone and desktop widths
  // -------------------------------------------------------------------------
  currentFlow = 'B-frame';
  for (const [label, viewport] of [
    ['phone 390x844', PHONE],
    ['desktop 1440x900', DESKTOP],
  ]) {
    await anonPage.setViewportSize(viewport);
    // The tenant-scoped pages are the ones an operator opens on a phone; with
    // no session they still render the real page shell instead of a device.
    await anonPage.goto(`${BASE}/operation/cashier`, { waitUntil: 'domcontentloaded' });
    const rendered = await eventually(
      anonPage,
      async () => (await anonPage.locator(FRAME).count()) === 1,
      30000,
    );
    check(rendered, `${label}: trang vận hành render`, FRAME);
    if (!rendered) continue;

    const text = await bodyText(anonPage);
    check(!/\b5G\b|Wi-Fi/.test(text), `${label}: không còn thanh trạng thái giả`);
    check(
      (await anonPage.locator('[id^="phone-simulator"]').count()) === 0,
      `${label}: không còn khung điện thoại giả`,
    );

    const geometry = await anonPage.evaluate((selector) => {
      const frame = document.querySelector(selector);
      const rect = frame.getBoundingClientRect();
      // The removed bezel was a >=4px border with a >=30px radius.
      const bezels = [...document.querySelectorAll('body *')].filter((el) => {
        const style = getComputedStyle(el);
        const radius = parseFloat(style.borderTopLeftRadius) || 0;
        const width = parseFloat(style.borderTopWidth) || 0;
        const box = el.getBoundingClientRect();
        return radius >= 30 && width >= 4 && box.width >= 280;
      }).length;
      return {
        width: Math.round(rect.width),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        height: Math.round(rect.height),
        bezels,
      };
    }, FRAME);

    check(geometry.bezels === 0, `${label}: không còn bezel`, `bezel=${geometry.bezels}`);
    check(
      geometry.left >= 0 && geometry.right <= geometry.viewportWidth + 1,
      `${label}: khung nằm trong màn hình`,
      `left=${geometry.left} right=${geometry.right} vw=${geometry.viewportWidth}`,
    );
    // On a phone the page must use the whole screen; on a desktop it must not
    // shrink back into a phone-sized box.
    const minWidth =
      viewport === PHONE ? viewport.width - 48 : Math.round(viewport.width / 2);
    check(
      geometry.width >= minWidth,
      `${label}: nội dung dùng hết bề rộng cho phép`,
      `${geometry.width}px >= ${minWidth}px`,
    );
    check(
      geometry.height >= geometry.viewportHeight - 160,
      `${label}: nội dung lấp đầy chiều cao màn hình`,
      `${geometry.height}/${geometry.viewportHeight}px`,
    );
    await shot(anonPage, `b-${label.split(' ')[0]}-cashier`);
  }

  // The Customer demo page must survive the frame removal too.
  await anonPage.setViewportSize(PHONE);
  await anonPage.goto(`${BASE}/operation/customer`, { waitUntil: 'domcontentloaded' });
  const customerReady = await eventually(
    anonPage,
    async () => (await anonPage.locator(FRAME).count()) === 1,
    30000,
  );
  const customerText = customerReady ? await bodyText(anonPage) : '';
  check(customerReady, 'Khách hàng: trang demo render', FRAME);
  check(/Bàn 0?1/.test(customerText), 'Khách hàng: hiện danh sách bàn demo');
  check(!/\b5G\b|Wi-Fi/.test(customerText), 'Khách hàng: không còn thanh trạng thái giả');
  await shot(anonPage, 'b-customer');
  await anon.close();

  // -------------------------------------------------------------------------
  // C. Signed in: the floor plan and the page ordering
  // -------------------------------------------------------------------------
  currentFlow = 'C-board';
  const authed = await browser.newContext({ viewport: DESKTOP });
  const page = await authed.newPage();
  collectConsoleErrors(page);
  await signIn(page);

  await page.goto(`${BASE}/operation/kitchen`, { waitUntil: 'domcontentloaded' });
  const kitchenGate = await eventually(
    page,
    async () => (await page.locator('input[type="password"][maxlength="4"]').count()) === 1,
    30000,
  );
  check(kitchenGate, 'Bếp: cổng PIN render');
  // Switching pages happens on the hub only (product decision 2026-10-14).
  check(
    (await page.locator('#operation-page').count()) === 0,
    'Trang vận hành không còn ô chuyển sang trang khác',
  );
  check(
    (await page.locator('a[aria-label="Về danh sách trang vận hành"]').count()) === 1,
    'Chỉ còn nút quay về danh sách trang vận hành',
  );
  await enterOperationPin(page);
  const kitchenBoard = await eventually(
    page,
    async () => (await page.locator(BOARD).count()) === 1,
    30000,
  );
  check(kitchenBoard, 'Bếp: sơ đồ bàn render', BOARD);

  const desktopTiles = page.locator(`${BOARD} button[aria-label]`);
  let desktopTile = 0;
  // The floor measures itself once the plan is placed, so poll for the grown cell.
  const grownTile = await eventually(
    page,
    async () => {
      const box = await desktopTiles.first().boundingBox();
      desktopTile = box ? Math.round(box.width) : 0;
      return desktopTile >= 110;
    },
    15000,
  );
  check(
    grownTile,
    'Bếp: ô bàn nở theo chỗ trống trên màn hình lớn',
    `${desktopTile}px`,
  );

  const names = kitchenBoard ? await tileNames(page) : [];
  check(
    names.length === expectedTables.length &&
      JSON.stringify(names) === JSON.stringify(expectedTables),
    'Bếp: sơ đồ vẽ đúng bàn của cửa hàng',
    `UI=[${names.join(', ')}] DB=[${expectedTables.join(', ')}]`,
  );

  if (kitchenBoard) {
    const queueTop = await topOf(page, 'Hàng đợi');
    const boardTop = await topOf(page, 'Sơ đồ bàn');
    check(
      queueTop !== null && boardTop !== null && queueTop < boardTop,
      'Bếp: card đơn ở trên, sơ đồ bàn ở dưới',
      `Hàng đợi y=${queueTop}, Sơ đồ bàn y=${boardTop}`,
    );

    const ticketBottom = await page.evaluate(() => {
      const tickets = [...document.querySelectorAll('article')];
      if (tickets.length === 0) return null;
      return Math.max(...tickets.map((el) => el.getBoundingClientRect().bottom));
    });
    if (ticketBottom !== null) {
      const boardBox = await page.locator(BOARD).boundingBox();
      check(
        boardBox !== null && ticketBottom <= boardBox.y + 1,
        'Bếp: mọi card đơn nằm trên sơ đồ bàn',
        `card bottom=${Math.round(ticketBottom)}, board top=${Math.round(boardBox?.y ?? -1)}`,
      );
    } else {
      check(true, 'Bếp: chưa có đơn nào để so vị trí card', 'hàng đợi trống');
    }

    // Tap a table to scope the queue, then clear the filter.
    const firstTile = page.locator(`${BOARD} button[aria-label]`).first();
    const firstName = expectedTables[0];
    await firstTile.click();
    await page.waitForTimeout(600);
    const filteredText = await bodyText(page);
    check(
      filteredText.includes(firstName) && /xem tất cả/i.test(filteredText),
      'Bếp: bấm bàn để lọc hàng đợi',
      firstName,
    );
    await shot(page, 'c1-kitchen-filtered');

    await page.getByRole('button', { name: /xem tất cả/i }).first().click();
    await page.waitForTimeout(600);
    check(
      !/xem tất cả/i.test(await bodyText(page)),
      'Bếp: bỏ lọc bằng "xem tất cả"',
    );
  }

  await page.goto(`${BASE}/operation/cashier`, { waitUntil: 'domcontentloaded' });
  await eventually(
    page,
    async () => (await page.locator('input[type="password"][maxlength="4"]').count()) === 1,
    30000,
  );
  await enterOperationPin(page);
  const cashierBoard = await eventually(
    page,
    async () => (await page.locator(BOARD).count()) === 1,
    30000,
  );
  check(cashierBoard, 'Thu ngân: sơ đồ bàn render', BOARD);
  if (cashierBoard) {
    const boardTop = await topOf(page, 'Sơ đồ bàn');
    const billsTop = await topOf(page, 'Hóa đơn');
    check(
      boardTop !== null && billsTop !== null && boardTop < billsTop,
      'Thu ngân: sơ đồ bàn ở trên danh sách hoá đơn',
      `Sơ đồ bàn y=${boardTop}, Hóa đơn y=${billsTop}`,
    );
  }
  await shot(page, 'c2-cashier');

  await page.goto(`${BASE}/operation/staff`, { waitUntil: 'domcontentloaded' });
  // The Owner is already signed in, so this screen starts their shift directly
  // instead of asking for a Staff PIN (REQ-AUTH-005). The PIN gate itself is
  // covered by flow H with a real Staff membership.
  // A fresh load resolves the active Tenant in two steps: the first read can
  // settle as "no Tenant" before Auth restores, so poll instead of assuming a
  // fixed wait is long enough.
  const ownerShift = await eventually(
    page,
    async () => (await page.locator(BOARD).count()) === 1,
    30000,
  );
  check(ownerShift, 'Nhân viên: chủ quán vào thẳng ca làm việc, không hỏi mã PIN');
  check(
    (await page.locator(FRAME).count()) === 1,
    'Nhân viên: trang dùng khung vận hành, không khung điện thoại',
  );
  await shot(page, 'c3-staff');

  // -------------------------------------------------------------------------
  // D. Phone width: the plan swipes instead of shrinking
  // -------------------------------------------------------------------------
  currentFlow = 'D-swipe';
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/operation/kitchen`, { waitUntil: 'domcontentloaded' });
  await eventually(
    page,
    async () => (await page.locator('input[type="password"][maxlength="4"]').count()) === 1,
    30000,
  );
  await enterOperationPin(page);
  const phoneBoard = await eventually(
    page,
    async () => (await page.locator(BOARD_SCROLL).count()) === 1,
    30000,
  );
  check(phoneBoard, 'Phone: sơ đồ bàn render', BOARD_SCROLL);
  if (phoneBoard) {
    const metrics = await page.evaluate((selector) => {
      const board = document.querySelector(selector);
      const tile = board.querySelector('button[aria-label]');
      return {
        scrollWidth: board.scrollWidth,
        clientWidth: board.clientWidth,
        tileWidth: tile ? Math.round(tile.getBoundingClientRect().width) : 0,
      };
    }, BOARD_SCROLL);
    check(
      metrics.scrollWidth > metrics.clientWidth,
      'Phone: sơ đồ cuộn ngang để vuốt xem bàn khác',
      `scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`,
    );
    check(
      metrics.tileWidth >= 88,
      'Phone: ô bàn đủ lớn để bấm',
      `${metrics.tileWidth}px`,
    );
    await shot(page, 'd1-kitchen-phone');
  }

  // The mobile layout must not stretch the labels: every Kitchen tab label
  // stays on one line and nothing spills out of the frame (REQ-UX-002).
  const phoneFit = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="operation-frame"]');
    return {
      tabHeights: [...document.querySelectorAll('[role="tab"]')].map((tab) =>
        Math.round(tab.getBoundingClientRect().height),
      ),
      frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : -1,
    };
  });
  check(
    phoneFit.tabHeights.length === 3 && phoneFit.tabHeights.every((h) => h <= 44),
    'Phone: nhãn ba tab bếp nằm trên một hàng, không bị kéo dãn',
    `cao ${phoneFit.tabHeights.join('/')}px`,
  );
  check(
    phoneFit.frameOverflow >= 0 && phoneFit.frameOverflow <= 2,
    'Phone: trang bếp không tràn ngang',
    `tràn ${phoneFit.frameOverflow}px`,
  );

  await page.getByRole('tab', { name: /Kho nguyên liệu/i }).first().click();
  const khoFit = await eventually(
    page,
    async () => (await page.locator('[data-testid="ingredient-table-scroll"]').count()) === 1,
    20000,
  );
  if (khoFit) {
    const tableMetrics = await page.evaluate(() => {
      const node = document.querySelector('[data-testid="ingredient-table-scroll"]');
      return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    });
    check(
      tableMetrics.scrollWidth <= tableMetrics.clientWidth + 2,
      'Phone: bảng kho vừa màn hình, không phải cuộn ngang',
      `${tableMetrics.scrollWidth}<=${tableMetrics.clientWidth}`,
    );
    await shot(page, 'd2-kitchen-phone-inventory');
  }

  // -------------------------------------------------------------------------
  // E. Kitchen tabs: queue + plan, menu state, ingredient in/out
  // -------------------------------------------------------------------------
  currentFlow = 'E-tabs';
  await seedIngredients(SEEDED_INGREDIENTS);
  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE}/operation/kitchen`, { waitUntil: 'domcontentloaded' });
  await eventually(
    page,
    async () => (await page.locator('input[type="password"][maxlength="4"]').count()) === 1,
    30000,
  );
  await enterOperationPin(page);
  const queueTab = await eventually(
    page,
    async () => (await page.locator(BOARD).count()) === 1,
    30000,
  );
  check(queueTab, 'Tab 1: hàng đợi và sơ đồ bàn cùng một tab');

  const tileCounts = (
    await page.locator('[data-testid="operation-table-count"]').allInnerTexts()
  ).map((value) => value.trim());
  check(
    tileCounts.length === expectedTables.length &&
      tileCounts.every((value) => /^\d+$/.test(value)),
    'Tab 1: mỗi bàn in số đơn đang đợi',
    `[${tileCounts.join(', ')}]`,
  );

  await page.getByRole('tab', { name: /Tình trạng món/i }).click();
  await page.waitForTimeout(900);
  const availabilityText = await bodyText(page);
  check(
    /ĐANG BÁN|TẠM HẾT/.test(availabilityText),
    'Tab 2: hiện tình trạng món theo danh mục',
  );
  check(
    (await page.locator(BOARD).count()) === 0,
    'Tab 2: không còn hàng đợi và sơ đồ bàn',
  );
  await shot(page, 'e1-availability');

  await page.getByRole('tab', { name: /Kho nguyên liệu/i }).click();
  const pager = await eventually(
    page,
    async () => (await page.locator('[data-testid="ingredient-pager"]').count()) === 1,
    20000,
  );
  check(pager, 'Tab 3: kho nguyên liệu có phân trang');
  const firstPageRows = await page.locator('[data-testid="ingredient-row"]').count();
  check(
    firstPageRows === INGREDIENT_ROWS,
    `Tab 3: trang đầu đúng ${INGREDIENT_ROWS} nguyên liệu`,
    `${firstPageRows} dòng`,
  );

  await page.getByRole('button', { name: /Sau/i }).first().click();
  await page.waitForTimeout(700);
  const secondPageRows = await page.locator('[data-testid="ingredient-row"]').count();
  const secondPageText = await bodyText(page);
  check(
    secondPageRows === SEEDED_INGREDIENTS - INGREDIENT_ROWS &&
      /trang 2\/2/i.test(secondPageText),
    'Tab 3: "Sau" sang trang 2',
    `${secondPageRows} dòng`,
  );
  await shot(page, 'e2-ingredient-page2');

  await page.getByRole('button', { name: /Trước/i }).first().click();
  await page.waitForTimeout(700);
  check(
    (await page.locator('[data-testid="ingredient-row"]').count()) === INGREDIENT_ROWS,
    'Tab 3: "Trước" quay lại trang 1',
  );

  // Waste must ask for a reason and a note (REQ-INV-009, ADR 0013).
  await page.getByRole('button', { name: /^Tồn$/i }).first().click();
  await page.waitForTimeout(500);
  check(/Điều chỉnh tồn kho/i.test(await bodyText(page)), 'Tab 3: mở được nhập/xuất kho');
  await page.locator('input[type="number"]').first().fill('-100');
  await page.waitForTimeout(400);
  const deductText = await bodyText(page);
  check(
    /lý do giảm/i.test(deductText) && /ghi chú \(bắt buộc\)/i.test(deductText),
    'Tab 3: hao hụt bắt buộc lý do và ghi chú',
  );
  await shot(page, 'e3-waste-reason');
  await page.getByRole('button', { name: /^Hủy$/i }).first().click();

  // -------------------------------------------------------------------------
  // F. Inventory waste: pick one or many ingredients, record it, read it back
  // -------------------------------------------------------------------------
  currentFlow = 'F-waste';
  const WASTE_NOTE = `[QA] hao hụt kiểm thử ${new Date().toISOString()}`;
  const selectBoxes = page.locator('[data-testid="ingredient-select"]');
  const bulkBar = page.locator('[data-testid="bulk-waste-bar"]');
  const selectedCount = async () => {
    if ((await bulkBar.count()) === 0) return 0;
    const match = (await bulkBar.innerText()).match(/Đã chọn (\d+)/i);
    return match ? Number(match[1]) : 0;
  };

  const selectableRows = await selectBoxes.count();
  check(
    selectableRows === INGREDIENT_ROWS,
    'Kho: mỗi nguyên liệu có ô chọn để ghi hao hụt',
    `${selectableRows} ô`,
  );

  await selectBoxes.nth(0).check();
  await page.waitForTimeout(400);
  check((await selectedCount()) === 1, 'Kho: chọn được 1 nguyên liệu');

  await selectBoxes.nth(1).check();
  await page.waitForTimeout(400);
  check(
    (await selectedCount()) === 2,
    'Kho: chọn được nhiều nguyên liệu cùng lúc',
    '2 nguyên liệu',
  );
  await shot(page, 'f1-bulk-select');

  // The header box covers the whole page and clears it again.
  const selectPage = page.getByLabel('Chọn tất cả nguyên liệu trên trang');
  await selectPage.check();
  await page.waitForTimeout(400);
  check(
    (await selectedCount()) === INGREDIENT_ROWS,
    'Kho: chọn tất cả nguyên liệu trên trang',
  );
  await selectPage.uncheck();
  await page.waitForTimeout(400);
  check((await selectedCount()) === 0, 'Kho: bỏ chọn được toàn bộ');

  // One reason and one note cover every ingredient picked for waste.
  await selectBoxes.nth(0).check();
  await selectBoxes.nth(1).check();
  await page.locator('[data-testid="bulk-waste-open"]').click();
  const bulkModal = await eventually(
    page,
    async () => (await page.locator('[data-testid="bulk-waste-modal"]').count()) === 1,
    10000,
  );
  check(bulkModal, 'Kho: mở phiếu ghi hao hụt cho nguyên liệu đã chọn');
  const qtyInputs = page.locator('[data-testid="bulk-waste-qty"]');
  const qtyCount = await qtyInputs.count();
  check(
    qtyCount === 2,
    'Kho: phiếu hao hụt có ô số lượng cho từng nguyên liệu',
    `${qtyCount} ô`,
  );
  await qtyInputs.nth(0).fill('100');
  await qtyInputs.nth(1).fill('200');
  await page.locator('[data-testid="bulk-waste-note"]').fill(WASTE_NOTE);
  await shot(page, 'f2-bulk-waste-modal');
  // Poll for the save control: a slow render must fail one check with a reason
  // instead of timing out the whole run on an unexplained locator wait.
  const bulkSubmitReady = await eventually(
    page,
    async () => (await page.locator('[data-testid="bulk-waste-submit"]').count()) === 1,
    15000,
  );
  check(bulkSubmitReady, 'Kho: phiếu hao hụt có nút lưu');
  if (bulkSubmitReady) {
    await page.locator('[data-testid="bulk-waste-submit"]').click();
  }

  const wasteRecorded = await eventually(
    page,
    async () => /đã ghi hao hụt 2 nguyên liệu/i.test(await bodyText(page)),
    30000,
  );
  check(wasteRecorded, 'Kho: ghi hao hụt cho nhiều nguyên liệu');

  // The command must move real stock and write the append-only audit ledger.
  const [firstAfter, secondAfter] = await Promise.all([
    db.doc(`tenants/${TENANT_ID}/ingredients/${seededIngredientIds[0]}`).get(),
    db.doc(`tenants/${TENANT_ID}/ingredients/${seededIngredientIds[1]}`).get(),
  ]);
  check(
    Number(firstAfter.get('stockQuantity')) === 1000 - 100 &&
      Number(secondAfter.get('stockQuantity')) === 2000 - 200,
    'Kho: tồn kho giảm đúng số lượng đã ghi',
    `${firstAfter.get('stockQuantity')} / ${secondAfter.get('stockQuantity')}`,
  );

  const wasteAudit = await db
    .collection(`tenants/${TENANT_ID}/audit`)
    .where('targetId', 'in', [seededIngredientIds[0], seededIngredientIds[1]])
    .get();
  const recorded = wasteAudit.docs.filter(
    (doc) =>
      doc.get('action') === 'StockAdjusted' &&
      doc.get('reason') === 'waste' &&
      doc.get('metadata')?.note === WASTE_NOTE,
  );
  const deltas = recorded
    .map((doc) => Number(doc.get('metadata')?.quantityDelta))
    .sort((left, right) => left - right);
  check(
    recorded.length === 2 && deltas.join(',') === '-200,-100',
    'Kho: báo cáo hao hụt được ghi vào audit với số lượng âm',
    `${recorded.length} dòng [${deltas.join(', ')}]`,
  );

  // The report page is where those rows are read back.
  await page.locator('[data-testid="inventory-tab-report"]').click();
  const reportRows = await eventually(
    page,
    async () => (await page.locator('[data-testid="report-row"]').count()) > 0,
    20000,
  );
  check(reportRows, 'Báo cáo kho: có trang xem lại các thay đổi');
  const reportText = (await bodyText(page)).toLowerCase();
  check(
    reportText.includes(WASTE_NOTE.toLowerCase()) &&
      reportText.includes('nguyên liệu 01') &&
      reportText.includes('nguyên liệu 02'),
    'Báo cáo kho: hiện đúng nguyên liệu và ghi chú hao hụt',
  );
  const wasteBadges = await page.locator('[data-testid="report-waste-badge"]').count();
  check(
    wasteBadges >= 2,
    'Báo cáo kho: dòng hao hụt được đánh dấu riêng',
    `${wasteBadges} dòng`,
  );

  await page.locator('[data-testid="report-filter-waste"]').click();
  await page.waitForTimeout(800);
  const wasteOnlyRows = await page.locator('[data-testid="report-row"]').count();
  const wasteOnlyBadges = await page
    .locator('[data-testid="report-waste-badge"]')
    .count();
  check(
    wasteOnlyRows === wasteOnlyBadges && wasteOnlyRows >= 2,
    'Báo cáo kho: lọc riêng các dòng hao hụt',
    `${wasteOnlyRows} dòng`,
  );
  await shot(page, 'f3-waste-report');

  // -------------------------------------------------------------------------
  // G. The Owner's Kho page carries the same two views and the same report
  // -------------------------------------------------------------------------
  currentFlow = 'G-owner-kho';
  await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: 'domcontentloaded' });
  const ownerTabs = await eventually(
    page,
    async () => (await page.locator('[data-testid="inventory-tabs"]').count()) === 1,
    30000,
  );
  check(ownerTabs, 'Kho (chủ quán): cùng hai view Nguyên liệu / Báo cáo kho');
  await page.locator('[data-testid="inventory-tab-report"]').click();
  const ownerReport = await eventually(
    page,
    async () => (await page.locator('[data-testid="report-row"]').count()) > 0,
    20000,
  );
  check(ownerReport, 'Kho (chủ quán): mở được trang báo cáo');
  check(
    (await bodyText(page)).toLowerCase().includes(WASTE_NOTE.toLowerCase()),
    'Kho (chủ quán): thấy dòng hao hụt vừa ghi',
  );
  await shot(page, 'g1-owner-inventory-report');

  await authed.close();


  // ---------------------------------------------------------------------------
  // H. An assigned Waiter only sees their own area (REQ-TBL-004, REQ-TBL-010)
  // ---------------------------------------------------------------------------
  currentFlow = 'H-waiter-scope';
  {
    const stamp = Date.now().toString().slice(-6);
    const zone = `[QA] Khu phục vụ ${stamp}`;
    const outsideZone = `[QA] Khu ngoài ${stamp}`;
    const insideTable = `[QA] Bàn trong khu ${stamp}`;
    const outsideTable = `[QA] Bàn ngoài khu ${stamp}`;
    const waiterEmail = `qa.zone.waiter.${stamp}@example.com`;
    const waiterPin = '246810';
    let waiterUid = null;

    try {
      const token = await ownerIdToken();
      const staff = await callCallable(
        'callableStaffCreate',
        {
          tenantId: TENANT_ID,
          email: waiterEmail,
          password: `ScanGo-Zone-${stamp}!`,
          displayName: `QA Phục vụ ${stamp}`,
          roles: ['waiter'],
          permissions: [],
          pin: waiterPin,
        },
        token,
      );
      waiterUid = staff.staff.uid;
      await callCallable(
        'callableTableCreate',
        {
          tenantId: TENANT_ID,
          name: insideTable,
          area: zone,
          seats: 4,
          position: { x: 0, y: 3 },
        },
        token,
      );
      await callCallable(
        'callableTableCreate',
        {
          tenantId: TENANT_ID,
          name: outsideTable,
          area: outsideZone,
          seats: 4,
          position: { x: 6, y: 3 },
        },
        token,
      );
      await callCallable(
        'callableTableAreaAssign',
        { tenantId: TENANT_ID, label: zone, waiterUids: [waiterUid] },
        token,
      );
      check(true, 'Fixture: một nhân viên phục vụ được gán đúng một khu', zone);

      const scoped = await browser.newContext({ viewport: DESKTOP });
      const scopedPage = await scoped.newPage();
      scopedPage.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text().slice(0, 200));
        }
      });

      await scopedPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await scopedPage.waitForSelector('#email', { timeout: 30000 });
      await scopedPage.fill('#email', waiterEmail);
      await scopedPage.fill('#password', `ScanGo-Zone-${stamp}!`);
      await scopedPage.click('button[type="submit"]');
      await scopedPage.waitForTimeout(6000);
      // A Staff membership lands on the PIN gate; reach it by URL so the flow
      // does not depend on where the sign-in redirect stopped.
      if (!scopedPage.url().includes('/operation/staff')) {
        await scopedPage.goto(`${BASE}/operation/staff`, {
          waitUntil: 'domcontentloaded',
        });
        await scopedPage.waitForTimeout(6000);
      }

      const pinField = scopedPage.locator('input[placeholder="Mã PIN"]');
      if (await pinField.count()) {
        await pinField.first().fill(waiterPin);
        await scopedPage
          .getByRole('button', { name: /^Đăng nhập$/i })
          .first()
          .click();
        await scopedPage.waitForTimeout(8000);
      }

      const board = await eventually(
        scopedPage,
        async () => (await scopedPage.locator(BOARD).count()) === 1,
        30000,
      );
      check(board, 'Nhân viên vào được sàn vận hành sau mã PIN');

      const visible = await scopedPage.evaluate((selector) => {
        const node = document.querySelector(selector);
        return node
          ? [...node.querySelectorAll('button[aria-label]')].map(
              (tile) => (tile.getAttribute('aria-label') ?? '').split(',')[0].trim(),
            )
          : [];
      }, BOARD);
      check(
        visible.includes(insideTable),
        'Sàn của nhân viên có bàn thuộc khu được gán',
        visible.join(', ') || '(không có bàn)',
      );
      check(
        !visible.includes(outsideTable),
        'Sàn của nhân viên không có bàn ngoài khu',
        visible.join(', ') || '(không có bàn)',
      );
      await shot(scopedPage, 'h1-waiter-scope-board');
      await scoped.close();
    } catch (error) {
      check(false, 'Luồng phạm vi khu vực chạy được', String(error).slice(0, 200));
    } finally {
      try {
        const token = await ownerIdToken();
        await callCallable(
          'callableTableAreaAssign',
          { tenantId: TENANT_ID, label: zone, waiterUids: [] },
          token,
        );
        if (waiterUid) {
          await callCallable(
            'callableStaffSetActive',
            { tenantId: TENANT_ID, uid: waiterUid, isActive: false },
            token,
          );
        }
        await callCallable(
          'callableTableAreaAssign',
          { tenantId: TENANT_ID, label: outsideZone, waiterUids: [] },
          token,
        ).catch(() => undefined);
      } catch (error) {
        console.log(`   · Dọn fixture khu vực lỗi: ${String(error).slice(0, 120)}`);
      }
      await archiveQaTable(insideTable);
      await archiveQaTable(outsideTable);
      console.log('   · Đã dọn fixture khu vực và nhân viên phạm vi');
    }
  }

  // ---------------------------------------------------------------------------
  // I-shift-clock — the Owner plans a Shift, the Staff member accepts it, and
  // the worked time is counted from the server's stamp (REQ-HRM-004/005).
  // ---------------------------------------------------------------------------
  currentFlow = 'I-shift-clock';
  {
    const stamp = Date.now().toString().slice(-6);
    const shiftStaffEmail = `qa.shift.staff.${stamp}@example.com`;
    const shiftStaffName = `[QA] Ca ${stamp}`;
    const shiftStaffPin = '135790';
    let shiftStaffUid = null;
    let plannedShiftId = null;

    // A window that contains the run, rounded to five minutes.
    const pad = (value) => String(value).padStart(2, '0');
    const clockTime = (date) =>
      `${pad(date.getHours())}:${pad(Math.floor(date.getMinutes() / 5) * 5)}`;
    const now = new Date();
    const startAt = new Date(now.getTime() - 30 * 60 * 1000);
    const endAt = new Date(now.getTime() + 210 * 60 * 1000);
    const startTime = clockTime(startAt);
    const endTime = clockTime(endAt);
    const dayKey = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const dayValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    try {
      const token = await ownerIdToken();
      const staff = await callCallable(
        'callableStaffCreate',
        {
          tenantId: TENANT_ID,
          email: shiftStaffEmail,
          password: `ScanGo-Shift-${stamp}!`,
          displayName: shiftStaffName,
          roles: ['cashier'],
          permissions: [],
          pin: shiftStaffPin,
        },
        token,
      );
      shiftStaffUid = staff.staff.uid;

      const ownerPage = await browser.newPage();
      collectConsoleErrors(ownerPage);
      await signIn(ownerPage);
      await ownerPage.goto(`${BASE}/dashboard/staff`, { waitUntil: 'domcontentloaded' });
      await ownerPage.getByRole('tab', { name: 'Ca làm' }).click();
      check(
        await eventually(
          ownerPage,
          async () => (await ownerPage.getByRole('button', { name: 'Thêm ca' }).count()) === 1,
          20000,
        ),
        'Chủ quán mở được tab Ca làm trong dashboard nhân sự',
      );

      await ownerPage.getByRole('button', { name: 'Thêm ca' }).click();
      await ownerPage.waitForSelector('[data-testid="shift-scheduler"]', { timeout: 15000 });
      await ownerPage.fill('#shift-day', dayValue);
      await ownerPage.fill('#shift-start', startTime);
      await ownerPage.fill('#shift-end', endTime);
      await ownerPage.fill('#shift-label', 'Ca QA');
      await ownerPage.getByLabel(shiftStaffName).check();
      await ownerPage.getByRole('button', { name: 'Lưu ca làm' }).click();

      const planned = await eventually(
        ownerPage,
        async () =>
          (await ownerPage.getByText(shiftStaffName).count()) > 0 &&
          (await ownerPage.getByText('Chưa nhận ca').count()) > 0,
        25000,
      );
      check(planned, 'Ca vừa xếp hiện trong tuần ở trạng thái Chưa nhận ca');
      await shot(ownerPage, 'i1-shift-planned');

      const shiftRows = await db
        .collection(`tenants/${TENANT_ID}/shifts`)
        .where('staffUid', '==', shiftStaffUid)
        .get();
      plannedShiftId = shiftRows.docs[0]?.id ?? null;
      check(
        shiftRows.size === 1 &&
          shiftRows.docs[0].get('date') === dayKey &&
          shiftRows.docs[0].get('label') === 'Ca QA',
        'Firestore có đúng một ca cho nhân viên, đúng ngày và có tên ca',
        `size=${shiftRows.size}`,
      );

      // The Staff member's own surface: sign in at /staff, clear the PIN gate.
      // The Staff entry has no `#email` id (that is the Owner login form), so
      // address its two fields by type.
      const shiftStaff = await browser.newContext({ viewport: PHONE });
      const staffPage = await shiftStaff.newPage();
      collectConsoleErrors(staffPage);
      await staffPage.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
      const staffEmail = staffPage.locator('input[type="email"]');
      await staffEmail.first().waitFor({ timeout: 30000 });
      await staffEmail.first().fill(shiftStaffEmail);
      await staffPage.locator('input[type="password"]').first().fill(`ScanGo-Shift-${stamp}!`);
      await staffPage.click('button[type="submit"]');
      const pinField = staffPage.locator('input[placeholder="Mã PIN"]');
      await pinField.first().waitFor({ timeout: 30000 });
      await pinField.first().fill(shiftStaffPin);
      await staffPage.getByRole('button', { name: /^Đăng nhập$/i }).first().click();

      const clockBar = await eventually(
        staffPage,
        async () =>
          (await staffPage.getByRole('button', { name: /Nhận ca/ }).count()) > 0,
        30000,
      );
      check(clockBar, 'Nhân viên thấy ca được gán và nút Nhận ca', `${startTime}–${endTime}`);
      await shot(staffPage, 'i2-staff-clock-in');

      await staffPage.getByRole('button', { name: /Nhận ca/ }).first().click();
      const working = await eventually(
        staffPage,
        async () => (await staffPage.getByText(/Đang làm từ/).count()) > 0,
        25000,
      );
      check(working, 'Sau khi nhận ca, màn hình nhân viên đếm giờ từ lúc nhận');
      await shot(staffPage, 'i3-staff-working');

      const attendance = await db
        .collection(`tenants/${TENANT_ID}/attendance`)
        .where('staffUid', '==', shiftStaffUid)
        .get();
      const record = attendance.docs[0];
      check(
        attendance.size === 1 &&
          record.get('shiftId') === plannedShiftId &&
          typeof record.get('clockInAt') === 'string' &&
          record.get('clockOutAt') === null &&
          record.id === `attendance_${shiftStaffUid}_${plannedShiftId}`,
        'Bản ghi chấm công gắn đúng ca và do server đóng dấu giờ vào',
        `size=${attendance.size}`,
      );

      // The Owner sees the same record through the week listener.
      await ownerPage.reload({ waitUntil: 'domcontentloaded' });
      await ownerPage.getByRole('tab', { name: 'Ca làm' }).click();
      const ownerSeesWorking = await eventually(
        ownerPage,
        async () => (await ownerPage.getByText('Đang làm', { exact: false }).count()) > 0,
        25000,
      );
      check(ownerSeesWorking, 'Chủ quán thấy nhân viên đang trong ca');
      await shot(ownerPage, 'i4-owner-working');

      await staffPage.getByRole('button', { name: /Tan ca/ }).click();
      const closed = await eventually(
        staffPage,
        async () =>
          (await staffPage.getByText(/Đang làm từ/).count()) === 0 &&
          (await staffPage.getByText(/Xong/).count()) > 0,
        25000,
      );
      check(closed, 'Tan ca đóng bản ghi và hiện số phút đã làm');
      await shot(staffPage, 'i5-staff-clocked-out');

      const afterOut = await db
        .doc(`tenants/${TENANT_ID}/attendance/attendance_${shiftStaffUid}_${plannedShiftId}`)
        .get();
      const inAt = Date.parse(String(afterOut.get('clockInAt')));
      const outAt = Date.parse(String(afterOut.get('clockOutAt')));
      check(
        afterOut.get('clockOutAt') !== null && outAt >= inAt,
        'Giờ ra do server đóng dấu và không sớm hơn giờ vào',
        `${afterOut.get('clockInAt')} → ${afterOut.get('clockOutAt')}`,
      );

      await ownerPage.reload({ waitUntil: 'domcontentloaded' });
      await ownerPage.getByRole('tab', { name: 'Ca làm' }).click();
      const ownerSeesDone = await eventually(
        ownerPage,
        async () => (await ownerPage.getByText('Đã xong', { exact: false }).count()) > 0,
        25000,
      );
      check(ownerSeesDone, 'Chủ quán thấy ca đã xong kèm số phút');
      const totalsShown = await eventually(
        ownerPage,
        async () => (await ownerPage.getByText('Giờ công tuần này').count()) > 0,
        15000,
      );
      check(totalsShown, 'Bảng giờ công tuần này theo nhân viên hiện ra');
      await shot(ownerPage, 'i6-owner-shift-done');
      await ownerPage.close();
      await shiftStaff.close();
    } catch (error) {
      check(false, 'Luồng xếp ca và chấm công chạy được', String(error).slice(0, 200));
    } finally {
      try {
        const token = await ownerIdToken();
        if (shiftStaffUid) {
          const shifts = await db
            .collection(`tenants/${TENANT_ID}/shifts`)
            .where('staffUid', '==', shiftStaffUid)
            .get();
          for (const doc of shifts.docs) {
            await callCallable(
              'callableWorkforceCancelShift',
              { tenantId: TENANT_ID, shiftId: doc.id },
              token,
            ).catch(async () => {
              // A Shift that already carries attendance cannot be cancelled
              // through the command, so the QA fixture is removed directly.
              await doc.ref.delete();
            });
          }
          const attendance = await db
            .collection(`tenants/${TENANT_ID}/attendance`)
            .where('staffUid', '==', shiftStaffUid)
            .get();
          for (const doc of attendance.docs) {
            await doc.ref.delete();
          }
          await callCallable(
            'callableStaffSetActive',
            { tenantId: TENANT_ID, uid: shiftStaffUid, isActive: false },
            token,
          ).catch(() => undefined);
        }
      } catch (error) {
        console.log(`   · Dọn fixture ca làm lỗi: ${String(error).slice(0, 120)}`);
      }
      console.log('   · Đã dọn fixture ca làm và nhân viên QA');
    }
  }

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
    expectedTables,
    passed,
    failed,
    screenshots,
    consoleErrors: realErrors,
    findings,
  };
  await mkdir(OUT, { recursive: true });
  const reportPath = path.join(OUT, 'operation-pages-verification-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n${passed}/${passed + failed} phép kiểm đạt.`);
  console.log(`Báo cáo: ${path.relative(process.cwd(), reportPath)}`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
  await cleanupIngredients();
}

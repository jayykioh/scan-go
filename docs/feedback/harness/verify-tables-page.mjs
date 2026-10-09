/**
 * Table-map (sơ đồ bàn) UI verification — REQ-TBL-001, IMP-01, IMP-04.
 *
 * The page must show the tenant's real tables when the Owner opens it by URL or
 * reloads it, and the first-run guide card must not cover the primary action.
 * Expected rows are read from the real Firestore through the admin SDK, so the
 * browser assertions are compared against the database rather than against
 * themselves.
 *
 * Usage:
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-tables-page.mjs [--headed]
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
const OUT = path.resolve(
  process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts',
);
const PROJECT = 'scango-8f0e9';
const EMAIL =
  process.env.SCANGO_QA_EMAIL ?? 'qa.playwright+1791453969001@example.com';
const PASSWORD = process.env.SCANGO_QA_PASSWORD ?? 'ScanGo-QA-2026!';
const TENANT_ID =
  process.env.SCANGO_QA_TENANT ?? 'first-g43h5hgnc4RJ0FJrYHxmd3g7qXl1';

const DESKTOP = { width: 1440, height: 900 };

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
  const file = path.join(OUT, `tables-${name}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  screenshots.push(path.relative(process.cwd(), file));
}

/** Poll until the predicate holds; Firestore listeners land asynchronously. */
async function eventually(page, predicate, timeout = 20000, step = 500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await page.waitForTimeout(step);
  }
  return false;
}

const sortedNames = (names) => [...names].sort((left, right) => left.localeCompare(right, 'vi'));

const namesMatch = (actual, expected) =>
  JSON.stringify(sortedNames(actual)) === JSON.stringify(sortedNames(expected));

const tableNames = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="table-plan-canvas"]');
    if (canvas) {
      return [...canvas.querySelectorAll('button[aria-label]')].map((tile) =>
        (tile.getAttribute('aria-label') ?? '').split(',')[0].trim(),
      );
    }
    return [...document.querySelectorAll('main h3')].map((h) =>
      (h.textContent ?? '').trim(),
    );
  });

const showListView = async (page) => {
  await page.getByRole('button', { name: /^Danh sách$/i }).first().click();
  await page.waitForTimeout(600);
};

const showPlanView = async (page) => {
  await page.getByRole('button', { name: /^Sơ đồ$/i }).first().click();
  await page.waitForTimeout(600);
};

const showsEmptyPanel = (page) =>
  page.evaluate(() =>
    /Chưa có bàn nào được thiết lập/.test(
      document.querySelector('main')?.innerText ?? '',
    ),
  );

const guideGeometry = (page) =>
  page.evaluate(() => {
    const aside = [...document.querySelectorAll('aside')].find(
      (el) => getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().height > 40,
    );
    const primary = [...document.querySelectorAll('main button')].find((b) =>
      /Thêm Bàn/i.test(b.textContent ?? ''),
    );
    if (!aside || !primary) {
      return { found: false, aside: !!aside, primary: !!primary };
    }
    const a = aside.getBoundingClientRect();
    const p = primary.getBoundingClientRect();
    const overlapW = Math.min(a.right, p.right) - Math.max(a.left, p.left);
    const overlapH = Math.min(a.bottom, p.bottom) - Math.max(a.top, p.top);
    const hit = document.elementFromPoint(
      p.left + p.width / 2,
      p.top + p.height / 2,
    );
    return {
      found: true,
      // A `position: fixed` card must be laid out against the viewport.
      insideViewport:
        a.top >= 0 &&
        a.left >= 0 &&
        a.right <= window.innerWidth + 1 &&
        a.bottom <= window.innerHeight + 1,
      rect: {
        top: Math.round(a.top),
        left: Math.round(a.left),
        width: Math.round(a.width),
        height: Math.round(a.height),
      },
      anchoredBottomRight:
        window.innerHeight - a.bottom < 40 && window.innerWidth - a.right < 40,
      overlapWithPrimary:
        overlapW > 0 && overlapH > 0 ? Math.round(overlapW * overlapH) : 0,
      primaryClickableByHitTest: !!hit && primary.contains(hit),
    };
  });

async function dismissGuide(page) {
  const button = page.getByRole('button', { name: /Đã hiểu/i });
  if (await button.count()) {
    await button.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 90000 });
  await page.waitForTimeout(2500);
}

// ---------------------------------------------------------------------------
// Expected state, straight from the database
// ---------------------------------------------------------------------------

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();
const tableDocs = await db.collection(`tenants/${TENANT_ID}/tables`).get();
const expectedNames = tableDocs.docs
  .filter((doc) => doc.get('archivedAt') == null)
  .map((doc) => String(doc.get('name')))
  .sort();
console.log(
  `\nKỳ vọng từ Firestore: ${expectedNames.length} bàn — ${expectedNames.join(', ') || '(trống)'}\n`,
);

const browser = await chromium.launch({ headless: HEADED });
const context = await browser.newContext({ viewport: DESKTOP });
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
});
page.on('pageerror', (error) =>
  consoleErrors.push(`pageerror: ${String(error).slice(0, 200)}`),
);
page.on('requestfailed', (request) => {
  const url = request.url();
  // The Vite dev client reconnects its own websocket while files change; that
  // is not a product error.
  if (url.startsWith('ws://') || url.includes('/@vite/')) {
    return;
  }
  consoleErrors.push(
    `requestfailed: ${url.slice(0, 160)} ${request.failure()?.errorText ?? ''}`,
  );
});

await signIn(page);

// ---------------------------------------------------------------------------
// t1 — the regression: hard load / reload must show the real tables
// ---------------------------------------------------------------------------
currentFlow = 't1-hard-load';
console.log('t1 — Mở trang bằng URL / tải lại (F5)');
{
  await page.goto(`${BASE}/dashboard/tables`, { waitUntil: 'domcontentloaded' });
  const sawEmpty = await eventually(page, () => showsEmptyPanel(page), 12000, 400);
  const loaded = await eventually(
    page,
    async () => namesMatch(await tableNames(page), expectedNames),
    25000,
  );
  const names = await tableNames(page);
  check(
    !sawEmpty,
    'Không hiện "Chưa có bàn nào" trong lúc chờ dữ liệu',
    sawEmpty ? 'bảng trống giả xuất hiện' : 'không thấy trạng thái trống giả',
  );
  check(
    loaded,
    'Tải cứng hiện đủ bàn từ Firestore',
    `hiển thị: ${names.join(', ') || '(trống)'}`,
  );
  await shot(page, 't1-hard-load');
}

// ---------------------------------------------------------------------------
// t2 — reload on the same route, then in-app navigation
// ---------------------------------------------------------------------------
currentFlow = 't2-reload-and-nav';
console.log('t2 — Tải lại tại chỗ và điều hướng trong app');
{
  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await eventually(
    page,
    async () => namesMatch(await tableNames(page), expectedNames),
    25000,
  );
  check(afterReload, 'F5 tại chỗ vẫn hiện đủ bàn', (await tableNames(page)).join(', '));

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.getByRole('link', { name: /Sơ đồ Bàn/i }).first().click();
  const afterNav = await eventually(
    page,
    async () => namesMatch(await tableNames(page), expectedNames),
    25000,
  );
  check(afterNav, 'Điều hướng trong app hiện đủ bàn', (await tableNames(page)).join(', '));
}

// ---------------------------------------------------------------------------
// t3 — the guide card must not float off-screen or cover the primary action
// ---------------------------------------------------------------------------
currentFlow = 't3-guide-overlay';
console.log('t3 — Thẻ hướng dẫn và nút chính');
{
  await context.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
  await signIn(page);
  await page.goto(`${BASE}/dashboard/tables`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const geometry = await guideGeometry(page);
  if (!check(geometry.found, 'Thấy thẻ hướng dẫn và nút "Thêm Bàn"')) {
    // nothing more to measure
  } else {
    check(
      geometry.insideViewport,
      'Thẻ hướng dẫn nằm trong khung nhìn',
      JSON.stringify(geometry.rect),
    );
    check(
      geometry.anchoredBottomRight,
      'Thẻ neo đúng góc dưới phải',
      `cách đáy ${DESKTOP.height - (geometry.rect.top + geometry.rect.height)}px`,
    );
    check(
      geometry.overlapWithPrimary === 0,
      'Thẻ không che nút "Thêm Bàn"',
      `diện tích chồng ${geometry.overlapWithPrimary} px²`,
    );
    check(
      geometry.primaryClickableByHitTest,
      'Nút "Thêm Bàn" nhận được click (hit test)',
      geometry.primaryClickableByHitTest ? 'điểm giữa nút thuộc nút' : 'bị phần tử khác chặn',
    );
  }
  await shot(page, 't3-guide-overlay');
}

// ---------------------------------------------------------------------------
// t4 — accessible names and touch targets on the cards
// ---------------------------------------------------------------------------
currentFlow = 't4-a11y';
console.log('t4 — Tên nút và vùng bấm');
{
  await dismissGuide(page);
  await page.waitForTimeout(800);
  const a11y = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('main button, main a')];
    const iconOnly = controls.filter(
      (el) => !(el.textContent ?? '').trim() && el.querySelector('svg'),
    );
    return {
      iconOnly: iconOnly.length,
      unnamed: iconOnly.filter(
        (el) =>
          !(el.getAttribute('aria-label') ?? '').trim() &&
          !(el.getAttribute('title') ?? '').trim(),
      ).length,
      small: controls
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            label: (el.textContent ?? '').trim().slice(0, 20) || '(icon)',
            h: Math.round(r.height),
          };
        })
        .filter((item) => item.h > 0 && item.h < 44),
    };
  });
  check(a11y.unnamed === 0, 'Mọi nút chỉ-icon đều có tên', `${a11y.iconOnly} nút chỉ-icon`);
  check(
    a11y.small.length === 0,
    'Vùng bấm đạt tối thiểu 44px',
    a11y.small.length ? JSON.stringify(a11y.small) : 'tất cả đạt',
  );
  await shot(page, 't4-a11y');
}

// ---------------------------------------------------------------------------
// t5 — the list is a live listener, so commands must show up without a reload
// ---------------------------------------------------------------------------
currentFlow = 't5-crud-loop';
console.log('t5 — Thêm / đổi tên / lưu trữ bàn không cần tải lại');
{
  const stamp = Date.now().toString().slice(-6);
  const created = `[QA] Bàn ${stamp}`;
  const renamed = `[QA] Bàn ${stamp} đổi tên`;

  await page.getByRole('button', { name: /^Thêm Bàn$/i }).first().click();
  await page.waitForTimeout(600);
  await page.locator('#table-name').fill(created);
  await page.locator('#table-area').fill('Khu kiểm thử');
  await page.locator('#table-seats').fill('4');
  await page.getByRole('button', { name: /^Lưu$/i }).first().click();

  const appeared = await eventually(
    page,
    async () => (await tableNames(page)).includes(created),
    20000,
  );
  check(appeared, 'Bàn mới xuất hiện trên sơ đồ (không tải lại)', created);

  if (appeared) {
    const createdDoc = (
      await db
        .collection(`tenants/${TENANT_ID}/tables`)
        .where('name', '==', created)
        .get()
    ).docs[0];
    check(
      createdDoc?.get('area') === 'Khu kiểm thử' && createdDoc?.get('seats') === 4,
      'Khu vực và số ghế được lưu cùng lệnh tạo bàn',
      `area=${createdDoc?.get('area')}, seats=${createdDoc?.get('seats')}`,
    );
    check(
      createdDoc?.get('position') != null,
      'Bàn mới có vị trí trên lưới ngay từ đầu',
      JSON.stringify(createdDoc?.get('position') ?? null),
    );

    await page
      .locator(`[data-testid="table-plan-canvas"] button[aria-label^="${created}"]`)
      .first()
      .click();
    await page.waitForTimeout(400);
    await page
      .getByRole('button', { name: /^Sửa tên, khu vực, số ghế$/i })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page.locator('#table-name').fill(renamed);
    await page.locator('#table-seats').fill('6');
    await page.getByRole('button', { name: /^Lưu$/i }).first().click();

    const renamedOk = await eventually(
      page,
      async () => (await tableNames(page)).includes(renamed),
      20000,
    );
    check(renamedOk, 'Đổi tên cập nhật ngay trên sơ đồ', renamed);

    const seatsSaved = await eventually(
      page,
      async () =>
        (
          await db
            .collection(`tenants/${TENANT_ID}/tables`)
            .where('name', '==', renamed)
            .get()
        ).docs[0]?.get('seats') === 6,
      20000,
    );
    check(seatsSaved, 'Số ghế sửa được ghi xuống Firestore', '6 ghế');

    if (renamedOk) {
      await showListView(page);
      await page
        .getByRole('button', { name: `Lưu trữ ${renamed}` })
        .first()
        .click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /^Lưu trữ$/i }).last().click();

      const archived = await eventually(
        page,
        async () => !(await tableNames(page)).includes(renamed),
        20000,
      );
      check(archived, 'Bàn đã lưu trữ biến mất khỏi sơ đồ', renamed);

      const remaining = await db
        .collection(`tenants/${TENANT_ID}/tables`)
        .where('name', '==', renamed)
        .get();
      check(
        remaining.docs.every((doc) => doc.get('archivedAt') != null),
        'Firestore ghi archivedAt cho bàn kiểm thử',
        `${remaining.size} bản ghi`,
      );
      await showPlanView(page);
    }
  }
  await shot(page, 't5-crud-loop');
}

// ---------------------------------------------------------------------------
// t6 — drag a table to another cell and prove the server stored the cell
// ---------------------------------------------------------------------------
currentFlow = 't6-drag-position';
console.log('t6 — Kéo bàn trên sơ đồ và lưu vị trí');
{
  await showPlanView(page);
  const anchor = await db
    .collection(`tenants/${TENANT_ID}/tables`)
    .where('archivedAt', '==', null)
    .get();
  const target = anchor.docs[0];
  const name = String(target?.get('name') ?? '');
  const before = target?.get('position') ?? { x: 0, y: 0 };

  const canvas = page.locator('[data-testid="table-plan-canvas"] > div');
  const tile = page
    .locator(`[data-testid="table-plan-canvas"] button[aria-label^="${name}"]`)
    .first();
  const tileBox = await tile.boundingBox();
  const canvasBox = await canvas.boundingBox();

  if (!tileBox || !canvasBox) {
    check(false, 'Đo được ô bàn và lưới để kéo', 'không thấy phần tử');
  } else {
    const cellWidth = canvasBox.width / 8;
    const cellHeight = canvasBox.height / 6;
    const stepX = Math.min(cellWidth, 96);
    const stepY = Math.min(cellHeight, 78);
    await page.mouse.move(
      tileBox.x + tileBox.width / 2,
      tileBox.y + tileBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      tileBox.x + tileBox.width / 2 + stepX,
      tileBox.y + tileBox.height / 2 + stepY,
      { steps: 12 },
    );
    await page.mouse.up();

    const moved = await eventually(
      page,
      async () => {
        const snap = await db
          .collection(`tenants/${TENANT_ID}/tables`)
          .doc(target.id)
          .get();
        const position = snap.get('position');
        return (
          position &&
          (position.x !== before.x || position.y !== before.y)
        );
      },
      20000,
    );
    const after = (
      await db.collection(`tenants/${TENANT_ID}/tables`).doc(target.id).get()
    ).get('position');
    check(
      moved,
      'Kéo bàn ghi vị trí mới xuống Firestore',
      `${JSON.stringify(before)} → ${JSON.stringify(after)}`,
    );
    check(
      after && after.x >= 0 && after.x < 12 && after.y >= 0 && after.y < 10,
      'Vị trí lưu nằm trong lưới 12×10',
      JSON.stringify(after),
    );

    // Keyboard move must work too, otherwise the plan is drag-only.
    await tile.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowLeft');
    const keyboardMoved = await eventually(
      page,
      async () => {
        const snap = await db
          .collection(`tenants/${TENANT_ID}/tables`)
          .doc(target.id)
          .get();
        const position = snap.get('position');
        return position && after && position.x === after.x - 1;
      },
      15000,
    );
    check(
      keyboardMoved,
      'Phím mũi tên dịch bàn được (không chỉ kéo chuột)',
      `${JSON.stringify(after)} → x-1`,
    );
    await shot(page, 't6-drag-position');
  }
}

// ---------------------------------------------------------------------------
// t7 — area filter, view toggle, and the live-status projection
// ---------------------------------------------------------------------------
currentFlow = 't7-plan-tools';
console.log('t7 — Lọc khu vực, đổi chế độ xem, trạng thái bàn');
{
  await showPlanView(page);
  const tiles = await page
    .locator('[data-testid="table-plan-canvas"] button[aria-label]')
    .count();
  check(tiles > 0, 'Sơ đồ vẽ được ô bàn', `${tiles} ô`);

  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="table-plan-canvas"] button[aria-label]')].map(
      (tile) => tile.getAttribute('aria-label') ?? '',
    ),
  );
  check(
    labels.every((label) => /Trống|Có khách|Món sẵn sàng|Chờ thanh toán/.test(label)),
    'Mỗi ô bàn in ra trạng thái phục vụ bằng chữ',
    labels[0] ?? '(không có ô)',
  );

  const summary = await page.evaluate(() =>
    [...document.querySelectorAll('main p')]
      .map((node) => node.textContent ?? '')
      .filter((text) => /^(Tổng số bàn|Trống|Có khách|Món sẵn sàng|Chờ thanh toán)$/.test(text.trim()))
      .length,
  );
  check(summary === 5, 'Dải tổng quan có đủ 5 chỉ số', `${summary} chỉ số`);

  await page.getByRole('button', { name: /^Danh sách$/i }).first().click();
  await page.waitForTimeout(700);
  const listHeadings = await page.locator('main h2, main h3').count();
  check(listHeadings > 0, 'Chế độ Danh sách nhóm bàn theo khu vực', `${listHeadings} tiêu đề`);
  await shot(page, 't7-list-view');

  await page.getByRole('button', { name: /^Sơ đồ$/i }).first().click();
  await page.waitForTimeout(700);
  const backToPlan = await page
    .locator('[data-testid="table-plan-canvas"]')
    .count();
  check(backToPlan === 1, 'Quay lại được chế độ Sơ đồ');
}

check(consoleErrors.length === 0, 'Không có lỗi console', consoleErrors.slice(0, 3).join(' | '));

// ---------------------------------------------------------------------------
// Cleanup: archive every leftover fixture this harness may have created
// ---------------------------------------------------------------------------
{
  const leftovers = await db
    .collection(`tenants/${TENANT_ID}/tables`)
    .get();
  const stale = leftovers.docs.filter(
    (doc) => String(doc.get('name') ?? '').startsWith('[QA]') && doc.get('archivedAt') == null,
  );
  for (const doc of stale) {
    await doc.ref.update({ archivedAt: new Date().toISOString(), isActive: false });
  }
  if (stale.length) {
    console.log(`   · Đã lưu trữ ${stale.length} bàn kiểm thử còn sót`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const passed = findings.filter((f) => f.kind === 'pass').length;
const failed = findings.filter((f) => f.kind === 'fail').length;
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  tenantId: TENANT_ID,
  expectedNames,
  passed,
  failed,
  screenshots,
  consoleErrors,
  findings,
};
await mkdir(OUT, { recursive: true });
const reportPath = path.join(OUT, 'tables-page-verification-report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`\n${passed}/${passed + failed} phép kiểm đạt.`);
console.log(`Báo cáo: ${path.relative(process.cwd(), reportPath)}`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);

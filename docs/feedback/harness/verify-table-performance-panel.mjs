/**
 * Table-performance panel UI verification — REQ-RPT-001, DR-001g.
 *
 * The Overview page must show the per-table stats that the reporting summary
 * already returned but never displayed. Expected rows are read from the real
 * Firestore through the admin SDK, so the browser assertions are compared
 * against the database rather than against themselves.
 *
 * Read-only: this script never writes to Firestore. The only local change is
 * the cached interface locale in the browser profile it creates.
 *
 * Usage:
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-table-performance-panel.mjs [--headed]
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

const HEADED = process.argv.slice(2).includes('--headed');
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
const READ_LIMIT = 50;

const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };

const findings = [];
const screenshots = [];
const consoleErrors = [];
let currentFlow = 'setup';
let monthExpectedCount = 0;

const check = (ok, label, detail) => {
  findings.push({ flow: currentFlow, kind: ok ? 'pass' : 'fail', label, detail });
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

async function shot(page, name) {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `table-performance-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  screenshots.push(path.relative(process.cwd(), file));
}

async function eventually(page, predicate, timeout = 20000, step = 400) {
  const started = Date.now();
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() - started > timeout) return false;
    await page.waitForTimeout(step);
  }
}

/** Tenant-local yyyymmdd, the key dailyStats is written under. */
function dayKeyIn(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('-', '');
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  const ok = await eventually(
    page,
    async () => !page.url().includes('/login'),
    25000,
  );
  if (!ok) throw new Error(`Đăng nhập thất bại, vẫn ở ${page.url()}`);
}

/** Read the panel out of the DOM: its heading, note, and body rows. */
async function readPanel(page) {
  return page.evaluate(() => {
    const section = document.querySelector(
      'section[aria-labelledby="table-performance-title"]',
    );
    if (!section) return null;
    const heading = section.querySelector('#table-performance-title');
    const headers = [...section.querySelectorAll('thead th')].map((th) =>
      th.textContent.trim(),
    );
    const rows = [...section.querySelectorAll('tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((td) =>
        td.textContent.trim(),
      );
      return {
        name: cells[0],
        orders: cells[1],
        revenue: cells[2],
        profit: cells[3],
      };
    });
    return {
      heading: heading?.textContent.trim() ?? null,
      note: section.querySelector('span')?.textContent.trim() ?? null,
      emptyText: rows.length
        ? null
        : (section.querySelector('p')?.textContent.trim() ?? null),
      truncated: [...section.querySelectorAll('p')].some((p) =>
        p.textContent.includes('50 bàn này'),
      ),
      headers,
      rows,
      // A panel wider than its own scroll box is the mobile failure mode.
      overflows: section.scrollWidth > section.clientWidth + 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Expected data straight from Firestore
// ---------------------------------------------------------------------------
initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();

const tenantSnap = await db.collection('tenants').doc(TENANT_ID).get();
const tenant = tenantSnap.data() ?? {};
const timeZone =
  tenant.timezone ?? tenant.config?.timezone ?? 'Asia/Ho_Chi_Minh';
const dayKey = dayKeyIn(timeZone);

const tablesSnap = await db
  .collection('tenants')
  .doc(TENANT_ID)
  .collection('dailyStats')
  .doc(dayKey)
  .collection('tables')
  .get();

const byTable = new Map();
for (const doc of tablesSnap.docs) {
  const data = doc.data();
  const existing = byTable.get(data.tableId) ?? {
    tableName: data.tableName,
    paidOrderCount: 0,
    revenueVnd: 0,
  };
  existing.paidOrderCount += data.paidOrderCount ?? 0;
  existing.revenueVnd += data.revenueVnd ?? 0;
  byTable.set(data.tableId, existing);
}
const expected = [...byTable.values()]
  .sort((a, b) => b.revenueVnd - a.revenueVnd)
  .slice(0, READ_LIMIT);

console.log(`Tenant ${TENANT_ID} · múi giờ ${timeZone} · ngày ${dayKey}`);
console.log(
  `Firestore có ${expected.length} bàn có doanh thu trong ngày này.\n`,
);

const formatVnd = (vnd) => `${Math.trunc(vnd).toLocaleString('vi-VN')}đ`;

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ headless: !HEADED });
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
  if (url.startsWith('ws://') || url.includes('/@vite/')) return;
  consoleErrors.push(
    `requestfailed: ${url.slice(0, 160)} ${request.failure()?.errorText ?? ''}`,
  );
});

try {
  await signIn(page);

  // The panel resolves the locale from the cached choice, then the browser
  // language (REQ-I18N-001). Headless Chromium reports en-US, so pin the
  // Vietnamese assertions to a cached vi and switch later for the English check.
  await page.evaluate(() =>
    window.localStorage.setItem('scango.locale', 'vi'),
  );

  // -------------------------------------------------------------------------
  currentFlow = 't1-panel-present';
  console.log('t1 — Khối "Hiệu suất theo bàn" có mặt trên trang tổng quan');
  {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    const panel = await eventually(
      page,
      async () => (await readPanel(page)) !== null,
      25000,
    );
    check(panel, 'Khối hiện diện theo aria-labelledby');
    await shot(page, 'desktop');
  }

  // -------------------------------------------------------------------------
  currentFlow = 't2-matches-firestore';
  console.log('t2 — Số liệu trên màn hình khớp dailyStats trong Firestore');
  {
    const panel = await readPanel(page);
    if (!panel) {
      check(false, 'Đọc được khối để so số liệu');
    } else if (expected.length === 0) {
      const ok = check(
        panel.rows.length === 0 && panel.emptyText !== null,
        'Không có bàn nào trong ngày → hiện trạng thái trống',
        panel.emptyText ?? '(không có thông báo trống)',
      );
      check(ok, 'Trạng thái trống đúng khi Firestore rỗng');
    } else {
      check(
        panel.rows.length === expected.length,
        'Số dòng khớp số bàn trong Firestore',
        `màn hình ${panel.rows.length} · Firestore ${expected.length}`,
      );
      const mismatches = expected
        .map((want, i) => ({ want, got: panel.rows[i] }))
        .filter(
          ({ want, got }) =>
            !got ||
            got.name !== want.tableName ||
            got.orders !== String(want.paidOrderCount) ||
            got.revenue !== formatVnd(want.revenueVnd),
        );
      check(
        mismatches.length === 0,
        'Tên bàn, số đơn và doanh thu từng dòng khớp Firestore',
        mismatches.length
          ? JSON.stringify(mismatches.slice(0, 3))
          : `${expected.length} dòng khớp`,
      );
      check(
        panel.headers.length === 4,
        'Bảng có 4 cột tiêu đề',
        panel.headers.join(' | '),
      );
    }
  }

  // -------------------------------------------------------------------------
  // The QA tenant has table stats on one day of the current month and none
  // today, so the month period is the one that exercises the non-empty path
  // with real data.
  currentFlow = 't2b-month-has-rows';
  console.log('t2b — Kỳ "Tháng" hiện đúng số bàn mà Firestore có trong tháng');
  {
    const [year, month] = [dayKey.slice(0, 4), dayKey.slice(4, 6)];
    const lastDay = new Date(
      Date.UTC(Number(year), Number(month), 0),
    ).getUTCDate();
    const monthDays = Array.from(
      { length: lastDay },
      (_, i) => `${year}${month}${String(i + 1).padStart(2, '0')}`,
    );

    const monthByTable = new Map();
    for (const key of monthDays) {
      const snap = await db
        .collection('tenants')
        .doc(TENANT_ID)
        .collection('dailyStats')
        .doc(key)
        .collection('tables')
        .get();
      for (const doc of snap.docs) {
        const data = doc.data();
        const existing = monthByTable.get(data.tableId) ?? {
          tableName: data.tableName,
          paidOrderCount: 0,
          revenueVnd: 0,
        };
        existing.paidOrderCount += data.paidOrderCount ?? 0;
        existing.revenueVnd += data.revenueVnd ?? 0;
        monthByTable.set(data.tableId, existing);
      }
    }
    const monthExpected = [...monthByTable.values()]
      .sort((a, b) => b.revenueVnd - a.revenueVnd)
      .slice(0, READ_LIMIT);
    monthExpectedCount = monthExpected.length;

    await page.getByRole('button', { name: 'Tháng' }).first().click();
    const settled = await eventually(
      page,
      async () => {
        const panel = await readPanel(page);
        if (!panel) return false;
        if (monthExpected.length === 0) return panel.rows.length === 0;
        return panel.rows.length === monthExpected.length;
      },
      20000,
    );
    const panel = await readPanel(page);
    check(
      settled,
      'Số dòng của kỳ Tháng khớp Firestore',
      `màn hình ${panel?.rows.length ?? '?'} · Firestore ${monthExpected.length}`,
    );
    const monthMismatches = monthExpected
      .map((want, i) => ({ want, got: panel?.rows[i] }))
      .filter(
        ({ want, got }) =>
          !got ||
          got.name !== want.tableName ||
          got.orders !== String(want.paidOrderCount) ||
          got.revenue !== formatVnd(want.revenueVnd),
      );
    check(
      monthMismatches.length === 0 && monthExpected.length > 0,
      'Tên bàn và số liệu từng dòng của kỳ Tháng khớp Firestore',
      monthMismatches.length
        ? JSON.stringify(monthMismatches.slice(0, 3))
        : `${monthExpected.length} dòng khớp`,
    );
    await shot(page, 'month');
    await page.getByRole('button', { name: 'Hôm nay' }).first().click();
    await page.waitForTimeout(500);
  }

  // -------------------------------------------------------------------------
  currentFlow = 't3-ordering-note';
  console.log('t3 — Ghi rõ thứ tự và giới hạn đọc');
  {
    const panel = await readPanel(page);
    check(
      panel?.note === 'Xếp theo doanh thu · tối đa 50 bàn',
      'Nhãn thứ tự và giới hạn hiện đúng',
      panel?.note ?? '(không có)',
    );
    if (expected.length >= READ_LIMIT) {
      check(panel.truncated, 'Chạm trần 50 → có nhãn "có thể còn bàn khác"');
    }
  }

  // -------------------------------------------------------------------------
  currentFlow = 't4-narrow';
  console.log('t4 — Màn hình hẹp 390px');
  {
    await page.setViewportSize(NARROW);
    await page.waitForTimeout(600);
    const panel = await readPanel(page);
    check(panel !== null, 'Khối vẫn hiện ở 390px');
    check(
      panel !== null && !panel.overflows,
      'Khối không tràn ngang ở 390px',
      panel?.overflows ? 'scrollWidth > clientWidth' : 'không tràn',
    );
    await shot(page, 'narrow-390');
    await page.setViewportSize(DESKTOP);
  }

  // -------------------------------------------------------------------------
  currentFlow = 't5-english';
  console.log('t5 — Nhãn tiếng Anh khi locale là en');
  {
    await page.evaluate(() =>
      window.localStorage.setItem('scango.locale', 'en'),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const english = await eventually(
      page,
      async () => (await readPanel(page))?.heading === 'Performance by table',
      20000,
    );
    const panel = await readPanel(page);
    check(english, 'Tiêu đề đổi sang tiếng Anh', panel?.heading ?? '(không đổi)');

    // The reload resets the period to today, which has no rows here, so the
    // column headers only exist once a period with data is selected. The period
    // buttons are still hardcoded Vietnamese (IMP-11), hence the vi label even
    // in the English run.
    await page.getByRole('button', { name: 'Tháng' }).first().click();
    const withRows = await eventually(
      page,
      async () => ((await readPanel(page))?.headers.length ?? 0) === 4,
      20000,
    );
    const englishPanel = await readPanel(page);
    check(
      withRows &&
        englishPanel?.headers.join(' | ') ===
          'Table | Paid orders | Revenue | Gross profit',
      'Tiêu đề cột đổi sang tiếng Anh',
      englishPanel?.headers.join(' | ') || '(không có cột)',
    );
    await shot(page, 'english');

    // Back to a period with no rows to read the English empty state.
    await page.getByRole('button', { name: 'Hôm nay' }).first().click();
    const emptyInEnglish = await eventually(
      page,
      async () =>
        (await readPanel(page))?.emptyText ===
        'No table has a paid order in this period.',
      20000,
    );
    check(
      emptyInEnglish,
      'Trạng thái trống cũng đổi sang tiếng Anh',
      (await readPanel(page))?.emptyText ?? '(không có)',
    );
    await page.evaluate(() => window.localStorage.clear());
  }

  // -------------------------------------------------------------------------
  currentFlow = 't6-console';
  console.log('t6 — Không có lỗi console');
  {
    const noise = consoleErrors.filter(
      (line) =>
        !line.includes('favicon') &&
        !line.includes('App Check') &&
        !line.includes('permission-denied'),
    );
    check(
      noise.length === 0,
      'Không có lỗi console ngoài nhiễu đã biết',
      noise.slice(0, 2).join(' | ') || 'sạch',
    );
  }
} catch (error) {
  check(false, 'Harness chạy trọn', String(error).slice(0, 300));
} finally {
  const passed = findings.filter((f) => f.kind === 'pass').length;
  const failed = findings.filter((f) => f.kind === 'fail').length;
  await mkdir(OUT, { recursive: true });
  const reportPath = path.join(OUT, 'table-performance-verification-report.json');
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base: BASE,
        tenantId: TENANT_ID,
        timeZone,
        dayKey,
        expectedTableCountForDay: expected.length,
        expectedTableCountForMonth: monthExpectedCount,
        passed,
        failed,
        screenshots,
        consoleErrors,
        findings,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`\n${passed}/${passed + failed} phép kiểm đạt.`);
  console.log(`Báo cáo: ${path.relative(process.cwd(), reportPath)}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

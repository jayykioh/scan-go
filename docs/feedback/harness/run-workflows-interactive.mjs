/**
 * ScanGo interactive workflow harness (feedback evidence).
 *
 * Drives the real user journeys end to end and captures a screenshot after
 * every meaningful action, so the review can point at what actually happened:
 *
 *   W1  Customer self-order on the QR menu (public link, real Firestore)
 *   W2  Kitchen KDS: PIN sign-in and order advancement
 *   W3  Cashier: PIN sign-in and settlement
 *   W4  Owner: create a table, copy the QR link, place an order through it
 *   W5  Owner: create a menu item
 *   W6  Owner: sign out and sign back in
 *
 * Usage:
 *   node docs/feedback/harness/run-workflows-interactive.mjs [--only=w1,w4] [--headed]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PLAYWRIGHT_CORE =
  process.env.PLAYWRIGHT_CORE ??
  '/home/duckneo/.local/share/mise/installs/node/22.23.2/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs';

const { chromium } = await import(PLAYWRIGHT_CORE);

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, d) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const BASE = process.env.SCANGO_BASE_URL ?? 'http://127.0.0.1:3000';
const OUT = path.resolve(process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts');
const ONLY = value('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const HEADED = flag('headed');
const PASSWORD = 'ScanGo-QA-2026!';

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const log = [];
const record = (flow, label, detail) => {
  log.push({ flow, label, detail, at: new Date().toISOString() });
  console.log(`   · ${label}${detail ? ` — ${detail}` : ''}`);
};

async function ownerCredentials() {
  if (process.env.SCANGO_OWNER_EMAIL) {
    return { email: process.env.SCANGO_OWNER_EMAIL, password: PASSWORD };
  }
  try {
    const raw = await readFile(path.join(OUT, 'workflow-report.json'), 'utf8');
    const report = JSON.parse(raw);
    return { email: report.ownerAccount, password: PASSWORD };
  } catch {
    return null;
  }
}

/**
 * Wait until the app is past its fixed two-second splash and the route has
 * rendered real content. This is also the measurement that proves the splash
 * delays every first paint (see the review report).
 */
async function waitForApp(page) {
  const started = Date.now();
  await page.waitForSelector('main', { state: 'visible', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
  return Date.now() - started;
}

/** Dismiss the first-run guide modal when it is covering the page. */
async function dismissGuide(page) {
  const button = page.getByRole('button', { name: /Đã hiểu/i });
  await button
    .first()
    .waitFor({ state: 'visible', timeout: 3000 })
    .catch(() => {});
  if (await button.count()) {
    await button.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 20000 });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  // Wait for the dashboard shell, not just the URL: the app still shows its
  // two-second splash after the route changes.
  await page
    .getByRole('button', { name: /THOÁT|Thoát|Đăng xuất/i })
    .first()
    .waitFor({ state: 'visible', timeout: 25000 })
    .catch(() => {});
}

const flows = [];
const flow = (id, name, viewport, run) => flows.push({ id, name, viewport, run });

// ---------------------------------------------------------------------------
flow('w1-customer-order', 'Khách tự gọi món qua QR (simulator)', MOBILE, async (ctx) => {
  const { page } = ctx;
  await page.goto(`${BASE}/simulator/customer`, { waitUntil: 'domcontentloaded' });
  await ctx.app();
  await ctx.shot('menu-table-list');
  await page.getByRole('button', { name: /Bàn 01/ }).click();
  await page.waitForTimeout(1500);
  await ctx.shot('after-open-menu');

  const dish = page.locator('main button').filter({ hasText: /₫|đ/ }).first();
  if (await dish.count()) {
    await dish.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await ctx.shot('after-pick-dish');
  }
  await page.getByRole('button', { name: /Thêm vào giỏ/ }).first().click({ timeout: 8000 }).catch(() => record('w1', 'add-to-cart click failed', ''));
  await page.waitForTimeout(1200);
  await ctx.shot('cart-bar');

  await page.locator('main button').filter({ hasText: /món/ }).last().click({ timeout: 8000 }).catch(() => record('w1', 'cart bar click failed', ''));
  await page.waitForTimeout(1200);
  await ctx.shot('cart-sheet');
  await page.getByRole('button', { name: /^Gửi đơn$/ }).first().click({ timeout: 8000 }).catch(() => record('w1', 'submit click failed', ''));
  await page.waitForTimeout(2500);
  await ctx.shot('after-submit');
  record('w1', 'after submit', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240));
});

// ---------------------------------------------------------------------------
flow('w2-kitchen', 'Bếp (KDS): đăng nhập PIN và chuyển trạng thái đơn', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await page.goto(`${BASE}/simulator/kitchen`, { waitUntil: 'domcontentloaded' });
  await ctx.app();
  await dismissGuide(page);
  await ctx.shot('pin-screen');
  const pin = page.getByRole('textbox').first();
  for (const candidate of ['1111', '2222', '3333']) {
    await pin.fill(candidate);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await page.waitForTimeout(1500);
    const stillPin = await page.getByRole('textbox').count();
    const error = await page.locator('[role="alert"]').first().innerText().catch(() => '');
    record('w2', `PIN ${candidate}`, stillPin ? `rejected: ${error}` : 'accepted');
    if (!stillPin) break;
  }
  await ctx.shot('kds-after-login');
  await page.getByRole('button', { name: /Đơn ảo/ }).first().click({ timeout: 8000 }).catch(() => record('w2', 'fake order click failed', ''));
  await page.waitForTimeout(2000);
  await ctx.shot('kds-after-fake-order');
  const advance = page.getByRole('button', { name: /Bắt đầu nấu|Chờ xử lý|Đang nấu|Sẵn sàng|Hoàn tất|Xong/i }).first();
  if (await advance.count()) {
    await advance.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await ctx.shot('kds-after-advance');
  }
  record('w2', 'kds text', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240));
});

// ---------------------------------------------------------------------------
flow('w3-cashier', 'Thu ngân: đăng nhập PIN và thanh toán', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await page.goto(`${BASE}/simulator/cashier`, { waitUntil: 'domcontentloaded' });
  await ctx.app();
  await dismissGuide(page);
  await ctx.shot('pin-screen');
  const pin = page.getByRole('textbox').first();
  await pin.fill('1234');
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await page.waitForTimeout(1800);
  await ctx.shot('cashier-after-login');
  await page.getByRole('button', { name: /Đơn ảo/ }).first().click({ timeout: 8000 }).catch(() => record('w3', 'fake order click failed', ''));
  await page.waitForTimeout(2000);
  await ctx.shot('cashier-after-fake-order');
  const settle = page.getByRole('button', { name: /Tiền mặt|VietQR|Thanh toán|Thu tiền/i }).first();
  if (await settle.count()) {
    await settle.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await ctx.shot('cashier-after-settle');
  } else {
    record('w3', 'no order to settle', 'cashier screen has no unsettled order');
  }
  record('w3', 'cashier text', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240));
});

// ---------------------------------------------------------------------------
flow('w4-owner-end-to-end', 'Owner: tạo bàn → copy link QR → khách đặt món qua link thật', DESKTOP, async (ctx) => {
  const creds = await ownerCredentials();
  if (!creds?.email) throw new Error('Không có tài khoản Owner trong workflow-report.json');
  const { page, browser } = ctx;
  await signIn(page, creds.email);
  await ctx.app();
  await dismissGuide(page);
  await page.goto(`${BASE}/dashboard/tables`, { waitUntil: 'domcontentloaded' });
  await ctx.app();
  await dismissGuide(page);
  await ctx.shot('tables-empty');

  // Create a table through the real callable.
  await page.getByRole('button', { name: /Thêm Bàn/i }).first().click({ timeout: 8000 }).catch(() => record('w4', 'add-table click failed', ''));
  await page.waitForTimeout(1200);
  await page.locator('input[type="text"]').first().fill('Bàn QA 01').catch(() => {});
  await ctx.shot('tables-create-form');
  await page.getByRole('button', { name: /^Lưu$/ }).first().click({ timeout: 8000 }).catch(() => record('w4', 'save-table click failed', ''));
  await page.waitForTimeout(2500);
  await ctx.shot('tables-after-create');
  const body = await page.locator('body').innerText();
  record('w4', 'tables page text', body.replace(/\s+/g, ' ').slice(0, 300));

  // Read the public menu link from the page.
  const link = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, code, span, a')];
    const hit = inputs.map((el) => el.value || el.textContent || '').find((t) => /\/menu\//.test(t));
    return hit ? hit.match(/\/menu\/[^\s"']+/)?.[0] ?? null : null;
  });
  record('w4', 'public menu link', link ?? 'không tìm thấy link /menu/ trên trang');
  if (!link) {
    // Fall back to the "Mở menu" action on the table card.
    const openMenu = page.getByRole('link', { name: /Mở menu/i }).first();
    if (await openMenu.count()) {
      const href = await openMenu.getAttribute('href');
      record('w4', 'fallback open-menu href', href ?? 'none');
    }
    return;
  }

  // Open the public menu as the customer and order.
  const customer = await browser.newContext({ viewport: MOBILE, locale: 'vi-VN' });
  const cpage = await customer.newPage();
  const errors = [];
  cpage.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  cpage.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  await cpage.goto(`${BASE}${link}`, { waitUntil: 'domcontentloaded' });
  await cpage.waitForTimeout(3000);
  await cpage.screenshot({ path: path.join(OUT, 'w4-public-menu.png'), fullPage: true });
  record('w4', 'public menu opened', (await cpage.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 260));

  const addDish = cpage.locator('button').filter({ hasText: /Thêm|Chọn|₫/ }).first();
  await addDish.click({ timeout: 8000 }).catch(() => record('w4', 'add dish click failed', ''));
  await cpage.waitForTimeout(1500);
  await cpage.screenshot({ path: path.join(OUT, 'w4-public-menu-after-add.png'), fullPage: true });
  record('w4', 'customer page errors', errors.join(' | ').slice(0, 400) || 'none');
  await customer.close();
});

// ---------------------------------------------------------------------------
flow('w7-public-order-real', 'Khách đặt món qua link QR thật (/menu/<token>)', DESKTOP, async (ctx) => {
  const creds = await ownerCredentials();
  const { page, browser } = ctx;
  await signIn(page, creds.email);
  await ctx.app();
  await dismissGuide(page);
  // Reach the tables page through in-app navigation, because a hard reload
  // leaves the Table listener empty (see the review report, BUG-01).
  await page.getByRole('link', { name: /SƠ ĐỒ BÀN|Sơ đồ bàn/i }).first().click();
  await ctx.app();
  await dismissGuide(page);
  await ctx.shot('tables-list');

  const token = await page.evaluate(() => {
    const code = [...document.querySelectorAll('code')]
      .map((el) => el.textContent ?? '')
      .find((t) => /\/menu\//.test(t));
    return code ? code.match(/\/menu\/([^\s]+)/)?.[1] ?? null : null;
  });
  record('w7', 'table token', token ? `${token.slice(0, 12)}…` : 'không đọc được token');
  if (!token) return;

  const customer = await browser.newContext({ viewport: MOBILE, locale: 'vi-VN' });
  const cpage = await customer.newPage();
  const errors = [];
  cpage.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  cpage.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  const cshot = async (label) => {
    await cpage.screenshot({ path: path.join(OUT, `w7-public-${label}.png`), fullPage: true }).catch(() => {});
  };

  await cpage.goto(`${BASE}/menu/${token}`, { waitUntil: 'domcontentloaded' });
  await cpage.waitForTimeout(3500);
  await cshot('01-menu');
  record('w7', 'public menu', (await cpage.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200));

  const dish = cpage.locator('main button').filter({ hasText: /₫|đ/ }).first();
  await dish.click({ timeout: 8000 }).catch(() => record('w7', 'dish click failed', ''));
  await cpage.waitForTimeout(1500);
  await cshot('02-item-sheet');
  await cpage.getByRole('button', { name: /Thêm vào giỏ/ }).first().click({ timeout: 8000 }).catch(() => record('w7', 'add-to-cart failed', ''));
  await cpage.waitForTimeout(1200);
  await cpage.locator('main button').filter({ hasText: /món/ }).last().click({ timeout: 8000 }).catch(() => record('w7', 'cart click failed', ''));
  await cpage.waitForTimeout(1200);
  await cshot('03-cart');
  await cpage.getByRole('button', { name: /^Gửi đơn$/ }).first().click({ timeout: 8000 }).catch(() => record('w7', 'submit failed', ''));
  await cpage.waitForTimeout(4000);
  await cshot('04-after-submit');
  record('w7', 'after submit', (await cpage.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300));
  record('w7', 'customer errors', errors.join(' | ').slice(0, 400) || 'none');
  await customer.close();

  // Verify the Order landed on the Owner side.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await ctx.app();
  await ctx.shot('owner-after-order');
  record('w7', 'owner overview', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(120, 460));
});

// ---------------------------------------------------------------------------
flow('w5-owner-create-menu-item', 'Owner: thêm món vào thực đơn', DESKTOP, async (ctx) => {
  const creds = await ownerCredentials();
  const { page } = ctx;
  await signIn(page, creds.email);
  await ctx.app();
  await dismissGuide(page);
  await page.goto(`${BASE}/dashboard/menu`, { waitUntil: 'domcontentloaded' });
  await ctx.app();
  await dismissGuide(page);
  await ctx.shot('menu-empty');
  const add = page.getByRole('button', { name: /Thêm Món/i }).first();
  if (await add.count()) {
    await add.click({ timeout: 8000 }).catch(() => record('w5', 'open form failed', ''));
    await page.waitForTimeout(1200);
    await ctx.shot('menu-create-form');
    await page.getByPlaceholder(/Phở bò|Tên món|Vd:/).first().fill('Trà đá QA').catch(async () => {
      await page.locator('form input[type="text"]').first().fill('Trà đá QA').catch(() => {});
    });
    const price = page.locator('form input[type="number"]').first();
    await price.fill('10000').catch(() => {});
    await page.waitForTimeout(400);
    await ctx.shot('menu-create-filled');
    await page.getByRole('button', { name: /^Lưu|Lưu món|Tạo món/i }).first().click({ timeout: 8000 }).catch(() => record('w5', 'save failed', ''));
    await page.waitForTimeout(3000);
    await ctx.shot('menu-after-save');
    record('w5', 'after save', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 260));
  } else {
    record('w5', 'no add-menu button found', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200));
  }
});

// ---------------------------------------------------------------------------
flow('w6-owner-signout-signin', 'Owner: đăng xuất rồi đăng nhập lại', DESKTOP, async (ctx) => {
  const creds = await ownerCredentials();
  const { page } = ctx;
  await signIn(page, creds.email);
  await ctx.app();
  await dismissGuide(page);
  await ctx.shot('dashboard-signed-in');
  await page.getByRole('button', { name: /THOÁT|Thoát|Đăng xuất/i }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await ctx.shot('after-signout');
  record('w6', 'after sign out', page.url());
  await signIn(page, creds.email);
  await ctx.app();
  await ctx.shot('signed-in-again');
  record('w6', 'after sign in', page.url());
});

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADED });
  const selected = flows.filter((f) => ONLY.length === 0 || ONLY.includes(f.id));
  const results = [];
  for (const f of selected) {
    const context = await browser.newContext({ viewport: f.viewport, locale: 'vi-VN' });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
    page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));
    let index = 0;
    const ctx = {
      page,
      browser,
      wait: (ms) => page.waitForTimeout(ms),
      app: () => waitForApp(page),
      shot: async (label) => {
        index += 1;
        const file = path.join(OUT, `${f.id}-${String(index).padStart(2, '0')}-${label}.png`);
        await page.screenshot({ path: file, fullPage: true }).catch(() => {});
        return path.relative(process.cwd(), file);
      },
    };
    const started = Date.now();
    const result = { id: f.id, name: f.name, ok: true, screenshots: [] };
    console.log(`\n▶ ${f.id} — ${f.name}`);
    try {
      await f.run(ctx);
    } catch (error) {
      result.ok = false;
      result.error = String(error?.message ?? error).slice(0, 500);
      console.log(`   ✗ ${result.error}`);
      await ctx.shot('failure').catch(() => {});
    }
    result.durationMs = Date.now() - started;
    result.consoleErrors = consoleErrors;
    result.pageErrors = pageErrors;
    result.failedRequests = failed;
    result.finalUrl = page.url();
    results.push(result);
    await context.close();
  }
  await writeFile(
    path.join(OUT, 'interactive-report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE, log, flows: results }, null, 2),
    'utf8',
  );
  await browser.close();
  console.log(`\nReport: ${path.relative(process.cwd(), path.join(OUT, 'interactive-report.json'))}`);
}

await run();

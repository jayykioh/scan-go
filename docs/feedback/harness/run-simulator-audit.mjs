/**
 * ScanGo simulator audit harness (evidence for docs/feedback/feature-audit-2026-10.md).
 *
 * The simulator at /simulator is the product's own demo of the six operating
 * roles. This harness drives every role: the customer ordering flow, the
 * Kitchen Display System, the Cashier settlement screen, the Staff PIN gate,
 * the Owner console tabs, and the Solo onboarding wizard. It also measures how
 * much of the interface the language switch actually translates.
 *
 * Usage:
 *   node docs/feedback/harness/run-simulator-audit.mjs [--only=s2,s3] [--headed]
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

const TABLET = { width: 1024, height: 768 };
const DESKTOP = { width: 1440, height: 900 };

const findings = [];
const screenshots = [];
let currentFlow = 'setup';

const note = (label, detail) => {
  findings.push({ flow: currentFlow, kind: 'note', label, detail });
  console.log(`   · ${label}${detail ? ` — ${detail}` : ''}`);
};
const check = (ok, label, detail) => {
  findings.push({ flow: currentFlow, kind: ok ? 'pass' : 'fail', label, detail });
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

async function ownerEmail() {
  if (process.env.SCANGO_OWNER_EMAIL) return process.env.SCANGO_OWNER_EMAIL;
  const raw = await readFile(path.join(OUT, 'workflow-report.json'), 'utf8');
  return JSON.parse(raw).ownerAccount;
}

async function shot(page, name) {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `audit-${name}.png`);
  await page.screenshot({ path: file });
  screenshots.push(path.relative(process.cwd(), file));
  return file;
}

async function openSim(page, role, waitMs = 5000) {
  await page.goto(`${BASE}/simulator/${role}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs);
  const guide = page.getByRole('button', { name: /Đã hiểu/i });
  if (await guide.count()) {
    await guide.first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

const bodyText = async (page) =>
  (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');

const flows = [];
const flow = (id, name, viewport, run, needsLogin = false) =>
  flows.push({ id, name, viewport, run, needsLogin });

// ---------------------------------------------------------------------------
// S1 — Customer ordering flow in the simulator
//
// The labels are read from the UI rather than assumed, because the simulator's
// customer view mixes Vietnamese and English (see S7).
// ---------------------------------------------------------------------------
flow('s1-customer', 'Khách: gọi món trong simulator', { width: 390, height: 844 }, async (ctx) => {
  const { page } = ctx;
  await openSim(page, 'customer', 7000);

  const tables = page.getByRole('button', { name: /Bàn/i });
  check((await tables.count()) > 0, 'Simulator khách: có danh sách bàn', `count=${await tables.count()}`);
  await shot(page, 's1-customer-tables');
  await tables.first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, 's1-customer-menu');

  const dish = page.locator('main button').filter({ hasText: /\.000đ/ }).first();
  check((await dish.count()) > 0, 'Menu simulator có món để chọn', `count=${await dish.count()}`);
  if (await dish.count()) {
    await dish.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  const addToCart = page.getByRole('button', { name: /Thêm vào giỏ|Add to cart/i }).first();
  check((await addToCart.count()) > 0, 'Có nút thêm vào giỏ ở màn chi tiết món', `count=${await addToCart.count()}`);
  if (await addToCart.count()) {
    await addToCart.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  let text = await bodyText(page);
  check(/1\s*items|1\s*món/i.test(text), 'Giỏ hàng ghi nhận 1 món', text.match(/\d+\s*items?/i)?.[0] ?? 'không thấy');
  await shot(page, 's1-customer-cart');

  const track = page.getByRole('button', { name: /Theo dõi đơn|Track order/i }).first();
  check((await track.count()) > 0, 'Có tab theo dõi đơn', `count=${await track.count()}`);
  if (await track.count()) {
    await track.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3500);
  }
  text = await bodyText(page);
  check(
    /ORD_|Your order|Đơn của bạn/i.test(text),
    'Simulator khách hiển thị màn theo dõi đơn',
    text.slice(-200),
  );
  check(
    /New|Cooking|Done|Served|Mới|Đang nấu|Xong|Đã phục vụ/i.test(text),
    'Màn theo dõi có các bước trạng thái món',
    text.slice(-160),
  );
  check(
    !/chỉ được gửi qua liên kết bàn chính thức/i.test(text),
    'Không bị chặn bởi thông báo "chỉ gửi qua liên kết bàn chính thức"',
    /chỉ được gửi qua liên kết bàn chính thức/i.test(text) ? 'bị chặn' : 'không bị chặn',
  );
  note('Đơn của simulator là đơn demo cục bộ (không ghi Firestore)', text.match(/#?ORD_\w+/)?.[0] ?? 'không thấy mã đơn');
  await shot(page, 's1-customer-after-submit');
});

// ---------------------------------------------------------------------------
// S2 — Kitchen Display System
// ---------------------------------------------------------------------------
flow('s2-kitchen', 'Bếp: KDS và chuyển trạng thái món', TABLET, async (ctx) => {
  const { page } = ctx;
  await openSim(page, 'kitchen', 6000);
  await shot(page, 's2-kitchen-pin');

  const pin = page.locator('input[type="password"]').first();
  if (!(await pin.count())) {
    check(false, 'KDS có ô nhập PIN', 'không thấy');
    return;
  }

  await pin.fill('9999');
  await page.getByRole('button', { name: /Đăng nhập|Nhận ca/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  let text = await bodyText(page);
  check(
    !/sai|không đúng|invalid pin/i.test(text),
    'PIN 4 số bất kỳ (9999) được chấp nhận — không kiểm tra tài khoản',
    text.slice(0, 120),
  );

  await shot(page, 's2-kitchen-queue');
  const queueText = text;
  note('Hàng đợi bếp', queueText.slice(0, 220));
  check(
    !/Missing or insufficient permissions/i.test(queueText),
    'KDS không hiện lỗi quyền bằng tiếng Anh thô',
    /Missing or insufficient permissions/i.test(queueText) ? 'có lỗi thô' : 'ok',
  );

  const start = page.getByRole('button', { name: /Bắt đầu nấu/i }).first();
  if (await start.count()) {
    await start.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await shot(page, 's2-kitchen-cooking');
    const ready = page.getByRole('button', { name: /^Xong$/i }).first();
    check(await ready.count() > 0, 'Sau "Bắt đầu nấu", đơn chuyển sang bước "Xong"', `count=${await ready.count()}`);
    if (await ready.count()) {
      await ready.click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(3500);
      await shot(page, 's2-kitchen-ready');
    }
    text = await bodyText(page);
    check(
      !/Missing or insufficient permissions/i.test(text),
      'Chuyển trạng thái bếp không trả lỗi quyền thô',
      /Missing or insufficient permissions/i.test(text) ? 'có lỗi thô' : 'ok',
    );
  } else {
    note('Không có đơn nào trong hàng đợi bếp', 'bỏ qua bước chuyển trạng thái');
  }
});

// ---------------------------------------------------------------------------
// S3 — Cashier settlement
// ---------------------------------------------------------------------------
flow('s3-cashier', 'Thu ngân: thu tiền và hội viên', TABLET, async (ctx) => {
  const { page } = ctx;
  await openSim(page, 'cashier', 6000);
  await shot(page, 's3-cashier-pin');

  const pin = page.locator('input[type="password"]').first();
  if (!(await pin.count())) {
    check(false, 'Thu ngân có ô nhập PIN', 'không thấy');
    return;
  }
  await pin.fill('0000');
  await page.getByRole('button', { name: /Đăng nhập/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  let text = await bodyText(page);
  check(
    !/sai|không đúng|invalid pin|Vui lòng nhập mã PIN đủ 4 số/i.test(text),
    'PIN 4 số bất kỳ (0000) được chấp nhận — không kiểm tra tài khoản',
    text.slice(0, 120),
  );
  check(
    !/Missing or insufficient permissions/i.test(text),
    'Thu ngân không hiện lỗi quyền bằng tiếng Anh thô',
    /Missing or insufficient permissions/i.test(text) ? 'có lỗi thô' : 'ok',
  );
  await shot(page, 's3-cashier-queue');

  const pay = page.getByRole('button', { name: /Thu tiền/i }).first();
  if (await pay.count()) {
    await pay.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await shot(page, 's3-cashier-after-pay');
    text = await bodyText(page);
    check(
      !/Missing or insufficient permissions|thất bại|error/i.test(text),
      'Thu tiền chạy được và không lộ lỗi hệ thống',
      text.slice(0, 160),
    );
  } else {
    note('Không có đơn chưa thu trong hàng đợi', 'bỏ qua bước thu tiền');
  }

  text = await bodyText(page);
  check(/Hội viên|hội viên|loyalty/i.test(text), 'Có khu vực hội viên/loyalty cho thu ngân', text.match(/Hội viên[^|]{0,60}/)?.[0] ?? 'không thấy');
});

// ---------------------------------------------------------------------------
// S4 — Staff PIN gate (server-verified path)
// ---------------------------------------------------------------------------
flow('s4-staff', 'Nhân viên: cổng PIN xác thực máy chủ', TABLET, async (ctx) => {
  const { page } = ctx;
  await openSim(page, 'staff', 6000);
  await shot(page, 's4-staff-pin');

  const pin = page.locator('input[type="password"], input[inputmode="numeric"]').first();
  if (!(await pin.count())) {
    check(false, 'Nhân viên có ô nhập PIN', 'không thấy');
    return;
  }
  await pin.fill('9999');
  await page.getByRole('button', { name: /Vào ca|Bắt đầu|Đăng nhập/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const deniedText = await bodyText(page);
  note('Sau khi nhập PIN sai', deniedText.slice(0, 220));
  check(
    /sai|không đúng|không hợp lệ|khóa|denied|PIN/i.test(deniedText),
    'PIN sai bị máy chủ từ chối và có thông báo hiểu được',
    deniedText.slice(0, 140),
  );
  await shot(page, 's4-staff-denied');
});

// ---------------------------------------------------------------------------
// S5 — Owner console tabs
// ---------------------------------------------------------------------------
flow('s5-owner-tabs', 'Owner: các tab trong simulator', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await openSim(page, 'owner', 6500);

  // Tab labels follow the interface language, so accept either rendering.
  const tabs = [
    ['Report', 'Báo cáo'],
    ['Dishes', 'Món ăn'],
    ['Inventory', 'Kho'],
    ['QR tables', 'Bàn QR'],
    ['Staff', 'Nhân viên'],
    ['AI assistant', 'Trợ lý AI'],
  ];
  for (const [en, vi] of tabs) {
    const tab = page.getByRole('button', { name: new RegExp(`^(${en}|${vi})`, 'i') }).first();
    if (!(await tab.count())) {
      check(false, `Tab "${en}/${vi}" tồn tại`, 'không thấy');
      continue;
    }
    await tab.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(2200);
    const text = await bodyText(page);
    check(text.length > 200, `Tab "${en}/${vi}" render nội dung`, `${text.length} ký tự`);
    await shot(page, `s5-owner-${en.toLowerCase().replace(/\s+/g, '-')}`);
  }

  const text = await bodyText(page);
  check(
    !/Missing or insufficient permissions/i.test(text),
    'Owner simulator không hiện lỗi quyền thô',
    /Missing or insufficient permissions/i.test(text) ? 'có lỗi thô' : 'ok',
  );
});

// ---------------------------------------------------------------------------
// S6 — Solo onboarding
// ---------------------------------------------------------------------------
flow('s6-solo', 'Solo: luồng thiết lập quán', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await openSim(page, 'solo', 6500);
  await shot(page, 's6-solo-step1');

  const brand = page.getByPlaceholder(/Phở Kinh Kỳ/i).first();
  if (await brand.count()) {
    await brand.fill('[AUDIT] Quán Solo');
    const next = page.getByRole('button', { name: /Tiếp theo/i }).first();
    if (await next.count()) {
      await next.click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await shot(page, 's6-solo-step2');
      const text = await bodyText(page);
      check(text.length > 100, 'Solo: sang được bước thiết lập tiếp theo', text.slice(0, 140));
      check(
        !/undefined|NaN|\[object Object\]/i.test(text),
        'Solo: không lộ giá trị lỗi (undefined/NaN)',
        /undefined|NaN/i.test(text) ? 'có giá trị lỗi' : 'ok',
      );
    } else {
      check(false, 'Solo: có nút "Tiếp theo"', 'không thấy');
    }
  } else {
    check(false, 'Solo: có ô nhập tên thương hiệu', 'không thấy');
  }
});

// ---------------------------------------------------------------------------
// S7 — Language switch coverage
//
// Measures, per surface, which strings actually change when the Owner switches
// the interface language. Requires a signed-in session for /dashboard/settings.
// ---------------------------------------------------------------------------
flow('s7-i18n', 'Cấu hình: độ phủ của nút đổi ngôn ngữ', DESKTOP, async (ctx) => {
  const { page } = ctx;
  const ROUTES = [
    ['/dashboard', 'dashboard'],
    ['/dashboard/menu', 'dashboard-menu'],
    ['/simulator/customer', 'sim-customer'],
    ['/simulator/owner', 'sim-owner'],
    ['/simulator/kitchen', 'sim-kitchen'],
    ['/simulator/cashier', 'sim-cashier'],
  ];

  const setLocale = async (label) => {
    await page.goto(`${BASE}/dashboard/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);
    const guide = page.getByRole('button', { name: /Đã hiểu/i });
    if (await guide.count()) await guide.first().click({ timeout: 4000 }).catch(() => {});
    const btn = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
    if (!(await btn.count())) return false;
    await btn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(3000);
    return true;
  };

  const probe = async (route) => {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6500);
    return page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const label = (el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim();
      return {
        headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(label),
        buttons: [...document.querySelectorAll('button,[role="button"]')].filter(visible).map(label).filter(Boolean),
        nav: [...document.querySelectorAll('nav a')].filter(visible).map(label),
        body: document.body.innerText.replace(/\s+/g, ' ').trim(),
      };
    });
  };

  const samples = {};
  for (const [key, label] of [['en', 'English'], ['vi', 'Tiếng Việt']]) {
    const ok = await setLocale(label);
    check(ok, `Đổi được ngôn ngữ sang "${label}"`, ok ? 'ok' : 'không thấy nút');
    samples[key] = {};
    for (const [route, name] of ROUTES) samples[key][name] = await probe(route);
  }

  for (const [, name] of ROUTES) {
    const en = samples.en[name];
    const vi = samples.vi[name];
    const changed = en.body !== vi.body;
    check(changed, `${name}: nội dung đổi khi chuyển ngôn ngữ`, changed ? 'có đổi' : 'KHÔNG đổi');
    const stillEnglish = vi.buttons.filter((b) =>
      /^(Send feedback|Report|Dishes|Inventory|QR tables|Staff|AI assistant|Add to cart|Track order|Member|Sign in|Topping)$/i.test(b),
    );
    check(
      stillEnglish.length === 0,
      `${name}: chế độ Tiếng Việt không còn nhãn tiếng Anh`,
      stillEnglish.join(' | ') || 'không có',
    );
    note(`${name}: số nhãn đổi`, `EN=${en.buttons.length} · VI=${vi.buttons.length}`);
  }
  await shot(page, 's7-i18n-vi');
}, true);

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const selected = ONLY.length
  ? flows.filter((f) => ONLY.includes(f.id) || ONLY.includes(f.id.split('-')[0]))
  : flows;

const browser = await chromium.launch({ headless: !HEADED });
const email = await ownerEmail();
console.log(`Simulator audit — ${selected.length} flow(s)\n`);

const report = { generatedAt: new Date().toISOString(), baseUrl: BASE, flows: [] };

for (const item of selected) {
  currentFlow = item.id;
  console.log(`\n===== ${item.id} — ${item.name}`);
  const context = await browser.newContext({ viewport: item.viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 240)}`));

  const started = Date.now();
  let error = null;
  try {
    if (item.needsLogin) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#email');
      await page.fill('#email', email);
      await page.fill('#password', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard', { timeout: 35000 });
      await page.waitForTimeout(2500);
    }
    await item.run({ page, context, browser });
  } catch (cause) {
    error = String(cause).split('\n')[0];
    console.log(`   !! flow lỗi: ${error}`);
    await shot(page, `${item.id}-error`).catch(() => {});
  }
  report.flows.push({
    id: item.id,
    name: item.name,
    durationMs: Date.now() - started,
    error,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 12),
  });
  await context.close();
}

await browser.close();
report.findings = findings;
report.screenshots = screenshots;
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'simulator-audit-report.json'), JSON.stringify(report, null, 2), 'utf8');

const failed = findings.filter((f) => f.kind === 'fail');
console.log('\n================ TỔNG KẾT ================');
console.log(`Assertion đạt : ${findings.filter((f) => f.kind === 'pass').length}`);
console.log(`Assertion lỗi : ${failed.length}`);
failed.forEach((f) => console.log(`  ✗ [${f.flow}] ${f.label} — ${f.detail ?? ''}`));
console.log(`Báo cáo JSON  : ${path.join(OUT, 'simulator-audit-report.json')}`);

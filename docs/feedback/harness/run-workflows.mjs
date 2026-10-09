/**
 * ScanGo user-workflow harness (feedback evidence).
 *
 * Drives the running dev server with Playwright and records, for every step:
 * a screenshot, an ARIA snapshot, console/page/network errors, navigation
 * timings, and a lightweight accessibility audit.
 *
 * Usage:
 *   node docs/feedback/harness/run-workflows.mjs [--only=<id,id>] [--headed]
 *
 * Env:
 *   SCANGO_BASE_URL   default http://127.0.0.1:3000
 *   SCANGO_ARTIFACTS  default docs/feedback/artifacts
 *   PLAYWRIGHT_CORE   path to playwright-core index.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PLAYWRIGHT_CORE =
  process.env.PLAYWRIGHT_CORE ??
  '/home/duckneo/.local/share/mise/installs/node/22.23.2/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs';

const { chromium } = await import(PLAYWRIGHT_CORE);

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = process.env.SCANGO_BASE_URL ?? 'http://127.0.0.1:3000';
const OUT = path.resolve(process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts');
const ONLY = value('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const HEADED = flag('headed');

/** Test Owner account created by this harness on the first authenticated run. */
const OWNER = {
  name: 'QA Playwright',
  shop: 'Quán QA Playwright',
  email: `qa.playwright+${Date.now()}@example.com`,
  password: 'ScanGo-QA-2026!',
};

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const steps = [];
const step = (id, name, config) => steps.push({ id, name, ...config });

// ---------------------------------------------------------------- public web
step('public-landing', 'Landing page (khách truy cập)', {
  url: '/',
  viewport: DESKTOP,
  ready: 'main, h1',
});
step('public-introduce', 'Trang giới thiệu', {
  url: '/introduce',
  viewport: DESKTOP,
  ready: 'main, h1',
});
step('public-login', 'Đăng nhập Owner', {
  url: '/login',
  viewport: DESKTOP,
  ready: 'form',
});
step('public-register', 'Đăng ký Owner', {
  url: '/register',
  viewport: DESKTOP,
  ready: 'form',
});
step('public-staff-login', 'Đăng nhập Staff bằng PIN', {
  url: '/staff',
  viewport: MOBILE,
  ready: 'form, main',
});
step('public-menu-bad-token', 'Menu công khai với token sai', {
  url: '/menu/khong-ton-tai',
  viewport: MOBILE,
  ready: 'body',
});
step('public-dashboard-guard', 'Truy cập /dashboard khi chưa đăng nhập', {
  url: '/dashboard',
  viewport: DESKTOP,
  ready: 'body',
});
step('public-404', 'Route không tồn tại', {
  url: '/khong-co-trang-nay',
  viewport: DESKTOP,
  ready: 'body',
});

// ------------------------------------------------------------- authenticated
step('owner-register-flow', 'Đăng ký tài khoản Owner mới (workflow thật)', {
  viewport: DESKTOP,
  run: async (page, ctx) => {
    await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#displayName', { timeout: 20000 });
    await page.fill('#displayName', OWNER.name);
    await page.fill('#shopName', OWNER.shop);
    await page.fill('#email', OWNER.email);
    await page.fill('#password', OWNER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    ctx.owner = OWNER;
  },
  ready: 'main',
});

const dashboardPages = [
  ['dashboard-overview', 'Dashboard — Tổng quan', '/dashboard'],
  ['dashboard-manage', 'Dashboard — Quản lý (ADMIN)', '/dashboard/manage'],
  ['dashboard-menu', 'Dashboard — Thực đơn', '/dashboard/menu'],
  ['dashboard-inventory', 'Dashboard — Kho & giá vốn', '/dashboard/inventory'],
  ['dashboard-tables', 'Dashboard — Bàn & QR', '/dashboard/tables'],
  ['dashboard-staff', 'Dashboard — Nhân viên', '/dashboard/staff'],
  ['dashboard-subscription', 'Dashboard — Gói dịch vụ', '/dashboard/subscription'],
  ['dashboard-settings', 'Dashboard — Cài đặt', '/dashboard/settings'],
];
for (const [id, name, url] of dashboardPages) {
  step(id, name, { url, viewport: DESKTOP, authenticated: true, ready: 'main' });
}

// ---------------------------------------------------------------- simulator
step('simulator-index', 'Simulator — chọn vai trò', {
  url: '/simulator',
  viewport: DESKTOP,
  ready: 'main',
});
for (const role of ['owner', 'kitchen', 'cashier', 'customer', 'staff', 'solo']) {
  step(`simulator-${role}`, `Simulator — ${role}`, {
    url: `/simulator/${role}`,
    viewport: role === 'customer' || role === 'staff' ? MOBILE : DESKTOP,
    ready: 'body',
  });
}

// ------------------------------------------------------------------- capture
async function audit(page) {
  return page.evaluate(() => {
    const issues = [];
    const label = (el) =>
      el.getAttribute('aria-label') ??
      el.getAttribute('aria-labelledby') ??
      el.getAttribute('title') ??
      '';
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const id = el.getAttribute('id');
      const hasFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrapped = el.closest('label');
      if (!hasFor && !wrapped && !label(el)) {
        issues.push({ type: 'form-control-without-label', detail: el.outerHTML.slice(0, 140) });
      }
    }
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const name =
        (el.textContent ?? '').trim() ||
        label(el) ||
        el.querySelector('img')?.getAttribute('alt') ||
        '';
      if (!name) {
        issues.push({ type: 'control-without-accessible-name', detail: el.outerHTML.slice(0, 140) });
      }
    }
    for (const el of document.querySelectorAll('img')) {
      if (!el.hasAttribute('alt')) {
        issues.push({ type: 'image-without-alt', detail: el.outerHTML.slice(0, 140) });
      }
    }
    const interactive = document.querySelectorAll('button, a[href], input, select, textarea').length;
    const small = [...document.querySelectorAll('button, a[href]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32);
    }).length;
    return {
      lang: document.documentElement.lang || null,
      title: document.title,
      hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
      headingCount: document.querySelectorAll('h1,h2,h3').length,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
      interactiveCount: interactive,
      smallTargetCount: small,
      issues,
      textLength: (document.body.innerText ?? '').length,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

async function timing(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    return {
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadMs: nav ? Math.round(nav.loadEventEnd) : null,
      firstPaintMs: paints.find((p) => p.name === 'first-paint')?.startTime
        ? Math.round(paints.find((p) => p.name === 'first-paint').startTime)
        : null,
      resourceCount: performance.getEntriesByType('resource').length,
    };
  });
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADED });
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    ownerAccount: OWNER.email,
    steps: [],
  };
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'vi-VN' });
  const page = await context.newPage();
  const selected = steps.filter((s) => ONLY.length === 0 || ONLY.includes(s.id));

  for (const s of selected) {
    const console_ = [];
    const pageErrors = [];
    const failedRequests = [];
    const badResponses = [];
    const onConsole = (m) => {
      if (['error', 'warning'].includes(m.type())) {
        console_.push({ type: m.type(), text: m.text().slice(0, 400) });
      }
    };
    const onPageError = (e) => pageErrors.push(String(e.message ?? e).slice(0, 400));
    const onFailed = (r) =>
      failedRequests.push({ url: r.url().slice(0, 200), failure: r.failure()?.errorText ?? null });
    const onResponse = (r) => {
      if (r.status() >= 400 && !r.url().includes('favicon')) {
        badResponses.push({ status: r.status(), url: r.url().slice(0, 200) });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onFailed);
    page.on('response', onResponse);

    const started = Date.now();
    const result = { id: s.id, name: s.name, ok: true };
    try {
      if (s.viewport) await page.setViewportSize(s.viewport);
      if (s.url) {
        await page.goto(`${BASE}${s.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      if (s.run) await s.run(page, report);
      if (s.ready) {
        try {
          await page.waitForSelector(s.ready, { timeout: 12000, state: 'attached' });
        } catch {
          result.readySelectorMissed = s.ready;
        }
      }
      await page.waitForTimeout(2500); // the app renders a fixed 2s splash
      // Scroll through the page so scroll-triggered animations settle before we
      // judge what a real user sees, then return to the top.
      await page
        .evaluate(async () => {
          const step = Math.round(window.innerHeight * 0.8);
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 120));
          }
          window.scrollTo(0, 0);
        })
        .catch(() => {});
      await page.waitForTimeout(600);
      result.url = page.url();
      result.timing = await timing(page);
      result.audit = await audit(page);
      result.console = console_;
      result.pageErrors = pageErrors;
      result.failedRequests = failedRequests;
      result.badResponses = badResponses;
      const shot = path.join(OUT, `${s.id}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      result.screenshot = path.relative(process.cwd(), shot);
      try {
        const aria = await page.locator('body').ariaSnapshot();
        await writeFile(path.join(OUT, `${s.id}.aria.yml`), aria, 'utf8');
        result.ariaSnapshot = path.relative(process.cwd(), path.join(OUT, `${s.id}.aria.yml`));
      } catch (e) {
        result.ariaSnapshotError = String(e).slice(0, 200);
      }
    } catch (error) {
      result.ok = false;
      result.error = String(error?.message ?? error).slice(0, 600);
      result.console = console_;
      result.pageErrors = pageErrors;
      result.failedRequests = failedRequests;
      result.badResponses = badResponses;
      try {
        await page.screenshot({ path: path.join(OUT, `${s.id}.png`), fullPage: true });
        result.screenshot = path.relative(process.cwd(), path.join(OUT, `${s.id}.png`));
      } catch {}
    }
    result.durationMs = Date.now() - started;
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onFailed);
    page.off('response', onResponse);
    report.steps.push(result);
    console.log(
      `${result.ok ? 'PASS' : 'FAIL'} ${s.id} ${result.durationMs}ms` +
        (result.audit ? ` issues=${result.audit.issues.length}` : '') +
        (result.console?.length ? ` console=${result.console.length}` : '') +
        (result.error ? ` error=${result.error.split('\n')[0]}` : ''),
    );
  }

  await writeFile(
    path.join(OUT, 'workflow-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  await browser.close();
  console.log(`\nReport: ${path.relative(process.cwd(), path.join(OUT, 'workflow-report.json'))}`);
}

await run();

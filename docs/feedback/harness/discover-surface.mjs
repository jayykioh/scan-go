/**
 * ScanGo surface discovery (audit helper, not a deliverable document).
 *
 * Signs in once and dumps, for every dashboard route and every simulator role,
 * the complete interactive inventory (buttons, inputs, headings, selected
 * state) plus console/page errors. The feature audit uses this to design flows
 * from the labels the UI actually renders instead of guessing them.
 *
 * Usage:
 *   node docs/feedback/harness/discover-surface.mjs [--headed] [--role=owner]
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
const HEADED = flag('headed');
const ONLY_ROLE = value('role', '');
const PASSWORD = 'ScanGo-QA-2026!';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const ROUTES = [
  ['dashboard', '/dashboard'],
  ['manage', '/dashboard/manage'],
  ['menu', '/dashboard/menu'],
  ['inventory', '/dashboard/inventory'],
  ['tables', '/dashboard/tables'],
  ['staff', '/dashboard/staff'],
  ['subscription', '/dashboard/subscription'],
  ['settings', '/dashboard/settings'],
  ['feedback', '/dashboard/feedback'],
];

const ROLES = [
  ['solo', 'solo'],
  ['owner', 'owner'],
  ['cashier', 'cashier'],
  ['kitchen', 'kitchen'],
  ['customer', 'customer'],
  ['staff', 'staff'],
];

async function ownerCredentials() {
  if (process.env.SCANGO_OWNER_EMAIL) {
    return { email: process.env.SCANGO_OWNER_EMAIL, password: PASSWORD };
  }
  const raw = await readFile(path.join(OUT, 'workflow-report.json'), 'utf8');
  return { email: JSON.parse(raw).ownerAccount, password: PASSWORD };
}

async function waitForApp(page) {
  await page.waitForSelector('main', { state: 'visible', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function dismissGuide(page) {
  const button = page.getByRole('button', { name: /Đã hiểu/i });
  await button.first().waitFor({ state: 'visible', timeout: 2500 }).catch(() => {});
  if (await button.count()) {
    await button.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 20000 });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await page.getByRole('button', { name: /THOÁT|Thoát|Đăng xuất/i }).first()
    .waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
}

/** Everything clickable/typeable with its accessible name and state. */
async function inventory(page) {
  return page.evaluate(() => {
    const name = (el) => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      const labelled = el.getAttribute('aria-labelledby');
      if (labelled) {
        const node = document.getElementById(labelled);
        if (node?.textContent) return node.textContent.trim();
      }
      const placeholder = el.getAttribute('placeholder');
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 90);
      if (placeholder) return `[placeholder] ${placeholder}`;
      const href = el.getAttribute('href');
      if (href) return `[href] ${href}`;
      return `[${el.tagName.toLowerCase()} ${el.getAttribute('type') ?? ''}]`;
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const collect = (sel) =>
      [...document.querySelectorAll(sel)]
        .filter(visible)
        .map((el) => ({
          name: name(el),
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? null,
          disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
          pressed: el.getAttribute('aria-pressed'),
          checked: el.getAttribute('aria-checked'),
          selected: el.getAttribute('aria-selected'),
          value: el.value ? String(el.value).slice(0, 60) : null,
        }));
    return {
      headings: [...document.querySelectorAll('h1,h2,h3')]
        .filter(visible)
        .map((el) => `${el.tagName.toLowerCase()}: ${(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90)}`),
      buttons: collect('button, [role="button"]'),
      links: collect('a[href]'),
      fields: collect('input, select, textarea, [role="combobox"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"]'),
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 900),
    };
  });
}

const results = [];

async function visit(context, id, label, url, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await dismissGuide(page);
  await page.waitForTimeout(900);
  const inv = await inventory(page);
  const aria = await page.locator('body').ariaSnapshot().catch(() => '');
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `discover-${id}.png`), fullPage: false });
  await writeFile(path.join(OUT, `discover-${id}.aria.yml`), aria, 'utf8');
  results.push({ id, label, url: page.url(), ...inv, consoleErrors, pageErrors, failed });
  console.log(`\n########## ${id} — ${label} (${page.url()})`);
  console.log('HEADINGS:', inv.headings.join(' | '));
  console.log('BUTTONS :', inv.buttons.map((b) => b.name + (b.disabled ? '(disabled)' : '') + (b.pressed ? `(pressed=${b.pressed})` : '')).join(' | '));
  console.log('FIELDS  :', inv.fields.map((f) => `${f.name}=${f.value ?? ''}`).join(' | '));
  if (consoleErrors.length) console.log('CONSOLE :', consoleErrors.slice(0, 6).join(' || '));
  if (pageErrors.length) console.log('PAGEERR :', pageErrors.slice(0, 4).join(' || '));
  if (failed.length) console.log('REQFAIL :', failed.slice(0, 4).join(' || '));
  await page.close();
}

const browser = await chromium.launch({ headless: !HEADED });
const { email } = await ownerCredentials();
console.log(`Signing in as ${email}`);

const owner = await browser.newContext({ viewport: DESKTOP });
const ownerPage = await owner.newPage();
await signIn(ownerPage, email);
await ownerPage.close();

for (const [id, url] of ROUTES) {
  await visit(owner, `page-${id}`, `Dashboard ${id}`, url, DESKTOP);
}
await owner.close();

for (const [id, role] of ROLES) {
  if (ONLY_ROLE && role !== ONLY_ROLE) continue;
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/simulator/${role}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await dismissGuide(page);
  await page.waitForTimeout(1200);
  const inv = await inventory(page);
  const aria = await page.locator('body').ariaSnapshot().catch(() => '');
  await page.screenshot({ path: path.join(OUT, `discover-role-${id}.png`), fullPage: false });
  await writeFile(path.join(OUT, `discover-role-${id}.aria.yml`), aria, 'utf8');
  results.push({ id: `role-${id}`, label: `Simulator ${role}`, url: page.url(), ...inv });
  console.log(`\n########## role-${id} — Simulator ${role} (${page.url()})`);
  console.log('HEADINGS:', inv.headings.join(' | '));
  console.log('BUTTONS :', inv.buttons.map((b) => b.name + (b.disabled ? '(disabled)' : '')).join(' | '));
  console.log('FIELDS  :', inv.fields.map((f) => `${f.name}=${f.value ?? ''}`).join(' | '));
  await ctx.close();
}

await browser.close();
await writeFile(path.join(OUT, 'discover-surface.json'), JSON.stringify(results, null, 2), 'utf8');
console.log(`\nWrote ${path.join(OUT, 'discover-surface.json')} (${results.length} surfaces)`);

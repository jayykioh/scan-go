/**
 * Product-feedback feature verification (REQ-FDB-004, REQ-FDB-005, REQ-FDB-006).
 *
 * Drives the real widget in a browser: opens it, fills the form, attaches a
 * screenshot through the file input, submits, then opens the Owner inbox and
 * confirms the report and its image are there. Every step is captured.
 *
 * Preconditions:
 *   - Vite dev server on SCANGO_BASE_URL
 *   - Functions emulator with callableProductFeedbackSubmit/List/SetStatus
 *   - Storage emulator reachable (VITE_USE_STORAGE_EMULATOR=true) or the
 *     deployed Storage Rules must allow the feedback path
 *   - docs/feedback/artifacts/workflow-report.json holds the Owner test account
 *
 * Usage:
 *   node docs/feedback/harness/run-feedback-feature.mjs [--headed]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PLAYWRIGHT_CORE =
  process.env.PLAYWRIGHT_CORE ??
  '/home/duckneo/.local/share/mise/installs/node/22.23.2/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs';

const { chromium } = await import(PLAYWRIGHT_CORE);

const BASE = process.env.SCANGO_BASE_URL ?? 'http://127.0.0.1:3000';
const OUT = path.resolve(process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts');
const FIXTURE = path.resolve('docs/feedback/harness/fixture-screenshot.png');
const PASSWORD = 'ScanGo-QA-2026!';
const HEADED = process.argv.slice(2).includes('--headed');

const report = JSON.parse(
  await readFile(path.join(OUT, 'workflow-report.json'), 'utf8'),
);
const OWNER_EMAIL = report.ownerAccount;

const steps = [];
const note = (label, detail) => {
  steps.push({ label, detail: detail ?? null });
  console.log(`   · ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'vi-VN',
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
page.on('requestfailed', (r) =>
  failedRequests.push(`${r.url().slice(0, 180)} :: ${r.failure()?.errorText}`),
);

let shotIndex = 0;
const shot = async (label) => {
  shotIndex += 1;
  const file = path.join(
    OUT,
    `feature-feedback-${String(shotIndex).padStart(2, '0')}-${label}.png`,
  );
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return path.relative(process.cwd(), file);
};

await mkdir(OUT, { recursive: true });

// ---------------------------------------------------------------- sign in
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 20000 });
await page.fill('#email', OWNER_EMAIL);
await page.fill('#password', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 30000 });
await page
  .getByRole('button', { name: /THOÁT|Thoát|Đăng xuất/i })
  .first()
  .waitFor({ state: 'visible', timeout: 25000 })
  .catch(() => {});
await page.waitForTimeout(800);
note('signed in', page.url());

// ------------------------------------------------------ open the widget
await page.getByRole('button', { name: /Gửi phản hồi/ }).first().click();
await page.waitForTimeout(800);
const dialogVisible = await page
  .getByRole('dialog', { name: /Phản hồi về ScanGo/ })
  .isVisible()
  .catch(() => false);
note('widget dialog visible', String(dialogVisible));
await shot('dialog-open');

// --------------------------------------------------------- fill the form
const message =
  'Kiểm tra tự động: nút Gửi phản hồi hoạt động và ảnh đính kèm tải lên Storage. '
  + 'Đây là phản hồi do harness Playwright tạo, có thể xoá.';
await page.selectOption('#feedback-category', 'ux');
await page.selectOption('#feedback-severity', 'low');
await page.fill('#feedback-message', message);
await page.waitForTimeout(400);
await shot('form-filled');

// ---------------------------------------------------- attach a screenshot
await page.setInputFiles('input[type="file"]', FIXTURE);
await page.waitForTimeout(2500);
const thumbs = await page.locator('form img[alt="fixture-screenshot.png"]').count();
const uploadError = await page
  .locator('form [role="alert"]')
  .first()
  .innerText()
  .catch(() => '');
note('thumbnail rendered after upload', String(thumbs));
if (uploadError) note('upload error', uploadError.slice(0, 300));
await shot('image-attached');

// ---------------------------------------------------------------- submit
await page.getByRole('button', { name: /^Gửi phản hồi$/ }).last().click();
await page.waitForTimeout(4000);
const toast = await page
  .locator('text=Đã gửi phản hồi')
  .first()
  .isVisible()
  .catch(() => false);
note('success toast', String(toast));
const dialogStillOpen = await page
  .getByRole('dialog', { name: /Phản hồi về ScanGo/ })
  .isVisible()
  .catch(() => false);
const submitError = await page
  .locator('form [role="alert"]')
  .first()
  .innerText()
  .catch(() => '');
note('dialog closed after submit', String(!dialogStillOpen));
if (submitError) note('submit error', submitError.slice(0, 300));
await shot('after-submit');

// ------------------------------------------------------- open the inbox
await page.getByRole('link', { name: /Phản hồi/i }).first().click();
await page.waitForTimeout(4000);
await shot('inbox');
const inboxText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
note('inbox shows the new report', String(inboxText.includes('harness Playwright')));
const inboxImages = await page.locator('main img').count();
note('inbox image count', String(inboxImages));
note('inbox excerpt', inboxText.slice(inboxText.indexOf('HỘP THƯ'), inboxText.indexOf('HỘP THƯ') + 260));

// ------------------------------------------- status change with a reason
page.once('dialog', (dialog) => {
  void dialog.accept('Đã xác minh trong buổi kiểm tra tự động.');
});
const resolveButton = page.getByRole('button', { name: /Đánh dấu đã xử lý/ }).first();
if (await resolveButton.count()) {
  await resolveButton.click();
  await page.waitForTimeout(3000);
  await shot('after-resolve');
  const resolved = await page
    .locator('text=Đã xử lý')
    .first()
    .isVisible()
    .catch(() => false);
  note('status moved to resolved', String(resolved));
} else {
  note('resolve button not found', 'inbox may be empty');
}

await writeFile(
  path.join(OUT, 'feedback-feature-report.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      ownerEmail: OWNER_EMAIL,
      steps,
      consoleErrors,
      pageErrors,
      failedRequests,
    },
    null,
    2,
  ),
  'utf8',
);

await browser.close();
console.log(
  `\nReport: ${path.relative(process.cwd(), path.join(OUT, 'feedback-feature-report.json'))}`,
);

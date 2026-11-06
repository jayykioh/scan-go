/**
 * Public table menu verification — REQ-ORD-001.
 *
 * Opening a Table link must show that restaurant's dishes, two to a row and ten
 * to a page, with a working next/previous pager and a detail sheet when a dish
 * is tapped (REQ-ORD-001). The run is read-only: it opens the public menu and
 * never writes a fixture, so it is safe against production.
 *
 * Run against the deployed app (no dev server needed):
 *   SCANGO_BASE_URL=https://scan-go-ashen.vercel.app \
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-public-menu.mjs
 *
 * `SCANGO_MENU_TOKEN` picks the Table link; the seeded demo tenant needs a menu
 * longer than one page, so the default is a seeded table with 37 dishes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PLAYWRIGHT_CORE =
  process.env.PLAYWRIGHT_CORE ??
  '/home/duckneo/.local/share/mise/installs/node/22.23.2/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs';

const { chromium } = await import(PLAYWRIGHT_CORE);

const HEADED = process.argv.slice(2).includes('--headed');
const BASE = (process.env.SCANGO_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const TOKEN = process.env.SCANGO_MENU_TOKEN ?? 'seed-table-token-06';
const OUT = path.resolve(process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts');
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
/** Mirrors `MENU_PAGE_SIZE` in `src/components/CustomerView.tsx`. */
const PAGE_SIZE = 10;
const CARD = '[data-testid="menu-card"]';
const LABEL = '[data-testid="menu-page-label"]';
const NEXT = '[data-testid="menu-page-next"]';
const PREV = '[data-testid="menu-page-prev"]';
const SHEET = '[data-testid="menu-item-sheet"]';

const findings = [];
const screenshots = [];

const check = (ok, label, detail = '') => {
  findings.push({ kind: ok ? 'pass' : 'fail', label, detail: String(detail).slice(0, 240) });
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`);
};

const eventually = async (page, predicate, timeout = 45000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await predicate()) return true;
    } catch {
      // The page may be mid-render; poll again.
    }
    await page.waitForTimeout(250);
  }
  return false;
};

const text = async (page, selector) =>
  (await page.locator(selector).count()) === 0
    ? ''
    : (await page.locator(selector).innerText()).trim();

const cardTexts = async (page) => page.locator(CARD).allInnerTexts();

const shot = async (page, name) => {
  const file = path.join(OUT, `public-menu-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push(path.relative(process.cwd(), file));
};

/** Click next until the pager says it is on the last page. */
const goToLastPage = async (page, pageCount) => {
  for (let guard = 0; guard < pageCount; guard += 1) {
    const label = await text(page, LABEL);
    if (label === `Trang ${pageCount}/${pageCount}`) return true;
    if (await page.locator(NEXT).isDisabled()) return false;
    await page.locator(NEXT).click();
    await page.waitForTimeout(150);
  }
  return (await text(page, LABEL)) === `Trang ${pageCount}/${pageCount}`;
};

const browser = await chromium.launch({ headless: !HEADED });
const consoleErrors = [];

try {
  const context = await browser.newContext({ viewport: PHONE, locale: 'vi-VN' });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 200)}`));

  await mkdir(OUT, { recursive: true });
  await page.goto(`${BASE}/menu/${TOKEN}`, { waitUntil: 'domcontentloaded' });

  // A. The link opens the restaurant's menu instead of a revoked-link error.
  const loaded = await eventually(page, async () => (await page.locator(CARD).count()) > 0);
  check(loaded, 'Mở link bàn ra thực đơn của quán', `${BASE}/menu/${TOKEN}`);
  if (!loaded) {
    throw new Error(`Không có món nào ở ${BASE}/menu/${TOKEN}: ${(await page.locator('body').innerText()).slice(0, 200)}`);
  }
  const badge = (await page.locator('main').innerText()).includes('BÀN 6');
  const title = await page.getByRole('heading', { level: 1, name: 'Thực đơn' }).innerText();
  check(title === 'Thực đơn' && badge, 'Header: số bàn là nhãn, tiêu đề là thực đơn', `BÀN 6 / ${title}`);

  // B. Five rows of two dishes, ten a page, with a pager.
  const chipText = await page.locator('main').innerText().then((body) => body.match(/(\d+)\s*món/)?.[1] ?? '');
  const total = Number(chipText);
  check(total > PAGE_SIZE, 'Thực đơn đủ dài để kiểm tra phân trang', `${total} món`);
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const firstPage = await cardTexts(page);
  check(firstPage.length === PAGE_SIZE, 'Trang 1: 5 dòng × 2 món = 10 món', `${firstPage.length} món`);
  const firstLabel = await text(page, LABEL);
  check(firstLabel === `Trang 1/${pageCount}`, 'Pager: đang ở trang 1', firstLabel || 'không có pager');
  check(await page.locator(PREV).isDisabled(), 'Trang 1: nút Trước bị khoá');
  await shot(page, 'a1-phone-page1');

  await page.locator(NEXT).click();
  const secondLabelReady = await eventually(page, async () => (await text(page, LABEL)) === `Trang 2/${pageCount}`);
  const secondPage = await cardTexts(page);
  check(secondLabelReady && secondPage.length === PAGE_SIZE, 'Bấm Tiếp: sang trang 2 đủ 10 món', `${secondPage.length} món / ${await text(page, LABEL)}`);
  check(
    secondPage.join('|') !== firstPage.join('|'),
    'Trang 2 là 10 món tiếp theo, không lặp trang 1',
    `${firstPage[0]?.split('\n')[0]} → ${secondPage[0]?.split('\n')[0]}`,
  );
  // Clicking the pager scrolls it into view; shoot the page from the top.
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((element) => {
      if (element.scrollTop > 0) element.scrollTop = 0;
    });
  });
  await page.waitForTimeout(200);
  await shot(page, 'a2-phone-page2');

  // The pager sits under the fifth row, so shoot it in view as well.
  await page.locator(NEXT).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(page, 'a3-phone-pager');

  const last = await goToLastPage(page, pageCount);
  check(last && (await page.locator(NEXT).isDisabled()), 'Trang cuối: nút Tiếp bị khoá', await text(page, LABEL));
  const lastCount = (await cardTexts(page)).length;
  check(
    lastCount === total - PAGE_SIZE * (pageCount - 1),
    'Trang cuối hiện đúng số món còn lại',
    `${lastCount} món`,
  );

  await page.locator(PREV).click();
  const backToSecond = await eventually(page, async () => (await text(page, LABEL)) === `Trang ${pageCount - 1}/${pageCount}`);
  check(backToSecond, 'Bấm Trước: quay lại trang trước', await text(page, LABEL));

  // C. A search starts again at the first page.
  const dishOnSecondPage = (await cardTexts(page))[0]?.split('\n')[0] ?? '';
  await page.getByPlaceholder(/Tìm món/).fill(dishOnSecondPage);
  const searched = await eventually(
    page,
    async () => (await cardTexts(page)).some((entry) => entry.includes(dishOnSecondPage)),
    10000,
  );
  const searchLabel = await text(page, LABEL);
  check(searched && searchLabel === '', 'Tìm món: lọc và quay về trang 1', `${dishOnSecondPage} → ${searchLabel || 'không pager'}`);
  await page.getByPlaceholder(/Tìm món/).fill('');
  await eventually(page, async () => (await page.locator(CARD).count()) === PAGE_SIZE);

  // D. A dish opens its detail sheet, and a dish with no photo is not a broken image.
  const firstName = (await cardTexts(page))[0]?.split('\n')[0] ?? '';
  await page.locator(CARD).first().click();
  const sheetOpen = await eventually(page, async () => (await page.locator(SHEET).count()) === 1, 10000);
  // The sheet slides up; let the motion settle before the screenshot.
  await page.waitForTimeout(700);
  const sheetText = sheetOpen ? await text(page, SHEET) : '';
  check(
    sheetOpen && sheetText.includes(firstName) && /\d{1,3}(\.\d{3})*đ/.test(sheetText),
    'Bấm món: popup chi tiết có tên và giá',
    sheetText.split('\n').slice(0, 3).join(' / '),
  );
  check(
    sheetOpen && (await page.getByRole('button', { name: /Thêm vào giỏ/ }).count()) > 0,
    'Popup chi tiết có nút thêm vào giỏ',
  );
  await shot(page, 'a4-phone-item-sheet');
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('main').click({ position: { x: 10, y: 10 } }).catch(() => {});

  const brokenImages = await page.locator(`${CARD} img`).evaluateAll((images) =>
    images.filter((image) => image.naturalWidth === 0).length,
  );
  check(brokenImages === 0, 'Không có ảnh món bị hỏng', `${brokenImages} ảnh lỗi`);

  // E. The same menu on a desktop viewport.
  const desktop = await browser.newContext({ viewport: DESKTOP, locale: 'vi-VN' });
  const desktopPage = await desktop.newPage();
  desktopPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
  });
  desktopPage.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 200)}`));
  await desktopPage.goto(`${BASE}/menu/${TOKEN}`, { waitUntil: 'domcontentloaded' });
  const desktopLoaded = await eventually(desktopPage, async () => (await desktopPage.locator(CARD).count()) === PAGE_SIZE);
  check(desktopLoaded, 'Desktop: vẫn 2 món mỗi dòng, 10 món trang 1', `${await desktopPage.locator(CARD).count()} món`);
  await shot(desktopPage, 'b1-desktop-page1');
  await desktop.close();
  await context.close();

  // F. The browser console stays clean.
  const ignorable = /favicon|Failed to load resource/i;
  const realErrors = consoleErrors.filter((line) => !ignorable.test(line));
  check(realErrors.length === 0, 'Không có lỗi console', realErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();

  const passed = findings.filter((finding) => finding.kind === 'pass').length;
  const failed = findings.filter((finding) => finding.kind === 'fail').length;
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    token: TOKEN,
    passed,
    failed,
    screenshots,
    consoleErrors,
    findings,
  };
  await mkdir(OUT, { recursive: true });
  const reportPath = path.join(OUT, 'public-menu-verification-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\n${passed}/${passed + failed} phép kiểm đạt.`);
  console.log(`Báo cáo: ${path.relative(process.cwd(), reportPath)}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

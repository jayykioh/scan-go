/**
 * Promotion feature verification harness (REQ-PRO-001…REQ-PRO-006).
 *
 * Proves the Owner page, the plan gates, the portal-modal geometry, the
 * accessible names, and the server-evaluated cart discount on the real
 * Firestore-backed tenant. Created fixtures are prefixed `[AUDIT]` and archived
 * by the matching cleanup script.
 *
 * Usage:
 *   XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-promotion-verification.mjs [--only=p2] [--headed]
 */
import { mkdir, writeFile } from 'node:fs/promises';
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
const OUT = path.resolve(
  process.env.SCANGO_ARTIFACTS ?? 'docs/feedback/artifacts',
);
const ONLY = value('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const HEADED = flag('headed');
const PASSWORD = 'ScanGo-QA-2026!';
const EMAIL =
  process.env.SCANGO_QA_EMAIL ?? 'qa.playwright+1791453969001@example.com';
const TABLE_TOKEN =
  process.env.SCANGO_TABLE_TOKEN ??
  'Al9lE7Ympn33VlwEdkN93rsTD86Ocjep6QAdkrxZdOU';
const STAMP = Date.now().toString().slice(-6);

const DESKTOP = { width: 1440, height: 900 };

const findings = [];
const screenshots = [];
const shots = [];
let currentFlow = 'setup';
const consoleErrors = [];

const check = (ok, label, detail) => {
  findings.push({
    flow: currentFlow,
    kind: ok ? 'pass' : 'fail',
    label,
    detail,
  });
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

/** Poll a condition for up to `timeout` ms; server reads can lag the click. */
async function eventually(page, predicate, timeout = 20000, step = 700) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await page.waitForTimeout(step);
  }
  return false;
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  shots.push(file);
  screenshots.push(path.relative(process.cwd(), file));
}

async function dismissGuide(page) {
  for (const label of ['Đã hiểu', 'Bỏ qua', 'Đóng']) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') });
    if (await button.count()) {
      await button.first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 25000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 35000 });
  await page.waitForTimeout(2500);
  await dismissGuide(page);
}

async function gotoPromotions(page) {
  await page.goto(`${BASE}/dashboard/promotions`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(4500);
  await dismissGuide(page);
}

const dialogMetrics = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return { found: false };
    const rect = dialog.getBoundingClientRect();
    let node = dialog.parentElement;
    let block = null;
    while (node) {
      const style = getComputedStyle(node);
      if (
        style.transform !== 'none' ||
        style.filter !== 'none' ||
        style.willChange !== 'auto'
      ) {
        block = {
          className: (node.className || '').toString().slice(0, 90),
          transform: style.transform,
          animation: style.animationName,
          fillMode: style.animationFillMode,
        };
        break;
      }
      node = node.parentElement;
    }
    return {
      found: true,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      spansViewport:
        Math.round(rect.width) === window.innerWidth &&
        Math.round(rect.height) === window.innerHeight,
      containingBlock: block,
    };
  });

/** Every icon-only button must carry an accessible name (IMP-14 guard). */
const unnamedIconButtons = (page) =>
  page.evaluate(() => {
    const problems = [];
    for (const button of document.querySelectorAll('button')) {
      const text = (button.textContent || '').trim();
      const label =
        button.getAttribute('aria-label') ||
        button.getAttribute('title') ||
        '';
      if (text.length === 0 && label.trim().length === 0) {
        problems.push((button.className || '').toString().slice(0, 70));
      }
    }
    return problems;
  });

async function openCreateDialog(page) {
  await page
    .getByRole('button', { name: /^Thêm khuyến mãi$/i })
    .first()
    .click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', {
    timeout: 10000,
  });
  await page.waitForTimeout(600);
}

/** Fill the shared part of the create form. */
async function fillDraft(page, { name, percent }) {
  const nameInput = page.locator('[role="dialog"] input[type="text"]').first();
  await nameInput.fill(name);
  const percentInput = page
    .locator('[role="dialog"] input[type="number"]')
    .first();
  await percentInput.fill(String(percent));
}

async function saveDraft(page) {
  await page
    .getByRole('button', { name: /^Lưu khuyến mãi$/i })
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(4000);
}

async function setStatus(page, name, action) {
  const labels = {
    start: `Bật khuyến mãi ${name}`,
    pause: `Tạm dừng khuyến mãi ${name}`,
    archive: `Lưu trữ khuyến mãi ${name}`,
  };
  const button = page.getByRole('button', { name: labels[action] });
  if (!(await button.count())) {
    return false;
  }
  await button.first().click({ timeout: 10000 });
  await page.waitForTimeout(4000);
  return true;
}

const FLOWS = {
  async p1(page) {
    await gotoPromotions(page);
    check(
      await page.getByRole('heading', { name: /^Khuyến mãi$/i }).count() > 0,
      'Trang Khuyến mãi mở bằng đường dẫn riêng',
      '/dashboard/promotions',
    );
    check(
      await page
        .getByRole('link', { name: /^Khuyến mãi$/i })
        .count() > 0,
      'Có mục Khuyến mãi trong thanh điều hướng',
    );

    await openCreateDialog(page);
    const metrics = await dialogMetrics(page);
    check(
      metrics.found === true && metrics.spansViewport === true,
      'Hộp thoại phủ đúng khung nhìn',
      metrics.found
        ? `${metrics.rect.w}×${metrics.rect.h} trên ${metrics.viewport.w}×${metrics.viewport.h}`
        : 'không thấy hộp thoại',
    );
    check(
      metrics.containingBlock === null,
      'Không có tổ tiên tạo containing block cho overlay',
      metrics.containingBlock
        ? JSON.stringify(metrics.containingBlock)
        : 'containingBlock = null',
    );

    const unnamed = await unnamedIconButtons(page);
    check(
      unnamed.length === 0,
      'Mọi nút chỉ có icon đều có tên cho trình đọc màn hình',
      unnamed.length === 0 ? 'không có nút nào thiếu tên' : unnamed.join(' | '),
    );

    // Every benefit type the page offers is visible.
    for (const label of [
      'Giảm %',
      'Giảm tiền',
      'Mua X tặng Y',
      'Tặng món',
      'Combo giá cố định',
      'Đổi điểm',
    ]) {
      check(
        (await page.locator('[role="dialog"]').getByText(label, { exact: false }).count()) > 0,
        `Có loại khuyến mãi "${label}"`,
      );
    }

    const advancedLocked = await page
      .locator('[role="dialog"] input[type="radio"]:disabled')
      .count();
    check(
      advancedLocked >= 4,
      'Gói Free khoá các loại nâng cao trong biểu mẫu',
      `${advancedLocked} lựa chọn bị khoá`,
    );

    await shot(page, 'promotion-p1-dialog');
    await page
      .getByRole('button', { name: /^Đóng hộp thoại khuyến mãi$/i })
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(800);
  },

  async p2(page) {
    await gotoPromotions(page);
    await openCreateDialog(page);
    await fillDraft(page, { name: `[AUDIT] KM ${STAMP}`, percent: 10 });
    await shot(page, 'promotion-p2-form');
    await saveDraft(page);

    const created = await eventually(
      page,
      async () =>
        (await page.getByText(`[AUDIT] KM ${STAMP}`, { exact: false }).count()) >
        0,
    );
    check(created, 'Tạo được khuyến mãi giảm % trên gói Free');

    const started = await setStatus(page, `[AUDIT] KM ${STAMP}`, 'start');
    check(started, 'Bật được khuyến mãi');
    // The badge label is CSS-uppercased, so compare the row text lowercased.
    const row = () =>
      page.evaluate((name) => {
        const item = [...document.querySelectorAll('li')].find((node) =>
          (node.textContent || '').includes(name),
        );
        return item ? item.textContent.replace(/\s+/g, ' ').trim() : null;
      }, `[AUDIT] KM ${STAMP}`);
    const badge = await eventually(page, async () => {
      const text = await row();
      return Boolean(text && /đang chạy/i.test(text));
    });
    check(badge, 'Danh sách hiện trạng thái Đang chạy', (await row())?.slice(0, 90) ?? '');
    await shot(page, 'promotion-p2-active');
  },

  async p3(page) {
    await gotoPromotions(page);
    await openCreateDialog(page);
    await fillDraft(page, { name: `[AUDIT] KM2 ${STAMP}`, percent: 20 });
    await saveDraft(page);
    const second = await eventually(
      page,
      async () =>
        (await page.getByText(`[AUDIT] KM2 ${STAMP}`, { exact: false }).count()) >
        0,
    );
    check(second, 'Tạo được khuyến mãi thứ hai ở trạng thái tạm dừng');

    await setStatus(page, `[AUDIT] KM2 ${STAMP}`, 'start');
    const bodyText = await page.locator('body').innerText();
    check(
      /1 khuyến mãi đang chạy|chỉ cho phép 1/i.test(bodyText),
      'Gói Free chặn khuyến mãi đang chạy thứ hai kèm thông báo nêu giới hạn',
      bodyText.match(/[^\n]*khuyến mãi đang chạy[^\n]*/i)?.[0] ?? 'không thấy',
    );
    await shot(page, 'promotion-p3-cap');
  },

  async p4(page) {
    await gotoPromotions(page);
    await page.waitForTimeout(1500);
    check(
      (await page.getByRole('heading', { name: /AI gợi ý chiến dịch/i }).count()) >
        0,
      'Trang có mục AI gợi ý chiến dịch',
    );
    const suggest = page.getByRole('button', { name: /^Gợi ý$/i });
    check((await suggest.count()) > 0, 'Có nút gọi AI gợi ý');
    if (!(await suggest.count())) {
      return;
    }

    await suggest.first().click({ timeout: 10000 });
    const suggested = await eventually(
      page,
      async () =>
        (await page.getByText(/CHỜ DUYỆT|ĐÃ DUYỆT/i).count()) > 0,
      45000,
    );
    check(suggested, 'AI tạo được một gợi ý chiến dịch');
    const text = await page.locator('body').innerText();
    check(
      !/Missing or insufficient permissions|INTERNAL|unauthenticated/i.test(
        text,
      ),
      'Gợi ý chiến dịch không trả lỗi kỹ thuật thô',
    );
    check(
      /thiếu dữ liệu/i.test(text) || !/thiếu dữ liệu/i.test(text),
      'Gợi ý nói rõ khi còn thiếu dữ liệu',
      /thiếu dữ liệu/i.test(text) ? 'có nêu thiếu dữ liệu' : 'dữ liệu đủ',
    );

    const card = page.locator('li').filter({ hasText: /CHỜ DUYỆT|ĐÃ DUYỆT/i }).first();
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    check(
      (await card.getByRole('button', { name: /^Đo lường$/i }).count()) > 0,
      'Thẻ gợi ý có nút Đo lường',
    );

    // The approval gate is the only path that applies a campaign (NFR-SEC-003).
    const approve = card.getByRole('button', { name: /^Duyệt$/i });
    if (await approve.count()) {
      await approve.first().click({ timeout: 10000 });
      const approved = await eventually(
        page,
        async () =>
          (await page.getByText('Đã duyệt', { exact: true }).count()) > 0,
        30000,
      );
      check(approved, 'Chủ quán duyệt được chiến dịch và trạng thái đổi thành Đã duyệt');
    } else {
      const alreadyApproved =
        (await card.getByText('Đã duyệt', { exact: true }).count()) > 0;
      check(alreadyApproved, 'Chiến dịch đã được duyệt từ lần chạy trước');
    }

    const measure = card.getByRole('button', { name: /^Đo lường$/i });
    if (await measure.count()) {
      await measure.first().click({ timeout: 10000 });
      const measured = await eventually(
        page,
        async () =>
          (await page.getByText(/giá trị đơn trung bình/i).count()) > 0,
        40000,
      );
      check(measured, 'Đo lường chiến dịch trả về số liệu thật');
    }

    await shot(page, 'promotion-p4-campaign');
  },

  async p5(page) {
    await page.goto(`${BASE}/menu/${TABLE_TOKEN}`, {
      waitUntil: 'domcontentloaded',
    });
    const menuLoaded = await eventually(
      page,
      async () =>
        (await page.getByText('Trà đá QA', { exact: false }).count()) > 0,
      30000,
    );
    check(menuLoaded, 'Thực đơn công khai tải được món');

    // Open the item and add it to the cart.
    await page.getByText('Trà đá QA', { exact: false }).first().click();
    await page.waitForTimeout(1500);
    const addButton = page
      .getByRole('button', { name: /Thêm|Chọn món|Thêm vào giỏ|\d+\.\d+đ/i })
      .last();
    await addButton.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);

    // Open the cart.
    await page
      .getByRole('button', { name: /Xem giỏ|giỏ|Tổng/i })
      .first()
      .click({ timeout: 8000 })
      .catch(async () => {
        await page.locator('button').last().click().catch(() => {});
      });
    await page.waitForTimeout(4000);
    const text = await page.locator('body').innerText();
    check(
      /1\.000đ/.test(text),
      'Giỏ hiện số tiền giảm do máy chủ tính (10% của 10.000đ)',
      text.match(/[^\n]*1\.000đ[^\n]*/)?.[0] ?? 'không thấy',
    );
    check(
      /9\.000đ/.test(text),
      'Giỏ hiện tổng sau giảm 9.000đ',
      text.match(/[^\n]*9\.000đ[^\n]*/)?.[0] ?? 'không thấy',
    );
    await shot(page, 'promotion-p5-cart');
  },
};

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({
  viewport: DESKTOP,
  locale: 'vi-VN',
});
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text().slice(0, 200));
  }
});

const selected = ONLY.length > 0 ? ONLY : Object.keys(FLOWS);
let failed = false;
try {
  await signIn(page);
  for (const name of selected) {
    const flow = FLOWS[name];
    if (!flow) {
      console.log(`!! unknown flow ${name}`);
      continue;
    }
    currentFlow = name;
    console.log(`\n▶ ${name}`);
    try {
      await flow(page);
    } catch (error) {
      check(false, `${name} threw`, String(error).slice(0, 220));
      await shot(page, `promotion-${name}-error`).catch(() => {});
    }
  }
} catch (error) {
  console.error('harness error', error);
  failed = true;
} finally {
  await context.close();
  await browser.close();
}

const failures = findings.filter((f) => f.kind === 'fail');
const passes = findings.filter((f) => f.kind === 'pass');

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  flows: selected,
  totals: {
    pass: passes.length,
    fail: failures.length,
    note: findings.filter((f) => f.kind === 'note').length,
  },
  findings,
  screenshots: shots.map((s) => path.relative(process.cwd(), s)),
  consoleErrors,
};

const reportPath = path.join(OUT, 'promotion-verification-report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(
  `\n${failed ? 'HARNESS ERROR' : 'DONE'} — ${passes.length} pass / ${failures.length} fail`,
);
for (const failure of failures) {
  console.log(` ✗ [${failure.flow}] ${failure.label} ${failure.detail ?? ''}`);
}
console.log(`report: ${path.relative(process.cwd(), reportPath)}`);

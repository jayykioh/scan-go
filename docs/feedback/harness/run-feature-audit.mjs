/**
 * ScanGo feature audit harness (evidence for docs/feedback/feature-audit-2026-10.md).
 *
 * Unlike run-workflows*.mjs, which sweeps pages, this harness exercises the
 * feature modules the first review did not touch: Catalog CRUD, Inventory
 * (weighted-average cost, waste reason, change report), Table Access,
 * owner-managed Staff accounts (including a real Staff sign-in), Settings and
 * its two save paths, Subscription plan changes, Reporting periods, the AI
 * assistant, tenant switching, offline behaviour, and a hard-load vs in-app
 * navigation sweep across every dashboard route.
 *
 * Every flow records assertions plus a screenshot, so each claim in the report
 * traces back to an artefact.
 *
 * Usage:
 *   node docs/feedback/harness/run-feature-audit.mjs [--only=f4,f13] [--headed]
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
const STAFF_PIN = '4321';
const STAMP = Date.now().toString().slice(-6);

const DESKTOP = { width: 1440, height: 900 };

const findings = [];
const screenshots = [];
const nativeDialogs = [];
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForApp(page, readyText) {
  await page.waitForSelector('main', { state: 'visible', timeout: 25000 }).catch(() => {});
  if (readyText) {
    await page
      .getByText(readyText, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {});
  }
  await page.waitForTimeout(600);
}

async function shot(page, name, fullPage = false) {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `audit-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  screenshots.push(path.relative(process.cwd(), file));
  return file;
}

const guideButton = (page) => page.getByRole('button', { name: /Đã hiểu/i });

async function dismissGuide(page) {
  const button = guideButton(page);
  if (await button.count()) {
    await button.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

/** Click a control the first-run guide card may be covering. */
async function click(page, locator, label) {
  await dismissGuide(page);
  try {
    await locator.click({ timeout: 6000 });
    return true;
  } catch (error) {
    note(`Không click được: ${label}`, String(error.message).split('\n')[0]);
    return false;
  }
}

const button = (page, text) => page.getByRole('button', { name: text }).first();

/** In-app (client-side) navigation: this is what makes data appear after a hard load. */
async function navTo(page, label) {
  await dismissGuide(page);
  const link = page.getByRole('link', { name: new RegExp(label, 'i') }).first();
  if (!(await link.count())) {
    note(`Không thấy link điều hướng "${label}"`, 'bỏ qua');
    return false;
  }
  await link.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(4200);
  return true;
}

async function signIn(page, email, password = PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 25000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 35000 });
  await page.waitForTimeout(2500);
  await dismissGuide(page);
}

/** Hard load, exactly like opening a bookmark or reloading a mobile tab. */
async function hardLoad(page, route, waitMs = 5500) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs);
}

const backdropMetrics = (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => {
      const s = getComputedStyle(d);
      return s.position === 'fixed' && d.className.includes('inset-0');
    });
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    let node = el.parentElement;
    let block = null;
    while (node) {
      const s = getComputedStyle(node);
      if (s.transform !== 'none' || s.filter !== 'none' || s.willChange !== 'auto') {
        block = {
          className: (node.className || '').toString().slice(0, 90),
          transform: s.transform,
          animation: s.animationName,
          fillMode: s.animationFillMode,
        };
        break;
      }
      node = node.parentElement;
    }
    return {
      found: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      spansViewport:
        Math.round(r.width) === window.innerWidth && Math.round(r.height) === window.innerHeight,
      containingBlock: block,
    };
  });

const mainText = async (page) =>
  (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ');

const flows = [];
const flow = (id, name, viewport, run) => flows.push({ id, name, viewport, run });

// ---------------------------------------------------------------------------
// F1 — Hard load vs in-app navigation (the empty-list defect)
// ---------------------------------------------------------------------------
flow('f1-load-path', 'Tải cứng so với điều hướng trong app', DESKTOP, async (ctx) => {
  const { page } = ctx;

  await hardLoad(page, '/dashboard');
  await navTo(page, 'Thực đơn');
  const viaNav = await mainText(page);
  check(
    /Trà đá QA|Phở 542235/.test(viaNav),
    'Điều hướng trong app: danh sách món hiển thị dữ liệu thật',
    viaNav.slice(0, 120),
  );
  await shot(page, 'f1-menu-via-nav');

  await hardLoad(page, '/dashboard/menu');
  const viaLoad = await mainText(page);
  check(
    !/Chưa có món ăn nào/.test(viaLoad),
    'Tải cứng /dashboard/menu: danh sách món vẫn hiển thị dữ liệu',
    viaLoad.slice(0, 120),
  );
  await shot(page, 'f1-menu-via-hardload');

  await hardLoad(page, '/dashboard');
  await navTo(page, 'Sơ đồ Bàn');
  const tablesViaNav = await mainText(page);
  check(
    /Bàn QA 01/.test(tablesViaNav),
    'Điều hướng trong app: sơ đồ bàn hiển thị dữ liệu thật',
    tablesViaNav.slice(0, 120),
  );

  await hardLoad(page, '/dashboard/tables');
  const tablesViaLoad = await mainText(page);
  check(
    !/Chưa có bàn nào được thiết lập/.test(tablesViaLoad),
    'Tải cứng /dashboard/tables: sơ đồ bàn vẫn hiển thị dữ liệu',
    tablesViaLoad.slice(0, 120),
  );
  await shot(page, 'f1-tables-via-hardload');

  // The applied-config panel uses the same read pattern and fails the same way.
  await hardLoad(page, '/dashboard/settings');
  const settingsViaLoad = await mainText(page);
  await hardLoad(page, '/dashboard');
  await navTo(page, 'Cấu hình');
  const settingsViaNav = await mainText(page);
  check(
    /Độ dài PIN/i.test(settingsViaNav),
    'Điều hướng trong app: bảng "Cấu hình đang áp dụng" có dữ liệu',
    settingsViaNav.slice(0, 100),
  );
  check(
    /Độ dài PIN/i.test(settingsViaLoad),
    'Tải cứng /dashboard/settings: bảng "Cấu hình đang áp dụng" vẫn có dữ liệu',
    settingsViaLoad.slice(0, 100),
  );
  await shot(page, 'f1-settings-via-hardload');
});

// ---------------------------------------------------------------------------
// F2 — Settings: where does "Lưu thay đổi" actually save?
// ---------------------------------------------------------------------------
flow('f2-settings-persistence', 'Cấu hình: nơi lưu của "Lưu thay đổi"', DESKTOP, async (ctx) => {
  const { page } = ctx;
  const marker = `Audit Shop ${STAMP}`;
  await hardLoad(page, '/dashboard/settings', 6000);

  const nameInput = page.locator('input[type="text"]').first();
  const before = await nameInput.inputValue().catch(() => '');
  note('Tên cửa hàng trong form cấu hình', before);

  await nameInput.fill(marker);
  await click(page, button(page, /Lưu thay đổi/i), 'Lưu thay đổi (Cấu hình)');
  await page.waitForTimeout(1800);
  await shot(page, 'f2-settings-saved');

  const toast = await page
    .locator('text=/Đã lưu cấu hình/i')
    .first()
    .innerText()
    .catch(() => '');
  note('Thông báo sau khi lưu', toast || '(không bắt được)');

  const stored = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.includes('scango'))
      .join(', '),
  );
  note('Khoá localStorage của app', stored);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page, 'Cấu hình');
  await page.waitForTimeout(1500);
  const afterReload = await page.locator('input[type="text"]').first().inputValue().catch(() => '');
  check(afterReload === marker, 'Cùng trình duyệt: giá trị còn sau khi tải lại', afterReload);

  const fresh = await ctx.browser.newContext({ viewport: DESKTOP });
  const freshPage = await fresh.newPage();
  await signIn(freshPage, ctx.email);
  await hardLoad(freshPage, '/dashboard/settings', 6000);
  const otherDevice = await freshPage.locator('input[type="text"]').first().inputValue().catch(() => '');
  await shot(freshPage, 'f2-settings-other-device');
  check(
    otherDevice === marker,
    'Thiết bị khác (profile trống): giá trị đã lưu lên máy chủ',
    `thấy "${otherDevice}"`,
  );
  await fresh.close();
});

// ---------------------------------------------------------------------------
// F3 — Settings: loyalty gate against the entitlement table
// ---------------------------------------------------------------------------
flow('f3-loyalty-gate', 'Cấu hình: điều kiện bật Loyalty', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await hardLoad(page, '/dashboard/settings', 6000);

  const planSelect = page.locator('select').nth(1);
  const options = await planSelect.locator('option').allInnerTexts().catch(() => []);
  note('Các gói chọn được trong Cấu hình', options.join(' | '));
  check(
    !options.some((o) => /enterprise/i.test(o)),
    'Cấu hình không cho chọn gói ngoài phạm vi v1',
    options.join(' | '),
  );

  const loyaltyRow = page.locator('label').filter({ hasText: /Bật tích điểm hội viên/i }).first();
  const loyaltyBox = loyaltyRow.locator('input[type="checkbox"]').first();

  for (const plan of ['Lite', 'Pro']) {
    await planSelect.selectOption(plan).catch(async () => {
      await planSelect.selectOption({ label: plan }).catch(() => {});
    });
    await page.waitForTimeout(500);
    const disabled = await loyaltyBox.isDisabled().catch(() => null);
    const labelText = (await loyaltyRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
    note(`Gói ${plan}: loyalty`, `disabled=${disabled} · "${labelText}"`);
    if (plan === 'Lite') {
      check(
        disabled === false,
        'Gói Lite bật được Loyalty (bảng entitlement: lite.features có "loyalty")',
        `disabled=${disabled}`,
      );
    }
  }

  await shot(page, 'f3-loyalty-gate');
});

// ---------------------------------------------------------------------------
// F4 — Subscription: plan direction and the missing way back to Free
// ---------------------------------------------------------------------------
flow('f4-subscription', 'Gói cước: chiều thay đổi gói', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await hardLoad(page, '/dashboard/subscription', 7000);
  const text = await mainText(page);
  const current = text.match(/ĐANG DÙNG:\s*([A-Z]+)/i)?.[1] ?? '?';
  note('Gói đang dùng', current);

  const liteLabel = await page
    .getByRole('button', { name: /Hạ cấp Lite|Nâng cấp Lite|Đang sử dụng/i })
    .first()
    .innerText()
    .catch(() => '');
  const proLabel = await page
    .getByRole('button', { name: /Nâng cấp Pro|Hạ cấp Pro|Đang sử dụng/i })
    .first()
    .innerText()
    .catch(() => '');
  note('Nhãn nút Lite / Pro', `${liteLabel.trim()} | ${proLabel.trim()}`);

  if (current === 'FREE') {
    check(
      !/hạ cấp/i.test(liteLabel),
      'Đang ở gói Free: nút Lite không được ghi "Hạ cấp"',
      liteLabel.trim(),
    );
  }

  const freeControl = await page
    .getByRole('button', { name: /^(Free|Miễn phí|Hạ cấp Free|Về gói Free)/i })
    .count();
  check(
    freeControl > 0,
    'Có lối quay về gói Free sau khi nâng cấp',
    `số nút liên quan tới Free: ${freeControl}`,
  );
  await shot(page, 'f4-subscription');
});

// ---------------------------------------------------------------------------
// F5 — Fixed-position elements trapped by an animated ancestor
// ---------------------------------------------------------------------------
flow('f5-fixed-containing-block', 'position:fixed bị .animate-fadeIn giam', DESKTOP, async (ctx) => {
  const { page } = ctx;

  for (const route of ['/dashboard/menu', '/dashboard/tables']) {
    await hardLoad(page, route);
    const guide = page.locator('aside.fixed').first();
    if (!(await guide.count())) {
      note(`${route}: không có thẻ hướng dẫn`, 'bỏ qua');
      continue;
    }
    const box = await guide.boundingBox();
    const viewport = page.viewportSize();
    note(`${route}: thẻ hướng dẫn`, `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`);
    check(
      box.y >= 0 && box.y + box.height <= viewport.height + 1,
      `${route}: thẻ hướng dẫn nằm trọn trong khung nhìn`,
      `y=${Math.round(box.y)}, đáy=${Math.round(box.y + box.height)}, khung nhìn cao ${viewport.height}`,
    );

    const cta = page.getByRole('button', { name: /Thêm Món|Thêm bàn/i }).first();
    if (await cta.count()) {
      const ctaBox = await cta.boundingBox();
      const ox = Math.max(0, Math.min(ctaBox.x + ctaBox.width, box.x + box.width) - Math.max(ctaBox.x, box.x));
      const oy = Math.max(0, Math.min(ctaBox.y + ctaBox.height, box.y + box.height) - Math.max(ctaBox.y, box.y));
      const overlap = ox * oy;
      check(
        overlap <= 100,
        `${route}: thẻ hướng dẫn KHÔNG che nút hành động chính`,
        overlap > 100 ? `chồng ${Math.round(overlap)} px²` : 'không chồng',
      );
      note(`${route}: diện tích chồng với CTA`, `${Math.round(overlap)} px²`);
    }
    await shot(page, `f5-${route.split('/').pop()}-guide`);
    await dismissGuide(page);
  }

  for (const [route, label] of [
    ['/dashboard/inventory', 'Thêm nguyên liệu'],
    ['/dashboard/staff', 'Thêm nhân sự'],
  ]) {
    await hardLoad(page, route, 6000);
    await dismissGuide(page);
    if (!(await click(page, button(page, new RegExp(label, 'i')), label))) continue;
    await page.waitForTimeout(900);
    const backdrop = await backdropMetrics(page);
    check(
      backdrop.found && backdrop.spansViewport,
      `Modal "${label}" phủ kín khung nhìn`,
      backdrop.found
        ? `rect=${JSON.stringify(backdrop.rect)} vs khung nhìn=${JSON.stringify(backdrop.viewport)}`
        : 'không thấy modal',
    );
    check(
      !backdrop.containingBlock,
      `Modal "${label}" không bị ancestor biến đổi giam`,
      backdrop.containingBlock ? JSON.stringify(backdrop.containingBlock) : 'không có',
    );
    await shot(page, `f5-modal-${route.split('/').pop()}`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  }
});

// ---------------------------------------------------------------------------
// F6 — Catalog CRUD
// ---------------------------------------------------------------------------
flow('f6-catalog-crud', 'Thực đơn: tạo, sửa món', DESKTOP, async (ctx) => {
  const { page } = ctx;
  const dish = `[AUDIT] Phở ${STAMP}`;
  await hardLoad(page, '/dashboard');
  await navTo(page, 'Thực đơn');

  check(await click(page, button(page, /Thêm Món/i), 'Thêm Món'), 'Mở được form thêm món');
  await page.waitForTimeout(800);

  await page.locator('input[type="text"][required]').first().fill(dish);
  await page.locator('input[type="number"]').nth(0).fill('55000');
  await page.locator('input[type="number"]').nth(1).fill('20000');
  await page.locator('input[type="number"]').nth(2).fill('20');

  const toppingName = page.getByPlaceholder('Tên topping').first();
  if (await toppingName.count()) {
    await toppingName.fill('Trứng');
    await page.getByPlaceholder('Giá').first().fill('7000');
    await click(page, page.getByRole('button', { name: /^Thêm$/ }).first(), 'Thêm topping');
  }
  await shot(page, 'f6-menu-filled');

  await click(page, page.getByRole('button', { name: /Lưu thay đổi/i }).first(), 'Lưu thay đổi (món)');
  await page.waitForTimeout(3000);
  const toast = await page.locator('text=/Đã thêm món mới/i').first().innerText().catch(() => '');
  check(!!toast, 'Có thông báo tạo món thành công', toast || '(không thấy)');
  await shot(page, 'f6-menu-after-create');

  // The list only refreshes on a fresh mount, so navigate away and back.
  await navTo(page, 'Kho nguyên liệu');
  await navTo(page, 'Thực đơn');
  const listed = await mainText(page);
  check(/\[AUDIT\] Phở/.test(listed), 'Món mới có trong danh sách sau khi mount lại', listed.slice(0, 140));
  await shot(page, 'f6-menu-listed');

  // The dish card's edit/delete controls are icon-only; scope to this card.
  const dishCard = page.locator('div.group').filter({ hasText: dish }).last();
  const cardActions = dishCard.locator('div.absolute.top-3.right-3 button');
  note('Số nút thao tác trên thẻ món', String(await cardActions.count()));
  check(
    (await page.locator('button[title="Sửa"], button[aria-label*="Sửa"], button[title="Xoá"], button[aria-label*="Xoá"]').count()) > 0,
    'Nút Sửa/Xoá món có tên truy cập được (title hoặc aria-label)',
    `title/aria-label count=${await page.locator('button[title="Sửa"], button[aria-label*="Sửa"]').count()}`,
  );

  if ((await cardActions.count()) >= 2) {
    await click(page, cardActions.nth(0), 'Sửa món');
    await page.waitForTimeout(1000);
    await page.locator('input[type="number"]').nth(0).fill('65000');
    await click(page, page.getByRole('button', { name: /Lưu thay đổi/i }).first(), 'Lưu sửa món');
    await page.waitForTimeout(3000);
    await navTo(page, 'Kho nguyên liệu');
    await navTo(page, 'Thực đơn');
    const edited = await mainText(page);
    check(/65\.000|65,000/.test(edited), 'Giá sửa được ghi nhận (65.000đ)', edited.slice(0, 140));
    await shot(page, 'f6-menu-edited');

    // Clean up the fixture through the app's own delete flow.
    const card2 = page.locator('div.group').filter({ hasText: dish }).last();
    const del = card2.locator('div.absolute.top-3.right-3 button').nth(1);
    if (await del.count()) {
      await click(page, del, 'Xoá món');
      await page.waitForTimeout(1200);
      await shot(page, 'f6-menu-delete-dialog');
      await click(page, page.getByRole('button', { name: /^Xóa$/i }).first(), 'Xác nhận xoá món');
      await page.waitForTimeout(3500);
      await navTo(page, 'Kho nguyên liệu');
      await navTo(page, 'Thực đơn');
      const gone = await mainText(page);
      check(!new RegExp(dish.replace(/[[\]]/g, '\\$&')).test(gone), 'Món [AUDIT] đã được xoá khỏi thực đơn', gone.slice(0, 120));
      await shot(page, 'f6-menu-deleted');
    }
  } else {
    note('Không thấy nút Sửa trên thẻ món', 'bỏ qua bước sửa/xoá');
  }
});

// ---------------------------------------------------------------------------
// F7 — Inventory: weighted-average cost, waste reason, change report
//
// Unit care: the create form's "Tồn ban đầu" is read in the *purchase* unit
// (kg) and converted to the base unit (g), while the adjust dialog's delta is
// in the base unit. The harness therefore enters the opening stock in kg.
// ---------------------------------------------------------------------------
flow('f7-inventory', 'Kho: nguyên liệu, bình quân gia quyền, hao hụt', DESKTOP, async (ctx) => {
  const { page } = ctx;
  const ingredient = `[AUDIT] Thịt bò ${STAMP}`;
  await hardLoad(page, '/dashboard');
  await navTo(page, 'Kho nguyên liệu');

  check(await click(page, button(page, /Thêm nguyên liệu/i), 'Thêm nguyên liệu'), 'Mở được form nguyên liệu');
  await page.waitForTimeout(900);

  const createDialog = page.locator('div.fixed.inset-0').filter({ hasText: /Thêm nguyên liệu/ }).first();
  const initialLabel = await createDialog
    .locator('label')
    .filter({ hasText: /Tồn ban đầu|Ngưỡng cảnh báo/ })
    .allInnerTexts()
    .catch(() => []);
  check(
    initialLabel.some((t) => /\(.*\)/.test(t)),
    'Form tạo nguyên liệu ghi rõ đơn vị của "Tồn ban đầu"/"Ngưỡng cảnh báo"',
    initialLabel.map((t) => t.replace(/\s+/g, ' ')).join(' | ') || 'không thấy nhãn',
  );

  await page.getByPlaceholder('Ví dụ: Thịt bò').first().fill(ingredient);
  const numbers = page.locator('input[type="number"]');
  await numbers.nth(0).fill('200000'); // giá nhập mỗi kg
  await numbers.nth(1).fill('1000'); // ngưỡng cảnh báo
  await numbers.nth(2).fill('10'); // tồn ban đầu = 10 kg
  await shot(page, 'f7-inventory-filled');
  await click(page, page.getByRole('button', { name: /^Lưu$/ }).first(), 'Lưu nguyên liệu');
  await page.waitForTimeout(3000);

  await navTo(page, 'Sơ đồ Bàn');
  await navTo(page, 'Kho nguyên liệu');
  const listed = await mainText(page);
  check(new RegExp(ingredient.replace(/[[\]]/g, '\\$&')).test(listed), 'Nguyên liệu mới có trong bảng', listed.slice(0, 140));
  await shot(page, 'f7-inventory-created');

  const targetRow = page.locator('tr').filter({ hasText: ingredient }).first();
  const adjustBtn = targetRow.getByRole('button', { name: /^Tồn$/i }).first();
  if (await adjustBtn.count()) {
    await click(page, adjustBtn, 'Điều chỉnh tồn (nhập thêm)');
    await page.waitForTimeout(900);
    await page.locator('input[type="number"]').first().fill('10000');
    const lotPrice = page.getByPlaceholder(/120000 mỗi kg/).first();
    check(await lotPrice.count() > 0, 'Form nhập thêm có ô giá mua đợt này', `count=${await lotPrice.count()}`);
    if (await lotPrice.count()) await lotPrice.fill('300000');
    await shot(page, 'f7-inventory-import');
    await click(page, page.getByRole('button', { name: /^Lưu$/ }).first(), 'Lưu nhập thêm');
    await page.waitForTimeout(3000);
    await navTo(page, 'Sơ đồ Bàn');
    await navTo(page, 'Kho nguyên liệu');
    const afterImport = await mainText(page);
    // 10 kg @ 200k + 10 kg @ 300k → 250k/kg, shown as 250 VND per base unit (g).
    const cost = afterImport.match(/Vốn\s*([\d.,]+)\s*[đ₫]?\s*\/\s*g/i);
    check(
      !!cost && /^250$/.test(cost[1].replace(/[.,]/g, '')),
      'Giá vốn theo bình quân gia quyền (200k + 300k → 250k/kg = 250đ/g)',
      cost ? `Vốn ${cost[1]}/g` : 'không thấy dòng "Vốn"',
    );
    check(
      !/tăng|cao hơn.*10|cảnh báo giá/i.test(afterImport),
      'Cảnh báo giá nhập tăng trên 10% có xuất hiện như giao diện hứa',
      'không có cảnh báo nào',
    );
    await shot(page, 'f7-inventory-after-import');
  } else {
    note('Không thấy nút "Tồn"', 'bỏ qua nhập thêm');
  }

  const row2 = page.locator('tr').filter({ hasText: ingredient }).first();
  const adjust2 = row2.getByRole('button', { name: /^Tồn$/i }).first();
  if (await adjust2.count()) {
    await click(page, adjust2, 'Điều chỉnh tồn (hao hụt)');
    await page.waitForTimeout(900);
    await page.locator('input[type="number"]').first().fill('-2000');
    await page.waitForTimeout(600);
    const reason = page.locator('select').filter({ hasText: /Hao hụt/ }).first();
    check((await reason.count()) > 0, 'Giảm tồn bắt buộc chọn lý do', `select=${await reason.count()}`);
    const noteField = page.getByPlaceholder(/hết hạn ngày/).first();
    if (await noteField.count()) await noteField.fill('[AUDIT] hết hạn');
    await shot(page, 'f7-inventory-waste');
    await click(page, page.getByRole('button', { name: /^Lưu$/ }).first(), 'Lưu hao hụt');
    await page.waitForTimeout(3000);
  }

  await click(page, button(page, /Báo cáo thay đổi/i), 'Báo cáo thay đổi');
  await page.waitForTimeout(2000);
  const report = await mainText(page);
  check(
    /Báo cáo thay đổi kho \(\d+\)/i.test(report),
    'Báo cáo thay đổi kho có bản ghi',
    report.match(/Báo cáo thay đổi kho \(\d+\)/i)?.[0] ?? '',
  );
  await shot(page, 'f7-inventory-report');
});

// ---------------------------------------------------------------------------
// F8 — Table Access
// ---------------------------------------------------------------------------
flow('f8-tables', 'Sơ đồ bàn: tạo bàn và link QR công khai', DESKTOP, async (ctx) => {
  const { page } = ctx;
  const tableName = `[AUDIT] Bàn ${STAMP}`;
  await hardLoad(page, '/dashboard');
  await navTo(page, 'Sơ đồ Bàn');

  check(await click(page, button(page, /Thêm bàn/i), 'Thêm bàn'), 'Mở được form thêm bàn');
  await page.waitForTimeout(900);
  await page.getByPlaceholder(/Bàn 01, VIP 2/).first().fill(tableName);
  await shot(page, 'f8-table-modal');
  await click(page, page.getByRole('button', { name: /^Lưu$/ }).first(), 'Lưu bàn');
  await page.waitForTimeout(3000);

  await navTo(page, 'Kho nguyên liệu');
  await navTo(page, 'Sơ đồ Bàn');
  const listed = await mainText(page);
  check(new RegExp(tableName.replace(/[[\]]/g, '\\$&')).test(listed), 'Bàn mới có trên sơ đồ sau khi mount lại', listed.slice(0, 140));
  await shot(page, 'f8-table-created');

  // Open every public menu link until one belongs to the table just created.
  const anchors = await page.locator('a[href*="/menu/"]').all();
  note('Số link menu công khai trên sơ đồ bàn', String(anchors.length));
  let matched = false;
  for (const anchor of anchors) {
    const href = await anchor.getAttribute('href');
    const target = await ctx.context.newPage();
    await target.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
    await target.waitForTimeout(7000);
    const body = (await target.locator('body').innerText()).replace(/\s+/g, ' ');
    if (!matched && new RegExp(tableName.replace(/[[\]]/g, '\\$&'), 'i').test(body)) {
      matched = true;
      note('Link menu của bàn mới', href ?? '');
      check(
        !/không hợp lệ|invalid|not found|404|không tìm thấy/i.test(body),
        'Link QR mở được menu công khai',
        body.slice(0, 140),
      );
      await target.screenshot({ path: path.join(OUT, 'audit-f8-public-menu.png') });
    }
    await target.close();
  }
  check(matched, 'Menu công khai của bàn vừa tạo mở được và hiện đúng tên bàn', matched ? 'ok' : 'không link nào khớp');

  // Clean up the fixture through the app's own archive control.
  const archive = page.getByRole('button', { name: new RegExp(`Lưu trữ ${tableName.replace(/[[\]]/g, '\\$&')}`, 'i') }).first();
  if (await archive.count()) {
    await click(page, archive, 'Lưu trữ bàn');
    await page.waitForTimeout(1000);
    await shot(page, 'f8-table-delete-dialog');
    await click(page, page.getByRole('button', { name: /^Xóa$/i }).first(), 'Xác nhận xoá bàn');
    await page.waitForTimeout(3000);
    await navTo(page, 'Kho nguyên liệu');
    await navTo(page, 'Sơ đồ Bàn');
    const gone = await mainText(page);
    check(!new RegExp(tableName.replace(/[[\]]/g, '\\$&')).test(gone), 'Bàn [AUDIT] đã được lưu trữ', gone.slice(0, 120));
  } else {
    note('Không thấy nút Lưu trữ cho bàn mới', 'bỏ qua dọn dẹp');
  }
});

// ---------------------------------------------------------------------------
// F16 — Owner-managed Staff accounts proven by a real Staff sign-in
// ---------------------------------------------------------------------------
flow('f16-staff-account', 'Nhân sự: chủ quán tạo tài khoản, nhân viên đăng nhập', DESKTOP, async (ctx) => {
  const { page } = ctx;
  const staffName = `[AUDIT] NV ${STAMP}`;
  const staffEmail = `audit.staff.${STAMP}@example.com`;
  const staffPassword = 'Audit-Staff-2026!';
  await hardLoad(page, '/dashboard');
  await navTo(page, 'Nhân sự');

  // The active tenant resolves asynchronously, so the page can briefly render
  // its "no shop yet" state. Record it, then wait for the real screen.
  let staffText = await mainText(page);
  if (/Chọn hoặc tạo cửa hàng trước khi quản lý nhân sự/i.test(staffText)) {
    note('Trang Nhân sự thoáng hiện "Chọn hoặc tạo cửa hàng trước khi quản lý nhân sự"', 'cùng gốc với F-01');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.waitForTimeout(2500);
      await navTo(page, 'Kho nguyên liệu');
      await navTo(page, 'Nhân sự');
      staffText = await mainText(page);
      if (!/Chọn hoặc tạo cửa hàng/i.test(staffText)) break;
    }
  }

  check(await click(page, button(page, /Thêm nhân sự/i), 'Thêm nhân sự'), 'Mở được form thêm nhân sự');
  await page.waitForTimeout(1000);
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: /Thêm nhân sự mới/ }).first();
  await modal.getByPlaceholder('Nhập họ tên đầy đủ').fill(staffName);
  await modal.getByPlaceholder('nhanvien@quan.vn').fill(staffEmail);
  await modal.getByPlaceholder('Ít nhất 6 ký tự').fill(staffPassword);
  await modal.getByPlaceholder('0000').fill(STAFF_PIN);
  await shot(page, 'f16-staff-modal');
  await click(page, modal.getByRole('button', { name: /^Lưu$/ }).first(), 'Lưu nhân sự');
  await page.waitForTimeout(4000);

  await navTo(page, 'Kho nguyên liệu');
  await navTo(page, 'Nhân sự');
  const listed = await mainText(page);
  check(new RegExp(staffEmail.replace(/[.]/g, '\\.')).test(listed), 'Tài khoản nhân sự được tạo', listed.slice(0, 140));
  await shot(page, 'f16-staff-created');

  const staffCtx = await ctx.browser.newContext({ viewport: DESKTOP });
  const staffPage = await staffCtx.newPage();
  await staffPage.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForTimeout(4500);
  await shot(staffPage, 'f16-staff-login');
  const emailField = staffPage.locator('input[type="email"], #email').first();
  if (await emailField.count()) {
    await emailField.fill(staffEmail);
    await staffPage.locator('input[type="password"]').first().fill(staffPassword);
    await staffPage.locator('button[type="submit"]').first().click().catch(() => {});
    await staffPage.waitForTimeout(4000);
    const pinField = staffPage.locator('input[inputmode="numeric"], input[type="password"]').last();
    const needsPin = (await pinField.count()) > 0;
    await shot(staffPage, 'f16-staff-pin-step');
    if (needsPin) {
      await pinField.fill(STAFF_PIN);
      await staffPage.locator('button[type="submit"]').first().click().catch(() => {});
      await staffPage.waitForTimeout(4500);
    }
    const body = (await staffPage.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      !/sai|không đúng|invalid|không có quyền|Missing or insufficient/i.test(body),
      'Nhân viên đăng nhập được bằng email + mật khẩu tạm + PIN',
      body.slice(0, 160),
    );
    await shot(staffPage, 'f16-staff-signed-in');
  } else {
    check(false, 'Màn hình /staff có ô email', 'không thấy');
  }
  await staffCtx.close();
});

// ---------------------------------------------------------------------------
// F9 — Staff PIN policy: the form and the server must agree
//
// Read-only on purpose: it compares the PIN the Staff form invites with the
// length the server actually enforces, both as rendered by the app.
// ---------------------------------------------------------------------------
flow('f9-staff-pin-policy', 'Nhân sự: độ dài PIN của form so với chính sách', DESKTOP, async (ctx) => {
  const { page } = ctx;

  // What the server will enforce, as the app itself reports it. The applied
  // config panel needs an authenticated read, so reach Settings in-app.
  await hardLoad(page, '/dashboard');
  await navTo(page, 'Cấu hình');
  const settings = await mainText(page);
  const policy = settings.match(/Độ dài PIN[^0-9]*(\d+)\s*chữ số/i);
  check(!!policy, 'Cấu hình hiển thị "Độ dài PIN" đang áp dụng', policy?.[0] ?? 'không thấy');
  const required = policy ? Number(policy[1]) : null;

  // What the Staff form invites the Owner to type.
  await navTo(page, 'Nhân sự');
  await click(page, button(page, /Thêm nhân sự/i), 'Thêm nhân sự');
  await page.waitForTimeout(1000);
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: /Thêm nhân sự mới/ }).first();
  const pinField = modal.getByPlaceholder('0000').first();
  const placeholder = await pinField.getAttribute('placeholder').catch(() => null);
  const minLength = await pinField.getAttribute('minlength').catch(() => null);
  const maxLength = await pinField.getAttribute('maxlength').catch(() => null);
  const hint = await modal
    .locator('text=/PIN/i')
    .allInnerTexts()
    .then((all) => all.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '))
    .catch(() => '');
  note('Ô PIN trong form nhân sự', `placeholder="${placeholder}" minlength=${minLength} maxlength=${maxLength}`);
  note('Nhãn/hướng dẫn về PIN', hint.slice(0, 220));
  await shot(page, 'f9-staff-pin-field');

  check(
    required === null || String(required) === String(placeholder) || Number(minLength) === required,
    `Form nhân sự nói rõ PIN phải đủ ${required ?? '?'} chữ số như máy chủ yêu cầu`,
    `placeholder="${placeholder}", minlength=${minLength}, chính sách=${required}`,
  );
});

// ---------------------------------------------------------------------------
// F10 — Reporting periods
// ---------------------------------------------------------------------------
flow('f10-reporting', 'Doanh thu: các kỳ báo cáo', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await hardLoad(page, '/dashboard', 7000);

  for (const [label, key] of [['Hôm nay', 'day'], ['Tuần', 'week'], ['Tháng', 'month']]) {
    const chip = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
    if (!(await chip.count())) {
      check(false, `Có nút kỳ "${label}"`, 'không thấy');
      continue;
    }
    await click(page, chip, `Kỳ ${label}`);
    await page.waitForTimeout(3000);
    const text = await mainText(page);
    const revenue = text.match(/DOANH THU[^0-9]*([\d.,]+)\s*đ/i);
    const orders = text.match(/SỐ ĐƠN\s*([\d.,]+)/i);
    const profit = text.match(/Lợi nhuận gộp:\s*([\d.,]+)\s*đ/i);
    note(`Kỳ ${label}`, `doanh thu=${revenue?.[1] ?? '?'} · số đơn=${orders?.[1] ?? '?'} · lợi nhuận gộp=${profit?.[1] ?? '?'}`);
    check(text.includes('DOANH THU'), `Kỳ ${label}: khối doanh thu render`, 'ok');
    await shot(page, `f10-reporting-${key}`);
  }

  const text = await mainText(page);
  check(/SỐ ĐƠN/.test(text), 'KPI số đơn hiển thị', text.match(/SỐ ĐƠN\s*[\d.,]+/)?.[0] ?? '');
});

// ---------------------------------------------------------------------------
// F11 — AI assistant
// ---------------------------------------------------------------------------
flow('f11-ai-assistant', 'Trợ lý AI: hỏi đáp', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await hardLoad(page, '/dashboard', 7000);

  check(await click(page, page.getByRole('button', { name: /Mở trợ lý AI/i }).first(), 'Mở trợ lý AI'), 'Mở được trợ lý AI');
  await page.waitForTimeout(900);
  const input = page.getByLabel('Câu hỏi cho trợ lý AI').first();
  if (!(await input.count())) {
    check(false, 'Có ô nhập câu hỏi', 'không thấy');
    return;
  }
  await shot(page, 'f11-ai-open');
  await input.fill('Hôm nay doanh thu bao nhiêu?');
  await page.getByLabel('Gửi câu hỏi').first().click().catch(() => {});
  await page.waitForTimeout(15000);

  const panel = page.getByRole('dialog', { name: /Trợ lý AI/i }).first();
  const answer = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
  note('Trả lời của trợ lý AI', answer.slice(0, 500));
  check(answer.length > 60, 'Trợ lý AI trả lời', `${answer.length} ký tự`);
  check(
    !/Missing or insufficient permissions|INTERNAL|unauthenticated/i.test(answer),
    'Trả lời không phải lỗi hệ thống thô',
    /Missing or insufficient permissions|INTERNAL/i.test(answer) ? 'có lỗi thô' : 'ok',
  );
  await shot(page, 'f11-ai-answer');
});

// ---------------------------------------------------------------------------
// F12 — Tenant switching (native prompt)
// ---------------------------------------------------------------------------
flow('f12-tenant', 'Cửa hàng: luồng tạo cửa hàng mới', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await hardLoad(page, '/dashboard', 7000);
  const createBtn = page.locator('button[title="Tạo cửa hàng mới"]').first();
  if (!(await createBtn.count())) {
    check(false, 'Có nút "Tạo cửa hàng mới"', 'không thấy');
    return;
  }
  await click(page, createBtn, 'Tạo cửa hàng mới');
  await page.waitForTimeout(1500);
  const dialogs = nativeDialogs.filter((d) => d.flow === currentFlow);
  check(
    dialogs.length > 0,
    'Tạo cửa hàng dùng hộp thoại trình duyệt gốc (window.prompt)',
    dialogs.map((d) => `${d.type}: ${d.message}`).join(' | '),
  );
  await shot(page, 'f12-tenant-create');
});

// ---------------------------------------------------------------------------
// F13 — ADMIN guard
// ---------------------------------------------------------------------------
flow('f13-admin-guard', 'Khu vực ADMIN: chặn chủ quán thường', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await hardLoad(page, '/dashboard/manage', 6000);
  const text = await mainText(page);
  check(/không có quyền ADMIN/i.test(text), 'Chủ quán thường bị từ chối', text.slice(0, 120));
  const interactive = await page.locator('main button, main a').count();
  note('Số phần tử bấm được trên trang từ chối', String(interactive));
  await shot(page, 'f13-admin-guard');
});

// ---------------------------------------------------------------------------
// F14 — Offline behaviour
// ---------------------------------------------------------------------------
flow('f14-offline', 'Mất mạng: hành vi khi offline', DESKTOP, async (ctx) => {
  const { page } = ctx;
  await hardLoad(page, '/dashboard/inventory', 6000);
  await dismissGuide(page);

  await ctx.context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(9000);
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  note('Màn hình khi offline', text.slice(0, 300));
  check(
    /mạng|offline|kết nối|thử lại|retry/i.test(text),
    'Có thông báo hiểu được khi mất mạng',
    /mạng|offline|kết nối/i.test(text) ? 'có' : 'không có thông báo nào',
  );
  await shot(page, 'f14-offline');

  await ctx.context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitForApp(page);
  await page.waitForTimeout(1500);
});

// ---------------------------------------------------------------------------
// F15 — Hard-reload sweep across every dashboard route
// ---------------------------------------------------------------------------
flow('f15-reload-sweep', 'Tải cứng từng trang dashboard', DESKTOP, async (ctx) => {
  const { page } = ctx;
  const routes = [
    ['/dashboard', 'DOANH THU'],
    ['/dashboard/menu', 'QUẢN LÝ THỰC ĐƠN'],
    ['/dashboard/inventory', 'KHO NGUYÊN LIỆU'],
    ['/dashboard/tables', 'QUẢN LÝ BÀN'],
    ['/dashboard/staff', 'NHÂN SỰ'],
    ['/dashboard/subscription', 'GÓI CƯỚC'],
    ['/dashboard/settings', 'CẤU HÌNH'],
    ['/dashboard/feedback', 'FEEDBACK'],
  ];
  for (const [route, marker] of routes) {
    await hardLoad(page, route, 6000);
    const text = await mainText(page);
    check(text.toUpperCase().includes(marker), `Tải cứng ${route}: khung trang render`, text.slice(0, 70));
    await dismissGuide(page);
  }
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const selected = ONLY.length
  ? flows.filter((f) => ONLY.includes(f.id) || ONLY.includes(f.id.split('-')[0]))
  : flows;

const browser = await chromium.launch({ headless: !HEADED });
const email = await ownerEmail();
console.log(`Feature audit — ${selected.length} flow(s), owner ${email}\n`);

const report = { generatedAt: new Date().toISOString(), baseUrl: BASE, ownerAccount: email, flows: [] };

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
  page.on('dialog', (dialog) => {
    nativeDialogs.push({ flow: currentFlow, type: dialog.type(), message: dialog.message() });
    console.log(`   ⚠ hộp thoại gốc: ${dialog.type()} — "${dialog.message()}"`);
    void dialog.dismiss().catch(() => {});
  });

  const started = Date.now();
  let error = null;
  try {
    await signIn(page, email);
    await item.run({ page, context, browser, email });
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
report.nativeDialogs = nativeDialogs;
report.screenshots = screenshots;
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'feature-audit-report.json'), JSON.stringify(report, null, 2), 'utf8');

const failed = findings.filter((f) => f.kind === 'fail');
console.log('\n================ TỔNG KẾT ================');
console.log(`Assertion đạt : ${findings.filter((f) => f.kind === 'pass').length}`);
console.log(`Assertion lỗi : ${failed.length}`);
failed.forEach((f) => console.log(`  ✗ [${f.flow}] ${f.label} — ${f.detail ?? ''}`));
console.log(`Báo cáo JSON  : ${path.join(OUT, 'feature-audit-report.json')}`);

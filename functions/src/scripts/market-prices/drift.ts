/**
 * Cost drift report.
 *
 *   npm run market:drift -- --tenant <tenantId>
 *   npm run market:drift -- --tenant <tenantId> --region HN
 *
 * Answers the only question a shop owner actually has: **am I paying more than
 * the market?**
 *
 * The two numbers are different in kind and must not be confused:
 *
 *  - **Actual** is `ingredient.unitCostVnd` read from Firestore. It is the
 *    weighted average of the shop's own purchase lots (ADR 0014), so it moves
 *    every time stock is received with a price. This is reality.
 *  - **Benchmark** is the market survey. It is somebody else's shelf price, so
 *    it is a reference, never a substitute.
 *
 * Neither replaces the other. The survey cannot know your supplier; your
 * weighted average cannot tell you whether your supplier is competitive. The
 * gap between them is the useful signal.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { MARKET_PRICE_SURVEY } from '../market-prices.generated.js';
import {
  DEFAULT_SEED_REGION,
  isSurveyStale,
  SURVEY_OBSERVED_AT,
} from './market-prices.js';

export interface DriftRow {
  ingredientId: string;
  name: string;
  /** Weighted average the shop actually pays, integer VND per base unit. */
  actualUnitCostVnd: number;
  /** Market reference for the same base unit, or null when unsurveyed. */
  benchmarkUnitCostVnd: number | null;
  /** Positive when the shop pays above the benchmark, in percent. */
  gapPercent: number | null;
  verdict: DriftVerdict;
  /** Product the benchmark was observed on, for the reviewer. */
  benchmarkProduct: string | null;
}

export type DriftVerdict =
  | 'cheaper'
  | 'on-par'
  | 'above-market'
  | 'no-benchmark'
  | 'unit-mismatch';

/** Within this band the two numbers are treated as the same. */
export const ON_PAR_BAND_PERCENT = 5;

/** Above this the gap is worth acting on rather than noting. */
export const REVIEW_THRESHOLD_PERCENT = 20;

export function classifyDrift(gapPercent: number | null): DriftVerdict {
  if (gapPercent === null) {
    return 'no-benchmark';
  }
  if (Math.abs(gapPercent) <= ON_PAR_BAND_PERCENT) {
    return 'on-par';
  }
  return gapPercent > 0 ? 'above-market' : 'cheaper';
}

/**
 * Compare one shop cost against the market reference for the shop's region.
 *
 * The region must match: a Hanoi shop compared against a Saigon reference
 * would report a drift that is really just a different city.
 */
export function compareToMarket(
  ingredientId: string,
  actualUnitCostVnd: number,
  region: string = DEFAULT_SEED_REGION,
  actualBaseUnit?: string,
): {
  benchmarkUnitCostVnd: number | null;
  gapPercent: number | null;
  product: string | null;
  unitMismatch: boolean;
} {
  const observation = MARKET_PRICE_SURVEY.observations.find(
    (entry) => entry.ingredientId === ingredientId && entry.region === region,
  );
  if (!observation || observation.unitCostVnd <= 0) {
    return {
      benchmarkUnitCostVnd: null,
      gapPercent: null,
      product: null,
      unitMismatch: false,
    };
  }
  // Comparing a price per piece against a price per gram is meaningless: the
  // shop stores `Đậu hũ` per piece while the listing only sells a 300g pack, so
  // a naive comparison reported a 9700% overspend that does not exist.
  if (actualBaseUnit !== undefined && actualBaseUnit !== observation.baseUnit) {
    return {
      benchmarkUnitCostVnd: null,
      gapPercent: null,
      product: observation.productName,
      unitMismatch: true,
    };
  }
  const gapPercent = Math.round(
    ((actualUnitCostVnd - observation.unitCostVnd) / observation.unitCostVnd) * 100,
  );
  return {
    benchmarkUnitCostVnd: observation.unitCostVnd,
    gapPercent,
    product: observation.productName,
    unitMismatch: false,
  };
}

interface IngredientDoc {
  name?: unknown;
  unitCostVnd?: unknown;
  isActive?: unknown;
  baseUnit?: unknown;
}

export function buildDriftRows(
  ingredients: ReadonlyArray<{ id: string; data: IngredientDoc }>,
  region: string,
): DriftRow[] {
  const rows: DriftRow[] = [];
  for (const ingredient of ingredients) {
    const name = typeof ingredient.data.name === 'string' ? ingredient.data.name : ingredient.id;
    const actual = ingredient.data.unitCostVnd;
    // An archived ingredient is history, and an unpriced one has nothing to
    // compare, so neither belongs in a drift report.
    if (ingredient.data.isActive === false) {
      continue;
    }
    if (typeof actual !== 'number' || !Number.isFinite(actual) || actual <= 0) {
      continue;
    }
    const baseUnit =
      typeof ingredient.data.baseUnit === 'string' ? ingredient.data.baseUnit : undefined;
    const compared = compareToMarket(ingredient.id, actual, region, baseUnit);
    rows.push({
      ingredientId: ingredient.id,
      name,
      actualUnitCostVnd: actual,
      benchmarkUnitCostVnd: compared.benchmarkUnitCostVnd,
      gapPercent: compared.gapPercent,
      verdict: compared.unitMismatch
        ? 'unit-mismatch'
        : classifyDrift(compared.gapPercent),
      benchmarkProduct: compared.product,
    });
  }
  return rows.sort((a, b) => (b.gapPercent ?? -1) - (a.gapPercent ?? -1));
}

function formatVnd(value: number): string {
  return value.toLocaleString('vi-VN');
}

export function printDriftReport(rows: readonly DriftRow[], region: string): void {
  console.log(`\nĐối chiếu giá vốn thực tế với thị trường — vùng ${region}`);
  console.log(`Khảo sát thị trường: ${SURVEY_OBSERVED_AT}`);
  if (isSurveyStale(SURVEY_OBSERVED_AT)) {
    console.log('  ! Khảo sát đã cũ. Chạy lại: npm run market:survey');
  }
  console.log(
    '\n' +
      'Nguyên liệu'.padEnd(20) +
      'Giá quán trả'.padEnd(14) +
      'Giá thị trường'.padEnd(16) +
      'Lệch'.padEnd(9) +
      'Kết luận',
  );

  for (const row of rows) {
    const gap =
      row.gapPercent === null
        ? '—'
        : `${row.gapPercent > 0 ? '+' : ''}${row.gapPercent}%`;
    const verdict =
      row.verdict === 'above-market'
        ? `CAO HƠN THỊ TRƯỜNG${row.gapPercent !== null && row.gapPercent >= REVIEW_THRESHOLD_PERCENT ? ' — nên xem lại' : ''}`
        : row.verdict === 'cheaper'
          ? 'rẻ hơn thị trường'
          : row.verdict === 'on-par'
            ? 'ngang thị trường'
            : row.verdict === 'unit-mismatch'
              ? 'khác đơn vị — không so được'
              : 'chưa có giá tham chiếu';
    console.log(
      row.name.slice(0, 18).padEnd(20) +
        formatVnd(row.actualUnitCostVnd).padEnd(14) +
        (row.benchmarkUnitCostVnd === null
          ? '—'
          : formatVnd(row.benchmarkUnitCostVnd)
        ).padEnd(16) +
        gap.padEnd(9) +
        verdict,
    );
  }

  const compared = rows.filter((row) => row.gapPercent !== null);
  const above = compared.filter((row) => row.verdict === 'above-market');
  const noBenchmark = rows.length - compared.length;
  const allZero = compared.length > 1 && compared.every((row) => row.gapPercent === 0);

  console.log(
    `\n  ${compared.length}/${rows.length} nguyên liệu có giá tham chiếu.` +
      (noBenchmark > 0 ? ` ${noBenchmark} chưa khảo sát được.` : ''),
  );
  if (above.length > 0) {
    console.log(
      `  ${above.length} nguyên liệu đang trả cao hơn thị trường: ` +
        above.map((row) => row.name).join(', '),
    );
  }
  if (allZero) {
    console.log(
      '\n  ! Mọi mức lệch đều 0%: tenant này vẫn đang dùng chính giá khảo sát làm giá vốn,\n' +
        '    nên báo cáo đang so khảo sát với chính nó. Chỉ có ý nghĩa sau khi bạn nhập\n' +
        '    hoá đơn thật qua màn Kho (Nhập hàng).',
    );
  }
  console.log(
    '\n  Lưu ý: "giá quán trả" là bình quân gia quyền từ hoá đơn nhập hàng của bạn.\n' +
      '  "Giá thị trường" là giá niêm yết của nơi khác — tham chiếu, không phải giá vốn.',
  );
}

interface DriftOptions {
  tenantId: string;
  region: string;
  projectId: string;
}

function parseDriftArgs(argv: readonly string[]): DriftOptions {
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };
  const tenantId = read('--tenant');
  if (!tenantId) {
    throw new Error('thiếu --tenant <tenantId>');
  }
  return {
    tenantId,
    region: (read('--region') ?? DEFAULT_SEED_REGION).toUpperCase(),
    projectId:
      read('--project') ?? process.env.FIREBASE_PROJECT_ID ?? 'scango-8f0e9',
  };
}

async function readIngredients(
  db: Firestore,
  tenantId: string,
): Promise<Array<{ id: string; data: IngredientDoc }>> {
  const snap = await db.collection(`tenants/${tenantId}/ingredients`).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as IngredientDoc }));
}

async function main(): Promise<void> {
  const options = parseDriftArgs(process.argv.slice(2));
  const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (!useEmulator) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= options.projectId;
  }
  initializeApp(
    useEmulator
      ? { projectId: options.projectId }
      : { credential: applicationDefault(), projectId: options.projectId },
  );
  const db = getFirestore();

  const ingredients = await readIngredients(db, options.tenantId);
  if (ingredients.length === 0) {
    throw new Error(
      `tenant "${options.tenantId}" has no ingredients at ${useEmulator ? 'the emulator' : options.projectId}`,
    );
  }

  const rows = buildDriftRows(ingredients, options.region);
  printDriftReport(rows, options.region);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

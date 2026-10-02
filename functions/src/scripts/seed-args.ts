/**
 * Command-line parsing for the demo seed script.
 *
 * Kept free of `firebase-admin` imports so it stays unit-testable, mirroring
 * `admin-claim.ts` for the ADMIN claim CLI.
 */

export interface SeedArgs {
  tenantId: string;
  shopName: string;
  ownerEmail: string | null;
  ownerUid: string | null;
  /** Number of tenant-local days of Orders to generate, ending today. */
  days: number;
  /** Required on a real project; the guard against an accidental write. */
  confirm: boolean;
  dryRun: boolean;
  projectId: string;
}

export const DEFAULT_SEED_TENANT_ID = 'demo-nha-hang';
export const DEFAULT_SEED_SHOP_NAME = 'Nhà hàng Demo ScanGo';
export const DEFAULT_SEED_DAYS = 14;
export const DEFAULT_SEED_PROJECT_ID = 'scango-8f0e9';
export const MIN_SEED_DAYS = 1;
export const MAX_SEED_DAYS = 62;

function readValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Thiếu giá trị cho ${flag}.`);
  }
  return value;
}

export function parseSeedArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): SeedArgs {
  const options: SeedArgs = {
    tenantId: DEFAULT_SEED_TENANT_ID,
    shopName: DEFAULT_SEED_SHOP_NAME,
    ownerEmail: null,
    ownerUid: null,
    days: DEFAULT_SEED_DAYS,
    confirm: false,
    dryRun: false,
    projectId:
      env.FIREBASE_PROJECT_ID?.trim() || DEFAULT_SEED_PROJECT_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--confirm') {
      options.confirm = true;
      continue;
    }
    if (flag === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (flag === '--owner-email') {
      options.ownerEmail = readValue(argv, index, flag).trim();
      index += 1;
      continue;
    }
    if (flag === '--owner-uid') {
      options.ownerUid = readValue(argv, index, flag).trim();
      index += 1;
      continue;
    }
    if (flag === '--tenant-id') {
      options.tenantId = readValue(argv, index, flag).trim();
      index += 1;
      continue;
    }
    if (flag === '--shop-name') {
      options.shopName = readValue(argv, index, flag).trim();
      index += 1;
      continue;
    }
    if (flag === '--project') {
      options.projectId = readValue(argv, index, flag).trim();
      index += 1;
      continue;
    }
    if (flag === '--days') {
      const raw = readValue(argv, index, flag);
      const days = Number(raw);
      if (!Number.isInteger(days) || days < MIN_SEED_DAYS || days > MAX_SEED_DAYS) {
        throw new Error(
          `--days phải là số nguyên từ ${MIN_SEED_DAYS} đến ${MAX_SEED_DAYS}.`,
        );
      }
      options.days = days;
      index += 1;
      continue;
    }

    throw new Error(`Tham số không hợp lệ: ${flag}.`);
  }

  if (!options.ownerEmail && !options.ownerUid) {
    throw new Error('Cần --owner-email hoặc --owner-uid để gắn quyền xem.');
  }
  if (!options.tenantId) {
    throw new Error('--tenant-id không được để trống.');
  }
  if (!options.shopName) {
    throw new Error('--shop-name không được để trống.');
  }

  return options;
}

/**
 * Backfill the Owner-only Staff directory projection (REQ-AUTH-003).
 *
 * `tenants/{tenantId}/staffDirectory` was introduced in the "direct reads"
 * change, after Staff memberships already existed. The Owner Staff list reads
 * that projection through Firestore Rules, so every membership created before
 * the projection is invisible to the Owner even though the Staff account works.
 * This script writes the missing rows from the membership documents, which stay
 * the source of truth.
 *
 * Safety:
 *  - Additive and idempotent: it only creates a row that does not exist and
 *    never rewrites, archives, or deletes anything.
 *  - It projects `staff` memberships only; an Owner never enters the Staff list.
 *  - On a real Firestore project it refuses to run without `--confirm`.
 *
 * Usage:
 *   npm run backfill:staff-directory                                  (emulator)
 *   npm run backfill:staff-directory -- --confirm                     (real project)
 *   npm run backfill:staff-directory -- --confirm --project scango-8f0e9
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planStaffDirectoryBackfill } from './staff-directory-backfill.js';

const DEFAULT_PROJECT_ID = 'scango-8f0e9';
/** Firestore caps one batch at 500 writes; stay clear of the ceiling. */
const BATCH_WRITE_LIMIT = 400;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const confirm = argv.includes('--confirm');
  const projectFlag = argv.indexOf('--project');
  const projectId =
    (projectFlag >= 0 ? argv[projectFlag + 1]?.trim() : undefined) ||
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    DEFAULT_PROJECT_ID;
  const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  if (!useEmulator && !confirm) {
    process.stdout.write(
      'Từ chối ghi lên Firestore thật khi chưa xác nhận.\n' +
        'Thêm --confirm để tiếp tục.\n' +
        `Dự án: ${projectId}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (!useEmulator) {
    // End-user Application Default Credentials have no quota project by default.
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
  }
  initializeApp(
    useEmulator
      ? { projectId }
      : { credential: applicationDefault(), projectId },
  );

  const db = getFirestore();
  const tenants = await db.collection('tenants').get();
  let written = 0;
  const skipped: string[] = [];

  for (const tenant of tenants.docs) {
    const [memberSnaps, directorySnaps] = await Promise.all([
      tenant.ref.collection('members').get(),
      tenant.ref.collection('staffDirectory').get(),
    ]);
    const plan = planStaffDirectoryBackfill(
      tenant.id,
      memberSnaps.docs.map((docSnap) => ({
        uid: docSnap.id,
        data: docSnap.data(),
      })),
      new Set(directorySnaps.docs.map((docSnap) => docSnap.id)),
    );
    for (const entry of plan.skipped) {
      skipped.push(`${tenant.id}/${entry.uid}: ${entry.reason}`);
    }
    if (plan.rows.length === 0) {
      continue;
    }

    for (let index = 0; index < plan.rows.length; index += BATCH_WRITE_LIMIT) {
      const batch = db.batch();
      for (const row of plan.rows.slice(index, index + BATCH_WRITE_LIMIT)) {
        batch.set(
          tenant.ref.collection('staffDirectory').doc(row.uid),
          row.entry,
        );
      }
      await batch.commit();
    }
    written += plan.rows.length;
    process.stdout.write(`${tenant.id}: +${plan.rows.length} dòng nhân sự\n`);
  }

  process.stdout.write(
    `Xong. Đã ghi ${written} dòng staffDirectory trên ${tenants.size} cửa hàng.\n`,
  );
  if (skipped.length > 0) {
    process.stdout.write(
      `Bỏ qua ${skipped.length} thành viên không đọc được:\n` +
        skipped.map((line) => `  ${line}`).join('\n') +
        '\n',
    );
  }
}

const invokedDirectly =
  process.argv[1]?.endsWith('backfill-staff-directory.ts') ||
  process.argv[1]?.endsWith('backfill-staff-directory.js') ||
  false;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

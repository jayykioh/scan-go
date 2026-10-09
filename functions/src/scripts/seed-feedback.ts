/**
 * Product-feedback seed script.
 *
 * Writes the review findings in `seed-feedback-data.ts` as real product-feedback
 * documents under `tenants/{tenantId}/productFeedback`, so the Owner inbox has
 * realistic content to read and the screenshot path has a working object.
 *
 * Safety mirrors `seed.ts`:
 *  - Only deterministic `seed-`-prefixed documents are written; nothing is
 *    deleted and no existing report is overwritten unless it is also `seed-`.
 *  - On a real Firestore project it refuses to run without `--confirm`.
 *  - On the Firestore emulator it runs freely.
 *  - Screenshots are uploaded to Storage only when `--with-images` is passed,
 *    because a Storage write needs a bucket (and the Storage emulator when the
 *    Firestore emulator is in use).
 *
 * Usage:
 *   npm run seed:feedback -- --owner-email owner@shop.vn --with-images --confirm
 *   npm run seed:feedback -- --owner-uid <uid> --tenant-id <tenantId> --confirm
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:feedback -- --owner-uid demo --with-images
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES,
  PRODUCT_FEEDBACK_CONTRACT_VERSION,
  productFeedbackAttachmentPrefix,
  productFeedbackRecordSchema,
  type ProductFeedbackAttachment,
} from '../../../shared/contracts/product-feedback.contract.js';
import {
  SEED_PRODUCT_FEEDBACK,
  type SeedProductFeedback,
} from './seed-feedback-data.js';

const DEFAULT_PROJECT_ID = 'scango-8f0e9';
const BATCH_LIMIT = 400;
const SEED_ID_PREFIX = 'seed-';

export interface SeedFeedbackArgs {
  tenantId: string | null;
  ownerEmail: string | null;
  ownerUid: string | null;
  projectId: string;
  /** Storage bucket for screenshots. Derived from the project when omitted. */
  bucketName: string | null;
  confirm: boolean;
  dryRun: boolean;
  withImages: boolean;
}

function readValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Thiếu giá trị cho ${flag}.`);
  }
  return value;
}

export function parseSeedFeedbackArgs(
  argv: readonly string[],
): SeedFeedbackArgs {
  const args: SeedFeedbackArgs = {
    tenantId: null,
    ownerEmail: null,
    ownerUid: null,
    projectId: process.env.FIREBASE_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    bucketName: process.env.FIREBASE_STORAGE_BUCKET ?? null,
    confirm: false,
    dryRun: false,
    withImages: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case '--tenant-id':
        args.tenantId = readValue(argv, index, flag);
        index += 1;
        break;
      case '--owner-email':
        args.ownerEmail = readValue(argv, index, flag);
        index += 1;
        break;
      case '--owner-uid':
        args.ownerUid = readValue(argv, index, flag);
        index += 1;
        break;
      case '--project':
        args.projectId = readValue(argv, index, flag);
        index += 1;
        break;
      case '--bucket':
        args.bucketName = readValue(argv, index, flag);
        index += 1;
        break;
      case '--confirm':
        args.confirm = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--with-images':
        args.withImages = true;
        break;
      default:
        throw new Error(`Tham số không hợp lệ: ${flag}`);
    }
  }

  if (!args.tenantId && !args.ownerEmail && !args.ownerUid) {
    throw new Error(
      'Cần --tenant-id, hoặc --owner-email/--owner-uid để suy ra tenant.',
    );
  }
  return args;
}

/** Stable document id so a re-run updates its own record instead of adding one. */
export function seedFeedbackId(id: string): string {
  return `${SEED_ID_PREFIX}${id}`;
}

/**
 * Pure builder for one seeded record. The shape is the frozen contract, so a
 * fixture that drifts from the contract fails here rather than in Firestore.
 */
export function buildSeedFeedbackRecord(input: {
  fixture: SeedProductFeedback;
  tenantId: string;
  actorUid: string;
  attachments: readonly ProductFeedbackAttachment[];
  now: Date;
}): Record<string, unknown> {
  const createdAt = new Date(
    input.now.getTime() - input.fixture.daysAgo * 24 * 60 * 60 * 1000,
  ).toISOString();

  return productFeedbackRecordSchema.parse({
    schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
    feedbackId: seedFeedbackId(input.fixture.id),
    tenantId: input.tenantId,
    category: input.fixture.category,
    severity: input.fixture.severity,
    status: 'received',
    message: input.fixture.message,
    attachments: input.attachments,
    actorUid: input.actorUid,
    actorRole: input.fixture.actorRole,
    screenContext: input.fixture.screenContext,
    history: [
      {
        at: createdAt,
        actorUid: input.actorUid,
        fromStatus: null,
        toStatus: 'received',
        reason: null,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  });
}

function assertAllowedContentType(contentType: string): void {
  if (
    !(PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(
      contentType,
    )
  ) {
    throw new Error(`Content type không được phép: ${contentType}`);
  }
}

async function resolveTenantId(
  db: Firestore,
  args: SeedFeedbackArgs,
): Promise<string> {
  if (args.tenantId) {
    return args.tenantId;
  }
  if (args.ownerUid) {
    const userSnap = await db.doc(`users/${args.ownerUid}`).get();
    const activeTenantId = userSnap.get('activeTenantId');
    if (typeof activeTenantId === 'string' && activeTenantId.length > 0) {
      return activeTenantId;
    }
    throw new Error(
      `Không tìm thấy activeTenantId cho uid ${args.ownerUid}. Dùng --tenant-id.`,
    );
  }

  const query = await db
    .collectionGroup('members')
    .where('membershipType', '==', 'owner')
    .limit(50)
    .get();
  const match = query.docs.find((docSnap) => {
    const email = docSnap.get('email');
    return typeof email === 'string' && email === args.ownerEmail;
  });
  if (!match) {
    throw new Error(
      `Không tìm thấy Owner ${args.ownerEmail}. Dùng --tenant-id hoặc --owner-uid.`,
    );
  }
  // members/{uid} lives under tenants/{tenantId}/members/{uid}.
  const tenantId = match.ref.parent.parent?.id;
  if (!tenantId) {
    throw new Error('Không suy ra được tenantId từ member document.');
  }
  return tenantId;
}

async function uploadScreenshots(input: {
  tenantId: string;
  actorUid: string;
  bucketName: string | undefined;
}): Promise<Map<string, ProductFeedbackAttachment>> {
  const bucket = getStorage().bucket(input.bucketName);
  const result = new Map<string, ProductFeedbackAttachment>();

  for (const fixture of SEED_PRODUCT_FEEDBACK) {
    if (!fixture.screenshot) continue;
    assertAllowedContentType(fixture.screenshot.contentType);
    const storagePath = `${productFeedbackAttachmentPrefix(
      input.tenantId,
      input.actorUid,
    )}/${fixture.screenshot.fileName}`;
    const bytes = Buffer.from(fixture.screenshot.base64, 'base64');
    await bucket.file(storagePath).save(bytes, {
      contentType: fixture.screenshot.contentType,
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    });
    result.set(fixture.id, {
      storagePath,
      contentType: fixture.screenshot.contentType,
      sizeBytes: bytes.byteLength,
    });
  }

  return result;
}

async function run(): Promise<void> {
  const args = parseSeedFeedbackArgs(process.argv.slice(2));
  const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const now = new Date();

  if (!useEmulator && !args.confirm && !args.dryRun) {
    process.stdout.write(
      'Từ chối ghi lên Firestore thật khi chưa xác nhận.\n' +
        'Thêm --confirm để tiếp tục, hoặc --dry-run để chỉ xem kế hoạch.\n' +
        `Dự án: ${args.projectId}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (!useEmulator) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= args.projectId;
  }
  initializeApp(
    useEmulator
      ? { projectId: args.projectId }
      : { credential: applicationDefault(), projectId: args.projectId },
  );
  const db = getFirestore();
  const tenantId = await resolveTenantId(db, args);

  // The report is attributed to the Owner account of the tenant, which is the
  // identity that exists in every Tenant (ADR 0012).
  const actorUid =
    args.ownerUid ??
    (
      await db
        .collection(`tenants/${tenantId}/members`)
        .where('membershipType', '==', 'owner')
        .limit(1)
        .get()
    ).docs[0]?.id ??
    'seed-owner';

  const attachmentsByFixture =
    args.withImages && !args.dryRun
      ? await uploadScreenshots({
          tenantId,
          actorUid,
          // The client app uses `<project>.firebasestorage.app`; the Storage
          // emulator accepts any name, and `FIREBASE_STORAGE_BUCKET`/`--bucket`
          // override this for a bucket the caller knows better.
          bucketName: args.bucketName ?? `${args.projectId}.firebasestorage.app`,
        })
      : new Map<string, ProductFeedbackAttachment>();

  const writes = SEED_PRODUCT_FEEDBACK.map((fixture) => ({
    path: `tenants/${tenantId}/productFeedback/${seedFeedbackId(fixture.id)}`,
    data: buildSeedFeedbackRecord({
      fixture,
      tenantId,
      actorUid,
      attachments: attachmentsByFixture.has(fixture.id)
        ? [attachmentsByFixture.get(fixture.id)!]
        : [],
      now,
    }),
  }));

  if (args.dryRun) {
    process.stdout.write(
      `Kế hoạch seed phản hồi (chưa ghi):\n` +
        `  Tenant: ${tenantId}\n` +
        `  Người gửi: ${actorUid}\n` +
        `  Số phản hồi: ${writes.length}\n` +
        `  Ảnh đính kèm: ${
          args.withImages
            ? SEED_PRODUCT_FEEDBACK.filter((f) => f.screenshot).length
            : 0
        }\n` +
        writes.map((write) => `  - ${write.path}\n`).join(''),
    );
    return;
  }

  let committed = 0;
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(start, start + BATCH_LIMIT)) {
      batch.set(db.doc(write.path), write.data);
    }
    await batch.commit();
    committed += Math.min(BATCH_LIMIT, writes.length - start);
  }

  process.stdout.write(
    `Đã seed phản hồi vào ${useEmulator ? 'emulator' : args.projectId}.\n` +
      `  Tenant: ${tenantId}\n` +
      `  Người gửi: ${actorUid}\n` +
      `  Phản hồi: ${committed}\n` +
      `  Ảnh đã tải lên Storage: ${attachmentsByFixture.size}\n` +
      (args.withImages
        ? ''
        : '  ! Chạy lại với --with-images để có ảnh đính kèm thật.\n') +
      `Mở /dashboard/feedback bằng tài khoản Owner để xem hộp thư.\n`,
  );
}

const invokedDirectly =
  process.argv[1]?.endsWith('seed-feedback.ts') ||
  process.argv[1]?.endsWith('seed-feedback.js') ||
  false;

if (invokedDirectly) {
  run().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

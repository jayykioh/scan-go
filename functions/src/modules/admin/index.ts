import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  ADMIN_CONTRACT_VERSION,
  adminAuditListResultSchema,
  adminChangeTenantResultSchema,
  adminCustomerPhoneListResultSchema,
  adminOpenTenantResultSchema,
  adminTenantListResultSchema,
  type AdminTenantSummary,
} from '../../../../shared/contracts/admin.contract.js';
import { customerPhoneRecordSchema } from '../../../../shared/contracts/authorization.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import {
  writeAuditEventInTransaction,
  writePlatformAuditEventInTransaction,
} from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  applyTenantStatePlan,
  buildTenantStatePlan,
  decideCustomerPhoneAccess,
  nowIso,
  projectCustomerPhone,
  requireUid,
} from '../tenant/service.js';
import {
  ADMIN_INVALID_MESSAGE,
  parseAdminChangeTenantInput,
  parseAdminCustomerPhoneInput,
  parseAdminListAuditInput,
  parseAdminListTenantsInput,
  parseAdminOpenTenantInput,
  resolveAuditListLimit,
  resolveCustomerPhoneLimit,
  resolveTenantListLimit,
  toAdminTenantSummary,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;
const ADMIN_TENANT_NOT_FOUND_MESSAGE = 'Không tìm thấy cửa hàng.';

/**
 * ADMIN identity is a server-verified platform claim, never a tenant
 * membership. ADMIN is not copied into each membership.
 */
export function isPlatformAdmin(
  token: Record<string, unknown> | undefined,
): boolean {
  return token?.admin === true;
}

export function requirePlatformAdmin(
  token: Record<string, unknown> | undefined,
): void {
  if (!isPlatformAdmin(token)) {
    throw new HttpsError(
      'permission-denied',
      'Chỉ ADMIN được thay đổi cấu hình nền tảng.',
    );
  }
}

async function countMembers(
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<number> {
  const snapshot = await db
    .collection(`tenants/${tenantId}/members`)
    .count()
    .get();
  return snapshot.data().count;
}

/**
 * ADMIN query: bounded platform-wide Tenant list. This read records no audit
 * event; only ADMIN create/update/delete actions are audited. The read never
 * bypasses tenant Rules because it runs server-side with the ADMIN claim
 * verified first (REQ-ADM-001).
 */
export const callableAdminListTenants = onCall(
  CALL_OPTIONS,
  async (request) => {
    requireUid(request.auth?.uid);
    requirePlatformAdmin(
      request.auth?.token as Record<string, unknown> | undefined,
    );
    assertAppCheck(request);
    const input = parseAdminListTenantsInput(request.data);

    const db = getDb();
    const snap = await db
      .collection('tenants')
      .orderBy('createdAt', 'desc')
      .limit(resolveTenantListLimit(input))
      .get();

    const tenants: AdminTenantSummary[] = [];
    for (const tenantDoc of snap.docs) {
      tenants.push(
        toAdminTenantSummary(
          tenantDoc.id,
          tenantDoc.data(),
          await countMembers(db, tenantDoc.id),
        ),
      );
    }

    return adminTenantListResultSchema.parse({
      schemaVersion: ADMIN_CONTRACT_VERSION,
      tenants,
    });
  },
);

/** ADMIN query: open one Tenant. This read records no audit event. */
export const callableAdminOpenTenant = onCall(CALL_OPTIONS, async (request) => {
  requireUid(request.auth?.uid);
  requirePlatformAdmin(
    request.auth?.token as Record<string, unknown> | undefined,
  );
  assertAppCheck(request);
  const input = parseAdminOpenTenantInput(request.data);

  const db = getDb();
  const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
  if (!tenantSnap.exists) {
    throw new HttpsError('not-found', ADMIN_TENANT_NOT_FOUND_MESSAGE);
  }

  const tenant = toAdminTenantSummary(
    input.tenantId,
    tenantSnap.data(),
    await countMembers(db, input.tenantId),
  );

  return adminOpenTenantResultSchema.parse({
    schemaVersion: ADMIN_CONTRACT_VERSION,
    tenant,
  });
});

/**
 * ADMIN delegated command: archive or restore one Tenant. The Tenant module
 * owns the document plan; ADMIN composes it and records the audit event in the
 * same commit. ADMIN never writes another module's collection directly.
 */
export const callableAdminChangeTenant = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    requirePlatformAdmin(
      request.auth?.token as Record<string, unknown> | undefined,
    );
    assertAppCheck(request);
    const input = parseAdminChangeTenantInput(request.data);

    const db = getDb();
    const memberCount = await countMembers(db, input.tenantId);
    const tenantRef = db.doc(`tenants/${input.tenantId}`);

    const outcome = await db.runTransaction(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const tenantSnap = await transaction.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new HttpsError('not-found', ADMIN_TENANT_NOT_FOUND_MESSAGE);
      }

      const now = nowIso();
      applyTenantStatePlan(
        transaction,
        db,
        buildTenantStatePlan({
          tenantId: input.tenantId,
          archived: input.action === 'archive',
          now,
        }),
      );

      const auditRef = db
        .collection(`tenants/${input.tenantId}/audit`)
        .doc();
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'admin',
        role: 'admin',
        action:
          input.action === 'archive'
            ? 'AdminTenantArchived'
            : 'AdminTenantRestored',
        targetType: 'tenant',
        targetId: input.tenantId,
        reason: input.reason,
        detail: { action: input.action },
      });

      const updated = {
        ...(tenantSnap.data() ?? {}),
        archivedAt: input.action === 'archive' ? now : null,
        updatedAt: now,
      };
      return {
        tenant: toAdminTenantSummary(
          input.tenantId,
          updated,
          memberCount,
        ),
        auditEventId: auditRef.id,
      };
    });

    return adminChangeTenantResultSchema.parse({
      schemaVersion: ADMIN_CONTRACT_VERSION,
      tenant: outcome.tenant,
      auditEventId: outcome.auditEventId,
    });
  },
);

/**
 * ADMIN query: bounded audit view for one Tenant. This read records no audit
 * event; the returned list stays the bounded CUD event list.
 */
export const callableAdminListAudit = onCall(CALL_OPTIONS, async (request) => {
  requireUid(request.auth?.uid);
  requirePlatformAdmin(
    request.auth?.token as Record<string, unknown> | undefined,
  );
  assertAppCheck(request);
  const input = parseAdminListAuditInput(request.data);

  const db = getDb();
  const snap = await db
    .collection(`tenants/${input.tenantId}/audit`)
    .orderBy('createdAt', 'desc')
    .limit(resolveAuditListLimit(input))
    .get();

  return adminAuditListResultSchema.parse({
    schemaVersion: ADMIN_CONTRACT_VERSION,
    events: snap.docs.map((docSnap) => ({
      ...(docSnap.data() ?? {}),
      eventId: docSnap.id,
    })),
  });
});

/**
 * ADMIN query: unrestricted Customer phone access. The server filters the field
 * through the shared AuthorizationDecision contract with `admin_bypass`. This
 * read records no audit event (NFR-PRIV-001).
 */
export const callableAdminListCustomerPhones = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    requirePlatformAdmin(
      request.auth?.token as Record<string, unknown> | undefined,
    );
    assertAppCheck(request);
    const input = parseAdminCustomerPhoneInput(request.data);

    const db = getDb();
    const snap = await db
      .collection(`tenants/${input.tenantId}/loyaltyMembers`)
      .limit(resolveCustomerPhoneLimit(input))
      .get();

    const decision = decideCustomerPhoneAccess({
      uid,
      tenantId: input.tenantId,
      membership: undefined,
      isAdmin: true,
      decidedAt: nowIso(),
    });

    const records = snap.docs.map((docSnap) => {
      const data = docSnap.data() ?? {};
      const displayName =
        typeof data.displayName === 'string'
          ? data.displayName
          : typeof data.name === 'string'
            ? data.name
            : null;
      const phone = typeof data.phone === 'string' ? data.phone : null;
      return customerPhoneRecordSchema.parse(
        projectCustomerPhone(decision, {
          memberId: docSnap.id,
          displayName,
          phone,
        }),
      );
    });

    return adminCustomerPhoneListResultSchema.parse({
      schemaVersion: ADMIN_CONTRACT_VERSION,
      records,
    });
  },
);

export { ADMIN_INVALID_MESSAGE, writePlatformAuditEventInTransaction };

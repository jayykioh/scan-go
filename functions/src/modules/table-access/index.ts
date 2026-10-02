import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  TABLE_CONTRACT_VERSION,
  tableCommandResultSchema,
  type TableCommand,
  type TableCommandResult,
  type TableLinkContext,
  type TableTokenRotation,
} from '../../../../shared/contracts/table.contract.js';
import {
  NFC_CONTRACT_VERSION,
  nfcProvisionResultSchema,
  nfcResolveResultSchema,
  nfcRevokeResultSchema,
  type NfcSession,
} from '../../../../shared/contracts/nfc.contract.js';
import { tableLinkContextSchema } from '../../../../shared/contracts/table.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { assertRateLimit } from '../../shared/rateLimit.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  assertFeatureEntitlement,
  loadSubscriptionState,
} from '../subscription/service.js';
import {
  assertActiveOwnerMember,
  buildPublicNfcLinkDocument,
  buildPublicTableLinkDocument,
  buildTableDocument,
  computeNextTokenVersion,
  generateTableToken,
  nowIso,
  parseNfcProvisionInput,
  parseNfcResolveInput,
  parseNfcRevokeInput,
  parseTableArchiveInput,
  parseTableCreateInput,
  parseTableRegenerateInput,
  parseTableRenameInput,
  parseTableResolveInput,
  requireUid,
  resolvePublicOrderRateLimit,
  TABLE_NOT_FOUND_MESSAGE,
  TABLE_TOKEN_CROSS_TENANT_MESSAGE,
  TABLE_TOKEN_INVALID_MESSAGE,
  toNfcSession,
  toTableLinkContext,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

function commandResult(input: {
  command: TableCommand;
  tableId: string | null;
  context: TableLinkContext | null;
  rotation: TableTokenRotation | null;
  version: number;
  reason?: string | null;
}): TableCommandResult {
  return tableCommandResultSchema.parse({
    schemaVersion: TABLE_CONTRACT_VERSION,
    command: input.command,
    status: 'applied',
    tableId: input.tableId,
    context: input.context,
    rotation: input.rotation,
    version: input.version,
    reason: input.reason ?? null,
    appliedAt: nowIso(),
  });
}

function tablePath(tenantId: string, tableId: string): string {
  return `tenants/${tenantId}/tables/${tableId}`;
}

/**
 * Owner command: create a table and its first opaque public link in one
 * transaction. The token is random and the public document is minimal.
 */
export const callableTableCreate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseTableCreateInput(request.data);

  const db = getDb();
  const tableRef = db.collection(`tenants/${input.tenantId}/tables`).doc();
  const token = generateTableToken();
  const linkRef = db.doc(`publicTableLinks/${token}`);
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const now = nowIso();

  const context = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    assertActiveOwnerMember(memberSnap.data());

    transaction.set(tableRef, buildTableDocument({ name: input.name, token, now }));
    transaction.set(
      linkRef,
      buildPublicTableLinkDocument({
        tenantId: input.tenantId,
        tableId: tableRef.id,
        tableName: input.name,
        tokenVersion: 1,
        now,
      }),
    );
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: 'TableCreated',
      targetType: 'table',
      targetId: tableRef.id,
      detail: { tokenVersion: 1 },
    });
    return toTableLinkContext(token, {
      tenantId: input.tenantId,
      tableId: tableRef.id,
      tableName: input.name,
      tokenVersion: 1,
      isActive: true,
      createdAt: now,
      revokedAt: null,
    });
  });

  return commandResult({
    command: 'create',
    tableId: tableRef.id,
    context,
    rotation: {
      schemaVersion: TABLE_CONTRACT_VERSION,
      tenantId: input.tenantId,
      tableId: tableRef.id,
      tableName: input.name,
      previousToken: null,
      previousTokenVersion: null,
      newToken: token,
      newTokenVersion: 1,
      rotatedAt: now,
    },
    version: 1,
  });
});

/** Owner command: rename a table and keep its public link label in sync. */
export const callableTableRename = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseTableRenameInput(request.data);

  const db = getDb();
  const tableRef = db.doc(tablePath(input.tenantId, input.tableId));
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

  const outcome = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const tableSnap = await transaction.get(tableRef);
    assertActiveOwnerMember(memberSnap.data());
    if (!tableSnap.exists) {
      throw new HttpsError('not-found', TABLE_NOT_FOUND_MESSAGE);
    }

    const token = tableSnap.get('activeToken');
    const tokenVersion = tableSnap.get('tokenVersion');
    const now = nowIso();
    transaction.set(
      tableRef,
      { name: input.name, updatedAt: now },
      { merge: true },
    );
    if (typeof token === 'string') {
      transaction.set(
        db.doc(`publicTableLinks/${token}`),
        { tableName: input.name },
        { merge: true },
      );
    }
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: 'TableRenamed',
      targetType: 'table',
      targetId: input.tableId,
      detail: { name: input.name },
    });
    return { token, tokenVersion };
  });

  const context =
    typeof outcome.token === 'string'
      ? toTableLinkContext(outcome.token, {
          tenantId: input.tenantId,
          tableId: input.tableId,
          tableName: input.name,
          tokenVersion: outcome.tokenVersion,
          isActive: true,
          createdAt: nowIso(),
          revokedAt: null,
        })
      : null;

  return commandResult({
    command: 'rename',
    tableId: input.tableId,
    context,
    rotation: null,
    version:
      typeof outcome.tokenVersion === 'number' ? outcome.tokenVersion : 1,
  });
});

/** Owner command: archive a table and revoke its public link atomically. */
export const callableTableArchive = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseTableArchiveInput(request.data);

  const db = getDb();
  const tableRef = db.doc(tablePath(input.tenantId, input.tableId));
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

  await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const tableSnap = await transaction.get(tableRef);
    assertActiveOwnerMember(memberSnap.data());
    if (!tableSnap.exists) {
      throw new HttpsError('not-found', TABLE_NOT_FOUND_MESSAGE);
    }

    const token = tableSnap.get('activeToken');
    const now = nowIso();
    transaction.set(
      tableRef,
      { isActive: false, archivedAt: now, updatedAt: now },
      { merge: true },
    );
    if (typeof token === 'string') {
      transaction.set(
        db.doc(`publicTableLinks/${token}`),
        { isActive: false, revokedAt: now },
        { merge: true },
      );
    }
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: 'TableArchived',
      targetType: 'table',
      targetId: input.tableId,
      reason: input.reason,
      detail: {},
    });
  });

  return commandResult({
    command: 'archive',
    tableId: input.tableId,
    context: null,
    rotation: null,
    version: 1,
    reason: input.reason,
  });
});

/**
 * Owner command: rotate the public token. The new link is created and the old
 * link is revoked in the same transaction, so old links fail immediately.
 */
export const callableTableRegenerate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseTableRegenerateInput(request.data);

  const db = getDb();
  const tableRef = db.doc(tablePath(input.tenantId, input.tableId));
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const newToken = generateTableToken();
  const newLinkRef = db.doc(`publicTableLinks/${newToken}`);

  const outcome = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const tableSnap = await transaction.get(tableRef);
    assertActiveOwnerMember(memberSnap.data());
    if (!tableSnap.exists) {
      throw new HttpsError('not-found', TABLE_NOT_FOUND_MESSAGE);
    }

    const previousToken = tableSnap.get('activeToken');
    const previousVersion =
      typeof tableSnap.get('tokenVersion') === 'number'
        ? (tableSnap.get('tokenVersion') as number)
        : 1;
    const newVersion = computeNextTokenVersion(previousVersion);
    const tableName = String(tableSnap.get('name') ?? '');
    const now = nowIso();

    if (typeof previousToken === 'string') {
      transaction.set(
        db.doc(`publicTableLinks/${previousToken}`),
        { isActive: false, revokedAt: now },
        { merge: true },
      );
    }
    transaction.set(
      newLinkRef,
      buildPublicTableLinkDocument({
        tenantId: input.tenantId,
        tableId: input.tableId,
        tableName,
        tokenVersion: newVersion,
        now,
      }),
    );
    transaction.set(
      tableRef,
      {
        tokenVersion: newVersion,
        activeToken: newToken,
        qrPayload: `/menu/${newToken}`,
        updatedAt: now,
      },
      { merge: true },
    );
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: 'TableTokenRegenerated',
      targetType: 'table',
      targetId: input.tableId,
      detail: { newTokenVersion: newVersion },
    });

    return {
      previousToken: typeof previousToken === 'string' ? previousToken : null,
      previousVersion:
        typeof previousToken === 'string' ? previousVersion : null,
      newVersion,
      tableName,
      now,
    };
  });

  const context = toTableLinkContext(newToken, {
    tenantId: input.tenantId,
    tableId: input.tableId,
    tableName: outcome.tableName,
    tokenVersion: outcome.newVersion,
    isActive: true,
    createdAt: outcome.now,
    revokedAt: null,
  });

  return commandResult({
    command: 'regenerate',
    tableId: input.tableId,
    context,
    rotation: {
      schemaVersion: TABLE_CONTRACT_VERSION,
      tenantId: input.tenantId,
      tableId: input.tableId,
      tableName: outcome.tableName,
      previousToken: outcome.previousToken,
      previousTokenVersion: outcome.previousVersion,
      newToken,
      newTokenVersion: outcome.newVersion,
      rotatedAt: outcome.now,
    },
    version: outcome.newVersion,
  });
});

/**
 * Public query: resolve an opaque token to minimal table context. A missing,
 * revoked, or mismatched-tenant token fails without private data.
 */
export const callableTableResolvePublic = onCall(
  CALL_OPTIONS,
  async (request) => {
    assertAppCheck(request);
    const input = parseTableResolveInput(request.data);

    const db = getDb();
    const limit = await resolvePublicOrderRateLimit(db);
    assertRateLimit(`table-resolve:${input.token}`, limit);

    const linkSnap = await db.doc(`publicTableLinks/${input.token}`).get();
    if (!linkSnap.exists) {
      throw new HttpsError('not-found', TABLE_TOKEN_INVALID_MESSAGE);
    }
    if (linkSnap.get('isActive') !== true) {
      throw new HttpsError('permission-denied', TABLE_TOKEN_INVALID_MESSAGE);
    }
    const linkTenantId = linkSnap.get('tenantId');
    if (input.tenantId !== null && input.tenantId !== linkTenantId) {
      throw new HttpsError(
        'permission-denied',
        TABLE_TOKEN_CROSS_TENANT_MESSAGE,
      );
    }

    return toTableLinkContext(input.token, linkSnap.data() ?? {});
  },
);

/**
 * Owner command: provision an opaque NFC session for one table. The tag token
 * is random and maps to minimal public context. Provisioning is idempotent
 * while an active NFC session exists (REQ-NFC-001, NFR-SEC-002).
 *
 * DEVICE STEP (TODO): writing the NDEF record and tapping the physical tag is a
 * client/device task. The server owns the provisioned token, its revocation,
 * and the verification seam below.
 */
export const callableTableProvisionNfc = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseNfcProvisionInput(request.data);
    const db = getDb();

    // Trusted-code plan gate: NFC is a paid capability (REQ-SUB-001).
    const state = await loadSubscriptionState(db, input.tenantId);
    assertFeatureEntitlement(state, 'nfc');

    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const tableRef = db.doc(
      `tenants/${input.tenantId}/tables/${input.tableId}`,
    );
    const nfcToken = generateTableToken();
    const nfcLinkRef = db.doc(`publicNfcLinks/${nfcToken}`);

    const outcome = await db.runTransaction<{
      replayed: boolean;
      session: NfcSession;
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const tableSnap = await transaction.get(tableRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!tableSnap.exists || tableSnap.get('archivedAt') != null) {
        throw new HttpsError('not-found', TABLE_NOT_FOUND_MESSAGE);
      }

      const existingToken = tableSnap.get('nfcToken');
      if (typeof existingToken === 'string') {
        const existingSnap = await transaction.get(
          db.doc(`publicNfcLinks/${existingToken}`),
        );
        if (existingSnap.exists && existingSnap.get('isActive') === true) {
          return {
            replayed: true,
            session: toNfcSession(existingToken, existingSnap.data() ?? {}),
          };
        }
      }

      const now = nowIso();
      const version = computeNextTokenVersion(tableSnap.get('nfcTokenVersion'));
      const tableName = String(tableSnap.get('name') ?? '');
      const document = buildPublicNfcLinkDocument({
        tenantId: input.tenantId,
        tableId: input.tableId,
        tableName,
        tokenVersion: version,
        now,
      });
      transaction.set(nfcLinkRef, document);
      transaction.set(
        tableRef,
        { nfcToken, nfcTokenVersion: version, nfcWritten: true, updatedAt: now },
        { merge: true },
      );
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'NfcProvisioned',
        targetType: 'table',
        targetId: input.tableId,
        detail: { nfcTokenVersion: version },
      });
      return { replayed: false, session: toNfcSession(nfcToken, document) };
    });

    return nfcProvisionResultSchema.parse({
      schemaVersion: NFC_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'provisioned',
      session: outcome.session,
    });
  },
);

/**
 * Owner command: revoke the active NFC session of one table. The public link
 * becomes inactive immediately, so an old tag fails verification
 * (REQ-NFC-001, NFR-SEC-002).
 */
export const callableTableRevokeNfc = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseNfcRevokeInput(request.data);
  const db = getDb();

  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const tableRef = db.doc(`tenants/${input.tenantId}/tables/${input.tableId}`);

  const outcome = await db.runTransaction<{
    session: NfcSession | null;
    revokedAt: string | null;
  }>(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const tableSnap = await transaction.get(tableRef);
    assertActiveOwnerMember(memberSnap.data());
    if (!tableSnap.exists) {
      throw new HttpsError('not-found', TABLE_NOT_FOUND_MESSAGE);
    }
    const token = tableSnap.get('nfcToken');
    if (typeof token !== 'string') {
      return { session: null, revokedAt: null };
    }
    const linkRef = db.doc(`publicNfcLinks/${token}`);
    const linkSnap = await transaction.get(linkRef);
    const now = nowIso();
    if (!linkSnap.exists || linkSnap.get('isActive') !== true) {
      transaction.set(
        tableRef,
        { nfcWritten: false, updatedAt: now },
        { merge: true },
      );
      return {
        session: linkSnap.exists
          ? toNfcSession(token, { ...linkSnap.data(), isActive: false, revokedAt: now })
          : null,
        revokedAt: now,
      };
    }
    transaction.set(linkRef, { isActive: false, revokedAt: now }, { merge: true });
    transaction.set(
      tableRef,
      { nfcToken: null, nfcWritten: false, updatedAt: now },
      { merge: true },
    );
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: 'NfcRevoked',
      targetType: 'table',
      targetId: input.tableId,
      detail: {},
    });
    return {
      session: toNfcSession(token, { ...linkSnap.data(), isActive: false, revokedAt: now }),
      revokedAt: now,
    };
  });

  return nfcRevokeResultSchema.parse({
    schemaVersion: NFC_CONTRACT_VERSION,
    status: outcome.session ? 'revoked' : 'noop',
    session: outcome.session,
    revokedAt: outcome.revokedAt,
  });
});

/**
 * Device verification: resolve a tapped NFC token to the same menu and table
 * context as the QR link. App Check and the public rate limit apply; no
 * sign-in is required (REQ-NFC-001, NFR-SEC-002).
 */
export const callableTableNfcResolve = onCall(CALL_OPTIONS, async (request) => {
  assertAppCheck(request);
  const input = parseNfcResolveInput(request.data);
  const db = getDb();
  const limit = await resolvePublicOrderRateLimit(db);
  assertRateLimit(`nfc-resolve:${input.token}`, limit);

  const linkSnap = await db.doc(`publicNfcLinks/${input.token}`).get();
  if (!linkSnap.exists) {
    throw new HttpsError('not-found', TABLE_TOKEN_INVALID_MESSAGE);
  }
  if (linkSnap.get('isActive') !== true) {
    throw new HttpsError('permission-denied', TABLE_TOKEN_INVALID_MESSAGE);
  }
  const session = toNfcSession(input.token, linkSnap.data() ?? {});
  const context = tableLinkContextSchema.parse({
    schemaVersion: TABLE_CONTRACT_VERSION,
    token: session.nfcToken,
    tenantId: session.tenantId,
    tableId: session.tableId,
    tableName: session.tableName,
    tokenVersion: session.tokenVersion,
    status: 'active',
    isActive: true,
    createdAt: session.createdAt,
    revokedAt: null,
  });

  return nfcResolveResultSchema.parse({
    schemaVersion: NFC_CONTRACT_VERSION,
    session,
    context,
  });
});

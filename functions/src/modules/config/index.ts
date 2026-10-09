import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  CONFIG_CONTRACT_VERSION,
  updatePlatformConfigResultSchema,
  updateTenantConfigResultSchema,
} from '../../../../shared/contracts/config.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { runRetentionArchive } from './retention.js';
import { runScheduledBackup } from './backup.js';
import {
  writeAuditEventInTransaction,
  writePlatformAuditEventInTransaction,
} from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import { requirePlatformAdmin } from '../admin/index.js';
import {
  assertActiveMember,
  assertActiveOwnerMember,
  assertAllowedTenantOverrideKeys,
  computeNextConfigVersion,
  layersFromSnapshots,
  mergeOverrideMaps,
  nowIso,
  parsePlatformOverrideInput,
  parseTenantOverrideInput,
  readConfigLayers,
  readPlainObject,
  requireUid,
  resolveAllowedKeys,
  resolvePlatformConfig,
  resolveTenantConfig,
  toTenantVisibleResolvedConfig,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

/**
 * Owner command: merge allowed tenant overrides, increment the config version,
 * record `ConfigurationChanged`, and return the resolved configuration.
 *
 * All reads happen before writes. Forbidden keys and invalid values throw
 * before any document is written.
 */
export const callableConfigUpdateTenant = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);

    const data = (request.data ?? {}) as {
      tenantId?: unknown;
      overrides?: unknown;
    };
    const tenantId = typeof data.tenantId === 'string' ? data.tenantId : null;
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'Thiếu tenantId.');
    }
    const overrides = parseTenantOverrideInput(data.overrides);

    const db = getDb();
    const memberRef = db.doc(`tenants/${tenantId}/members/${uid}`);
    const tenantRef = db.doc(`tenants/${tenantId}`);
    const platformRef = db.doc('platform/config');

    const outcome = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const tenantSnap = await transaction.get(tenantRef);
      const platformSnap = await transaction.get(platformRef);

      assertActiveOwnerMember(
        memberSnap.exists ? memberSnap.data() : undefined,
      );

      const platformData = platformSnap.exists ? platformSnap.data() : undefined;
      const allowedKeys = platformData
        ? platformData.allowedTenantOverrideKeys
        : null;
      assertAllowedTenantOverrideKeys(
        overrides as Record<string, unknown>,
        Array.isArray(allowedKeys) ? allowedKeys.map(String) : null,
      );

      const currentOverrides =
        readPlainObject(tenantSnap.get('configOverrides')) ?? {};
      const nextOverrides = mergeOverrideMaps(
        currentOverrides,
        overrides as Record<string, unknown>,
      );
      const nextVersion = computeNextConfigVersion(
        tenantSnap.get('configVersion'),
      );

      const layers = layersFromSnapshots(platformData, nextOverrides);
      const resolvedConfig = resolveTenantConfig(layers);

      transaction.set(
        tenantRef,
        {
          configOverrides: nextOverrides,
          configVersion: nextVersion,
          updatedAt: nowIso(),
        },
        { merge: true },
      );
      writeAuditEventInTransaction(transaction, {
        tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'ConfigurationChanged',
        targetType: 'tenant',
        targetId: tenantId,
        detail: { overrides },
      });

      return { configVersion: nextVersion, resolvedConfig };
    });

    // Validate the response against the frozen contract before it leaves the
    // server so a malformed value can never reach a client.
    return updateTenantConfigResultSchema.parse({
      schemaVersion: CONFIG_CONTRACT_VERSION,
      configVersion: outcome.configVersion,
      resolvedConfig: toTenantVisibleResolvedConfig(outcome.resolvedConfig),
    });
  },
);

/**
 * ADMIN command: validate product defaults, write `platform/config`, and
 * record a platform audit event. ADMIN never writes `platform/config`
 * directly; the client cannot write it under any circumstances.
 */
export const callableConfigUpdatePlatform = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    requirePlatformAdmin(
      request.auth?.token as Record<string, unknown> | undefined,
    );
    assertAppCheck(request);

    const data = (request.data ?? {}) as { overrides?: unknown };
    const overrides = parsePlatformOverrideInput(data.overrides);

    const db = getDb();
    const platformRef = db.doc('platform/config');

    const outcome = await db.runTransaction(async (transaction) => {
      const platformSnap = await transaction.get(platformRef);
      const currentValues =
        readPlainObject(platformSnap.get('values')) ?? {};
      const currentAllowedRaw = platformSnap.get('allowedTenantOverrideKeys');
      const currentAllowed = Array.isArray(currentAllowedRaw)
        ? currentAllowedRaw.map(String)
        : null;

      const nextValues = mergeOverrideMaps(
        currentValues,
        overrides as Record<string, unknown>,
      );
      const nextAllowed = resolveAllowedKeys(currentAllowed);

      const resolvedConfig = resolvePlatformConfig({
        admin: nextValues,
        allowedTenantOverrideKeys: nextAllowed,
      });
      const nextVersion = computeNextConfigVersion(
        platformSnap.get('configVersion'),
      );

      transaction.set(
        platformRef,
        {
          values: nextValues,
          allowedTenantOverrideKeys: nextAllowed,
          configVersion: nextVersion,
          updatedAt: nowIso(),
        },
        { merge: true },
      );
      writePlatformAuditEventInTransaction(transaction, {
        actorUid: uid,
        actorType: 'admin',
        role: 'admin',
        action: 'ConfigurationChanged',
        targetType: 'platform_config',
        targetId: 'platform/config',
        detail: { overrides },
      });

      return { configVersion: nextVersion, resolvedConfig };
    });

    // Validate the response against the frozen contract before it leaves the
    // server so a malformed value can never reach a client.
    return updatePlatformConfigResultSchema.parse({
      schemaVersion: CONFIG_CONTRACT_VERSION,
      configVersion: outcome.configVersion,
      resolvedConfig: outcome.resolvedConfig,
    });
  },
);

/**
 * Read query: resolve the effective configuration for a tenant the caller
 * actively belongs to. This is the member read path because `platform/config`
 * is not readable by every signed-in user.
 */
export const callableConfigGetResolved = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const data = (request.data ?? {}) as { tenantId?: unknown };

    const db = getDb();
    let tenantId = typeof data.tenantId === 'string' ? data.tenantId : null;
    if (!tenantId) {
      const userSnap = await db.doc(`users/${uid}`).get();
      const activeTenantId = userSnap.get('activeTenantId');
      tenantId = typeof activeTenantId === 'string' ? activeTenantId : null;
    }
    if (!tenantId) {
      throw new HttpsError('failed-precondition', 'Chưa chọn cửa hàng.');
    }

    const memberSnap = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
    assertActiveMember(memberSnap.exists ? memberSnap.data() : undefined);

    const layers = await readConfigLayers(db, tenantId);
    return toTenantVisibleResolvedConfig(resolveTenantConfig(layers));
  },
);

const SCHEDULE_OPTIONS = {
  region: FUNCTIONS_REGION,
  timeZone: 'Asia/Ho_Chi_Minh',
} as const;

/**
 * Daily retention and archive job. Config supplies the five-year default; paid
 * Orders and confirmed Payments are archived, never deleted (NFR-RET-001).
 * Retention is idempotent, so a failed run is retried rather than skipped.
 */
export const scheduledRetentionArchive = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: 'every day 03:00', retryCount: 3 },
  async () => {
    await runRetentionArchive(getDb());
  },
);

/**
 * Daily Firestore backup job. The deployment configuration retains backups for
 * 30 days (NFR-REL-001). A retried run replaces the same day's backup.
 */
export const scheduledFirestoreBackup = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: 'every day 02:00', retryCount: 3 },
  async () => {
    await runScheduledBackup(getDb());
  },
);

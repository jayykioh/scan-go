import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { CONFIG_CONTRACT_VERSION } from '../../../../shared/contracts/config.contract.js';
import { getDb } from '../../shared/firestore.js';
import { writeAuditEvent } from '../../shared/audit.js';
import {
  mergeOverrideMaps,
  nowIso,
  parseTenantOverrideInput,
  readConfigLayers,
  requireUid,
  resolveTenantConfig,
} from './service.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

export const callableConfigUpdateTenant = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);

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
    const memberSnap = await db
      .doc(`tenants/${tenantId}/members/${uid}`)
      .get();
    if (!memberSnap.exists || memberSnap.get('isActive') === false) {
      throw new HttpsError(
        'permission-denied',
        'Bạn không thuộc cửa hàng này.',
      );
    }
    if (memberSnap.get('membershipType') !== 'owner') {
      throw new HttpsError(
        'permission-denied',
        'Chỉ chủ cửa hàng đổi được cấu hình.',
      );
    }

    const tenantRef = db.doc(`tenants/${tenantId}`);
    const tenantSnap = await tenantRef.get();
    const currentOverridesRaw = tenantSnap.get('configOverrides');
    const currentOverrides =
      currentOverridesRaw &&
      typeof currentOverridesRaw === 'object' &&
      !Array.isArray(currentOverridesRaw)
        ? (currentOverridesRaw as Record<string, unknown>)
        : {};
    const currentVersion =
      typeof tenantSnap.get('configVersion') === 'number'
        ? (tenantSnap.get('configVersion') as number)
        : 0;

    const nextOverrides = mergeOverrideMaps(
      currentOverrides,
      overrides as Record<string, unknown>,
    );
    const nextVersion = currentVersion + 1;

    await tenantRef.set(
      {
        configOverrides: nextOverrides,
        configVersion: nextVersion,
        updatedAt: nowIso(),
      },
      { merge: true },
    );

    await writeAuditEvent({
      tenantId,
      actorUid: uid,
      action: 'ConfigurationChanged',
      targetType: 'tenant',
      targetId: tenantId,
      detail: { overrides },
    }).catch(() => undefined);

    const layers = await readConfigLayers(db, tenantId);

    return {
      schemaVersion: CONFIG_CONTRACT_VERSION,
      configVersion: nextVersion,
      resolvedConfig: resolveTenantConfig(layers),
    };
  },
);

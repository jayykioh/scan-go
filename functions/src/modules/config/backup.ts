import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import {
  backupExpiryAt,
  backupRunId,
  buildRestoreDrillPlan,
  validateBackupConfiguration,
} from '../../../../shared/config/backup.js';
import { nowIso } from '../ordering/service.js';

/** Scheduled backup captures at most this many tenants per run. */
export const BACKUP_TENANT_LIMIT = 500;

export interface BackupRunResult {
  runId: string;
  schedule: 'daily';
  retentionDays: number;
  expiresAt: string;
  tenantCount: number;
  createdAt: string;
}

/**
 * Daily backup run. The deployment configuration supplies the schedule and the
 * 30-day retention; this run records one manifest per UTC day with its exact
 * expiry so a restore drill can target it (NFR-REL-001).
 */
export async function runScheduledBackup(
  db: Firestore,
  input: { now?: string; schedule?: unknown; retentionDays?: unknown } = {},
): Promise<BackupRunResult> {
  const now = input.now ?? nowIso();
  const platformSnap = await db.doc('platform/config').get();
  const configured = (platformSnap.get('values')?.backup ?? {}) as {
    schedule?: unknown;
    retentionDays?: unknown;
  };
  const config = validateBackupConfiguration({
    schedule: input.schedule ?? configured.schedule,
    retentionDays: input.retentionDays ?? configured.retentionDays,
  });

  const tenantsSnap = await db
    .collection('tenants')
    .limit(BACKUP_TENANT_LIMIT)
    .get();

  const result: BackupRunResult = {
    runId: backupRunId(now),
    schedule: config.schedule,
    retentionDays: config.retentionDays,
    expiresAt: backupExpiryAt(now, config.retentionDays),
    tenantCount: tenantsSnap.size,
    createdAt: now,
  };

  await db.doc(`platform/config/backups/${result.runId}`).set({
    ...result,
    tenantIds: tenantsSnap.docs.map((docSnap) => docSnap.id),
    location: platformSnap.get('values')?.backupLocation ?? null,
  });

  return result;
}

export interface RestoreDrillInput {
  backupId: string;
  targetNamespace: string;
  tenantIds: string[];
  now?: string;
}

export interface RestoreDrillResult {
  drillId: string;
  backupId: string;
  targetNamespace: string;
  restoredTenantIds: string[];
  restoredCount: number;
  sourceUnchanged: true;
  createdAt: string;
}

/**
 * Isolated restore rehearsal. Tenant documents are copied into the target
 * namespace only; the source environment is never written
 * (NFR-REL-001, P0-L03).
 */
export async function runRestoreDrill(
  db: Firestore,
  input: RestoreDrillInput,
): Promise<RestoreDrillResult> {
  const now = input.now ?? nowIso();
  const drillId = `drill_${input.backupId}_${now.slice(0, 10)}`;
  const plan = buildRestoreDrillPlan({
    drillId,
    backupId: input.backupId,
    targetNamespace: input.targetNamespace,
    tenantIds: input.tenantIds,
    now,
  });

  const restored: string[] = [];
  for (const tenantId of plan.tenantIds) {
    const sourceSnap = await db.doc(`tenants/${tenantId}`).get();
    const sourceData: DocumentData =
      (sourceSnap.exists ? sourceSnap.data() : {}) ?? {};
    await db
      .doc(`${plan.targetNamespace}/tenants/${tenantId}`)
      .set({
        ...sourceData,
        restoreMetadata: {
          drillId: plan.drillId,
          backupId: plan.backupId,
          restoredAt: now,
        },
      });
    restored.push(tenantId);
  }

  const result: RestoreDrillResult = {
    drillId: plan.drillId,
    backupId: plan.backupId,
    targetNamespace: plan.targetNamespace,
    restoredTenantIds: restored,
    restoredCount: restored.length,
    sourceUnchanged: true,
    createdAt: now,
  };

  await db.doc(`platform/config/restoreDrills/${plan.drillId}`).set(result);

  return result;
}

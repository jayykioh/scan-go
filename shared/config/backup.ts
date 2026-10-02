import { CONFIG_DEFAULTS } from './defaults.js';

/** Approved daily backup schedule and 30-day retention (NFR-REL-001). */
export const BACKUP_SCHEDULE = CONFIG_DEFAULTS.backup.schedule;
export const BACKUP_RETENTION_DAYS = CONFIG_DEFAULTS.backup.retentionDays;

export interface BackupConfiguration {
  schedule: typeof BACKUP_SCHEDULE;
  retentionDays: number;
}

/**
 * Validate a resolved backup configuration. Only the daily schedule is
 * approved and retention must be a positive integer number of days
 * (NFR-REL-001, NFR-CFG-001).
 */
export function validateBackupConfiguration(input: {
  schedule?: unknown;
  retentionDays?: unknown;
}): BackupConfiguration {
  const schedule = input.schedule ?? BACKUP_SCHEDULE;
  if (schedule !== BACKUP_SCHEDULE) {
    throw new Error('Only the daily backup schedule is supported.');
  }
  const retentionDays = input.retentionDays ?? BACKUP_RETENTION_DAYS;
  if (
    typeof retentionDays !== 'number' ||
    !Number.isInteger(retentionDays) ||
    retentionDays <= 0
  ) {
    throw new Error('Backup retention days must be a positive integer.');
  }
  return { schedule, retentionDays };
}

/** UTC `yyyymmdd` run id for one daily backup. */
export function backupRunId(nowIso: string): string {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) {
    throw new Error('invalid backup clock');
  }
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Expiry instant for one backup run. A backup is retained for the configured
 * number of days from its creation (NFR-REL-001).
 */
export function backupExpiryAt(nowIso: string, retentionDays: number): string {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) {
    throw new Error('invalid backup clock');
  }
  const expiry = new Date(now.getTime());
  expiry.setUTCDate(expiry.getUTCDate() + retentionDays);
  return expiry.toISOString();
}

/** One tenant selected for the isolated restore drill. */
export interface RestoreDrillPlan {
  drillId: string;
  backupId: string;
  targetNamespace: string;
  tenantIds: string[];
  createdAt: string;
}

/**
 * Build an isolated restore plan for the listed source tenants. The plan never
 * modifies the source environment because it only writes below the target
 * namespace (NFR-REL-001, P0-L03).
 */
export function buildRestoreDrillPlan(input: {
  drillId: string;
  backupId: string;
  targetNamespace: string;
  tenantIds: string[];
  now: string;
}): RestoreDrillPlan {
  if (input.tenantIds.length === 0) {
    throw new Error('A restore drill needs at least one tenant.');
  }
  return {
    drillId: input.drillId,
    backupId: input.backupId,
    targetNamespace: input.targetNamespace,
    tenantIds: [...new Set(input.tenantIds)],
    createdAt: input.now,
  };
}

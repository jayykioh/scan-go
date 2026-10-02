import { describe, expect, it } from 'vitest';
import {
  backupExpiryAt,
  backupRunId,
  BACKUP_RETENTION_DAYS,
  BACKUP_SCHEDULE,
  buildRestoreDrillPlan,
  validateBackupConfiguration,
} from './backup.js';

/**
 * Unit evidence for the backup deployment policy (NFR-REL-001, P0-L03).
 *
 * The real restore rehearsal runs in the Functions Emulator against an
 * isolated target namespace. Production uses the managed Firestore backup with:
 *   gcloud firestore backups schedules create \
 *     --database='(default)' --retention=30d --recurrence=daily
 *   gcloud firestore databases restore --source-backup=BACKUP --destination-database=drill
 */
describe('backup configuration validation', () => {
  it('defaults to a daily schedule with 30-day retention', () => {
    expect(BACKUP_SCHEDULE).toBe('daily');
    expect(BACKUP_RETENTION_DAYS).toBe(30);
    expect(validateBackupConfiguration({})).toEqual({
      schedule: 'daily',
      retentionDays: 30,
    });
  });

  it('accepts an explicit positive integer retention', () => {
    expect(
      validateBackupConfiguration({ schedule: 'daily', retentionDays: 45 }),
    ).toEqual({ schedule: 'daily', retentionDays: 45 });
  });

  it('rejects a non-daily schedule or invalid retention', () => {
    expect(() =>
      validateBackupConfiguration({ schedule: 'hourly' }),
    ).toThrow();
    expect(() => validateBackupConfiguration({ retentionDays: 0 })).toThrow();
    expect(() =>
      validateBackupConfiguration({ retentionDays: 1.5 }),
    ).toThrow();
    expect(() =>
      validateBackupConfiguration({ retentionDays: '30' }),
    ).toThrow();
  });
});

describe('backup run identity and expiry', () => {
  it('uses one UTC yyyymmdd run id per day', () => {
    expect(backupRunId('2026-10-01T02:00:00.000Z')).toBe('20261001');
    expect(() => backupRunId('nope')).toThrow();
  });

  it('expires the backup at the configured retention instant', () => {
    expect(backupExpiryAt('2026-10-01T02:00:00.000Z', 30)).toBe(
      '2026-10-31T02:00:00.000Z',
    );
  });
});

describe('isolated restore drill plan', () => {
  it('deduplicates tenants and never targets the source environment', () => {
    const plan = buildRestoreDrillPlan({
      drillId: 'drill-1',
      backupId: '20261001',
      targetNamespace: 'restoreDrills/scango-drill',
      tenantIds: ['tenant-a', 'tenant-a', 'tenant-b'],
      now: '2026-10-01T04:00:00.000Z',
    });
    expect(plan.tenantIds).toEqual(['tenant-a', 'tenant-b']);
    expect(plan.targetNamespace).toBe('restoreDrills/scango-drill');
  });

  it('requires at least one tenant', () => {
    expect(() =>
      buildRestoreDrillPlan({
        drillId: 'drill-1',
        backupId: '20261001',
        targetNamespace: 'restoreDrills/scango-drill',
        tenantIds: [],
        now: '2026-10-01T04:00:00.000Z',
      }),
    ).toThrow();
  });
});

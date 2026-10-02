import { describe, expect, it } from 'vitest';
import { auditEventSchema } from './audit.contract.js';
import {
  adminActionAuditFixture,
  configChangedAuditFixture,
  ownerRegisteredAuditFixture,
  staffPinLockedAuditFixture,
} from '../fixtures/audit.fixture.js';

describe('AuditEvent contract', () => {
  it('accepts the audit fixtures', () => {
    for (const fixture of [
      ownerRegisteredAuditFixture,
      staffPinLockedAuditFixture,
      configChangedAuditFixture,
      adminActionAuditFixture,
    ]) {
      expect(auditEventSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('rejects an unknown actor type', () => {
    expect(
      auditEventSchema.safeParse({
        ...ownerRegisteredAuditFixture,
        actorType: 'ghost',
      }).success,
    ).toBe(false);
  });

  it('rejects a local timestamp without a timezone', () => {
    expect(
      auditEventSchema.safeParse({
        ...ownerRegisteredAuditFixture,
        createdAt: '2026-09-12 03:05:00',
      }).success,
    ).toBe(false);
  });
});

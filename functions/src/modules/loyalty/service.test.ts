import { describe, expect, it } from 'vitest';
import {
  buildLoyaltyEarnPlan,
  buildLoyaltyMemberDocument,
  buildLoyaltyRedeemPlan,
  buildLoyaltyRequestHash,
  buildLoyaltyReversePlan,
  hashLoyaltyVerificationCode,
  mapStoredLoyaltyMember,
  toLoyaltyMemberView,
  buildLoyaltyConfigDocument,
} from './service.js';
import { buildDefaultLoyaltyConfig } from '../../../../shared/contracts/loyalty.contract.js';

const NOW = '2026-09-12T05:00:00.000Z';
const RATE = { earnRateVnd: 10000, pointsPerEarnRate: 1 };

function member(overrides: Record<string, unknown> = {}) {
  const base = buildLoyaltyMemberDocument({
    tenantId: 'tenant-a',
    phone: '0901234567',
    displayName: 'Khách A',
    now: NOW,
    verificationCodeHash: hashLoyaltyVerificationCode('111111'),
    verificationExpiresAt: '2026-09-12T05:10:00.000Z',
  });
  return { ...base, ...overrides };
}

describe('loyalty service helpers', () => {
  it('hashes a verification code and never stores the plaintext', () => {
    const hash = hashLoyaltyVerificationCode('123456');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('123456');
    expect(hash).toBe(hashLoyaltyVerificationCode('123456'));
  });

  it('normalizes the phone and starts with zero points', () => {
    const record = member();
    expect(record.memberId).toBe('member_84901234567');
    expect(record.phone).toBe('+84901234567');
    expect(record.pointBalance).toBe(0);
    expect(record.isVerified).toBe(false);
  });

  it('builds an earn plan with integer points and a one-shot ledger id', () => {
    const plan = buildLoyaltyEarnPlan({
      tenantId: 'tenant-a',
      member: member(),
      orderId: 'order-1',
      amountVnd: 25000,
      rate: RATE,
      idempotencyKey: 'idem-1',
      requestHash: buildLoyaltyRequestHash({
        tenantId: 'tenant-a',
        memberId: 'member_84901234567',
        action: 'earn',
        points: 2,
        amountVnd: 25000,
      }),
      actorUid: 'uid-cashier',
      now: NOW,
    });
    expect(plan.transaction.transactionId).toBe('loyalty_earn_order-1');
    expect(plan.transaction.points).toBe(2);
    expect(plan.nextMember.pointBalance).toBe(2);
    expect(plan.nextMember.paidTotalVnd).toBe(25000);
    expect(plan.transaction.requestHash).toHaveLength(64);
  });

  it('derives a stable request hash that changes when the request changes', () => {
    const base = {
      tenantId: 'tenant-a',
      memberId: 'member_84901234567',
      action: 'earn' as const,
      points: 2,
      amountVnd: 25000,
    };
    expect(buildLoyaltyRequestHash(base)).toBe(
      buildLoyaltyRequestHash({ ...base }),
    );
    expect(buildLoyaltyRequestHash(base)).not.toBe(
      buildLoyaltyRequestHash({ ...base, amountVnd: 30000 }),
    );
    expect(buildLoyaltyRequestHash(base)).not.toBe(
      buildLoyaltyRequestHash({ ...base, points: 3 }),
    );
    expect(buildLoyaltyRequestHash(base)).not.toBe(
      buildLoyaltyRequestHash({ ...base, action: 'redeem' }),
    );
  });

  it('requires verification and enough balance to redeem', () => {
    const redeemHash = buildLoyaltyRequestHash({
      tenantId: 'tenant-a',
      memberId: 'member_84901234567',
      action: 'redeem',
      points: 1,
      amountVnd: 0,
    });
    expect(() =>
      buildLoyaltyRedeemPlan({
        tenantId: 'tenant-a',
        member: member({ isVerified: false }),
        points: 1,
        orderId: null,
        idempotencyKey: 'idem-redeem',
        requestHash: redeemHash,
        actorUid: 'uid',
        now: NOW,
      }),
    ).toThrow();

    const plan = buildLoyaltyRedeemPlan({
      tenantId: 'tenant-a',
      member: member({ isVerified: true, pointBalance: 10 }),
      points: 4,
      orderId: null,
      idempotencyKey: 'idem-redeem',
      requestHash: buildLoyaltyRequestHash({
        tenantId: 'tenant-a',
        memberId: 'member_84901234567',
        action: 'redeem',
        points: 4,
        amountVnd: 0,
      }),
      actorUid: 'uid',
      now: NOW,
    });
    expect(plan.transaction.points).toBe(-4);
    expect(plan.nextMember.pointBalance).toBe(6);
  });

  it('clamps a reversal to the current balance', () => {
    const earn = buildLoyaltyEarnPlan({
      tenantId: 'tenant-a',
      member: member(),
      orderId: 'order-2',
      amountVnd: 100000,
      rate: RATE,
      idempotencyKey: 'idem-2',
      requestHash: buildLoyaltyRequestHash({
        tenantId: 'tenant-a',
        memberId: 'member_84901234567',
        action: 'earn',
        points: 10,
        amountVnd: 100000,
      }),
      actorUid: 'uid',
      now: NOW,
    }).transaction;
    const plan = buildLoyaltyReversePlan({
      tenantId: 'tenant-a',
      member: member({ pointBalance: 3 }),
      earnTransaction: earn,
      reason: 'refund',
      idempotencyKey: 'idem-rev',
      requestHash: buildLoyaltyRequestHash({
        tenantId: 'tenant-a',
        memberId: 'member_84901234567',
        action: 'reverse',
        points: Math.abs(earn.points),
        amountVnd: 0,
      }),
      actorUid: 'uid',
      now: NOW,
    });
    expect(plan.transaction.points).toBe(-3);
    expect(plan.nextMember.pointBalance).toBe(0);
  });

  it('merges a partial config update over the defaults', () => {
    const current = buildDefaultLoyaltyConfig('tenant-a', NOW);
    const next = buildLoyaltyConfigDocument(
      'tenant-a',
      current,
      { welcomePoints: 5 },
      NOW,
    );
    expect(next.welcomePoints).toBe(5);
    expect(next.earnRateVnd).toBe(10000);
  });

  it('filters the phone field by the visibility flag', () => {
    const record = mapStoredLoyaltyMember('member_84901234567', 'tenant-a', member());
    expect(toLoyaltyMemberView(record, false).phone).toBeNull();
    expect(toLoyaltyMemberView(record, false).phoneVisible).toBe(false);
    expect(toLoyaltyMemberView(record, true).phone).toBe('+84901234567');
  });
});

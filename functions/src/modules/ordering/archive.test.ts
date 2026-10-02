import { describe, expect, it } from 'vitest';
import {
  buildOrderArchivePlan,
  buildOrderCorrectionMutationPlan,
} from './service.js';
import { orderArchivePlanSchema } from '../../../../shared/contracts/order.contract.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';

const NOW = '2026-10-01T00:00:00.000Z';
const RETENTION_YEARS = 5;

/**
 * Unit evidence for the Ordering retention archive plan and the linked
 * paid-order correction mutation (NFR-RET-001, REQ-PAY-001).
 */
describe('buildOrderArchivePlan', () => {
  it('selects only paid Orders older than the retention cutoff', () => {
    const plan = buildOrderArchivePlan({
      tenantId: TENANT_A_FIXTURE,
      candidates: [
        {
          orderId: 'order-old-paid',
          status: 'paid',
          paidAt: '2020-02-01T00:00:00.000Z',
          createdAt: '2020-01-01T00:00:00.000Z',
          archivedAt: null,
        },
        {
          orderId: 'order-recent-paid',
          status: 'paid',
          paidAt: '2026-09-01T00:00:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z',
          archivedAt: null,
        },
      ],
      now: NOW,
      retentionYears: RETENTION_YEARS,
    });

    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]?.orderId).toBe('order-old-paid');
    expect(plan.lines[0]?.archivePath).toBe(
      `tenants/${TENANT_A_FIXTURE}/archivedOrders/order-old-paid`,
    );
    expect(orderArchivePlanSchema.safeParse(plan).success).toBe(true);
  });

  it('protects unpaid, cancelled, and already-archived Orders', () => {
    const plan = buildOrderArchivePlan({
      tenantId: TENANT_A_FIXTURE,
      candidates: [
        {
          orderId: 'order-unpaid',
          status: 'pending',
          paidAt: null,
          createdAt: '2020-01-01T00:00:00.000Z',
          archivedAt: null,
        },
        {
          orderId: 'order-cancelled',
          status: 'cancelled',
          paidAt: null,
          createdAt: '2020-01-01T00:00:00.000Z',
          archivedAt: null,
        },
        {
          orderId: 'order-archived',
          status: 'paid',
          paidAt: '2020-02-01T00:00:00.000Z',
          createdAt: '2020-01-01T00:00:00.000Z',
          archivedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      now: NOW,
      retentionYears: RETENTION_YEARS,
    });

    expect(plan.lines).toHaveLength(0);
  });
});

describe('buildOrderCorrectionMutationPlan', () => {
  it('records the correction instant for the linked kind only', () => {
    const reversal = buildOrderCorrectionMutationPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-paid',
      kind: 'reversal',
      now: NOW,
    });
    expect(reversal.kind).toBe('reversal');
    expect(reversal.correctedAt).toBe(NOW);
    expect(reversal.orderId).toBe('order-paid');
  });
});

import type { Firestore } from 'firebase-admin/firestore';
import {
  computeRetentionCutoff,
  resolveRetentionYears,
} from '../../../../shared/config/retention.js';
import { buildAuditEventData } from '../../shared/audit.js';
import {
  applyOrderArchivePlan,
  buildOrderArchivePlan,
} from '../ordering/index.js';
import type { OrderStatus } from '../../../../shared/contracts/order.contract.js';
import {
  applyPaymentArchivePlan,
  buildPaymentArchivePlan,
} from '../payment/index.js';
import type { PaymentRecord } from '../../../../shared/contracts/payment.contract.js';
import { nowIso } from '../ordering/service.js';

/** Scheduled retention scans at most this many tenants per run. */
export const RETENTION_TENANT_LIMIT = 500;

export interface RetentionRunResult {
  runId: string;
  cutoffAt: string;
  retentionYears: number;
  tenantCount: number;
  archivedOrderCount: number;
  archivedPaymentCount: number;
}

export interface RetentionRunInput {
  now?: string;
  /** Test/override hook; configuration remains the production source. */
  retentionYears?: number;
}

/**
 * Scheduled retention and archive run (NFR-RET-001, NFR-REL-001).
 *
 * - Config supplies the retention window (five years by default).
 * - Ordering archives paid Orders; Payment archives confirmed Payments.
 * - Eligible records are copied to an archive collection and marked with
 *   `archivedAt`; nothing is deleted.
 * - Already-archived records are excluded, so a retry never duplicates or
 *   removes a protected record.
 */
export async function runRetentionArchive(
  db: Firestore,
  input: RetentionRunInput = {},
): Promise<RetentionRunResult> {
  const now = input.now ?? nowIso();
  const platformSnap = await db.doc('platform/config').get();
  const configuredYears = platformSnap.get('values')?.retention?.years;
  const retentionYears =
    input.retentionYears ?? resolveRetentionYears(configuredYears);
  const cutoffAt = computeRetentionCutoff(now, retentionYears);
  const runId = `retention_${now.slice(0, 10)}`;

  const tenantsSnap = await db
    .collection('tenants')
    .limit(RETENTION_TENANT_LIMIT)
    .get();

  let archivedOrderCount = 0;
  let archivedPaymentCount = 0;

  for (const tenantSnap of tenantsSnap.docs) {
    const tenantId = tenantSnap.id;
    const counts = await db.runTransaction(async (transaction) => {
      // The descending order matches the deployed (status ASC, createdAt DESC)
      // composite index (firestore.indexes.json), so the scheduled job runs in
      // production without a new index (NFR-RET-001).
      const orderQuery = db
        .collection(`tenants/${tenantId}/orders`)
        .where('status', '==', 'paid')
        .where('createdAt', '<', cutoffAt)
        .orderBy('createdAt', 'desc');
      const paymentQuery = db
        .collection(`tenants/${tenantId}/payments`)
        .where('status', '==', 'confirmed')
        .where('createdAt', '<', cutoffAt)
        .orderBy('createdAt', 'desc');

      // All reads precede all writes (RULES_FIREBASE §4).
      const orderSnap = await transaction.get(orderQuery);
      const paymentSnap = await transaction.get(paymentQuery);

      const orderPlan = buildOrderArchivePlan({
        tenantId,
        candidates: orderSnap.docs.map((docSnap) => ({
          orderId: docSnap.id,
          status: docSnap.get('status') as OrderStatus,
          paidAt: (docSnap.get('paidAt') as string | null) ?? null,
          createdAt: docSnap.get('createdAt') as string,
          archivedAt: (docSnap.get('archivedAt') as string | null) ?? null,
        })),
        now,
        retentionYears,
      });
      const paymentPlan = buildPaymentArchivePlan({
        tenantId,
        candidates: paymentSnap.docs.map((docSnap) => ({
          paymentId: docSnap.id,
          status: docSnap.get('status') as PaymentRecord['status'],
          confirmedAt: (docSnap.get('confirmedAt') as string | null) ?? null,
          createdAt: docSnap.get('createdAt') as string,
          archivedAt: (docSnap.get('archivedAt') as string | null) ?? null,
        })),
        now,
        retentionYears,
      });

      applyOrderArchivePlan(
        transaction,
        db,
        orderPlan,
        new Map(orderSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()])),
      );
      applyPaymentArchivePlan(
        transaction,
        db,
        paymentPlan,
        new Map(
          paymentSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]),
        ),
      );

      if (orderPlan.lines.length > 0 || paymentPlan.lines.length > 0) {
        const auditRef = db
          .collection(`tenants/${tenantId}/audit`)
          .doc();
        transaction.set(
          auditRef,
          buildAuditEventData(auditRef.id, {
            tenantId,
            actorUid: null,
            actorType: 'system',
            role: 'system',
            action: 'RetentionArchived',
            targetType: 'tenant',
            targetId: tenantId,
            requestId: runId,
            detail: {
              cutoffAt,
              archivedOrderCount: orderPlan.lines.length,
              archivedPaymentCount: paymentPlan.lines.length,
            },
          }),
        );
      }

      return {
        orders: orderPlan.lines.length,
        payments: paymentPlan.lines.length,
      };
    });

    archivedOrderCount += counts.orders;
    archivedPaymentCount += counts.payments;
  }

  const result: RetentionRunResult = {
    runId,
    cutoffAt,
    retentionYears,
    tenantCount: tenantsSnap.size,
    archivedOrderCount,
    archivedPaymentCount,
  };

  await db.doc(`platform/config/retentionRuns/${runId}`).set({
    ...result,
    schedule: 'daily',
    createdAt: now,
  });

  return result;
}

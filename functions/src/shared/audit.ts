import type { Transaction } from 'firebase-admin/firestore';
import {
  AUDIT_CONTRACT_VERSION,
  type AuditActorType,
} from '../../../shared/contracts/audit.contract.js';
import { getDb } from './firestore.js';

export interface AuditEventInput {
  tenantId: string;
  actorUid: string | null;
  actorType?: AuditActorType;
  role?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * A platform-scoped event has no tenant. The audit contract requires a tenant
 * id, so platform events use the reserved `platform` marker below.
 */
export type PlatformAuditEventInput = Omit<AuditEventInput, 'tenantId'>;

export const PLATFORM_AUDIT_TENANT_ID = 'platform';

export function buildAuditEventData(
  eventId: string,
  input: AuditEventInput,
): Record<string, unknown> {
  return {
    schemaVersion: AUDIT_CONTRACT_VERSION,
    eventId,
    tenantId: input.tenantId,
    actorUid: input.actorUid,
    actorType: input.actorType ?? 'system',
    role: input.role ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    requestId: input.requestId ?? null,
    reason: input.reason ?? null,
    metadata: input.detail ?? {},
    createdAt: new Date().toISOString(),
  };
}

export async function writeAuditEvent(input: AuditEventInput): Promise<string> {
  const db = getDb();
  const ref = db.collection(`tenants/${input.tenantId}/audit`).doc();
  await ref.set(buildAuditEventData(ref.id, input));
  return ref.id;
}

export function writeAuditEventInTransaction(
  transaction: Transaction,
  input: AuditEventInput,
): void {
  const db = getDb();
  const ref = db.collection(`tenants/${input.tenantId}/audit`).doc();
  transaction.set(ref, buildAuditEventData(ref.id, input));
}

/**
 * Write an ADMIN platform change audit event under
 * `platform/config/audit/{eventId}`. Platform events carry the reserved
 * `platform` tenant marker because the audit contract requires a tenant id.
 */
export function writePlatformAuditEventInTransaction(
  transaction: Transaction,
  input: PlatformAuditEventInput,
): void {
  const db = getDb();
  const ref = db.doc('platform/config').collection('audit').doc();
  transaction.set(
    ref,
    buildAuditEventData(ref.id, {
      ...input,
      tenantId: PLATFORM_AUDIT_TENANT_ID,
    }),
  );
}

/**
 * Write a platform-scoped ADMIN audit event outside a transaction. Use this
 * for read queries that have no business write to share a commit with.
 */
export async function writePlatformAuditEvent(
  input: PlatformAuditEventInput,
): Promise<string> {
  const db = getDb();
  const ref = db.doc('platform/config').collection('audit').doc();
  await ref.set(
    buildAuditEventData(ref.id, {
      ...input,
      tenantId: PLATFORM_AUDIT_TENANT_ID,
    }),
  );
  return ref.id;
}

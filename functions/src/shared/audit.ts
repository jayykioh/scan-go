import { getDb } from './firestore.js';

export interface AuditEventInput {
  tenantId: string;
  actorUid: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  const db = getDb();
  await db.collection(`tenants/${input.tenantId}/audit`).add({
    actorUid: input.actorUid,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    detail: input.detail ?? {},
    at: new Date().toISOString(),
  });
}

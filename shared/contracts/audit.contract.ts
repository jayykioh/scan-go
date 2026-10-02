import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

export const AUDIT_CONTRACT_VERSION = 1;

export const auditActorTypeSchema = z.enum([
  'owner',
  'staff',
  'customer',
  'admin',
  'system',
]);

export type AuditActorType = z.infer<typeof auditActorTypeSchema>;

export const auditEventSchema = z.strictObject({
  schemaVersion: z.literal(AUDIT_CONTRACT_VERSION),
  eventId: z.string().min(1),
  tenantId: z.string().min(1),
  actorUid: z.string().min(1).nullable(),
  actorType: auditActorTypeSchema,
  role: z.string().min(1).nullable(),
  action: z.string().min(1),
  targetType: z.string().min(1).nullable(),
  targetId: z.string().min(1).nullable(),
  requestId: z.string().min(1).nullable(),
  reason: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoUtcTimestampSchema,
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import {
  ADMIN_CONTRACT_VERSION,
  ADMIN_AUDIT_LIST_LIMIT,
  ADMIN_CUSTOMER_PHONE_LIST_LIMIT,
  ADMIN_TENANT_LIST_LIMIT,
  adminChangeTenantInputSchema,
  adminCustomerPhoneQueryInputSchema,
  adminListAuditInputSchema,
  adminListTenantsInputSchema,
  adminOpenTenantInputSchema,
  type AdminChangeTenantInput,
  type AdminCustomerPhoneQueryInput,
  type AdminListAuditInput,
  type AdminListTenantsInput,
  type AdminOpenTenantInput,
  type AdminTenantSummary,
} from '../../../../shared/contracts/admin.contract.js';

export const ADMIN_INVALID_MESSAGE = 'Yêu cầu ADMIN không hợp lệ.';

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : fallback;
}

export function parseAdminListTenantsInput(
  data: unknown,
): AdminListTenantsInput {
  const parsed = adminListTenantsInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ADMIN_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseAdminOpenTenantInput(data: unknown): AdminOpenTenantInput {
  const parsed = adminOpenTenantInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ADMIN_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseAdminChangeTenantInput(
  data: unknown,
): AdminChangeTenantInput {
  const parsed = adminChangeTenantInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ADMIN_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseAdminListAuditInput(data: unknown): AdminListAuditInput {
  const parsed = adminListAuditInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ADMIN_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseAdminCustomerPhoneInput(
  data: unknown,
): AdminCustomerPhoneQueryInput {
  const parsed = adminCustomerPhoneQueryInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ADMIN_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function resolveTenantListLimit(input: AdminListTenantsInput): number {
  return input.limit ?? ADMIN_TENANT_LIST_LIMIT;
}

export function resolveAuditListLimit(input: AdminListAuditInput): number {
  return input.limit ?? ADMIN_AUDIT_LIST_LIMIT;
}

export function resolveCustomerPhoneLimit(
  input: AdminCustomerPhoneQueryInput,
): number {
  return input.limit ?? ADMIN_CUSTOMER_PHONE_LIST_LIMIT;
}

/**
 * Map a stored Tenant document to the ADMIN summary. ADMIN reads every Tenant
 * through owning module data, but the projection is derived server-side and
 * never grants authorization by itself (REQ-ADM-001).
 */
export function toAdminTenantSummary(
  tenantId: string,
  data: DocumentData | undefined,
  memberCount: number,
): AdminTenantSummary {
  const createdAt = readString(data?.createdAt) ?? '1970-01-01T00:00:00.000Z';
  const archivedAt = readString(data?.archivedAt);
  const pricingTier = data?.pricingTier;
  const paymentMode = data?.paymentMode;
  return {
    schemaVersion: ADMIN_CONTRACT_VERSION,
    tenantId,
    shopName: readString(data?.shopName) ?? tenantId,
    industry: readString(data?.industry) ?? 'unknown',
    pricingTier:
      pricingTier === 'lite' || pricingTier === 'pro' ? pricingTier : 'free',
    paymentMode: paymentMode === 'payFirst' ? 'payFirst' : 'payLater',
    state: archivedAt ? 'archived' : 'active',
    memberCount: readInteger(memberCount, 0),
    archivedAt,
    createdAt,
    updatedAt: readString(data?.updatedAt) ?? createdAt,
  };
}

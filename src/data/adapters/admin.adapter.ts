import { httpsCallable } from 'firebase/functions';
import type {
  AdminAuditListResult,
  AdminChangeTenantResult,
  AdminCustomerPhoneListResult,
  AdminOpenTenantResult,
  AdminTenantChangeAction,
  AdminTenantListResult,
} from '@contracts/admin.contract';
import type { CustomerPhoneRecord } from '@contracts/authorization.contract';
import {
  getFirebaseAuth,
  getFirebaseFunctions,
} from '../../services/firebase/client';

const ADMIN_TENANTS_LIST = 'callableAdminListTenants';
const ADMIN_TENANT_OPEN = 'callableAdminOpenTenant';
const ADMIN_TENANT_CHANGE = 'callableAdminChangeTenant';
const ADMIN_AUDIT_LIST = 'callableAdminListAudit';
const ADMIN_CUSTOMER_PHONES = 'callableAdminListCustomerPhones';

function requireFunctions() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  return functions;
}

async function call<T>(
  name: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const callable = httpsCallable<Record<string, unknown> | undefined, T>(
    requireFunctions(),
    name,
  );
  const result = await callable(data);
  return result.data;
}

/**
 * ADMIN identity is a server-verified platform claim, never a tenant
 * membership (REQ-ADM-001). The UI uses this only to gate the ADMIN console;
 * every server call still re-verifies the claim.
 */
export async function hasAdminClaim(): Promise<boolean> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) {
    return false;
  }
  try {
    const token = await user.getIdTokenResult();
    return token.claims.admin === true;
  } catch {
    return false;
  }
}

export function listAdminTenants(
  limit?: number,
): Promise<AdminTenantListResult> {
  return call<AdminTenantListResult>(
    ADMIN_TENANTS_LIST,
    limit ? { limit } : {},
  );
}

export function openAdminTenant(
  tenantId: string,
): Promise<AdminOpenTenantResult> {
  return call<AdminOpenTenantResult>(ADMIN_TENANT_OPEN, { tenantId });
}

export function changeAdminTenant(
  tenantId: string,
  action: AdminTenantChangeAction,
  reason: string,
): Promise<AdminChangeTenantResult> {
  return call<AdminChangeTenantResult>(ADMIN_TENANT_CHANGE, {
    tenantId,
    action,
    reason,
  });
}

export function listAdminAudit(
  tenantId: string,
  limit?: number,
): Promise<AdminAuditListResult> {
  return call<AdminAuditListResult>(ADMIN_AUDIT_LIST, {
    tenantId,
    ...(limit ? { limit } : {}),
  });
}

export function listAdminCustomerPhones(
  tenantId: string,
  limit?: number,
): Promise<AdminCustomerPhoneListResult> {
  return call<AdminCustomerPhoneListResult>(ADMIN_CUSTOMER_PHONES, {
    tenantId,
    ...(limit ? { limit } : {}),
  });
}

/**
 * The ADMIN console renders phone rows with the field-level projection the
 * server returned. The client never reconstructs a hidden phone (NFR-PRIV-001).
 */
export function phoneDisplayValue(record: CustomerPhoneRecord): string {
  return record.phoneVisible && record.phone ? record.phone : '••••';
}

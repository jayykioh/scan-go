import { useEffect, useMemo, useState } from 'react';
import {
  subscribeCurrentMembership,
  type ActiveMembershipReadContext,
} from '../data/adapters/tenant.adapter';
import { useActiveTenantIdState } from './useActiveTenantId';
import { useAuthSession } from './useAuthSession';

/** The Staff working surface, and the home a membership that is not the Owner gets. */
export const STAFF_HOME_PATH = '/staff';

/** The signed-in identity's own membership of its active Tenant. */
export interface ActiveMembership {
  userId: string | null;
  tenantId: string | null;
  /** Who to show in a header: the Auth display name, else the email. */
  name: string | null;
  membershipType: string | null;
  roles: string[];
  isActive: boolean;
  /** False until the Tenant and membership reads have settled. */
  resolved: boolean;
}

/**
 * Read the caller's own membership of the active Tenant (REQ-AUTH-005,
 * REQ-AUTH-006). One document listener, the same read the shared store already
 * makes; the server still re-verifies membership on every command, so this only
 * decides what a screen may draw (NFR-SEC-001).
 */
export function useActiveMembership(): ActiveMembership {
  const { tenantId, resolved: tenantResolved } = useActiveTenantIdState();
  const { user } = useAuthSession();
  const uid = user?.uid ?? null;
  const name = user?.displayName ?? user?.email ?? null;
  const [membership, setMembership] =
    useState<ActiveMembershipReadContext | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!tenantResolved) {
      return;
    }
    if (!tenantId || !uid) {
      setMembership(null);
      setSettled(true);
      return;
    }
    setSettled(false);
    // A denied read (an inactive membership is not readable) settles as "no
    // membership" rather than leaving the screen waiting.
    return subscribeCurrentMembership(
      tenantId,
      uid,
      (next) => {
        setMembership(next);
        setSettled(true);
      },
      () => {
        setMembership(null);
        setSettled(true);
      },
    );
  }, [tenantResolved, tenantId, uid]);

  return useMemo(
    () => ({
      userId: uid,
      tenantId,
      name,
      membershipType: membership?.membershipType ?? null,
      roles: membership?.roles ?? [],
      isActive: membership?.isActive ?? false,
      resolved: tenantResolved && settled,
    }),
    [uid, tenantId, name, membership, tenantResolved, settled],
  );
}

/**
 * True when the active membership owns the Tenant. The Owner is already
 * authenticated by Firebase Auth, so no Staff PIN identifies them
 * (REQ-AUTH-005).
 */
export function isTenantOwner(membership: ActiveMembership): boolean {
  return (
    membership.resolved &&
    membership.isActive &&
    membership.membershipType === 'owner'
  );
}

/**
 * Where a membership must work instead of the Owner console, or null when the
 * console is theirs (REQ-AUTH-006). An unresolved or unknown membership is left
 * alone: the Owner console is not a boundary the client owns, and the server
 * refuses every Owner read and command to a Staff membership anyway.
 */
export function ownerConsoleRedirect(
  membership: ActiveMembership,
): string | null {
  if (
    !membership.resolved ||
    !membership.isActive ||
    membership.membershipType === null
  ) {
    return null;
  }
  return membership.membershipType === 'owner' ? null : STAFF_HOME_PATH;
}

import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  DEFAULT_INDUSTRY,
  DEFAULT_TENANT_NAME,
  DEFAULT_TIMEZONE,
  TENANT_BOOTSTRAP_INVALID_MESSAGE,
  TENANT_CREATE_INVALID_MESSAGE,
  TENANT_LIST_INVALID_MESSAGE,
  TENANT_ONBOARDING_DENIED_MESSAGE,
  TENANT_ONBOARDING_INVALID_MESSAGE,
  TENANT_SELECT_DENIED_MESSAGE,
  TENANT_SELECT_INVALID_MESSAGE,
  TENANT_CUSTOMER_PHONE_INVALID_MESSAGE,
  applyOnboardingStep,
  assertOwnerMember,
  buildOwnerMembershipDocument,
  buildOwnerProfile,
  buildTenantDocument,
  buildTenantOnboardingChecklist,
  decideBootstrap,
  decideCustomerPhoneAccess,
  firstTenantDocumentId,
  mapIdentity,
  mapMembership,
  parseCustomerPhoneQueryInput,
  parseOnboardingStateInput,
  parseOnboardingUpdateInput,
  parseTenantBootstrapInput,
  parseTenantCreateInput,
  parseTenantListMembershipsInput,
  parseTenantSelectActiveInput,
  projectCustomerPhone,
  readOnboardingCompletion,
  requireActiveMembership,
  resolveCustomerPhoneQueryLimit,
} from './service.js';
import {
  CUSTOMER_PHONE_PERMISSION,
  CUSTOMER_PHONE_QUERY_LIMIT,
} from '../../../../shared/contracts/authorization.contract.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';

const NOW = '2026-09-12T03:00:00.000Z';
const LATER = '2026-09-12T04:30:00.000Z';

function captureHttpsError(run: () => unknown): HttpsError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpsError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected an HttpsError to be thrown.');
}

describe('buildTenantDocument defaults', () => {
  it('applies the approved Tenant defaults and UTC timestamps', () => {
    expect(buildTenantDocument(NOW)).toEqual({
      shopName: DEFAULT_TENANT_NAME,
      industry: DEFAULT_INDUSTRY,
      timezone: DEFAULT_TIMEZONE,
      pricingTier: 'free',
      paymentMode: 'payLater',
      onboardingChecklist: {},
      configOverrides: {},
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('uses a trimmed custom shop name and falls back on blanks', () => {
    expect(buildTenantDocument(NOW, '  Quán Bravo  ').shopName).toBe(
      'Quán Bravo',
    );
    expect(buildTenantDocument(NOW, '   ').shopName).toBe(DEFAULT_TENANT_NAME);
    expect(buildTenantDocument(NOW, null).shopName).toBe(DEFAULT_TENANT_NAME);
  });
});

describe('buildOwnerMembershipDocument', () => {
  it('builds an active Owner membership with no plaintext PIN', () => {
    const member = buildOwnerMembershipDocument('uid-owner', NOW);
    expect(member).toMatchObject({
      uid: 'uid-owner',
      membershipType: 'owner',
      roles: ['owner'],
      permissions: [],
      isActive: true,
      staffPinHash: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      sessionVersion: 1,
      lastLoginAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect('pin' in member).toBe(false);
  });
});

describe('buildOwnerProfile', () => {
  it('sets navigation state and only optional fields that exist', () => {
    expect(
      buildOwnerProfile({
        email: 'owner@example.com',
        phoneNumber: null,
        displayName: null,
        activeTenantId: 'tenant-alpha',
        now: NOW,
      }),
    ).toEqual({
      activeTenantId: 'tenant-alpha',
      updatedAt: NOW,
      email: 'owner@example.com',
    });
  });

  it('adds locale and createdAt only for a new user', () => {
    const profile = buildOwnerProfile({
      email: null,
      phoneNumber: '+84900000000',
      displayName: 'Chủ quán',
      activeTenantId: 'tenant-alpha',
      now: NOW,
      isNewUser: true,
    });
    expect(profile).toEqual({
      activeTenantId: 'tenant-alpha',
      updatedAt: NOW,
      phoneNumber: '+84900000000',
      displayName: 'Chủ quán',
      locale: 'vi',
      createdAt: NOW,
    });
  });
});

describe('decideBootstrap', () => {
  it('provisions the first Tenant when the user has no membership', () => {
    expect(decideBootstrap([], null)).toEqual({ kind: 'provision' });
    expect(decideBootstrap([], 'tenant-alpha')).toEqual({ kind: 'provision' });
  });

  it('reuses an existing membership and keeps a valid active Tenant', () => {
    expect(decideBootstrap(['tenant-alpha', 'tenant-bravo'], 'tenant-bravo'))
      .toEqual({
        kind: 'reuse',
        tenantId: 'tenant-alpha',
        activeTenantId: 'tenant-bravo',
      });
  });

  it('reuses the first Tenant when activeTenantId is stale', () => {
    expect(decideBootstrap(['tenant-alpha', 'tenant-bravo'], 'tenant-charlie'))
      .toEqual({
        kind: 'reuse',
        tenantId: 'tenant-alpha',
        activeTenantId: 'tenant-alpha',
      });
    expect(decideBootstrap(['tenant-alpha'], null)).toEqual({
      kind: 'reuse',
      tenantId: 'tenant-alpha',
      activeTenantId: 'tenant-alpha',
    });
  });

  it('ignores blank membership ids', () => {
    expect(decideBootstrap(['', 'tenant-alpha'], '')).toEqual({
      kind: 'reuse',
      tenantId: 'tenant-alpha',
      activeTenantId: 'tenant-alpha',
    });
  });
});

describe('mapMembership', () => {
  it('maps a stored Owner membership', () => {
    expect(
      mapMembership('tenant-alpha', 'uid-owner', {
        membershipType: 'owner',
        roles: ['owner'],
        permissions: [],
        isActive: true,
        sessionVersion: 1,
        lastLoginAt: LATER,
        createdAt: NOW,
        updatedAt: LATER,
      }),
    ).toMatchObject({
      tenantId: 'tenant-alpha',
      uid: 'uid-owner',
      membershipType: 'owner',
      roles: ['owner'],
      permissions: [],
      isActive: true,
      sessionVersion: 1,
      lastLoginAt: LATER,
      createdAt: NOW,
      updatedAt: LATER,
    });
  });

  it('maps a Staff membership and applies safe defaults', () => {
    const mapped = mapMembership('tenant-alpha', 'uid-staff', {
      membershipType: 'staff',
      roles: ['cashier'],
      permissions: ['order.settle'],
      isActive: false,
    });
    expect(mapped.membershipType).toBe('staff');
    expect(mapped.roles).toEqual(['cashier']);
    expect(mapped.permissions).toEqual(['order.settle']);
    expect(mapped.isActive).toBe(false);
    expect(mapped.sessionVersion).toBe(1);
    expect(mapped.lastLoginAt).toBeNull();
  });
});

describe('mapIdentity', () => {
  it('maps a stored user profile to the identity contract', () => {
    expect(
      mapIdentity(
        'uid-owner',
        {
          email: 'owner@example.com',
          phoneNumber: null,
          displayName: 'Chủ quán',
          locale: 'en',
          activeTenantId: 'tenant-alpha',
          createdAt: NOW,
          updatedAt: LATER,
        },
        false,
      ),
    ).toEqual({
      schemaVersion: 1,
      uid: 'uid-owner',
      email: 'owner@example.com',
      phoneNumber: null,
      displayName: 'Chủ quán',
      locale: 'en',
      activeTenantId: 'tenant-alpha',
      isAdmin: false,
      createdAt: NOW,
      updatedAt: LATER,
    });
  });

  it('defaults locale to vi and carries the ADMIN claim', () => {
    const mapped = mapIdentity(
      'uid-admin',
      { createdAt: NOW, updatedAt: NOW },
      true,
    );
    expect(mapped.locale).toBe('vi');
    expect(mapped.isAdmin).toBe(true);
    expect(mapped.activeTenantId).toBeNull();
  });
});

describe('requireActiveMembership', () => {
  it('accepts an active membership', () => {
    expect(() =>
      requireActiveMembership({ isActive: true, membershipType: 'owner' }),
    ).not.toThrow();
    // A missing isActive field defaults to active, matching mapMembership.
    expect(() => requireActiveMembership({ membershipType: 'owner' })).not.toThrow();
  });

  it('rejects a missing or inactive membership and keeps navigation state', () => {
    for (const membership of [undefined, { isActive: false }]) {
      const error = captureHttpsError(() =>
        requireActiveMembership(membership),
      );
      expect(error.code).toBe('permission-denied');
      expect(error.message).toBe(TENANT_SELECT_DENIED_MESSAGE);
    }
  });
});

describe('parseTenantCreateInput', () => {
  it('accepts and trims a valid shop name', () => {
    expect(parseTenantCreateInput({ shopName: '  Quán Mới  ' })).toEqual({
      shopName: 'Quán Mới',
    });
  });

  it('rejects a missing, empty, non-string, or over-long shop name', () => {
    for (const data of [
      {},
      { shopName: '' },
      { shopName: '   ' },
      { shopName: 42 },
      { shopName: 'x'.repeat(121) },
      'not-an-object',
    ]) {
      const error = captureHttpsError(() => parseTenantCreateInput(data));
      expect(error.code).toBe('invalid-argument');
      expect(error.message).toBe(TENANT_CREATE_INVALID_MESSAGE);
    }
  });

  it('rejects an unknown field on the strict create schema', () => {
    const error = captureHttpsError(() =>
      parseTenantCreateInput({ shopName: 'Quán', extra: true }),
    );
    expect(error.code).toBe('invalid-argument');
  });
});

describe('Tenant boundary input parsing', () => {
  it('accepts the empty bootstrap and membership-list payloads', () => {
    expect(parseTenantBootstrapInput({})).toEqual({});
    expect(parseTenantBootstrapInput(undefined)).toEqual({});
    expect(parseTenantListMembershipsInput({})).toEqual({});
    expect(parseTenantListMembershipsInput(undefined)).toEqual({});
  });

  it('rejects a client-supplied field on bootstrap and list', () => {
    for (const data of [{ tenantId: 'tenant-alpha' }, 'nope', 42]) {
      const bootstrapError = captureHttpsError(() =>
        parseTenantBootstrapInput(data),
      );
      expect(bootstrapError.code).toBe('invalid-argument');
      expect(bootstrapError.message).toBe(TENANT_BOOTSTRAP_INVALID_MESSAGE);

      const listError = captureHttpsError(() =>
        parseTenantListMembershipsInput(data),
      );
      expect(listError.code).toBe('invalid-argument');
      expect(listError.message).toBe(TENANT_LIST_INVALID_MESSAGE);
    }
  });

  it('accepts only a non-empty tenantId for active selection', () => {
    expect(parseTenantSelectActiveInput({ tenantId: 'tenant-alpha' })).toEqual({
      tenantId: 'tenant-alpha',
    });
    for (const data of [
      {},
      { tenantId: '' },
      { tenantId: 42 },
      { tenantId: 'tenant-alpha', activeTenantId: 'tenant-bravo' },
      'not-an-object',
    ]) {
      const error = captureHttpsError(() => parseTenantSelectActiveInput(data));
      expect(error.code).toBe('invalid-argument');
      expect(error.message).toBe(TENANT_SELECT_INVALID_MESSAGE);
    }
  });
});

describe('firstTenantDocumentId', () => {
  it('is deterministic per Owner so concurrent first provisions collide', () => {
    expect(firstTenantDocumentId('uid-owner')).toBe('first-uid-owner');
    expect(firstTenantDocumentId('uid-owner')).toBe(
      firstTenantDocumentId('uid-owner'),
    );
    expect(firstTenantDocumentId('uid-owner')).not.toBe(
      firstTenantDocumentId('uid-other'),
    );
  });
});

describe('Tenant onboarding checklist (REQ-ONB-001)', () => {
  it('starts a new Tenant at shopName and reports the next incomplete step', () => {
    const checklist = buildTenantOnboardingChecklist(
      TENANT_A_FIXTURE,
      { onboardingChecklist: {} },
      NOW,
    );
    expect(checklist.completedCount).toBe(0);
    expect(checklist.nextIncompleteStep).toBe('shopName');
    expect(checklist.isComplete).toBe(false);
    expect(checklist.completionPercent).toBe(0);
  });

  it('records one step and advances to the next incomplete step', () => {
    const completion = applyOnboardingStep({}, 'shopName', NOW);
    expect(completion).toEqual({ shopName: NOW });

    const checklist = buildTenantOnboardingChecklist(
      TENANT_A_FIXTURE,
      { onboardingChecklist: completion },
      NOW,
    );
    expect(checklist.completedCount).toBe(1);
    expect(checklist.nextIncompleteStep).toBe('industry');
  });

  it('keeps the first completion timestamp on a repeated step', () => {
    const first = applyOnboardingStep({}, 'industry', NOW);
    const repeat = applyOnboardingStep(
      { onboardingChecklist: first },
      'industry',
      LATER,
    );
    expect(repeat.industry).toBe(NOW);
  });

  it('completes the checklist after every approved step', () => {
    let completion = {};
    for (const step of [
      'shopName',
      'industry',
      'plan',
      'paymentMode',
      'tables',
      'menu',
    ] as const) {
      completion = applyOnboardingStep(
        { onboardingChecklist: completion },
        step,
        NOW,
      );
    }
    const checklist = buildTenantOnboardingChecklist(
      TENANT_A_FIXTURE,
      { onboardingChecklist: completion },
      NOW,
    );
    expect(checklist.isComplete).toBe(true);
    expect(checklist.nextIncompleteStep).toBeNull();
    expect(checklist.completionPercent).toBe(100);
  });

  it('treats a malformed stored map as empty', () => {
    expect(readOnboardingCompletion({ onboardingChecklist: 'nope' })).toEqual({});
    expect(readOnboardingCompletion(undefined)).toEqual({});
  });
});

describe('Tenant onboarding authorization and boundaries', () => {
  it('allows only an active Owner membership', () => {
    expect(() =>
      assertOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
    for (const member of [
      { membershipType: 'staff', roles: ['owner'], isActive: true },
      { membershipType: 'owner', isActive: false },
      undefined,
    ]) {
      const error = captureHttpsError(() => assertOwnerMember(member));
      expect(error.code).toBe('permission-denied');
    }
    expect(TENANT_ONBOARDING_DENIED_MESSAGE).toContain('chủ');
  });

  it('rejects malformed onboarding payloads', () => {
    for (const data of [{}, { tenantId: 42 }, { tenantId: 't', extra: true }]) {
      const error = captureHttpsError(() => parseOnboardingStateInput(data));
      expect(error.code).toBe('invalid-argument');
      expect(error.message).toBe(TENANT_ONBOARDING_INVALID_MESSAGE);
    }
    expect(parseOnboardingStateInput({ tenantId: 't' })).toEqual({
      tenantId: 't',
    });

    for (const data of [
      { tenantId: 't' },
      { tenantId: 't', step: 'loyalty' },
      { tenantId: 't', step: 'shopName', extra: true },
    ]) {
      const error = captureHttpsError(() => parseOnboardingUpdateInput(data));
      expect(error.code).toBe('invalid-argument');
    }
    expect(
      parseOnboardingUpdateInput({ tenantId: 't', step: 'menu' }),
    ).toEqual({ tenantId: 't', step: 'menu' });
  });
});

describe('Customer-phone permission matrix (NFR-PRIV-001)', () => {
  const baseMembership = {
    isActive: true,
    membershipType: 'owner' as const,
    roles: ['owner'],
    permissions: [] as string[],
    sessionVersion: 1,
  };

  function decide(
    overrides: Partial<Parameters<typeof decideCustomerPhoneAccess>[0]>,
  ) {
    return decideCustomerPhoneAccess({
      uid: 'uid-1',
      tenantId: TENANT_A_FIXTURE,
      membership: baseMembership,
      isAdmin: false,
      decidedAt: NOW,
      ...overrides,
    });
  }

  it('lets only a role with the configured permission see the phone', () => {
    const allowed = decide({
      membership: {
        ...baseMembership,
        permissions: [CUSTOMER_PHONE_PERMISSION],
      },
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.reason).toBe('allowed');
    expect(allowed.permission).toBe(CUSTOMER_PHONE_PERMISSION);

    const denied = decide({});
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('missing_permission');
  });

  it('denies a missing, inactive, or role-less membership', () => {
    expect(decide({ membership: undefined }).reason).toBe('no_membership');
    expect(
      decide({ membership: { ...baseMembership, isActive: false } }).reason,
    ).toBe('inactive_membership');
    expect(
      decide({ membership: { ...baseMembership, roles: [] } }).reason,
    ).toBe('missing_permission');
  });

  it('lets ADMIN bypass but always audits the decision', () => {
    const decision = decide({ isAdmin: true, membership: undefined });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('admin_bypass');
    expect(decision.isAdminBypass).toBe(true);
    expect(decision.isAudited).toBe(true);
  });

  it('keeps or omits the phone field per the decision', () => {
    const source = {
      memberId: 'member-1',
      displayName: 'Khách',
      phone: '+84900000000',
    };
    const allowed = decide({
      membership: { ...baseMembership, permissions: [CUSTOMER_PHONE_PERMISSION] },
    });
    expect(projectCustomerPhone(allowed, source)).toEqual({
      memberId: 'member-1',
      displayName: 'Khách',
      phone: '+84900000000',
      phoneVisible: true,
    });

    const denied = decide({});
    expect(projectCustomerPhone(denied, source)).toEqual({
      memberId: 'member-1',
      displayName: 'Khách',
      phone: null,
      phoneVisible: false,
    });
  });

  it('parses the bounded query and rejects unknown fields', () => {
    expect(parseCustomerPhoneQueryInput({ tenantId: 'tenant-a' })).toEqual({
      tenantId: 'tenant-a',
    });
    expect(resolveCustomerPhoneQueryLimit({ tenantId: 'tenant-a' })).toBe(
      CUSTOMER_PHONE_QUERY_LIMIT,
    );
    for (const data of [{}, { tenantId: 42 }, { tenantId: 'a', extra: true }]) {
      const error = captureHttpsError(() =>
        parseCustomerPhoneQueryInput(data),
      );
      expect(error.code).toBe('invalid-argument');
      expect(error.message).toBe(TENANT_CUSTOMER_PHONE_INVALID_MESSAGE);
    }
  });
});

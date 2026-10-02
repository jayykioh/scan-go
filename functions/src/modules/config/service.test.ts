import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  assertActiveMember,
  assertActiveOwnerMember,
  assertAllowedTenantOverrideKeys,
  computeNextConfigVersion,
  layersFromSnapshots,
  mergeOverrideMaps,
  parsePlatformOverrideInput,
  parseTenantOverrideInput,
  resolveAllowedKeys,
  resolvePlatformConfig,
  resolveTenantConfig,
  toTenantVisibleResolvedConfig,
} from './service.js';
import { requirePlatformAdmin } from '../admin/index.js';
import {
  assertAppCheck,
  isAppCheckEnforced,
} from '../../shared/appCheck.js';
import {
  buildAuditEventData,
  PLATFORM_AUDIT_TENANT_ID,
} from '../../shared/audit.js';
import { auditEventSchema } from '../../../../shared/contracts/audit.contract.js';
import {
  updatePlatformConfigResultSchema,
  updateTenantConfigResultSchema,
} from '../../../../shared/contracts/config.contract.js';

describe('parseTenantOverrideInput', () => {
  it('accepts the allowed tenant keys', () => {
    expect(
      parseTenantOverrideInput({
        locale: 'en',
        timezone: 'Asia/Tokyo',
        pinPolicy: { length: 4 },
      }),
    ).toEqual({
      locale: 'en',
      timezone: 'Asia/Tokyo',
      pinPolicy: { length: 4 },
    });
  });

  it('denies a forbidden tenant override key', () => {
    expect(() => parseTenantOverrideInput({ currency: 'USD' })).toThrow(
      HttpsError,
    );
  });

  it('denies an invalid tenant override value', () => {
    expect(() => parseTenantOverrideInput({ locale: 'fr' })).toThrow(
      HttpsError,
    );
  });

  it('denies an unknown nested pinPolicy key', () => {
    expect(() =>
      parseTenantOverrideInput({ pinPolicy: { length: 6, foo: 1 } }),
    ).toThrow(HttpsError);
  });
});

describe('mergeOverrideMaps', () => {
  it('merges nested pinPolicy fields', () => {
    expect(
      mergeOverrideMaps(
        { pinPolicy: { length: 6, lockMinutes: 15 } },
        { pinPolicy: { length: 4 } },
      ),
    ).toEqual({ pinPolicy: { length: 4, lockMinutes: 15 } });
  });
});

describe('resolveTenantConfig', () => {
  it('denies a forbidden stored tenant override', () => {
    expect(() =>
      resolveTenantConfig({
        admin: null,
        tenant: { currency: 'USD' },
        allowedTenantOverrideKeys: null,
      }),
    ).toThrow(HttpsError);
  });

  it('resolves stored layers with tenant source', () => {
    const resolved = resolveTenantConfig({
      admin: { timezone: 'Asia/Bangkok' },
      tenant: { timezone: 'Asia/Tokyo' },
      allowedTenantOverrideKeys: ['locale', 'timezone'],
    });
    expect(resolved.values.timezone).toBe('Asia/Tokyo');
    expect(resolved.sources.timezone).toBe('tenant');
  });
});

describe('parsePlatformOverrideInput', () => {
  it('accepts product defaults', () => {
    expect(
      parsePlatformOverrideInput({
        timezone: 'Asia/Bangkok',
        retention: { years: 7 },
      }),
    ).toEqual({
      timezone: 'Asia/Bangkok',
      retention: { years: 7 },
    });
  });

  it('denies fixed fields, the tenant allow-list, and unknown keys', () => {
    expect(() => parsePlatformOverrideInput({ schemaVersion: 2 })).toThrow(
      HttpsError,
    );
    expect(() => parsePlatformOverrideInput({ currency: 'USD' })).toThrow(
      HttpsError,
    );
    expect(() =>
      parsePlatformOverrideInput({ allowedTenantOverrideKeys: ['locale'] }),
    ).toThrow(HttpsError);
    expect(() => parsePlatformOverrideInput({ feature: true })).toThrow(
      HttpsError,
    );
  });
});

describe('assertActiveOwnerMember', () => {
  it('allows an active Owner', () => {
    expect(() =>
      assertActiveOwnerMember({ isActive: true, membershipType: 'owner' }),
    ).not.toThrow();
  });

  it('denies a Staff member', () => {
    expect(() =>
      assertActiveOwnerMember({ isActive: true, membershipType: 'staff' }),
    ).toThrow(HttpsError);
  });

  it('denies an inactive Owner', () => {
    expect(() =>
      assertActiveOwnerMember({ isActive: false, membershipType: 'owner' }),
    ).toThrow(HttpsError);
  });

  it('denies a cross-tenant or missing membership', () => {
    expect(() => assertActiveOwnerMember(undefined)).toThrow(HttpsError);
  });
});

describe('assertActiveMember', () => {
  it('allows an active member of any type', () => {
    expect(() =>
      assertActiveMember({ isActive: true, membershipType: 'staff' }),
    ).not.toThrow();
  });

  it('denies an inactive member', () => {
    expect(() => assertActiveMember({ isActive: false })).toThrow(HttpsError);
  });
});

describe('requirePlatformAdmin', () => {
  it('allows a verified ADMIN claim', () => {
    expect(() => requirePlatformAdmin({ admin: true })).not.toThrow();
  });

  it('denies a non-ADMIN and a missing token', () => {
    expect(() => requirePlatformAdmin({ admin: false })).toThrow(HttpsError);
    expect(() => requirePlatformAdmin({})).toThrow(HttpsError);
    expect(() => requirePlatformAdmin(undefined)).toThrow(HttpsError);
  });
});

describe('assertAppCheck', () => {
  const ENV_KEYS = ['FUNCTIONS_EMULATOR', 'ENFORCE_APP_CHECK'] as const;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it('requires App Check when enforcement is on', () => {
    expect(isAppCheckEnforced()).toBe(true);
    expect(() => assertAppCheck({})).toThrow(HttpsError);
    expect(() => assertAppCheck({ app: undefined })).toThrow(HttpsError);
    expect(() => assertAppCheck({ app: { appId: 'app-1' } })).not.toThrow();
  });

  it('skips enforcement when FUNCTIONS_EMULATOR is true', () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    expect(isAppCheckEnforced()).toBe(false);
    expect(() => assertAppCheck({})).not.toThrow();
  });

  it('skips enforcement when ENFORCE_APP_CHECK is false', () => {
    process.env.ENFORCE_APP_CHECK = 'false';
    expect(isAppCheckEnforced()).toBe(false);
    expect(() => assertAppCheck({})).not.toThrow();
  });
});

describe('computeNextConfigVersion', () => {
  it('starts at 1 for a missing version', () => {
    expect(computeNextConfigVersion(undefined)).toBe(1);
    expect(computeNextConfigVersion('3')).toBe(1);
    expect(computeNextConfigVersion(-1)).toBe(1);
  });

  it('increments an existing version', () => {
    expect(computeNextConfigVersion(0)).toBe(1);
    expect(computeNextConfigVersion(4)).toBe(5);
  });
});

describe('assertAllowedTenantOverrideKeys', () => {
  it('allows keys inside the stored allow-list', () => {
    expect(() =>
      assertAllowedTenantOverrideKeys({ locale: 'en' }, ['locale']),
    ).not.toThrow();
  });

  it('denies a forbidden key before any write', () => {
    expect(() =>
      assertAllowedTenantOverrideKeys({ currency: 'USD' }, null),
    ).toThrow(HttpsError);
    expect(() =>
      assertAllowedTenantOverrideKeys({ pinPolicy: { length: 4 } }, ['locale']),
    ).toThrow(HttpsError);
  });

  it('treats an empty stored allow-list as no overrides', () => {
    expect(() =>
      assertAllowedTenantOverrideKeys({ locale: 'en' }, []),
    ).toThrow(HttpsError);
  });

  it('filters unapproved stored keys through resolveAllowedKeys', () => {
    expect(resolveAllowedKeys(['locale', 'currency'])).toEqual(['locale']);
  });
});

describe('layersFromSnapshots', () => {
  it('reads ADMIN values, tenant overrides, and allowed keys', () => {
    const layers = layersFromSnapshots(
      {
        values: { timezone: 'Asia/Bangkok' },
        allowedTenantOverrideKeys: ['locale'],
      },
      { locale: 'en' },
    );
    expect(layers.admin).toEqual({ timezone: 'Asia/Bangkok' });
    expect(layers.tenant).toEqual({ locale: 'en' });
    expect(layers.allowedTenantOverrideKeys).toEqual(['locale']);
  });

  it('returns nulls for an empty platform document', () => {
    expect(layersFromSnapshots(undefined, undefined)).toEqual({
      admin: null,
      tenant: null,
      allowedTenantOverrideKeys: null,
    });
  });
});

describe('resolvePlatformConfig', () => {
  it('resolves ADMIN defaults without a tenant layer', () => {
    const resolved = resolvePlatformConfig({
      admin: { timezone: 'Asia/Bangkok' },
      allowedTenantOverrideKeys: ['locale'],
    });
    expect(resolved.values.timezone).toBe('Asia/Bangkok');
    expect(resolved.sources.timezone).toBe('admin');
    expect(resolved.allowedTenantOverrideKeys).toEqual(['locale']);
  });

  it('rejects an invalid ADMIN value', () => {
    expect(() =>
      resolvePlatformConfig({
        admin: { pinPolicy: { length: 'six' } },
        allowedTenantOverrideKeys: null,
      }),
    ).toThrow(HttpsError);
  });
});

describe('toTenantVisibleResolvedConfig', () => {
  it('strips platform-only leaves and their sources', () => {
    const full = resolveTenantConfig({
      admin: {
        retention: { years: 7 },
        backup: { retentionDays: 45 },
        rateLimit: { publicOrderPerMinute: 60 },
      },
      tenant: { locale: 'en', timezone: 'Asia/Tokyo' },
      allowedTenantOverrideKeys: ['locale', 'timezone'],
    });

    const visible = toTenantVisibleResolvedConfig(full);

    expect(visible.values).toEqual({
      locale: 'en',
      timezone: 'Asia/Tokyo',
      currency: 'VND',
      pinPolicy: full.values.pinPolicy,
      ai: full.values.ai,
    });
    expect('retention' in visible.values).toBe(false);
    expect('backup' in visible.values).toBe(false);
    expect('rateLimit' in visible.values).toBe(false);
    expect(visible.sources['retention.years']).toBeUndefined();
    expect(visible.sources['backup.retentionDays']).toBeUndefined();
    expect(visible.sources['rateLimit.publicOrderPerMinute']).toBeUndefined();
    expect(visible.sources['pinPolicy.length']).toBe('default');
    expect(visible.sources.timezone).toBe('tenant');
    expect(visible.allowedTenantOverrideKeys).toEqual(['locale', 'timezone']);
  });
});

describe('tenant update result', () => {
  it('omits platform-only leaves and parses against the tenant result schema', () => {
    const full = resolveTenantConfig({
      admin: {
        retention: { years: 7 },
        backup: { retentionDays: 45 },
        rateLimit: { publicOrderPerMinute: 60 },
      },
      tenant: { locale: 'en' },
      allowedTenantOverrideKeys: null,
    });

    const result = {
      schemaVersion: full.schemaVersion,
      configVersion: 4,
      resolvedConfig: toTenantVisibleResolvedConfig(full),
    };

    expect(updateTenantConfigResultSchema.safeParse(result).success).toBe(true);
    expect('retention' in result.resolvedConfig.values).toBe(false);
    expect('backup' in result.resolvedConfig.values).toBe(false);
    expect('rateLimit' in result.resolvedConfig.values).toBe(false);
  });
});

describe('callable response validation', () => {
  it('parses a valid tenant update result and rejects a malformed one', () => {
    const full = resolveTenantConfig({
      admin: null,
      tenant: { locale: 'en' },
      allowedTenantOverrideKeys: null,
    });
    const valid = {
      schemaVersion: full.schemaVersion,
      configVersion: 3,
      resolvedConfig: toTenantVisibleResolvedConfig(full),
    };
    expect(updateTenantConfigResultSchema.safeParse(valid).success).toBe(true);

    // A platform-only leaf would break the strict tenant-visible contract.
    const malformed = {
      ...valid,
      resolvedConfig: { ...valid.resolvedConfig, values: { ...valid.resolvedConfig.values, retention: { years: 7 } } },
    };
    expect(updateTenantConfigResultSchema.safeParse(malformed).success).toBe(false);
    expect(() => updateTenantConfigResultSchema.parse(malformed)).toThrow();
  });

  it('parses a valid platform update result and rejects a malformed one', () => {
    const resolvedConfig = resolvePlatformConfig({
      admin: null,
      allowedTenantOverrideKeys: null,
    });
    const valid = {
      schemaVersion: resolvedConfig.schemaVersion,
      configVersion: 1,
      resolvedConfig,
    };
    expect(updatePlatformConfigResultSchema.safeParse(valid).success).toBe(true);

    const malformed = {
      ...valid,
      resolvedConfig: { ...resolvedConfig, values: { ...resolvedConfig.values, currency: 'USD' } },
    };
    expect(updatePlatformConfigResultSchema.safeParse(malformed).success).toBe(
      false,
    );
    expect(() => updatePlatformConfigResultSchema.parse(malformed)).toThrow();
  });
});

describe('ADMIN platform audit event', () => {
  it('builds a ConfigurationChanged event for an ADMIN change', () => {
    const data = buildAuditEventData('audit-config-changed-001', {
      tenantId: PLATFORM_AUDIT_TENANT_ID,
      actorUid: 'uid-admin-001',
      actorType: 'admin',
      role: 'admin',
      action: 'ConfigurationChanged',
      targetType: 'platform_config',
      targetId: 'platform/config',
      detail: { overrides: { timezone: 'Asia/Bangkok' } },
    });

    expect(data).toMatchObject({
      schemaVersion: 1,
      eventId: 'audit-config-changed-001',
      tenantId: PLATFORM_AUDIT_TENANT_ID,
      actorUid: 'uid-admin-001',
      actorType: 'admin',
      role: 'admin',
      action: 'ConfigurationChanged',
      targetType: 'platform_config',
      targetId: 'platform/config',
      metadata: { overrides: { timezone: 'Asia/Bangkok' } },
    });
    expect(typeof data.createdAt).toBe('string');
  });

  it('produces data that parses against auditEventSchema', () => {
    const data = buildAuditEventData('audit-config-001', {
      tenantId: PLATFORM_AUDIT_TENANT_ID,
      actorUid: 'uid-admin-001',
      actorType: 'admin',
      role: 'admin',
      action: 'ConfigurationChanged',
      targetType: 'platform_config',
      targetId: 'platform/config',
      detail: {},
    });

    const parsed = auditEventSchema.safeParse(data);
    expect(parsed.success).toBe(true);
    expect(data.eventId).toBe('audit-config-001');
  });
});

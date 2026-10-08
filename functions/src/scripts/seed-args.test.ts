import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED_DAYS,
  DEFAULT_SEED_TENANT_ID,
  parseSeedArgs,
} from './seed-args.js';

describe('parseSeedArgs', () => {
  it('requires an owner email or uid', () => {
    expect(() => parseSeedArgs([], {})).toThrow(/Cần --owner-email hoặc --owner-uid/);
  });

  it('parses the owner email and keeps the defaults', () => {
    const options = parseSeedArgs(['--owner-email', 'owner@shop.vn'], {});
    expect(options.ownerEmail).toBe('owner@shop.vn');
    expect(options.ownerUid).toBeNull();
    expect(options.tenantId).toBe(DEFAULT_SEED_TENANT_ID);
    expect(options.days).toBe(DEFAULT_SEED_DAYS);
    expect(options.orders).toBe(0);
    expect(options.confirm).toBe(false);
    expect(options.dryRun).toBe(false);
  });

  it('parses owner uid, tenant, shop name, days, confirm, and dry run', () => {
    const options = parseSeedArgs(
      [
        '--owner-uid',
        'uid-1',
        '--tenant-id',
        'custom',
        '--shop-name',
        'Quán Thử',
        '--days',
        '7',
        '--confirm',
        '--dry-run',
      ],
      {},
    );
    expect(options).toMatchObject({
      ownerUid: 'uid-1',
      ownerEmail: null,
      tenantId: 'custom',
      shopName: 'Quán Thử',
      days: 7,
      confirm: true,
      dryRun: true,
    });
  });

  it('prefers FIREBASE_PROJECT_ID over the built-in default', () => {
    const options = parseSeedArgs(['--owner-uid', 'abc'], {
      FIREBASE_PROJECT_ID: 'env-project',
    });
    expect(options.projectId).toBe('env-project');
  });

  it('rejects an unknown flag', () => {
    expect(() => parseSeedArgs(['--wrong'], {})).toThrow(
      /Tham số không hợp lệ/,
    );
  });

  it('rejects a flag with a missing value', () => {
    expect(() => parseSeedArgs(['--owner-email'], {})).toThrow(
      /Thiếu giá trị cho --owner-email/,
    );
  });

  it('parses an orders total', () => {
    const options = parseSeedArgs(
      ['--owner-uid', 'a', '--days', '10', '--orders', '100'],
      {},
    );
    expect(options.orders).toBe(100);
    expect(options.days).toBe(10);
  });

  it('rejects an orders value outside the allowed range', () => {
    expect(() =>
      parseSeedArgs(['--owner-uid', 'a', '--orders', '0'], {}),
    ).toThrow(/--orders/);
    expect(() =>
      parseSeedArgs(['--owner-uid', 'a', '--orders', '999999'], {}),
    ).toThrow(/--orders/);
  });

  it('rejects a days value outside the allowed range', () => {
    expect(() => parseSeedArgs(['--owner-uid', 'a', '--days', '0'], {})).toThrow(
      /--days/,
    );
    expect(() =>
      parseSeedArgs(['--owner-uid', 'a', '--days', '999'], {}),
    ).toThrow(/--days/);
  });
});

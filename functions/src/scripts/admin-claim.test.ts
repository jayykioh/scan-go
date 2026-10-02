import { describe, expect, it } from 'vitest';
import { mergeAdminClaim, parseAdminGrantArgs } from './admin-claim.js';

describe('parseAdminGrantArgs', () => {
  it('uses the default project and requires an email or uid', () => {
    expect(() => parseAdminGrantArgs([], {})).toThrow(/Cần --email hoặc --uid/);
  });

  it('parses email, revoke, and project flags', () => {
    const options = parseAdminGrantArgs(
      ['--email', 'owner@shop.vn', '--project', 'other-project', '--revoke'],
      {},
    );
    expect(options).toEqual({
      email: 'owner@shop.vn',
      uid: undefined,
      revoke: true,
      projectId: 'other-project',
    });
  });

  it('prefers FIREBASE_PROJECT_ID over the built-in default', () => {
    const options = parseAdminGrantArgs(['--uid', 'abc'], {
      FIREBASE_PROJECT_ID: 'env-project',
    });
    expect(options.projectId).toBe('env-project');
  });

  it('rejects an unknown flag', () => {
    expect(() => parseAdminGrantArgs(['--wrong'], {})).toThrow(
      /Tham số không hợp lệ/,
    );
  });

  it('rejects a flag with a missing value', () => {
    expect(() => parseAdminGrantArgs(['--email'], {})).toThrow(
      /Thiếu giá trị cho --email/,
    );
  });
});

describe('mergeAdminClaim', () => {
  it('adds the admin claim and keeps existing claims', () => {
    expect(mergeAdminClaim({ role: 'owner' }, true)).toEqual({
      role: 'owner',
      admin: true,
    });
  });

  it('removes the admin claim on revoke and keeps the rest', () => {
    expect(mergeAdminClaim({ admin: true, role: 'owner' }, false)).toEqual({
      role: 'owner',
    });
  });

  it('handles undefined existing claims', () => {
    expect(mergeAdminClaim(undefined, false)).toEqual({});
  });
});

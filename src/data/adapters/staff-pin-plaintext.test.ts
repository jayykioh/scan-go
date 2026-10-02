import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toPersistedStaffAccounts } from './auth.adapter';
import type { StaffAccount } from '../../types';

/**
 * P0-004 plaintext-PIN scan evidence (REQ-AUTH-002, NFR-PRIV-001).
 *
 * The scan proves two invariants:
 * 1. The persisted Staff account payload never contains a plaintext PIN.
 * 2. The client Staff flow files contain no PIN literal default and no client
 *    PIN comparison against persisted account data.
 */
function readSource(relativePath: string): string {
  const url = new URL(relativePath, import.meta.url);
  return readFileSync(fileURLToPath(url), 'utf8');
}

const STAFF_FLOW_FILES = [
  '../../components/StaffView.tsx',
  '../../layouts/SimulatorLayout.tsx',
  'auth.adapter.ts',
] as const;

describe('persisted Staff accounts contain no plaintext PIN', () => {
  const accountsWithPins: StaffAccount[] = [
    {
      id: 'staff_cashier_1',
      name: 'Nguyễn Văn A',
      pin: '1111',
      roles: { isKitchen: false, isWaiter: false, isCashier: true },
      isActive: true,
    },
    {
      id: 'staff_kitchen_1',
      name: 'Trần Thị B',
      pin: '2222',
      roles: { isKitchen: true, isWaiter: false, isCashier: false },
      isActive: true,
    },
  ];

  it('strips the pin field and never serializes a plaintext value', () => {
    const persisted = toPersistedStaffAccounts(accountsWithPins);
    expect(persisted).toHaveLength(2);
    expect(persisted.every((account) => !('pin' in account))).toBe(true);

    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain('1111');
    expect(serialized).not.toContain('2222');
    expect(serialized).not.toContain('"pin"');
  });
});

describe('client Staff flow scan', () => {
  it('has no default PIN literal or client-side PIN equality check', () => {
    for (const relativePath of STAFF_FLOW_FILES) {
      const source = readSource(relativePath);
      // No hard-coded PIN secret, including the legacy '0000' default.
      expect(source).not.toMatch(/pin\s*[:=]\s*'[\d]{3,10}'/);
      expect(source).not.toMatch(/pin\s*[:=]\s*"[\d]{3,10}"/);
      // No client-side comparison of a PIN value against account data.
      expect(source).not.toMatch(/\.pin\s*(===|==|!==|!=)/);
      expect(source).not.toMatch(/[a-zA-Z_]+\.pin\s*===/);
    }
  });
});

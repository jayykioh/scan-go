import { describe, expect, it } from 'vitest';
import {
  buildPublicNfcLinkDocument,
  generateTableToken,
  parseNfcProvisionInput,
  toNfcSession,
} from './service.js';
import { NFC_CONTRACT_VERSION } from '../../../../shared/contracts/nfc.contract.js';

describe('NFC token provisioning', () => {
  it('generates an opaque URL-safe token without tenant or table ids', () => {
    const token = generateTableToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateTableToken()).not.toBe(token);
  });

  it('builds a minimal public NFC link and maps it back to a session', () => {
    const document = buildPublicNfcLinkDocument({
      tenantId: 'tenant-a',
      tableId: 'table-1',
      tableName: 'Bàn 1',
      tokenVersion: 1,
      now: '2026-09-12T05:00:00.000Z',
    });
    const session = toNfcSession('tok_nfc_1', document);
    expect(session.schemaVersion).toBe(NFC_CONTRACT_VERSION);
    expect(session.isActive).toBe(true);
    expect(session.tableName).toBe('Bàn 1');
    expect(session.revokedAt).toBeNull();
  });

  it('rejects a malformed provision payload', () => {
    expect(() => parseNfcProvisionInput({ tenantId: 'tenant-a' })).toThrow();
    expect(() =>
      parseNfcProvisionInput({ tenantId: 'tenant-a', tableId: 'table-1' }),
    ).not.toThrow();
  });
});

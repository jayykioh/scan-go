import { NFC_CONTRACT_VERSION, type NfcSession } from '../contracts/nfc.contract.js';
import { activeTableLinkContextFixture, TABLE_ID_FIXTURE } from './table.fixture.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const NFC_TOKEN_FIXTURE = 'nfc_tok_9f3a7c';

export const nfcSessionFixture: NfcSession = {
  schemaVersion: NFC_CONTRACT_VERSION,
  nfcToken: NFC_TOKEN_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  tableId: TABLE_ID_FIXTURE,
  tableName: activeTableLinkContextFixture.tableName,
  tokenVersion: activeTableLinkContextFixture.tokenVersion,
  isActive: true,
  createdAt: '2026-09-12T06:00:00.000Z',
  revokedAt: null,
};

export const revokedNfcSessionFixture: NfcSession = {
  ...nfcSessionFixture,
  nfcToken: 'nfc_tok_old_0001',
  isActive: false,
  revokedAt: '2026-09-12T07:00:00.000Z',
};

import {
  TABLE_CONTRACT_VERSION,
  type TableLinkContext,
  type TableTokenRotation,
} from '../contracts/table.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const TABLE_ID_FIXTURE = 'table-05';
export const NEW_TABLE_TOKEN_FIXTURE = 'tok_new_9f3a';
export const OLD_TABLE_TOKEN_FIXTURE = 'tok_old_1b7c';

export const activeTableLinkContextFixture: TableLinkContext = {
  schemaVersion: TABLE_CONTRACT_VERSION,
  token: NEW_TABLE_TOKEN_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  tableId: TABLE_ID_FIXTURE,
  tableName: 'Bàn 5',
  tokenVersion: 2,
  status: 'active',
  isActive: true,
  createdAt: '2026-09-12T06:00:00.000Z',
  revokedAt: null,
};

export const revokedTableLinkContextFixture: TableLinkContext = {
  schemaVersion: TABLE_CONTRACT_VERSION,
  token: OLD_TABLE_TOKEN_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  tableId: TABLE_ID_FIXTURE,
  tableName: 'Bàn 5',
  tokenVersion: 1,
  status: 'revoked',
  isActive: false,
  createdAt: '2026-09-01T02:00:00.000Z',
  revokedAt: '2026-09-12T06:00:00.000Z',
};

export const expiredTableLinkContextFixture: TableLinkContext = {
  schemaVersion: TABLE_CONTRACT_VERSION,
  token: 'tok_expired_0001',
  tenantId: TENANT_A_FIXTURE,
  tableId: TABLE_ID_FIXTURE,
  tableName: 'Bàn 5',
  tokenVersion: 1,
  status: 'expired',
  isActive: false,
  createdAt: '2026-08-01T02:00:00.000Z',
  revokedAt: '2026-09-01T02:00:00.000Z',
};

export const unknownTableLinkContextFixture: TableLinkContext = {
  schemaVersion: TABLE_CONTRACT_VERSION,
  token: 'tok_unknown_zzzz',
  tenantId: TENANT_A_FIXTURE,
  tableId: TABLE_ID_FIXTURE,
  tableName: 'Bàn 5',
  tokenVersion: 1,
  status: 'unknown',
  isActive: false,
  createdAt: '2026-09-12T06:00:00.000Z',
  revokedAt: null,
};

export const rotatedTableTokenFixture: TableTokenRotation = {
  schemaVersion: TABLE_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  tableId: TABLE_ID_FIXTURE,
  tableName: 'Bàn 5',
  previousToken: OLD_TABLE_TOKEN_FIXTURE,
  previousTokenVersion: 1,
  newToken: NEW_TABLE_TOKEN_FIXTURE,
  newTokenVersion: 2,
  rotatedAt: '2026-09-12T06:00:00.000Z',
};

export const firstTableTokenFixture: TableTokenRotation = {
  schemaVersion: TABLE_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  tableId: TABLE_ID_FIXTURE,
  tableName: 'Bàn 5',
  previousToken: null,
  previousTokenVersion: null,
  newToken: OLD_TABLE_TOKEN_FIXTURE,
  newTokenVersion: 1,
  rotatedAt: '2026-09-01T02:00:00.000Z',
};

import { describe, expect, it } from 'vitest';
import { buildQrPayload, mapStoredTable } from './table.adapter';
import {
  NEW_TABLE_TOKEN_FIXTURE,
  TABLE_ID_FIXTURE,
} from '@shared/fixtures/table.fixture';

describe('mapStoredTable', () => {
  it('maps a stored table document', () => {
    const table = mapStoredTable(TABLE_ID_FIXTURE, {
      name: 'Bàn 5',
      isActive: true,
      tokenVersion: 2,
      activeToken: NEW_TABLE_TOKEN_FIXTURE,
      qrPayload: `/menu/${NEW_TABLE_TOKEN_FIXTURE}`,
      nfcWritten: false,
      archivedAt: null,
      createdAt: '2026-09-12T06:00:00.000Z',
      updatedAt: '2026-09-12T06:00:00.000Z',
    });
    expect(table.tableId).toBe(TABLE_ID_FIXTURE);
    expect(table.activeToken).toBe(NEW_TABLE_TOKEN_FIXTURE);
    expect(table.isActive).toBe(true);
  });

  it('treats an archived table as inactive', () => {
    const table = mapStoredTable(TABLE_ID_FIXTURE, {
      name: 'Bàn 5',
      isActive: true,
      archivedAt: '2026-09-12T06:00:00.000Z',
    });
    expect(table.isActive).toBe(false);
  });
});

describe('buildQrPayload', () => {
  it('uses the opaque token as the only path segment', () => {
    expect(buildQrPayload('https://scango.app/', NEW_TABLE_TOKEN_FIXTURE)).toBe(
      `https://scango.app/menu/${NEW_TABLE_TOKEN_FIXTURE}`,
    );
  });
});

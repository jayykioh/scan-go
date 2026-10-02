import { describe, expect, it } from 'vitest';
import {
  tableLinkContextSchema,
  tableTokenRotationSchema,
} from './table.contract.js';
import {
  activeTableLinkContextFixture,
  expiredTableLinkContextFixture,
  firstTableTokenFixture,
  revokedTableLinkContextFixture,
  rotatedTableTokenFixture,
  unknownTableLinkContextFixture,
} from '../fixtures/table.fixture.js';

describe('TableLinkContext contract', () => {
  it('accepts the active, revoked, expired, and unknown token fixtures', () => {
    for (const fixture of [
      activeTableLinkContextFixture,
      revokedTableLinkContextFixture,
      expiredTableLinkContextFixture,
      unknownTableLinkContextFixture,
    ]) {
      expect(tableLinkContextSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('rejects a revoked token that reports itself active', () => {
    expect(
      tableLinkContextSchema.safeParse({
        ...revokedTableLinkContextFixture,
        isActive: true,
      }).success,
    ).toBe(false);
  });
});

describe('TableTokenRotation contract', () => {
  it('accepts the first and rotated token fixtures', () => {
    expect(tableTokenRotationSchema.safeParse(firstTableTokenFixture).success).toBe(
      true,
    );
    expect(
      tableTokenRotationSchema.safeParse(rotatedTableTokenFixture).success,
    ).toBe(true);
  });

  it('rejects a version that does not follow the previous version', () => {
    expect(
      tableTokenRotationSchema.safeParse({
        ...rotatedTableTokenFixture,
        newTokenVersion: 5,
      }).success,
    ).toBe(false);
  });
});

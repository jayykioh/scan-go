/**
 * Seed product-feedback script tests.
 *
 * The pure parts are tested here: argument parsing, the deterministic document
 * id, and the record builder. The builder runs the fixture through the frozen
 * contract, so a fixture that drifts from the contract fails in CI instead of
 * at seed time.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSeedFeedbackRecord,
  parseSeedFeedbackArgs,
  seedFeedbackId,
} from './seed-feedback.js';
import { SEED_PRODUCT_FEEDBACK } from './seed-feedback-data.js';
import { PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH } from '../../../shared/contracts/product-feedback.contract.js';

const NOW = new Date('2026-10-08T10:00:00.000Z');

describe('parseSeedFeedbackArgs', () => {
  it('requires a tenant or an owner identity', () => {
    expect(() => parseSeedFeedbackArgs([])).toThrow(/--tenant-id/);
  });

  it('defaults to the production project and refuses to confirm implicitly', () => {
    const args = parseSeedFeedbackArgs(['--tenant-id', 'tenant-a']);
    expect(args.projectId).toBe('scango-8f0e9');
    expect(args.confirm).toBe(false);
    expect(args.dryRun).toBe(false);
    expect(args.withImages).toBe(false);
  });

  it('reads every flag', () => {
    const args = parseSeedFeedbackArgs([
      '--tenant-id',
      'tenant-a',
      '--project',
      'demo-x',
      '--bucket',
      'demo-x.firebasestorage.app',
      '--with-images',
      '--confirm',
    ]);
    expect(args).toMatchObject({
      tenantId: 'tenant-a',
      projectId: 'demo-x',
      bucketName: 'demo-x.firebasestorage.app',
      withImages: true,
      confirm: true,
    });
  });

  it('rejects a flag without a value and an unknown flag', () => {
    expect(() => parseSeedFeedbackArgs(['--tenant-id'])).toThrow(/Thiếu giá trị/);
    expect(() =>
      parseSeedFeedbackArgs(['--tenant-id', 'tenant-a', '--nope']),
    ).toThrow(/không hợp lệ/);
  });
});

describe('seedFeedbackId', () => {
  it('is deterministic and seed-prefixed so a re-run cannot duplicate', () => {
    expect(seedFeedbackId('no-404-page')).toBe('seed-no-404-page');
    expect(seedFeedbackId('no-404-page')).toBe(seedFeedbackId('no-404-page'));
  });
});

describe('SEED_PRODUCT_FEEDBACK fixtures', () => {
  it('has unique ids and a message long enough for the contract', () => {
    const ids = SEED_PRODUCT_FEEDBACK.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fixture of SEED_PRODUCT_FEEDBACK) {
      expect(fixture.message.length).toBeGreaterThanOrEqual(
        PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH,
      );
    }
  });

  it('carries no personal data: the seed is not customer data', () => {
    const phonePattern = /(\+?84|0)\d{9,10}/;
    for (const fixture of SEED_PRODUCT_FEEDBACK) {
      expect(phonePattern.test(fixture.message)).toBe(false);
      expect(fixture.message).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    }
  });

  it('ships at least one screenshot fixture for the image path', () => {
    expect(SEED_PRODUCT_FEEDBACK.some((fixture) => fixture.screenshot)).toBe(
      true,
    );
  });
});

describe('buildSeedFeedbackRecord', () => {
  it('builds a contract-valid record and back-dates it', () => {
    const fixture = SEED_PRODUCT_FEEDBACK[0];
    const record = buildSeedFeedbackRecord({
      fixture,
      tenantId: 'tenant-a',
      actorUid: 'owner-uid',
      attachments: [],
      now: NOW,
    });

    expect(record.feedbackId).toBe(seedFeedbackId(fixture.id));
    expect(record.tenantId).toBe('tenant-a');
    expect(record.status).toBe('received');
    expect(record.actorRole).toBe(fixture.actorRole);
    expect(record.screenContext).toBe(fixture.screenContext);
    expect(Array.isArray(record.history)).toBe(true);
    expect((record.history as unknown[]).length).toBe(1);
    expect(record.createdAt).toBe(NOW.toISOString());
  });

  it('back-dates a fixture by its daysAgo', () => {
    const fixture = { ...SEED_PRODUCT_FEEDBACK[0], daysAgo: 3 };
    const record = buildSeedFeedbackRecord({
      fixture,
      tenantId: 'tenant-a',
      actorUid: 'owner-uid',
      attachments: [],
      now: NOW,
    });
    expect(record.createdAt).toBe('2026-10-05T10:00:00.000Z');
    expect(record.updatedAt).toBe(record.createdAt);
  });
});

/**
 * Scheduled batch helper tests (NFR-OBS-001, REQ-RPT-002, REQ-AI-002).
 *
 * The helper exists because a scheduled function that resolves is reported to
 * Cloud Scheduler as a success. These tests pin the two properties that keep a
 * nightly job honest: one failing tenant never blocks the others, and a run
 * with any failure is reported as failed so it is retried and searchable.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ScheduledBatchError,
  runPerTenant,
} from './scheduled.js';

describe('runPerTenant', () => {
  it('runs every tenant and resolves when none fail', async () => {
    const seen: string[] = [];
    const outcome = await runPerTenant('job', ['a', 'b', 'c'], async (id) => {
      seen.push(id);
    });

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(outcome.processed).toBe(3);
    expect(outcome.failures).toEqual([]);
  });

  it('keeps going after a failure and reports the run as failed', async () => {
    const seen: string[] = [];
    const run = vi.fn(async (id: string) => {
      seen.push(id);
      if (id === 'b') {
        throw new Error('tenant b exploded');
      }
    });

    const error = await runPerTenant('nightlyRebuild', ['a', 'b', 'c'], run).catch(
      (caught: unknown) => caught,
    );

    // The later tenant still ran: one bad tenant must not block the rest.
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(error).toBeInstanceOf(ScheduledBatchError);

    const outcome = (error as ScheduledBatchError).outcome;
    expect(outcome.jobName).toBe('nightlyRebuild');
    expect(outcome.processed).toBe(2);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]?.tenantId).toBe('b');
    expect((outcome.failures[0]?.error as Error).message).toBe(
      'tenant b exploded',
    );
  });

  it('resolves for an empty tenant list so a fresh deployment stays quiet', async () => {
    const outcome = await runPerTenant('job', [], async () => undefined);
    expect(outcome.processed).toBe(0);
    expect(outcome.failures).toEqual([]);
  });

  it('names the failing count in the thrown message', async () => {
    const error = (await runPerTenant('weekly', ['a', 'b'], async () => {
      throw new Error('nope');
    }).catch((caught: unknown) => caught)) as ScheduledBatchError;

    expect(error.message).toBe('weekly: 2 of 2 tenants failed');
  });
});

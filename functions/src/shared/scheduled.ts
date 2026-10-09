import { logger } from 'firebase-functions/v2';
import { captureFunctionError } from './monitoring.js';

export interface ScheduledTenantFailure {
  readonly tenantId: string;
  readonly error: unknown;
}

export interface ScheduledBatchOutcome {
  readonly jobName: string;
  readonly processed: number;
  readonly failures: readonly ScheduledTenantFailure[];
}

/** The error thrown when at least one tenant failed during a scheduled batch. */
export class ScheduledBatchError extends Error {
  constructor(readonly outcome: ScheduledBatchOutcome) {
    super(
      `${outcome.jobName}: ${outcome.failures.length} of ` +
        `${outcome.processed + outcome.failures.length} tenants failed`,
    );
    this.name = 'ScheduledBatchError';
  }
}

/**
 * Run one idempotent unit of scheduled work per tenant, then fail the run when
 * any tenant failed.
 *
 * A scheduled function that resolves is reported to Cloud Scheduler as a
 * success, so a swallowed error means no retry, no alert, and a silently stale
 * projection. Catching per tenant keeps one bad tenant from blocking the rest,
 * while raising at the end keeps the failure visible (NFR-OBS-001). Every unit
 * of work used with this helper must be idempotent, because a failed run is
 * retried.
 */
export async function runPerTenant(
  jobName: string,
  tenantIds: readonly string[],
  run: (tenantId: string) => Promise<unknown>,
): Promise<ScheduledBatchOutcome> {
  let processed = 0;
  const failures: ScheduledTenantFailure[] = [];

  for (const tenantId of tenantIds) {
    try {
      await run(tenantId);
      processed += 1;
    } catch (error) {
      failures.push({ tenantId, error });
      logger.error(`${jobName}: tenant failed`, {
        jobName,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      captureFunctionError(error, { jobName, tenantId });
    }
  }

  const outcome: ScheduledBatchOutcome = { jobName, processed, failures };
  if (failures.length > 0) {
    throw new ScheduledBatchError(outcome);
  }
  return outcome;
}

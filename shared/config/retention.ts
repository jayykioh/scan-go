import { CONFIG_DEFAULTS } from './defaults.js';

/**
 * Product default retention window in years. Policy comes from Config; this is
 * the approved default when no ADMIN override is stored
 * (NFR-RET-001, NFR-CFG-001).
 */
export const RETENTION_DEFAULT_YEARS = CONFIG_DEFAULTS.retention.years;

/** Resolve a positive integer retention window, or the approved default. */
export function resolveRetentionYears(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : RETENTION_DEFAULT_YEARS;
}

/**
 * Compute the server UTC cutoff instant `years` before `nowIso`. A record is
 * eligible for retention when its server createdAt is strictly before the
 * cutoff.
 */
export function computeRetentionCutoff(nowIso: string, years: number): string {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) {
    throw new Error('invalid retention clock');
  }
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff.toISOString();
}

/** True when a server timestamp is strictly older than the cutoff. */
export function isRetentionEligible(
  createdAt: string,
  cutoffAt: string,
): boolean {
  const created = new Date(createdAt).getTime();
  const cutoff = new Date(cutoffAt).getTime();
  return (
    !Number.isNaN(created) && !Number.isNaN(cutoff) && created < cutoff
  );
}

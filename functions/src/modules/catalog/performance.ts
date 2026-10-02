/**
 * Customer menu performance evidence helpers (NFR-PERF-001).
 *
 * The measurement harness runs 100 production-like menu loads and reports the
 * p95. A representative 4G profile adds a documented transfer allowance to
 * each measured load, because the emulator does not model the radio network.
 */

export const MENU_PERF_CONTRACT_VERSION = 1;

/** SRS budget: p95 is at most two seconds (NFR-PERF-001). */
export const MENU_P95_BUDGET_MS = 2000;

/** SRS acceptance: 100 production-like menu loads (NFR-PERF-001). */
export const MENU_LOAD_SAMPLE_COUNT = 100;

/** One bounded public-menu read, matching the client listener bound. */
export const PUBLIC_MENU_LOAD_LIMIT = 100;

/** Production-like public menu payload used by the 4G model. */
export const MENU_PAYLOAD_BYTES_BUDGET = 350 * 1024;

export interface NetworkProfile {
  id: string;
  label: string;
  /** One-way radio + server round-trip allowance in milliseconds. */
  addedLatencyMs: number;
  /** Sustained downlink throughput in kilobits per second. */
  throughputKbps: number;
}

/**
 * Representative 4G profile. The values are documented thresholds, not device
 * measurements: 8 Mbps downlink and a 60 ms round trip.
 */
export const REPRESENTATIVE_4G_PROFILE: NetworkProfile = {
  id: 'representative-4g',
  label: 'Representative 4G (8 Mbps, 60 ms RTT)',
  addedLatencyMs: 60,
  throughputKbps: 8000,
};

export interface MenuLoadReport {
  schemaVersion: number;
  profileId: string;
  profileLabel: string;
  sampleCount: number;
  measuredP50Ms: number;
  measuredP95Ms: number;
  effectiveP50Ms: number;
  effectiveP95Ms: number;
  maxEffectiveMs: number;
  budgetMs: number;
  meetsBudget: boolean;
}

/** Nearest-rank percentile. The input order does not matter. */
export function percentile(
  samples: readonly number[],
  fraction: number,
): number {
  if (samples.length === 0) {
    throw new Error('percentile requires at least one sample');
  }
  if (!(fraction > 0 && fraction <= 1)) {
    throw new Error('percentile fraction must be within (0, 1]');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

/**
 * Add the documented network allowance to one measured emulator load. The
 * transfer time uses the fixed production-like payload budget.
 */
export function applyNetworkProfile(
  measuredMs: number,
  profile: NetworkProfile = REPRESENTATIVE_4G_PROFILE,
  payloadBytes: number = MENU_PAYLOAD_BYTES_BUDGET,
): number {
  const transferMs = (payloadBytes * 8) / profile.throughputKbps;
  return measuredMs + profile.addedLatencyMs + transferMs;
}

/**
 * Summarize measured emulator latencies into the SRS p95 report. The measured
 * samples stay separate from the effective samples so a reader can inspect
 * both the raw harness cost and the modeled 4G result (NFR-PERF-001).
 */
export function summarizeMenuLoads(
  measuredSamples: readonly number[],
  profile: NetworkProfile = REPRESENTATIVE_4G_PROFILE,
): MenuLoadReport {
  if (measuredSamples.length !== MENU_LOAD_SAMPLE_COUNT) {
    throw new Error(
      `summarizeMenuLoads requires exactly ${MENU_LOAD_SAMPLE_COUNT} samples`,
    );
  }
  const effective = measuredSamples.map((sample) =>
    applyNetworkProfile(sample, profile),
  );
  const effectiveP95Ms = percentile(effective, 0.95);
  return {
    schemaVersion: MENU_PERF_CONTRACT_VERSION,
    profileId: profile.id,
    profileLabel: profile.label,
    sampleCount: measuredSamples.length,
    measuredP50Ms: percentile(measuredSamples, 0.5),
    measuredP95Ms: percentile(measuredSamples, 0.95),
    effectiveP50Ms: percentile(effective, 0.5),
    effectiveP95Ms,
    maxEffectiveMs: Math.max(...effective),
    budgetMs: MENU_P95_BUDGET_MS,
    meetsBudget: effectiveP95Ms <= MENU_P95_BUDGET_MS,
  };
}

export function meetsMenuP95Budget(report: MenuLoadReport): boolean {
  return report.effectiveP95Ms <= report.budgetMs;
}

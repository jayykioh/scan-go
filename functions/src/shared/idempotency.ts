import { createHash } from 'node:crypto';

/**
 * Deterministic request hash for an idempotency key. The same command with the
 * same tenant, key, and stable payload shape returns the same hash. A reused
 * key with a different payload hash fails (docs/data-model.md §5).
 */
export function stableRequestHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * Canonical JSON stringify with sorted object keys. Arrays keep their given
 * order because cart line order is part of the request identity.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`,
  );
  return `{${entries.join(',')}}`;
}

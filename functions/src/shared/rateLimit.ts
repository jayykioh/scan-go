import { HttpsError } from 'firebase-functions/v2/https';

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000;

/** Per-process sliding window. v1 uses no Redis; public limits stay local. */
const buckets = new Map<string, RateLimitBucket>();

/**
 * Return true when the key is inside its configured per-minute limit. The
 * first call in a window always succeeds.
 */
export function checkRateLimit(
  key: string,
  limitPerMinute: number,
  now: number = Date.now(),
): boolean {
  if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
    return false;
  }
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= limitPerMinute) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function assertRateLimit(
  key: string,
  limitPerMinute: number,
  now: number = Date.now(),
): void {
  if (!checkRateLimit(key, limitPerMinute, now)) {
    throw new HttpsError(
      'resource-exhausted',
      'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
    );
  }
}

/** Clear all buckets. Used only by unit tests. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Shared retry-safe idempotency-key helper for frontend command adapters
 * (REQ-ORD-004, REQ-SOLO-001). The server still owns idempotency; this only
 * gives the same logical command a stable, unique key across retries.
 */
export function createIdempotencyKey(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

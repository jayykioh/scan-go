/**
 * Settlement idempotency keys, held in memory per Order. A key is created once
 * for an attempt and reused on every retry until the server returns a confirmed
 * result. Reusing the key guarantees a duplicate confirmation creates no second
 * Payment (REQ-CAS-001).
 */
export class SettlementKeyStore {
  private readonly keys = new Map<string, string>();

  constructor(private readonly createKey: (orderId: string) => string) {}

  /** Return the current key for an Order, creating one on first use. */
  keyFor(orderId: string): string {
    const existing = this.keys.get(orderId);
    if (existing) {
      return existing;
    }
    const created = this.createKey(orderId);
    this.keys.set(orderId, created);
    return created;
  }

  /** Drop the key once the server confirms settlement for that Order. */
  clear(orderId: string): void {
    this.keys.delete(orderId);
  }

  /** True when a retry still holds the key for that Order. */
  has(orderId: string): boolean {
    return this.keys.has(orderId);
  }
}

/** Deterministic factory used in tests and as the browser default. */
export function createSettlementKeyFactory(): (orderId: string) => string {
  let counter = 0;
  return (orderId: string) => {
    counter += 1;
    return `pay-${orderId}-${counter}`;
  };
}

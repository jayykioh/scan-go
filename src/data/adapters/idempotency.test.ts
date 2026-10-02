import { describe, expect, it } from 'vitest';
import { createIdempotencyKey } from './idempotency';

describe('createIdempotencyKey', () => {
  it('prefixes a unique retry-safe key for the same command', () => {
    const first = createIdempotencyKey('cook');
    const second = createIdempotencyKey('cook');
    expect(first.startsWith('cook-')).toBe(true);
    expect(first).not.toBe(second);
  });

  it('keeps the prefix for each command family', () => {
    expect(createIdempotencyKey('solo-pay').startsWith('solo-pay-')).toBe(true);
    expect(createIdempotencyKey('ord').startsWith('ord-')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createSettlementKeyFactory,
  SettlementKeyStore,
} from './settlement-keys';

/**
 * P0-009 client evidence (REQ-CAS-001): one idempotency key per settlement
 * attempt, reused on every retry until a confirmed result.
 */
describe('SettlementKeyStore', () => {
  it('creates one key on first use and reuses it on a retry', () => {
    const store = new SettlementKeyStore(createSettlementKeyFactory());
    const first = store.keyFor('order-1');
    const retry = store.keyFor('order-1');
    expect(first).toBe(retry);
    expect(store.has('order-1')).toBe(true);
  });

  it('uses a distinct key per Order', () => {
    const store = new SettlementKeyStore(createSettlementKeyFactory());
    expect(store.keyFor('order-1')).not.toBe(store.keyFor('order-2'));
  });

  it('drops the key after a confirmed result so the next attempt is new', () => {
    const store = new SettlementKeyStore(createSettlementKeyFactory());
    const first = store.keyFor('order-1');
    store.clear('order-1');
    expect(store.has('order-1')).toBe(false);
    expect(store.keyFor('order-1')).not.toBe(first);
  });
});

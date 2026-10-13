import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_NOTE_MAX_LENGTH,
  orderSubmitInputSchema,
  orderSnapshotSchema,
} from './order.contract';
import { pendingOrderFixture } from '@shared/fixtures/order.fixture';

const submitInput = {
  token: 'tok_1',
  paymentMode: 'payLater' as const,
  idempotencyKey: 'idem-00000001',
  lines: [{ menuItemId: 'item-1', quantity: 1, selectedOptionIds: [] }],
};

/**
 * The Customer's request is untrusted free text that Kitchen reads on a
 * ticket, so it is trimmed, bounded, and never stored empty (REQ-ORD-001).
 */
describe('customerNote', () => {
  it('keeps a trimmed request', () => {
    const parsed = orderSubmitInputSchema.parse({
      ...submitInput,
      customerNote: '  ít cay, không hành  ',
    });
    expect(parsed.customerNote).toBe('ít cay, không hành');
  });

  it('accepts an absent or null request', () => {
    expect(orderSubmitInputSchema.parse(submitInput).customerNote).toBeUndefined();
    expect(
      orderSubmitInputSchema.parse({ ...submitInput, customerNote: null })
        .customerNote,
    ).toBeNull();
  });

  it('rejects an empty or whitespace-only request', () => {
    expect(() =>
      orderSubmitInputSchema.parse({ ...submitInput, customerNote: '   ' }),
    ).toThrow();
  });

  it('rejects a request longer than the shared limit', () => {
    expect(() =>
      orderSubmitInputSchema.parse({
        ...submitInput,
        customerNote: 'a'.repeat(CUSTOMER_NOTE_MAX_LENGTH + 1),
      }),
    ).toThrow();
  });

  it('still parses an Order stored before the field existed', () => {
    const stored: Record<string, unknown> = { ...pendingOrderFixture };
    delete stored.customerNote;
    expect(orderSnapshotSchema.parse(stored).customerNote).toBeUndefined();
  });
});

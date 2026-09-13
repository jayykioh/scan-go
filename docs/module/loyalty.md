# Loyalty Module

- Serves: REQ-LOY-001, NFR-PRIV-001
- Owns: Verified members, point balance, and append-only point transactions
- Does not own: Payment confirmation or Order totals

## Commands
- Register and verify a normalized `+84` phone.
- Award points after confirmed Payment.
- Redeem points after phone verification.
- Reverse point effects after reversal or refund.

## Rules
- Default earning rate is one point per 10,000 VND.
- Default welcome points are zero; Owner can configure the allowed value.
- Every balance change has one append-only transaction.
- Idempotency prevents repeated earning, redemption, or reversal.
- Order records store only `loyaltyMemberId`.
- Phone visibility follows server-enforced permissions; ADMIN remains unrestricted.

## Contracts
- Emits point awarded, redeemed, and reversed events.

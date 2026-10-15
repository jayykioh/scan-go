# Capability Map: Customer Ordering UI

| Module id | Responsibility | Depends on |
|---|---|---|
| customer-ordering | Responsive public menu/cart/order tracking; show loyalty balance only for an already verified member | REQ-ORD-001..004, REQ-LOY-001 |
| customer-feedback | Customer submits visit/order feedback; stored topic tagging and AI grouping remain server-owned | REQ-FDB-001, REQ-FDB-002, REQ-FDB-007 |
| customer-promotions | Browse currently available shop promotions and eligibility from existing public reads | REQ-PRO-001, REQ-PRO-005 |

Build order: customer-ordering → customer-feedback and customer-promotions (independent UI slices after customer context exists).

## Boundaries
- No new authentication or OTP delivery flow. Loyalty balance is shown only when the existing verified identity mechanism has established a member; otherwise the customer can continue as a guest.
- No business writes from the browser directly to Firestore. Submit feedback and orders through existing server commands.
- AI topic is server-assigned from the bounded catalog. Do not expose raw feedback or personal data to untrusted model output or claim grouping is instantaneous if it runs asynchronously.
- Promotions are read-only in the customer UI; eligibility and discounts remain server-authoritative.
- Screenshots and Playwright results are test evidence, not additional runtime features.

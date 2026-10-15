# Customer UI Playwright test plan

## Scope and evidence caveat
This plan covers current customer-facing UI only. The public `/menu/:tableId` route needs a real, active table token and Firebase configuration; the route smoke check without them is expected to show a loading/error boundary, not a completed order screen. The screenshots below are the existing-operation customer demo screen only; they do not demonstrate public order submission, feedback or promotion browsing. Those flows are not fully wired yet.

## Viewports
- Phone: 390×844
- Tablet: 768×1024
- Desktop: 1440×900

## Playwright scenarios
1. Open `/operation/customer`; wait until the customer table picker is visible (not the lazy-load spinner). Assert no horizontal overflow.
2. At each viewport, capture screenshot; keyboard-tab through visible controls and assert focus is visible and accessible names exist.
3. Open a table and assert menu/search/category/cart controls; add an in-stock item; verify cart quantity/total remains visible and viewport has no horizontal overflow.
4. Open the loyalty panel; assert phone lookup, fake OTP, and points are absent until there is an approved verified-customer read path.
5. Open tracking after a test order; assert feedback category, rating/message validation, submitting/error/success states; mock or connect only the existing feedback callable and assert no PII fields are sent.
6. Promotions: do not assert a customer promotions listing until a public-safe API/projection is approved. Assert current cart evaluation remains server-owned and no fabricated promotion cards appear.
7. Record browser console errors and failed network requests for the customer flow.

## Executed test results (2026-10-14)
- Responsive Playwright customer demo: 27/27 assertions pass across phone, tablet, desktop; zero browser console errors and no horizontal overflow.
- Verified picker, table selection, demo menu rendering, opening an item detail, adding an item to cart, and absence of fake OTP/points display.
- The test uses local demo data. It deliberately did not submit an order or write data.
- Focused component tests: `npm test -- src/components/CustomerView.test.tsx` — 5/5 pass.
- Frontend typecheck: `npm run typecheck` — pass.
- Feedback/topic tests: `npm --workspace functions test -- src/modules/feedback/service.test.ts src/modules/feedback/topic.service.test.ts` — 17/17 pass; `npm run typecheck:functions` — pass.
- Existing legacy harness flow `/simulator/customer` redirects to `/operation`; its old locator times out. Do not use that result as a product failure; the corrected direct `/operation/customer` run is in `customer-flow-playwright-report.json`.
- Public `/menu/:tableId` live callable submission, feedback persistence, verified loyalty points, and public promotions are not exercised: they need a valid server-backed table token/session or approved public promotions read path.
- Screenshots are in `docs/feedback/artifacts/customer-flow-*.png` (four stages per viewport).

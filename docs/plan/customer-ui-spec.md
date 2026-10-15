# Spec: Customer Ordering UI

## Objective
Add a responsive customer-facing experience to ScanGo's existing public menu: customers can order, see an existing verified loyalty balance, submit a review/issue about service, food, or surroundings, and browse the shop's active promotions. The UI connects only to approved existing server/read contracts and does not invent auth, loyalty verification, AI, or promotion behavior.

## Approved requirements and capability map
- `customer-ordering`: REQ-ORD-001..004, REQ-LOY-001.
- `customer-feedback`: REQ-FDB-001, REQ-FDB-002, REQ-FDB-007.
- `customer-promotions`: REQ-PRO-001, REQ-PRO-005.
- Map: [customer-ui-capability-map.md](customer-ui-capability-map.md).

## Tech Stack
Use the existing ScanGo React/TypeScript app, its current tokens/components, existing Firebase client adapters and Cloud Functions contracts, and installed Playwright tooling. No new dependency or database/API schema is approved by this spec.

## Commands
Discover and use repo scripts from `package.json` before implementation. Expected checks are the focused Vitest command(s), `npm run typecheck`, `npm run lint`, relevant Functions/Rules Emulator tests if backend contracts are touched, and the repo's Playwright browser harness. Record exact commands and outcomes in the customer UI verification report.

## Project Structure
- Existing customer/public route: `src/pages/PublicMenuPage.tsx`, `src/components/CustomerView.tsx`.
- Existing shared data/contracts: `src/data/**`, `shared/contracts/**`, `functions/src/modules/{feedback,promotion,ordering,loyalty}/`.
- Existing docs and test artifacts: `docs/SRS.md`, `docs/traceability.md`, `docs/feedback/harness/`, `docs/feedback/artifacts/`.
- Add only the smallest necessary customer UI component/test/harness files after implementation review.

## Code Style
Follow adjacent TypeScript/React, existing UI tokens and adapter conventions. Render server data; keep business logic and validation authoritative on the server. Example: `const activePromotions = promotions.filter(isAvailableToCustomer);` must not replace server eligibility checks during Order creation.

## Testing Strategy
- Unit/component checks cover tabs/navigation, verified vs guest loyalty visibility, feedback field validation/submit outcomes, and active/empty promotion states.
- Existing Functions and Rules tests remain the authority for tenant scope, verification, bounded topics, privacy masking, promotion eligibility, and server-only writes; do not duplicate security guarantees in client tests.
- Playwright covers customer menu/order flow, existing verified member balance, feedback submit and visible result, promotion list and empty state, and responsive overflow/accessibility at 390×844 (phone), 768×1024 (tablet), and 1440×900 (desktop). Save screenshots and a test-plan/report artifact in `docs/feedback/artifacts/`.
- Check loading, empty, validation/error, and success states; test keyboard access and console errors.

## Boundaries
- Always: preserve guest ordering; tenant-scope reads; validate form inputs; use server commands for writes; protect phone/PII; maintain REQ traceability; run acceptance tests before completion.
- Ask first: new sign-in/OTP delivery/auth changes, schema changes, external AI/SMS integrations, new dependencies, or promotion eligibility changes.
- Never: direct client writes to business collections, claim an unverified customer has points, let AI output determine money/state without deterministic server validation, weaken existing rules, or discard unrelated working-tree changes.

## Success Criteria
1. Customer can complete the existing order journey as a guest without regression.
2. An existing verified member can see their correct points; guest/unverified customers are not shown another person's balance.
3. Customer can submit a bounded, accessible feedback report with issue type (service/staff, food, surroundings/amenities, other); server topic assignment and verification remain authoritative.
4. Customer can open a Promotions tab that shows only current server-provided offers and handles no-offer/loading/error states.
5. UI works without horizontal overflow at specified phone/tablet/desktop viewports and Playwright evidence is saved and linked.
6. Unit, typecheck, lint and applicable server/rules tests pass; SRS traceability is updated only where status/evidence genuinely changes.

## Open Questions
- Existing customer's verified identity/lookup path may not be connected to the public customer route; inspect before implementation. If the only path requires unavailable OTP delivery, display only a safe sign-in/verification handoff and do not simulate verification.
- The current dirty working tree contains related in-progress edits across app, backend, SRS, and docs. The user authorized committing the existing diff, but we must review the complete diff and test before committing; the customer feature should remain separable if practical.

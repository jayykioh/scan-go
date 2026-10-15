# Implementation Plan: Customer Ordering UI

## Overview
Complete the customer-facing public menu surfaces for order, loyalty visibility, feedback and promotions using the already-approved server contracts. Keep the three independent capability slices separately verifiable.

## Decisions and constraints
- Approved REQ IDs only: REQ-ORD-001..004, REQ-LOY-001, REQ-FDB-001/002/007, REQ-PRO-001/005.
- Existing current tree already has server-driven order, promotion evaluation, and feedback submission. Do not rewrite these paths.
- Loyalty balance is not exposed until an authenticated/verified customer read exists. Public entry currently passes no loyalty data; remove demo phone lookup/OTP state rather than implying verification.
- No backend or schema change unless the existing contract proves insufficient and the user separately approves it.
- Current worktree contains broad pre-existing changes. Do not blanket-stage or commit unrelated files; only stage verified customer-scope artifacts unless user reconfirms a broad commit after the full diff review.

## Tasks

### Slice 1 — Customer entry and loyalty safety
- Acceptance: preserve guest ordering; public menu does not search locally held member data by arbitrary phone; no unverified or unrelated balance displayed; accessible customer navigation entry for loyalty/feedback/promotions as implemented.
- Verify: focused Customer component test, typecheck, Playwright customer entry at phone/desktop.
- Files: `src/components/CustomerView.tsx`, focused `src/components/CustomerView.test.tsx` (new).
- Depends: none.

### Slice 2 — Feedback form
- Acceptance: feedback UI covers rating/message plus explicitly selectable category (service/staff, food, surroundings/amenities, other); form bounds match contract; submit still delegates to existing server command; topic and verification remain server-controlled; loading, validation, error, success states are present.
- Verify: component tests and applicable existing Functions/Rules feedback tests.
- Files: customer component/test; `src/pages/PublicMenuPage.tsx` only if contract adapter wiring needs correction; i18n contracts only for needed labels.
- Depends: Slice 1.

### Slice 3 — Promotions browsing
- Acceptance: customer tab displays only server-authorized current promotion details and handles loading/empty/error; order cart's existing server evaluate remains authoritative; no new client-side price rules.
- Verify: focused UI tests and existing promotion contract/function tests.
- Files: customer component/test, `PublicMenuPage.tsx` and promotion adapter only if needed by existing contract.
- Depends: Slice 1.

### Slice 4 — Browser acceptance evidence
- Acceptance: saved Playwright plan/report and screenshots at 390×844, 768×1024, and 1440×900; verify no horizontal overflow, tabs/forms keyboard accessible, representative order/feedback/promotion states, no console errors.
- Verify: Playwright harness and screenshots in `docs/feedback/artifacts/`.
- Files: `docs/feedback/harness/verify-customer-ui.mjs`, artifacts, plan/test report.
- Depends: Slices 1–3.

### Slice 5 — Requirement traceability and commit
- Acceptance: update SRS and traceability only with evidence-backed status; commit the customer change without staging unrelated pre-existing edits; report any remaining partial REQ-LOY-001 external verification dependency.
- Verify: inspect staged diff and run final tests/build/typecheck/lint.
- Files: `docs/SRS.md`, `docs/traceability.md` only if actual status/evidence changes; customer UI files/artifacts.
- Depends: Slices 1–4.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Existing public route has no verified identity mechanism | Cannot show loyalty points safely | Keep points hidden until an approved verified identity/read path exists |
| Public feedback route only includes tracking token after ordering | Feedback may be unavailable pre-order | Keep current flow and submit feedback as visit/order report; do not expand API |
| Worktree includes unrelated modified/untracked files | Accidental broad commit/regression | Stage only specific inspected deliverables; no blanket staging |
| Local Firebase credentials or real tenant unavailable | Live API scenarios may not run | Use existing test harness and clearly label mocked vs real Firestore verification |

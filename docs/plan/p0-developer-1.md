# Developer 1 — P0 Config, Firebase Auth, Tenant, authorization

**Owner:** Developer 1. **Effort:** 21 points. **Review partner:** Developer 2. **Founder:** final acceptance reviewer only.

## Ownership and contract-first start
- **Modules and paths:** Config: `platform/config`, Tenant `configOverrides`. Auth/Tenant: `users/{uid}`, `tenants/{tenantId}`, `members/{uid}`, `audit`, `onboardingChecklist`.
- **UI status:** PARTIAL 5. Extend SettingsPage, LoginPage, RegisterPage, SimulatorLayout, StaffPage/StaffView, and OwnerView. No DONE screen is assigned.
- **Rules/tests owned:** `firestore.rules` sections for user, Tenant, membership, and config reads; Emulator tests for two-Tenant isolation, denied permissions, PIN lock, and direct client-write denial.
- Freeze `ResolvedConfig`, `FirebaseIdentity`, `Membership`, `AuthorizationDecision`, `StaffSession`, `OnboardingChecklist`, and `AuditEvent`. Publish Emulator fixtures and test doubles. Use Firebase Auth phone OTP plus Firestore Rules only. Do not create a custom auth service.

## Assigned items
| ID and effort | UI and backend deliverables | IDs and acceptance | Tests, handoff, evidence |
|---|---|---|---|
| P0-001 (3) | **UI: PARTIAL — extend** SettingsPage with resolved source. **BE:** typed defaults, precedence, allowed override callable/query. | REQ-CFG-001, NFR-CFG-001, CON-006/007. Given three values, when resolved, then allowed Tenant value and source return. | Config unit/contract, Functions Emulator, Rules. Output `ResolvedConfig` to all Developers. Evidence: source inspection. |
| P0-002A/B, P0-003 (7) | **UI: PARTIAL — extend** Login/Register with OTP and SimulatorLayout with memberships/switch. **BE:** Firebase OTP, bootstrap Tenant/profile/membership, active-Tenant command/query. | REQ-AUTH-001, REQ-TEN-001, CON-001/002, NFR-SEC-001, NFR-DATA-001. Given valid OTP, when verified, then session begins. Given two memberships, when switched, then no cross-Tenant data appears. | Auth and two-Tenant Emulator tests. Output `FirebaseIdentity` and `Membership` to all Developers. Evidence: OTP and switch recording. |
| P0-004A/B (5) | **UI: PARTIAL — extend** StaffPage/StaffView with policy, lock, and denied states. **BE:** PIN hash, five-failure 15-minute lock, session version, role/reduced-permission guard, audit. | REQ-AUTH-002, REQ-ACL-001, NFR-PRIV-001. Given five invalid PINs, when limit reaches, then lock and audit exist. Given absent permission, when callable runs, then server denies. | Hash/lock, role, Rules Emulator matrix. Output `AuthorizationDecision` to Developers 2–4. Evidence: audit fixture. |
| P0-010B (3) | **UI: PARTIAL — extend** OwnerView checklist. **BE:** checklist command/query using Catalog/Table/Payment completion-event doubles. | REQ-ONB-001/002, NFR-UX-001. Given each approved step completes, when updated, then next incomplete step shows; prepared Owner finishes in 15 minutes. | checklist unit/E2E and timed study. Output `OnboardingChecklist` evidence. |
| P0-L04 (3) | **UI: MISSING — build UI + BE** permission-result evidence surface. **BE:** Customer-phone authorization matrix and audited ADMIN test-double input. | NFR-PRIV-001, REQ-ADM-001. Given a role requests Customer phone, when server responds, then configured permission applies and ADMIN is audited. | Emulator matrix. Evidence: role report. |

## Integration and merge
Inputs from other modules use test doubles. Final gates: bind Config to PIN/rate policy; bind `AuthorizationDecision` to every callable. Do not write Catalog, Table, Order, Inventory, or Payment paths. Merge only owned modules and Rules after Developer 2 review. Founder accepts the listed evidence. No direct client business write is allowed.

# Developer 2 — P0 Catalog, Table Access, ADMIN

**Owner:** Developer 2. **Effort:** 22 points. **Review partner:** Developer 1. **Founder:** final acceptance reviewer only.

## Ownership and contract-first start
- **Modules and paths:** Catalog: `menuItems`, `publicMenuItems`, tenant Storage metadata. Table Access: `tables`, `publicTableLinks`. ADMIN: delegated query/command boundary and audit orchestration.
- **UI status:** PARTIAL 2, MISSING 1. Extend MenuPage/OwnerView and TablesPage. Build ADMIN route and screen.
- **Rules/tests owned:** `firestore.rules` Catalog/Table/public-token/ADMIN sections; `storage.rules` tenant image section; Emulator tests for projection privacy, token revocation, ADMIN audit, cross-Tenant reads, and client-write denial.
- Freeze `PublicMenuItem`, `CatalogCommandResult`, `TableLinkContext`, `TableTokenRotation`, and `AdminAuditEvent`. Publish Catalog/Table fixtures; mock `AuthorizationDecision` and Ordering public-menu consumer.

## Assigned items
| ID and effort | UI and backend deliverables | IDs and acceptance | Tests, handoff, evidence |
|---|---|---|---|
| P0-005 (7) | **UI: PARTIAL — extend** MenuPage and OwnerView. **BE:** Catalog create/update/archive/template/availability commands, private query, public projection, Storage validation. | REQ-CAT-001/002, CON-002, NFR-SEC-001, NFR-DATA-001. Given valid item, when Owner saves, then Customer sees scoped public item within two seconds. | Catalog contract, Storage Rules, projection privacy, Emulator isolation. Output `PublicMenuItem` and availability contracts to Developer 3/4. Evidence: Owner-to-Customer demo. |
| P0-006 (5) | **UI: PARTIAL — extend** TablesPage QR/link actions. **BE:** Table create/rename/archive/regenerate commands, resolver, atomic revocation. | REQ-TBL-001, NFR-SEC-002, CON-002. Given regenerated link, when old token opens, then it fails; new token resolves one Table. | token transaction and public Rules Emulator tests. Output `TableLinkContext` to Developer 3. Evidence: old/new link record. |
| P0-L01 (6) | **UI: MISSING — build UI + BE** ADMIN route, Tenant/platform access screen, and audit view. **BE:** claim-verified delegated commands/queries and automatic audit. | REQ-ADM-001, NFR-PRIV-001. Given ADMIN session, when any Tenant opens or changes, then operation succeeds without prompt and audit exists. | claim, audit, and Emulator access tests. Input mocked authorization; output `AdminAuditEvent` to Developer 1. Evidence: ADMIN audit report. |
| P0-L05 (4) | **UI: MISSING — build UI + BE** locale provider, switch, and catalogs. **BE:** use Developer 1 user-locale query/command contract. | REQ-I18N-001. Given saved user choice or browser language, when UI opens, then `vi`/`en` labels appear and switch remains; Owner menu text remains unchanged. | locale unit/E2E. Evidence: two locale recordings. |

## Integration and merge
Start immediately with a mocked `ResolvedConfig` and `AuthorizationDecision` from Developer 1. Publish `PublicMenuItem` to Developer 3 and 4, `TableLinkContext` to Developer 3, and `AdminAuditEvent` to Developer 1 before review.

Final gates: bind public menu projection and Table resolver to the Developer 3 Customer flow; bind ADMIN audit to the Developer 1 audit contract; bind locale labels to the Developer 1 user-locale contract. Do not write Order, Inventory, Payment, or Tenant membership paths.

Merge only owned Catalog, Table Access, ADMIN, and i18n modules plus their Rules sections after Developer 1 review. Every Rules change needs a cross-Tenant Emulator test. Founder accepts the listed evidence. No direct client business write is allowed.

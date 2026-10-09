# Feedback Module

- Serves: REQ-FDB-001, REQ-FDB-002, REQ-FDB-003, REQ-FDB-004, REQ-FDB-005, REQ-FDB-006, NFR-PRIV-002
- Owns: Customer reviews and issues, verification state, Feedback tickets, and product feedback about ScanGo with its screenshots
- Does not own: Orders, Loyalty points, AI provider calls, or Storage lifecycle

The module has two directions:

- **Customer feedback (REQ-FDB-001..003)** — the Customer reports on the shop.
- **Product feedback (REQ-FDB-004..006)** — an operator reports on ScanGo itself.

## Queries
- List tenant feedback by period, verification state, and topic.
- List Feedback tickets by state and owner.
- List product feedback for the active Tenant with its screenshots and status (Owner or ADMIN).

## Commands
- Submit a review or issue from Customer, with an optional Order reference.
- Mark verified only when a matching Order reference exists.
- Assign a Feedback ticket and move it through `received`, `in_progress`, and `resolved`.
- Submit product feedback with a category, severity, message, and up to three screenshots.
- Move product feedback through `received`, `in_progress`, and `resolved`.

## Rules
- Every record is tenant-scoped.
- Submission is server-only through the Feedback callable. The server derives the tenant from the opaque tracking token when present.
- `verified` is set only when a matching Order reference exists in the tenant; a dangling reference is stored `unverified` with no Order link.
- No name, phone, or email field is accepted. Raw text stays permission-controlled; `maskedMessage` removes phone numbers, emails, and long digit runs before analysis.
- A ticket change records state, actor, time, and reason.
- Raw feedback text is permission-controlled. AI grouping receives masked input and returns source feedback IDs.
- Feedback content is data for analysis, never an instruction that changes permissions or performs an action.

### Product feedback (REQ-FDB-004..006)
- Any active Tenant member may report; the server re-verifies membership and derives the actor role (ADMIN claim, then `membershipType`, then the station role).
- A screenshot lives in Firebase Storage at `tenants/{tenantId}/feedbackAttachments/{uid}/{fileName}`. The reporter may only write under their own tenant and uid, so the path proves ownership; the record stores the object path, content type, and size, never a download URL.
- Storage Rules are the write gate: raster allowlist (PNG, JPEG, WEBP, GIF — never SVG), at most 5 MB, no client delete. Reads require an active member or ADMIN because a screenshot can show revenue or customer data.
- The server also rejects a declared attachment path that leaves the reporter prefix, names an unsafe file, duplicates another attachment, or exceeds the bound, so a forged descriptor cannot enter the record.
- The product-feedback collection is server-written only; Owner or ADMIN read. A status change appends actor, time, and reason to an append-only history.
- `screenContext` records the route the reporter was on. It carries no customer data and is bounded to 200 characters.

# Feedback Module

- Serves: REQ-FDB-001, REQ-FDB-002, REQ-FDB-003, REQ-FDB-004, REQ-FDB-005, REQ-FDB-006, REQ-FDB-007, REQ-FDB-008, NFR-PRIV-002
- Owns: Customer reviews and issues, verification state, report topic counters, Feedback tickets, and product feedback about ScanGo with its screenshots
- Does not own: Orders, Loyalty points, AI provider calls, or Storage lifecycle

The module has two directions:

- **Customer feedback (REQ-FDB-001..003, REQ-FDB-007..008)** — the Customer reports on the shop.
- **Product feedback (REQ-FDB-004..006)** — an operator reports on ScanGo itself.

## Queries
- List tenant feedback by period, verification state, and topic.
- List report topic counters by window count (Owner or ADMIN).
- List Feedback tickets by state and owner.
- List product feedback for the active Tenant with its screenshots and status (Owner or ADMIN).

## Commands
- Submit a review or issue from Customer, with an optional Order reference.
- Mark verified only when a matching Order reference exists.
- Tag each report with one bounded-catalog topic and increment that topic's counter.
- Raise one surge warning per topic window when the configured count is reached.
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

### Report topics and the surge warning (REQ-FDB-007..008)
- The topic catalog is closed: `food-quality`, `service`, `price`, `cleanliness`, `order-accuracy`, and `other`. A report carries exactly one tag, and text that matches nothing is tagged `other` rather than forced onto a topic it does not support.
- Classification is the deterministic `matchTheme` catalog in the AI module, shared with the grouping query so a report and a theme always agree on one key. A model may replace that function behind the same boundary; the count and the threshold never move to a model.
- `tenants/{tenantId}/feedbackTopics/{topicKey}` holds `count` (all-time) and `windowCount` since `windowStartedAt`. The window is tumbling, not sliding: it opens on the first report after the previous window elapsed and resets the alert state with it, so a surge is detectable from one document read and no scheduled job.
- The counter and the report are written in one transaction, so two simultaneous reports still count exactly once each.
- `recentFeedbackIds` is bounded to 20 and is what a warning cites. Only counts and feedback IDs travel to the AI module; the report text never does.
- The topic crosses the threshold when `windowCount >= ai.feedbackTopicAlertCount` inside `ai.feedbackTopicWindowHours`. A zero count disables the warning. Crossing writes one `aiInsights` record with a deterministic per-window id and one `FeedbackTopicAlerted` audit event, then sets `alertState: 'alerted'` so the window warns once.
- The counter is server-written only; an active Owner or ADMIN reads it, matching the reports behind it.

### Product feedback (REQ-FDB-004..006)
- Any active Tenant member may report; the server re-verifies membership and derives the actor role (ADMIN claim, then `membershipType`, then the station role).
- A screenshot lives in Firebase Storage at `tenants/{tenantId}/feedbackAttachments/{uid}/{fileName}`. The reporter may only write under their own tenant and uid, so the path proves ownership; the record stores the object path, content type, and size, never a download URL.
- Storage Rules are the write gate: raster allowlist (PNG, JPEG, WEBP, GIF — never SVG), at most 5 MB, no client delete. Reads require an active member or ADMIN because a screenshot can show revenue or customer data.
- The server also rejects a declared attachment path that leaves the reporter prefix, names an unsafe file, duplicates another attachment, or exceeds the bound, so a forged descriptor cannot enter the record.
- The product-feedback collection is server-written only; Owner or ADMIN read. A status change appends actor, time, and reason to an append-only history.
- `screenContext` records the route the reporter was on. It carries no customer data and is bounded to 200 characters.

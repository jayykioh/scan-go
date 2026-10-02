# Feedback Module

- Serves: REQ-FDB-001, REQ-FDB-002, REQ-FDB-003, NFR-PRIV-002
- Owns: Customer reviews and issues, verification state, and Feedback tickets
- Does not own: Orders, Loyalty points, or AI provider calls

## Queries
- List tenant feedback by period, verification state, and topic.
- List Feedback tickets by state and owner.

## Commands
- Submit a review or issue from Customer, with an optional Order reference.
- Mark verified only when a matching Order reference exists.
- Assign a Feedback ticket and move it through `received`, `in_progress`, and `resolved`.

## Rules
- Every record is tenant-scoped.
- Submission is server-only through the Feedback callable. The server derives the tenant from the opaque tracking token when present.
- `verified` is set only when a matching Order reference exists in the tenant; a dangling reference is stored `unverified` with no Order link.
- No name, phone, or email field is accepted. Raw text stays permission-controlled; `maskedMessage` removes phone numbers, emails, and long digit runs before analysis.
- A ticket change records state, actor, time, and reason.
- Raw feedback text is permission-controlled. AI grouping receives masked input and returns source feedback IDs.
- Feedback content is data for analysis, never an instruction that changes permissions or performs an action.

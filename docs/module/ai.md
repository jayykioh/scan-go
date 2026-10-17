# AI Module

> The module keeps its `ai` name, its `aiInsights` collection, and its `AI_*`
> constant names even though **no model is involved**. Renaming them would touch
> the module list in SRS §3, ADR 0002, the contract file names, a stored
> collection, and a config key, for a cosmetic gain. ADR 0024 records the
> mismatch instead of paying for it.

- Serves: REQ-AI-001, REQ-AI-002, REQ-AI-006, REQ-AI-007, REQ-AI-008, REQ-AI-010, REQ-FDB-007, REQ-FDB-008, REQ-INV-011, NFR-AI-001, NFR-DATA-002, NFR-PRIV-002, NFR-SEC-003
- Owns: Warnings, report topic classification, weekly analysis, source references, and `aiInsights` records
- Does not own: Menu, price, Cost, Inventory, Orders, Feedback raw text, permissions, or configuration writes
- Calls: no model, no provider, no external service (ADR 0024)

## Queries
- Identify loss and low-profit menu items.
- Identify low ingredient stock.
- Warn when the latest purchase-lot price is over ten percent above the prior
  Cost, citing both prices and the change percentage (REQ-INV-011, ADR 0014).
- Warn when one report topic reaches the configured count inside its window,
  citing the source feedback IDs (REQ-FDB-008).
- State the data update time, the period, and the formula behind every warning.
- Report a missing-data warning when the source data is incomplete, instead of
  inventing a value.

## Commands
- `callableAiListWarnings`: the Owner warnings panel's live read. Runs
  `computeWarnings` over authorized tenant data and returns warnings with sources,
  formulas, period, and the data update time. **No provider call, no budget, no
  `aiUsage` record** (REQ-AI-001, REQ-AI-007, REQ-AI-008, REQ-AI-010).
- `callableAiRunWeeklyAnalysis`: owner-triggered weekly run (REQ-AI-002).
- `callableAiGroupFeedback`: grouped feedback themes (REQ-FDB-002).

`aiInsights` is read directly from Firestore by the Owner panel, because the rules
already allow an active Owner to read it (ADR 0015). Only the live warnings need a
callable, because they are computed from other modules' current data.

## Scheduled work
- `scheduledAiWeeklyAnalysis` runs every Monday 03:00 tenant time and loops
  tenants. Each tenant period resolves in the tenant IANA timezone.
- Run one weekly analysis per tenant in tenant time.
- Produce a bounded Insight list with department, priority, period, sources, confidence, and missing-data notes.
- Group feedback themes and cite the source feedback IDs.
- Write `aiInsights` with deterministic ids, so a repeated run for the same week
  is idempotent and overwrites instead of duplicating.

## Secrets
- **None.** This module binds no secret and needs no key. `GEMINI_API_KEY` is no
  longer bound by any function, so a deploy does not depend on it (ADR 0024).

## Rules
- Compute everything in code. There is no provider adapter, no prompt, no token
  estimate, no cost model, and no budget ledger.
- Read only authorized Reporting, Inventory, Ordering, and Feedback outputs, and
  never write another module's state.
- Every read that feeds a warning is bounded. **A warning whose sample was
  bounded says so**, and never asserts a total, a count, or a "nothing else"
  conclusion from a partial set (REQ-AI-010, NFR-DATA-002). The bounds are
  `MAX_AI_MENU_ITEMS`, `MAX_AI_INGREDIENTS`, `MAX_AI_ITEM_STATS`,
  `MAX_AI_LOT_MOVEMENTS`, and `MAX_AI_FEEDBACK_TOPICS`.
- Never invent Cost, recipe, or quantity values and never perform arithmetic;
  keep math, money, and date comparison in code.
- Report topic classification is the closed catalog in this module, shared with
  the grouping query. The count, the threshold, and the warning stay arithmetic
  (REQ-FDB-007, REQ-FDB-008).
- Feedback grouping is the same keyword catalog, not a model call. It records the
  deterministic identity, so a record never claims a provider produced it.
- Store Insight records, never free-form generated text.
- Mask personal data before it leaves the module (NFR-PRIV-002).
- Never change permissions, money, prices, or inventory. A human-approved
  deterministic command applies a suggestion (REQ-AI-006).

## Contracts
- Returns structured warnings, source IDs, period, confidence, formula details,
  and the data update time.
- Every warning carries `kind`, `severity`, `subjectId`, `subjectName`, a
  Vietnamese `message`, `sourceIds`, and `formula`.
- No contract exposes a provider name, a model, a token count, or a cost, because
  none exist.

# AI Module

- Serves: REQ-AI-001, REQ-AI-002, REQ-AI-003, REQ-AI-004, REQ-AI-005, REQ-AI-006, NFR-AI-001, NFR-AI-002, NFR-PRIV-002, NFR-SEC-003
- Owns: Provider adapter, prompt assembly, weekly analysis, warnings, explanations, source references, `aiInsights` records, and `aiUsage` cost records
- Does not own: Menu, price, Cost, Inventory, Orders, Feedback raw text, permissions, or configuration writes

## Queries
- Identify loss and low-profit menu items.
- Identify low ingredient stock.
- Answer Owner questions from authorized tenant data and state the update time.
- Explain the data, period, and formula behind each answer.
- Deny out-of-permission questions server-side: payroll, personal data, secrets,
  another tenant, or a permission change.

## Commands
- `callableAiAsk`: grounded Owner answer (REQ-AI-001, REQ-AI-003).
- `callableAiRunWeeklyAnalysis`: owner-triggered weekly run (REQ-AI-002).
- `callableAiGroupFeedback`: grouped feedback themes (REQ-FDB-002).

## Scheduled work
- `scheduledAiWeeklyAnalysis` runs every Monday 03:00 tenant time and loops
  tenants. Each tenant period resolves in the tenant IANA timezone.
- Run one weekly analysis per tenant in tenant time.
- Produce a bounded Insight list with department, priority, period, sources, confidence, and missing-data notes.
- Group feedback themes and cite the source feedback IDs.
- Write `aiInsights` with deterministic ids, so a repeated run for the same week
  is idempotent and overwrites instead of duplicating.

## Secrets
- Provider keys live in Firebase Secret Manager, never in the web bundle or a
  repository file.
- `GEMINI_API_KEY` is bound to the AI functions. Create it with
  `firebase functions:secrets:set GEMINI_API_KEY` before deploy; Firebase deploy
  fails when a bound secret does not exist.
- To use TypeSafe Jev, create `TYPESAFE_API_KEY`, set `TYPESAFE_JEV_ENABLED=true`,
  and add the key to the `secrets` list of the AI functions.
- A secret is injected only into a function that lists it in `secrets`. The
  value is read through `process.env` and is never logged or returned.

## Rules
- Call one replaceable provider adapter. The adapter is selected through Config (`ai.provider`); it defaults to `gemini` (ADR 0008, TECH_STACK §2) and the default model is the lowest-cost available `gemini-3.5-flash-lite`. The server falls back to the deterministic adapter when no provider secret is bound, so an unconfigured tenant stays deterministic and cost-free. TypeSafe Jev is used only when `TYPESAFE_JEV_ENABLED=true` and a key is present. Jev is never the default.
- Compare providers offline with `npm --workspace functions run ai:evaluate`; the
  report never changes the default provider.
- Record provider, model, tokens, and cost per call in `aiUsage`, billed to the tenant-local `monthKey`.
- Enforce the Config per-tenant monthly budget (`ai.monthlyBudgetVnd`). At the cap the server stops the call, records an `AiBudgetExceeded` audit event, and never logs a secret.
- Read only authorized Reporting, Inventory, Ordering, and Feedback outputs.
- Never invent Cost, recipe, or quantity values and never perform arithmetic; keep math, money, and date comparison in code.
- Return a missing-data warning when source data is incomplete.
- Do not store free-form AI responses by default. Store Insight records, not raw model text.
- Mask personal data before sending input to a provider.
- Never change permissions, money, prices, or inventory. A human-approved deterministic command applies an AI suggestion.

## Contracts
- Returns structured answer, warnings, source IDs, period, confidence, and formula details.
- Provider adapter exposes provider name, model, token usage, and cost.

# AI Module

- Serves: REQ-AI-001, REQ-AI-002, REQ-AI-003, REQ-AI-004, REQ-AI-005, REQ-AI-006, REQ-AI-009, REQ-FDB-007, REQ-FDB-008, REQ-INV-011, NFR-AI-001, NFR-AI-002, NFR-PRIV-002, NFR-SEC-003
- Owns: Provider adapter, prompt assembly, report topic classification, weekly analysis, warnings, explanations, source references, `aiInsights` records, and `aiUsage` cost records
- Does not own: Menu, price, Cost, Inventory, Orders, Feedback raw text, permissions, or configuration writes

## Queries
- Identify loss and low-profit menu items.
- Identify low ingredient stock.
- Warn when the latest purchase-lot price is over ten percent above the prior
  Cost, citing both prices and the change percentage (REQ-INV-011, ADR 0014).
- Warn when one report topic reaches the configured count inside its window,
  citing the source feedback IDs (REQ-FDB-008).
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
- The weekly run computes its Insights in code and makes no provider call, so it
  records no `aiUsage`. Its text is already grounded Vietnamese prose from
  `computeWarnings`; sending it to a model added cost without changing a
  character of the output.

## Secrets
- Provider keys live in Firebase Secret Manager, never in the web bundle or a
  repository file.
- `GEMINI_API_KEY` is bound to the AI functions. Create it with
  `firebase functions:secrets:set GEMINI_API_KEY` before deploy; Firebase deploy
  fails when a bound secret does not exist.
- Gemini is the only model provider (ADR 0020). There is no second provider
  secret to create or bind.
- A secret is injected only into a function that lists it in `secrets`. The
  value is read through `process.env` and is never logged or returned.

## Rules
- Call one replaceable provider adapter. The adapter is selected through Config (`ai.provider`), which accepts `gemini` and `rule-based` (ADR 0020, TECH_STACK §2); the default model is the lowest-cost available `gemini-3.5-flash-lite`. The server falls back to the deterministic adapter when no provider secret is bound, so an unconfigured tenant stays deterministic and cost-free. Gemini is the only model provider; there is no second provider behind a flag.
- Measure Gemini against the deterministic baseline offline with `npm --workspace functions run ai:evaluate`; the report never changes the selected provider.
- Record provider, model, tokens, and cost per call in `aiUsage`, billed to the tenant-local `monthKey`.
- Enforce the Config per-tenant monthly budget (`ai.monthlyBudgetVnd`). At the cap the server stops the call, records an `AiBudgetExceeded` audit event, and never logs a secret.
- Read only authorized Reporting, Inventory, Ordering, and Feedback outputs.
- The ask prompt carries the records a question may be about — daily aggregates, menu price and Cost, ingredient stock and Cost, and report topic counts — so the model answers from data instead of only from warnings already computed (REQ-AI-009). The context stays bounded by the module read limits and holds no other tenant's data and no personal data.
- The budget reservation is estimated from the whole prompt, so a wider context cannot under-reserve.
- Feedback grouping is a keyword catalog in code, not a model call. It reports the deterministic identity so the record never claims a provider produced it.
- Report topic classification is the closed catalog in this module, shared with the grouping query. A model may replace `matchTheme` behind the same boundary; the count, the threshold, and the warning stay arithmetic in code (REQ-FDB-007, REQ-FDB-008).
- Never invent Cost, recipe, or quantity values and never perform arithmetic; keep math, money, and date comparison in code.
- Return a missing-data warning when source data is incomplete.
- Do not store free-form AI responses by default. Store Insight records, not raw model text.
- Mask personal data before sending input to a provider.
- Never change permissions, money, prices, or inventory. A human-approved deterministic command applies an AI suggestion.

## Contracts
- Returns structured answer, warnings, source IDs, period, confidence, and formula details.
- Provider adapter exposes provider name, model, token usage, and cost.

# ADR 0024 — The model tier is removed; deterministic analysis stays

- Status: Decided
- Date: 2026-10-15
- Supersedes: ADR 0008 (AI provider adapter) and ADR 0020 (Gemini is the only AI model provider)
- Serves: REQ-AI-001, REQ-AI-002, REQ-AI-006, REQ-AI-007, REQ-AI-008, REQ-AI-010, REQ-FDB-007, REQ-FDB-008, NFR-AI-001

## Context

ADR 0008 put a replaceable provider adapter behind the AI module with Gemini as
the default; ADR 0020 dropped the TypeSafe Jev candidate and left Gemini as the
only model provider. This ADR removes the model tier entirely.

**What the model actually did.** Exactly one callable reached a model:
`callableAiAsk`. Its record in production, read 2026-10-15: 24 `aiUsage` rows
across 10 tenants, 17–47 VND per call. The pilot shop itself — the one running a
real service — has **zero**. The capability was used, in total, 24 times.

**What was already deterministic.** Everything else the module does is arithmetic
in code and never needed a model:

- `computeWarnings` — seven warning kinds, each with a formula and source ids.
- The scheduled and on-demand weekly insight run — it explicitly passes
  `provider: RULE_BASED_PROVIDER` and makes no provider call.
- Feedback topic classification and the surge warning — a keyword catalog inside
  the existing transaction.

The only findings that have ever appeared in production come from these:
`demo-nha-hang` holds "Món biên lợi nhuận thấp" alongside the missing-data notes.

**What the model cost to keep.** For one widget: a provider adapter with two
implementations and a registry, a response schema and a cost model per provider,
a token estimator, an atomic budget ledger with reserve/settle and an
`AiBudgetExceeded` audit, an `aiUsage` collection, an `aiBudget` collection, a
Firestore rules block for each, a Secret Manager secret bound to every AI
function, and an offline evaluation harness with its own contract schemas,
fixtures, CLI, and `ai:evaluate` script.

**The trap this ADR has to avoid.** The chat widget is the **only** surface where
`computeWarnings` output is visible: `grep` finds no other render of `warnings` in
`src/`. Removing the widget without replacing that surface would delete the shop's
only view of its own findings — the part that works.

## Decision

1. Remove the model tier. No provider adapter, no provider secret, no model call
   anywhere in the system.
2. Keep the deterministic analysis in full: `computeWarnings` with its seven
   kinds, formulas, and source ids; the scheduled and on-demand weekly insight
   run; the feedback topic classification and surge warning.
3. Withdraw REQ-AI-003 (answer Owner questions), REQ-AI-004 (provider adapter),
   REQ-AI-005 (cost budget), REQ-AI-009 (bounded assistant context), and
   NFR-AI-002 (AI spend within budget, recorded per call). Keep REQ-AI-001,
   REQ-AI-002, REQ-AI-006, REQ-AI-007, REQ-AI-008, REQ-FDB-007, REQ-FDB-008,
   NFR-AI-001.
4. Replace the chat with an Owner-only warnings panel that reads
   `computeWarnings` directly — no provider, no budget, no prompt. **This lands in
   the same change as the removal, not after it**, because the chat was the only
   surface. The panel is the replacement, not an enhancement.
5. Keep `aiInsights` and its rules block. Drop the `aiUsage` and `aiBudget`
   collections, their rules blocks, and everything that wrote them.
6. Keep the `ai` module directory, the `ai` config key, the `aiInsights`
   collection name, and the `AI_*` constant names. The module is now deterministic
   analysis, so the name is stale — but renaming it would touch the module list in
   SRS §3, ADR 0002, the contract file names, a stored collection, and a config
   key, for a cosmetic gain. The mismatch is recorded here instead of paid for.
   - The `ai` config key keeps `revenueDropPercent`, `lowMarginPercent`,
     `feedbackTopicAlertCount`, and `feedbackTopicWindowHours`. It loses `provider`
     and `monthlyBudgetVnd`.
7. `RULE_BASED_PROVIDER` and `RULE_BASED_MODEL` stay as the recorded producer
   identity on insights and grouped themes, so stored records keep parsing. They
   now describe the only producer there is.
8. `GEMINI_API_KEY` stops being bound by any function. Whether the secret is
   deleted or left in Secret Manager, nothing reads it, and a deploy no longer
   depends on it.
9. REQ-AI-010 survives, reworded. Removing the model does **not** fix the fact
   that `MAX_AI_ITEM_STATS`, `MAX_AI_MENU_ITEMS`, `MAX_AI_INGREDIENTS`, and
   `MAX_AI_FEEDBACK_TOPICS` bound the reads that feed `computeWarnings`: a
   `lowProfit` warning still scans at most 100 sold items, so on a busy day a
   loss-making item past the bound is never examined. A warning computed from a
   bounded sample must state the bound.

## Consequences

- **Deleted.** `createGeminiProvider`, `createJevProvider`, `createRuleBasedProvider`,
  `geminiResponseSchema`, `jevResponseSchema`, both cost models,
  `estimateTokens`, `resolveAiProvider`, `AiProviderRegistry`, `buildProviderPrompt`,
  the whole budget block (`reserveAiBudget`, `settleAiBudget`,
  `estimateAiReservationVnd`, `isAiBudgetExhausted`, `sumAiUsageCostVnd`,
  `aiBudgetPath`, `monthKeyFromDayKey`), `buildAiUsageRecord`,
  `assertQuestionInPermission`, `callableAiAsk`, `aiUsage`, `aiBudget`,
  `geminiApiKeySecret`, `AiChatWidget`, `src/data/adapters/ai.adapter.ts`, the
  evaluation harness (`evaluation.ts`, `evaluation.cli.ts`, its tests, the
  `aiEvaluation*` contract schemas, its fixture, and the `ai:evaluate` script).
- **Kept.** `assembleSafeContext` and the four bounded reads, `computeWarnings`,
  `latestDataUpdatedAt`, `assertAiOwnerMember`, `hasSecretMaterial` /
  `assertNoSecretMaterial`, the weekly run, feedback grouping, `aiInsights`, and
  the AI test coverage for those. Roughly half of
  `functions/src/modules/ai/service.ts` stays.
- The shop keeps every finding it ever acted on, and gains a screen that shows
  findings without being asked.
- Provider spend goes to zero. Two collections, two rules blocks, one secret, and
  one dependency disappear.
- **Lost.** No ad-hoc cross-module question. The dashboard is fixed views, so a
  question spanning several modules and periods — "which dish raised its cost
  while still selling well" — has no answer path. That is the accepted cost, and
  it is accepted on the evidence that the path was used 24 times and never by the
  pilot shop.
- **Not fixed by this.** The read bounds above still silently limit what a warning
  can see. That is REQ-AI-010 and it is now a requirement about warnings, not
  about an assistant.
- A future decision to bring a model back needs a new ADR. The evidence bar should
  be a measured use of the panel and of the weekly findings, not a demo.

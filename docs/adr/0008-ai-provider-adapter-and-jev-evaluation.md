# ADR 0008 — AI provider adapter with Gemini default and Jev evaluation

- Status: Decided
- Date: 2026-09-30
- Serves: REQ-AI-001, REQ-AI-004, REQ-AI-005, NFR-AI-001, NFR-AI-002

## Context

`TECH_STACK.md` selects Gemini through a server-side read-only adapter for REQ-AI-001. `PRODUCT_OBJECTIVES.md` §3 asks for a weekly analysis, open question answering, and lower AI cost. The Founder asked whether TypeSafe AI (https://typesafe.ai/) can replace Gemini and reduce cost.

TypeSafe AI serves `jev-1.13.0`, a System One model. It returns typed decisions (Choice, Score, Noul) with calibrated confidence instead of generated text. Published price is $42 per billion input tokens and free output. It does not generate prose, English is its strongest language, and it is weak at math, counting, and date arithmetic (TypeSafe "Jev 1.13 jaggedness"). ScanGo needs Vietnamese explanations and arithmetic, which stay in code.

The Founder decision on 2026-09-30: keep Gemini, evaluate Jev, and do not switch yet.

## Decision

1. Keep Gemini as the default generative provider for Vietnamese explanations and narrative answers.
2. Define one replaceable AI provider adapter behind the AI module. No module calls a provider directly.
3. Treat TypeSafe Jev as a candidate for bounded structured decisions only, such as feedback topic classification and insight priority selection. Jev output is a signal, never a money, permission, price, or inventory value.
4. Do not switch the default provider until a recorded evaluation proves lower total cost per useful insight, acceptable Vietnamese quality, source citation, and acceptable privacy terms.
5. Record provider, model, token usage, and cost per AI call, and enforce a per-tenant budget from Config.

## Consequences

- The AI module owns a provider interface with a Gemini implementation and a Jev implementation behind a feature flag.
- Arithmetic, money, Cost, and date comparison remain in deterministic code.
- The database adds an `aiUsage` collection for cost and budget evidence.
- TypeSafe evaluation depends on an early-access contract and Vietnamese testing; this is an open question.
- SRS §4.7 and §7, `TECH_STACK.md` §2 and §6, and `docs/module/ai.md` are amended by this decision.

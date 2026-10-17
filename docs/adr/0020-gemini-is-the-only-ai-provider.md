# ADR 0020 — Gemini is the only AI model provider

- Status: Superseded by ADR 0024 (2026-10-15), which removes the model tier. Kept for rationale.
- Date: 2026-10-15
- Supersedes: ADR 0008 (AI provider adapter with Gemini default and Jev evaluation)
- Serves: REQ-AI-001, REQ-AI-004, REQ-AI-005, REQ-AI-009, NFR-AI-001, NFR-AI-002

## Context

ADR 0008 kept Gemini as the default generative provider and left a TypeSafe Jev
adapter behind `TYPESAFE_JEV_ENABLED` as an evaluation candidate, with a
recorded evaluation as the gate before any switch.

That evaluation never happened. No TypeSafe contract was signed, SRS Q-4 stayed
open, and `TYPESAFE_JEV_ENABLED` is set in no deployment configuration,
`apphosting.yaml`, or environment file in the repository. Production `aiUsage`
holds Gemini calls only. The only Jev code that ever executed in a test was
`createJevFixtureProvider`, an offline fixture that never contacted TypeSafe.

The adapter was also unreachable by construction. `CALL_OPTIONS` in
`functions/src/modules/ai/index.ts` binds `secrets: [geminiApiKeySecret]` only,
so even with `TYPESAFE_JEV_ENABLED=true`, `process.env.TYPESAFE_API_KEY` is
undefined and `resolveAiProvider('jev')` falls through to the deterministic
adapter. `docs/module/ai.md` told the reader to add the key to the functions'
`secrets` list; that step was never taken.

So the candidate carried a second provider schema value, a second adapter, a
second cost model, a feature flag, a secret slot, and a permanent "do not switch
yet" caveat in the SRS — for a provider no deployment could reach.

## Decision

1. Gemini is the only AI model provider. `ai.provider` accepts `gemini` and
   `rule-based`, and nothing else.
2. Remove the TypeSafe Jev adapter, the `TYPESAFE_JEV_ENABLED` flag, the
   `TYPESAFE_API_KEY` secret slot, the Jev response schema, and the Jev cost
   model.
3. Keep `rule-based`. It is not a competing provider: it is the deterministic
   adapter the server falls back to when no provider secret is bound, so an
   unconfigured tenant stays deterministic and cost-free. Removing it would
   remove the fallback, not a provider.
4. Keep the one replaceable provider adapter (REQ-AI-004). Replacing Gemini
   later is a new ADR, not a Config change to a provider nobody maintains.
5. Close SRS Q-4. TypeSafe zero-retention and Vietnamese-quality terms are no
   longer open, because TypeSafe is no longer a candidate.
6. Keep the offline evaluation harness (`npm --workspace functions run
   ai:evaluate`), with the live Gemini adapter as its candidate, so a later
   model or price change can still be measured against the deterministic
   baseline on cost per useful result and Vietnamese quality. The harness never
   changes the default provider.

## Consequences

- `aiProviderSchema` loses `jev`; the AI provider interface still has two
  implementations (Gemini and the deterministic fallback) behind one adapter.
- `docs/module/ai.md`, SRS §4.7 and §7, `TECH_STACK.md` §2 and §6,
  `PRODUCT_OBJECTIVES.md`, `glossary.md`, `traceability.md`, and the M2 growth
  plan drop TypeSafe.
- Arithmetic, money, Cost, and date comparison remain in deterministic code.
- The database adds nothing: `aiUsage` already records provider, model, tokens,
  and cost per call, and continues to do so for Gemini.
- A future provider change needs a new ADR and its own evaluation, exactly as
  ADR 0008 required and as this ADR did not shortcut.

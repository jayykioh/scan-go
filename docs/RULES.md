# RULES_COMMON — Global Template — Always Active

| Source | `~/.config/opencode/docs-template/RULES_COMMON.template.md` (global) |
|---|---|

> Applies regardless of DB choice. All subagents must enforce.

---

## 1. Single Source of Truth

- `SRS.md` is contractual. `TECH_STACK.md` is binding but SRS wins if conflict.
- No code without REQ ID. No REQ without acceptance criteria and traceability row.
- Open Questions `Q-n = OPEN` → AI MUST ask via `question` tool, not invent.

## 2. File Organization — Keep Agent-Findable

- `docs/SRS.md`, `docs/TECH_STACK.md`, `docs/RULES.md` (this file's project copy), `docs/adr/`, `docs/glossary.md`
- One concept per file, ≤300 lines ideal. Links not duplication.
- Update `AGENTS.md` / `docs/README.md` index when adding files — otherwise agent can't find them.

## 3. Verification Gates (CI must block merge)

1. Golden fixtures / REQ traceability (OneFEK `NFR-C-2`)
2. Cross-tenant / role tests (Firebase: roles, Postgres: RLS)
3. Coverage floors (OneFEK: 80% overall, 95% engine/validation/metering)
4. SAST high-severity block
5. Migration safety

## 4. Language and Money Invariants

- Money = integer minor units; no floating money; explicit rounding logged.
- Time = UTC stored, IANA tz rendered; ISO-8601.

## 5. Agent Workflow

1. `srs-keeper` checks SRS completeness + traceability before code
2. `architect` checks file decisions + ADR before code
3. `worker` implements one ticket/REQ vertically (one callable + one UI slice)
4. `tester` verifies against REQ and rules (severity + file:line)

## 6. Out of Scope = Hallucination

Any feature not linked to `REQ ID` is out-of-scope and must be removed or added via approved SRS change with ADR. `Out of scope` section in map is not fog — it never graduates.

## 7. No Secrets, No Drift

- No secrets in git (keys, firebase_options.dart, .env with real values)
- No renaming package / state management without explicit request
- Keep `package.json` / `pubspec.yaml` versions pinned, lockfile committed

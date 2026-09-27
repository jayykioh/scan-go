# ADR 0006 — Use a real Firestore project and defer Emulator tests

- Status: Decided
- Date: 2026-09-26
- Serves: CON-002, NFR-SEC-001, NFR-MOD-001

## Context

The W1-01 bootstrap ticket assumes a Firebase Emulator Suite for rules tests. `docs/TECH_STACK.md` lists the Emulator Suite as the test service. SRS §12 requires Firestore Emulator tests for role, permission, tenant, and public token boundaries. The team needs the application connected to Firestore now, and local Java is not on the PATH.

## Decision

Target the real Firebase project `scango-8f0e9` for application runtime. Deploy deny-by-default Security Rules with `firebase deploy --only firestore:rules`. Use Vitest for unit and contract tests. Defer Firestore Emulator Rules tests to a later ticket that runs before the first tenant data exists.

## Consequences

- The application connects to real Firestore and Firebase Auth early.
- Automated cross-tenant Rules verification is temporarily missing.
- The SRS §12 Emulator coverage becomes tracked delivery debt.
- Rules stay deny-by-default, so no client read or write is possible yet.
- Emulator Rules tests must return before P0-002A writes tenant data.
- Local Firebase Functions emulation remains allowed for development. The UI selects it with `VITE_USE_FUNCTIONS_EMULATOR`. Auth and Firestore stay on the real project, so local Functions use real credentials and data. This does not replace the deferred automated Emulator tests.

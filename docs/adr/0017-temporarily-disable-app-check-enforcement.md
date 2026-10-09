# ADR 0017 — Temporarily disable App Check enforcement until the web client sends a token

- Status: Decided (temporary)
- Date: 2026-10-08
- Serves: NFR-SEC-002, NFR-SEC-001, CON-002

## Context

`docs/RULES_FIREBASE.md` §1 requires every write to validate authentication,
App Check, tenant, role, permission, payload, and idempotency, so
`functions/src/shared/appCheck.ts` enforces App Check by default: it skips only
when `FUNCTIONS_EMULATOR === 'true'` or `ENFORCE_APP_CHECK === 'false'`. The gate
is called from 124 places and covers every module.

The client half was never built. `src/` contains no `initializeAppCheck`, no
reCAPTCHA site key, and no App Check import of any kind. The requirement was
scoped to the server from the start: ticket P0-001 asks for "App Check validation
in `functions/src/shared/appCheck.ts`" and nothing else, and no ADR or ticket
ever covered the browser. NFR-SEC-002 is nevertheless recorded as `Done`, on
server-side evidence alone.

The production project reflects the same gap. On 2026-10-08 the web app
(`1:599208704899:web:5b977cf8b5b4a379d514b6`) had no reCAPTCHA v3 site secret
registered and no App Check debug tokens. The Firestore and Identity Toolkit
App Check services existed but were `UNENFORCED`.

The result was a gate no real client could pass. A deployed callable probed with
a browser-shaped request answered:

```
HTTP 400 {"error":{"message":"Yêu cầu thiếu App Check hợp lệ.","status":"FAILED_PRECONDITION"}}
```

Because `assertAppCheck` runs before payload validation and rate limiting, every
callable in the product was unreachable from the deployed frontend, not just the
public ordering path.

## Decision

1. Set `ENFORCE_APP_CHECK=false` for the `scango-8f0e9` deployment through
   `functions/.env.scango-8f0e9`. `firebase-tools` applies user env files to
   every function in the codebase, so one flag covers all 106 functions.
2. Do not change `appCheck.ts`, its default, or its tests. The code still
   enforces by default; only this deployment opts out. The unit evidence for
   NFR-SEC-001 and CON-002 stays valid and unchanged.
3. Do not weaken any other layer. Auth, tenant membership, role, permission,
   rate limit, and idempotency gates are untouched, and the Firestore,
   Storage, and Auth App Check services stay `UNENFORCED` exactly as they were,
   so nothing that was closed becomes open.
4. Version the flag. `.gitignore` keeps ignoring `.env*` in general and gains one
   narrow exception for this file, so a fresh clone deploys the same environment
   instead of silently re-enabling enforcement.
5. Revisit when the web client initializes App Check against a registered
   reCAPTCHA v3 provider: delete the flag, redeploy, and confirm with a browser
   request. That work needs its own approved REQ ID.

## Consequences

- Every callable is reachable from the browser again. The App Check gate no
  longer runs in production, so `docs/RULES_FIREBASE.md` §1 is not satisfied for
  App Check until the client work lands. This ADR is the recorded deviation.
- The public surface keeps its other protections. `callableOrderSubmit` still
  requires a revocable opaque Table token and still passes the per-token rate
  limit before any read or write (NFR-SEC-002); `paymentWebhookV1` still verifies
  its signature. App Check was defence in depth, not the authorisation boundary.
- The flag is deploy-time state, so changing it needs a redeploy, and a deploy
  from a machine without the file would re-enable enforcement. The versioned
  exception is what keeps the two paths from diverging.
- NFR-SEC-002's App Check clause is only partly met: the server rejects an
  invalid token correctly, but no client can present a valid one yet. Read the
  SRS row together with this ADR.
- App Check remains the right control for the unauthenticated ordering path, and
  it is cheap to add. The mistake to avoid repeating is enabling a server gate
  before the client that must satisfy it exists; a monitor-only mode would have
  surfaced the gap without breaking the product.

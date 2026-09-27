# ADR 0007 — Switch Owner authentication to email/password

- Status: Decided
- Date: 2026-09-27
- Serves: REQ-AUTH-001, NFR-SEC-001

## Context

REQ-AUTH-001 and `TECH_STACK.md` selected Firebase Auth phone OTP for Owner authentication. Phone OTP needs an SMS provider, a billing account, and a reCAPTCHA flow. The Founder wants a normal email and password registration without SMS.

## Decision

Use Firebase Auth Email/Password for Owner registration and sign-in. The web client creates the Firebase Auth user and then calls the trusted `callableAuthRegisterOwner` function. That function creates the `users/{uid}` profile, the first Tenant, and the Owner membership. Staff authentication stays tenant-scoped PIN under REQ-AUTH-002. The Owner identity carries `email` in place of `phoneNumber`.

## Consequences

- Owner auth needs no SMS provider and no phone number.
- The profile gains an `email` field. `phoneNumber` stays nullable for later contact use.
- The database must enable the Email/Password provider in Firebase Authentication.
- Email verification and password reset become available through Firebase Auth.
- SRS REQ-AUTH-001, `TECH_STACK.md` §2, and `docs/module/auth.md` are amended by this decision.

# Firestore Foundation Research

Date: 2026-09-12
Version: 1.0

## Findings
- Firestore Security Rules can use authenticated user data and document lookups to authorize access.
- Firestore listeners deliver an initial snapshot and later document changes.
- Firestore can retry transaction functions after concurrent edits.
- Transaction functions fail offline and must not directly change application state.
- Firebase custom claims support access control, but application profile data belongs in database records.
- Cloud Functions runtime options include memory, timeout, concurrency, region, and instance limits.
- Firebase recommends setting runtime options in function code to avoid configuration drift.

## ScanGo decisions supported by these findings
- Store tenant memberships in Firestore and enforce them through Security Rules and Cloud Functions.
- Treat `activeTenantId` as selection state, not proof of access.
- Use listeners for order status and bounded operational queues.
- Make order, inventory, Loyalty, and payment transactions idempotent.
- Keep Cloud Functions runtime options in deployment configuration.
- Keep ADMIN and tenant product settings separate from infrastructure settings.

## Sources
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/query-data/listen
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/auth/admin/custom-claims
- https://firebase.google.com/docs/functions/manage-functions#set_runtime_options

# ADR 0021 — The Owner operates without a Staff PIN, and a Staff membership never opens the Owner console

- Status: Decided
- Date: 2026-10-15
- Serves: REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-002, REQ-AUTH-003, REQ-ACL-001, REQ-AI-001, NFR-SEC-001

## Context

Two identities meet at the same screens, and the screens treated them as one.

The operating pages (`/operation/staff`) are opened by a Person, not a shop: a
tablet at the counter is shared, so a PIN says *who* is holding it. That gate was
the only door on the page, and the server command behind it
(`callableAuthStaffPinVerify`) accepts an active `membershipType === 'staff'`
membership only. The Owner of the Tenant — the account that owns the shop and is
already authenticated by Firebase Auth for it — therefore could not pass it: the
PIN screen answered `Bạn không thuộc cửa hàng này hoặc không phải nhân viên.
[403]` on every attempt, and the only way into their own operating pages was to
create a Staff account for themselves. In the live project, the Tenant
`first-dhCuAkXlehctZMISYWZ6FDWAo9R2` has exactly one member, the Owner, so every
attempt landed on that 403.

The mirror image was open too. `DashboardLayout` guarded only "signed in?" and
let anyone with a Firebase Auth account into the Owner console. A Staff account
that the Owner created (REQ-AUTH-003) has exactly that, so signing in on the
Owner form at `/login` rendered the console shell and its navigation.

What the client cannot decide on its own is the actual boundary, and that
boundary already exists on the server: the Rules gate the money collections to
`isActiveOwner` (or Owner-or-Cashier for `payments`) and every business callable
re-verifies the membership. A Staff membership in the Owner console sees denied
reads, not data.

## Decision

1. **An Owner membership is the Owner's session.** `useActiveMembership` reads
   the caller's own membership of the active Tenant — one document, the same
   read the shared store already makes (ADR 0015) — and `toOwnerStaffSessionView`
   turns an active `owner` membership into the operating session with every role
   tab. No PIN is verified and none is needed: the session is already
   authenticated, and an Owner membership carries no reduced role set to
   narrow.

2. **The PIN gate stays for everyone else, including a handed-over device.**
   `StaffView` seeds the Owner session once per mount, not on every render, so
   tapping Đăng xuất still drops to the PIN gate and the next person can sign in
   as themselves. A Staff membership is unchanged: PIN, roles, and the server's
   authorization.

3. **The console belongs to the membership that owns the Tenant.** An active
   non-Owner membership is redirected from `/dashboard` to `/staff`. A
   membership that is unknown or has not settled is left where it is, because
   the client is not the boundary: the redirect is there to stop a Staff member
   reading a console that will refuse them, not to be the thing that refuses
   them.

4. **The server keeps the last word.** Nothing here widens or narrows a
   permission. `dailyStats`, `aiUsage`, and `aiInsights` remain `isActiveOwner`
   reads, `payments` remains Owner-or-Cashier, and each callable keeps its own
   membership and role gate (REQ-ACL-001).

5. **The Staff sign-in page names an Owner instead of dead-ending.** `/staff`
   resolves the memberships it already reads and, when the account owns an
   active Tenant and holds no Staff membership, says so, links to `/operation`,
   and keeps Đăng xuất for handing the device to the next person. The page still
   refuses to start a PIN session for an Owner: an Owner membership has no PIN
   hash to verify and no reduced role set to issue.

## Consequences

- Opening `/operation/staff` as the Owner now costs one membership-document
  read per mount, shared with the store's own listener on the same document.
- The Owner console redirect follows the membership read, so a Staff member can
  see the console shell for the fraction of a second before that read settles.
  Nothing is exposed: every read the shell makes is refused server-side.
- A platform ADMIN (`admin: true`, no membership) is deliberately not covered.
  An ADMIN is not a member of anybody's Tenant, so the operation callables
  refuse them; the Staff PIN screen stays as it is rather than inventing a
  session the server would reject.
- An account that owns one Tenant and is Staff of another keeps the PIN flow on
  `/staff`, because it does have a Staff membership to verify (REQ-TEN-001).
- The Owner's name in the operating header comes from the Firebase Auth
  display name, else the email, else the uid; the Owner's profile display name
  in `users/{uid}` is not read for this.

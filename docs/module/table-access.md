# Table Access Module

- Serves: REQ-TBL-001, REQ-NFC-001, NFR-SEC-002
- Owns: Tables, QR and NFC links, token issue and revocation
- Does not own: Menu content or Orders

## Commands
- Create, rename, and archive a table.
- Generate or regenerate a table token.
- Record that an NFC tag was written.

## Queries
- List active tenant tables.
- Resolve one active public token to tenant and table context.

## Rules
- QR and NFC use the same opaque random table link.
- Tokens have no default expiry.
- Regeneration atomically revokes the old token.
- Public token data contains no Cost, Staff, payment, or private tenant data.
- Order submission revalidates the current token version.

## Contracts
- Emits `TableCreated`, `TableArchived`, and `TableTokenRegenerated`.

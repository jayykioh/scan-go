# Catalog Module

- Serves: REQ-CAT-001, REQ-CAT-002, REQ-KDS-001
- Owns: Private menu items and public-safe menu projection
- Does not own: Ingredient quantities, order snapshots, or table tokens

## Commands
- Create, update, archive, search, and categorize menu items.
- Configure price, modifiers, description, image, and availability.
- Initialize one approved industry template.
- Change availability after an authorized Kitchen request.

## Queries
- Owner menu with private Cost references.
- Customer public menu with active items only.

## Rules
- Never expose Cost, recipe, or private metadata in `publicMenuItems`.
- Archive referenced menu items instead of deleting them.
- A private item update and its public projection update form one authoritative command.
- Store images under tenant-scoped Firebase Storage paths.

## Contracts
- Emits `MenuItemChanged`, `MenuAvailabilityChanged`, and `PublicMenuUpdated`.

# Fulfilment Module

- Serves: REQ-KDS-001, REQ-NOT-001, REQ-WAI-001
- Owns: Kitchen and Waiter workflow coordination and notification effects
- Does not own: Orders, Inventory, Catalog, or Payment records

## Commands
- Start cooking through Ordering and Inventory contracts.
- Request ready and served transitions through Ordering.
- Request an item availability change through Catalog.

## Queries
- Kitchen queue ordered oldest first.
- Waiter ready queue.

## Rules
- Kitchen can perform `pending → cooking → ready` only.
- Waiter can perform `ready → served` only.
- Visual and audible notifications use one mute setting.
- A retry must not produce duplicate status or notification effects.
- Only Ordering mutates Order documents.

## Contracts
- Emits `CookingStarted`, `OrderReady`, `OrderServed`, and notification events.

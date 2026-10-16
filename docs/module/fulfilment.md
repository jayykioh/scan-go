# Fulfilment Module

- Serves: REQ-KDS-001, REQ-NOT-001, REQ-WAI-001, REQ-WAI-002, REQ-TBL-010
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
- The Waiter ready queue honours the area scope: a Waiter given areas receives
  only the ready Orders of those areas' tables (`tableId in …` per chunk, then
  re-bounded to the queue limit). A Waiter with no assignment keeps the
  tenant-wide queue (REQ-TBL-010, ADR 0025).

## Contracts
- Emits `CookingStarted`, `OrderReady`, `OrderServed`, and notification events.

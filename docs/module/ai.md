# AI Module

- Serves: REQ-AI-001, NFR-PRIV-001
- Owns: Read-only prompt assembly, warnings, explanations, and source references
- Does not own: Menu, price, Cost, Inventory, Orders, or configuration writes

## Queries
- Identify loss and low-profit menu items.
- Identify low ingredient stock.
- Explain the data and formula behind each answer.

## Rules
- Run Gemini through a server-side adapter.
- Read only authorized Reporting and Inventory outputs.
- Never invent Cost or recipe values.
- Return a missing-data warning when source data is incomplete.
- Do not store AI responses by default.
- Log only safe operational metadata without Customer phone or secrets.

## Contracts
- Returns structured answer, warnings, source IDs, and formula details.

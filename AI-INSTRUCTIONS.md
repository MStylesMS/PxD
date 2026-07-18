# PxD — AI Instructions

PxD is the **operator dashboard** (GM daily tool), browser-served from room packages (`room.json` / widgets).

## Docs

Read `docs/` and room `room.json` contracts before changing behaviour. Update docs in the same change as code.

## Conventions

- Conventional commits: `Docs:`, `Implement:`, `Fix:`, `Test:`, `Refactor:`, `Chore:`.
- MQTT topic structure `{baseTopic}/{commands|events|state|warnings}` is sacred.
- Suite context: Paradox escape-room suite; sibling apps under `apps/`.

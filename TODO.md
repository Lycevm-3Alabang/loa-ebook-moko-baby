# TODO — open work

Forward-looking only: **next**, **in progress**, and **pending**.
Completed work and dated decisions live in the specs under `specs/` — this file does not repeat
them.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
The owner runs it; the agent never executes CLI (H1).

## Next

- [ ] **Evaluation coverage faculty cache.** Review/finalize `specs/evaluation-coverage-faculty-cache.md`, then implement faculty-only coverage, accurate department/faculty aggregates, and period/scope local-storage caching with manual Refresh for admin and dean.

## In progress

None.

## Handovers

- `docs/evaluation-coverage-faculty-cache-handover.md` — start with the draft spec and its open owner approval.

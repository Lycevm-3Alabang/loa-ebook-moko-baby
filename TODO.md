# TODO — open work

Forward-looking only: **next**, **in progress**, and **pending**.
Completed work and dated decisions live in the specs under `specs/` — this file does not repeat
them.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
The owner runs it; the agent never executes CLI (H1).

## Next

- [ ] **Run the owner validation gate** for consistent Evaluation Results averages and exports in `specs/evaluation-results-faculty-card-average.md`.
- [ ] **Run owner validation gate for the evaluation coverage department drill-down** in `specs/evaluation-coverage-department-drilldown.md`.

## In progress

- **Consistent Evaluation Results averages:** implementation is complete for the Faculty Card, department detail/list summaries, and summary workbook/CSV exports. Owner validation remains.

## Handovers

- `docs/evaluation-results-cache-handover.md` — implementation status and remaining department-list/export work.

# TODO — open work

Forward-looking only: **next**, **in progress**, and **pending**.
Completed work and dated decisions live in the specs under `specs/` — this file does not repeat
them.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
The owner runs it; the agent never executes CLI (H1).

## Next

- [ ] **Evaluation coverage department drill-down.** Review/approve `specs/evaluation-coverage-department-drilldown.md`, then add Results-style faculty search/sorting to the admin `?dept={departmentId}` view without selection checkboxes, and fix faculty status counts that disagree with Details.

## In progress

None.

## Handovers

- `docs/evaluation-coverage-department-drilldown-handover.md` — start with the draft drill-down spec; owner review is required before implementation.

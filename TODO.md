# TODO — open work

Forward-looking only: **next**, **in progress**, and **pending**.
Completed work and dated decisions live in the specs under `specs/` — this file does not repeat
them.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
The owner runs it; the agent never executes CLI (H1).

## Next

- **Evaluation results — consolidated faculty export (Part III).** Built
  2026-10-26 (plan slices 0–9 applied; the existing department ZIP is untouched).
  ⭐ **The owner's gate and Excel proof are the open step**:
  `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`, then
  `ACES_SAMPLE_PATH=/tmp/consolidated-sample.xlsx npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts`
  and open the sample. Plan:
  `.opencode/skills/plan-fix/runs/20261026-1446-consolidated-faculty-export.md`.

## Handovers

- `docs/evaluation-coverage-department-drilldown-handover.md` — coverage drill-down, zero-row parity, and faculty-card strip removal.
- `docs/evaluation-export-handover.md` — the export area: the subject workbook, the department ZIP, and the built consolidated faculty ZIP (owner gate pending).

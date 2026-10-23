# TODO — open work

Forward-looking only: **next**, **in progress**, **pending**, and the **handovers** to start from.
Completed work and dated decisions live in the specs under `specs/` and in the handovers — this
file does not repeat them.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
The owner runs it; the agent never executes CLI (H1).

## Next

- [ ] **Admin evaluation-results cache UX.** Implement the explicit-refresh contract in `specs/evaluation-results-cache.md`: retain figures across browser reloads, remove timed refresh, and make the stale-data reminder prominent.
- [x] **E4:** Select / unselect all — one toggle in card toolbar applying to shown faculty cards (D37). Hidden selections survive.
- [x] **E5:** Docs — update spec §24 status row, verify gate run green, delete handover file.

## In progress

None.

## Resolved (owner-confirmed 2026-10-24)

The owner confirms that every formerly pending item below is complete or a no-op. Detailed outcomes were not provided. The new cache UX work is tracked separately under Next.

- [x] **Owner proofs — export.** Empty department selection is a local no-op; remaining export and workbook proofs are owner-confirmed resolved.
- [x] **Legend convergence.** Owner-confirmed resolved.
- [x] **Subject-page shared read.** Owner-confirmed resolved.
- [x] **Student CSV importer verification.** Owner-confirmed resolved.
- [x] **Home-less teachers verification.** Owner-confirmed resolved.
- [x] **Department Summary card duplication.** Owner-confirmed resolved or no-op.

## Handovers

- `specs/README.md` — status table and "Next Session — Start Here".
- `specs/` — the dated historical trail (e.g. `evaluation-results-export.md`, `evaluation-results-attribution.md`).

(End of file - total 36 lines)
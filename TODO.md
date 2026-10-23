# TODO — open work

Forward-looking only: **next**, **in progress**, **pending**, and the **handovers** to start from.
Completed work and dated decisions live in the specs under `specs/` and in the handovers — this
file does not repeat them.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
The owner runs it; the agent never executes CLI (H1).

## Next

- [ ] **E4:** Select / unselect all — one toggle in card toolbar applying to shown faculty cards (D37). Hidden selections survive.
- [ ] **E5:** Docs — update spec §24 status row, verify gate run green, delete handover file.

## In progress

E4–E5: faculty picker on department export.

## Pending

- [ ] **Owner proofs — export.** Verify export for: one department, several departments, none selected (=all departments). Confirm dean's 403 for other department and 400 for unknown faculty. Print workbook in Excel.

- [ ] **Legend convergence.** Move rating ladder from hard-coded `getRemark` to shared data readable by both remark and legend.

- [ ] **Subject-page shared read.** Ensure page and export agree by construction rather than parallel reads.

- [ ] **Student CSV importer verification.** Verify S2 + S3 browser pass; observe gate vs Needs Review behavior.

- [ ] **Home-less teachers verification.** Run SQL from `docs/evaluation-surfaces-verification.md` §7 per period.

- [ ] **Department Summary card duplication.** Decide on shared component vs inlined; not part of redesign.

## Handovers

- `specs/README.md` — status table and "Next Session — Start Here".
- `specs/` — the dated historical trail (e.g. `evaluation-results-export.md`, `evaluation-results-attribution.md`).
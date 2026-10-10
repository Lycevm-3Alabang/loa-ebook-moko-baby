# Table-First Import UI — Slim Execution Strip + Filterable Work Table

**Version:** 1.0
**Status:** Approved 2026-10-10
**Parent:** [student-import-stepper.md](../student-import-stepper.md) (C3 family)

Supersedes the unapproved *Panel blocked-row details* draft (2026-10-10): per-card
detail lists are dropped — the preview table owns row detail now.

---

## 1. Problem

Department panels and the preview table overlap without a clear contract: blocked
counts appear in three places (roll-up, panel summary, table badges) and invalid
rows in two (panel list, table) — with *less* detail in the panel. The execution
unit cannot explain what it refuses to run, and the work surface cannot run
anything. Email is display-only (`BulkStudentImport.tsx:909-911`), so a
domain-typo correction is impossible in-UI; removal or CSV re-upload are the only
paths.

## 2. Decision

**Table-first (direction A).** Each surface owns exactly one job:

- **Panels → slim execution strip.** Status + Run per department. No row detail.
- **Preview table → the single work surface.** See, filter, fix, remove.
- **Links bind the two.** A strip row's *"view"* link filters the table to that
  department's rows and scrolls to them.

## 3. Pinned contracts (challenge any only by revising this spec)

1. **Filters are view-only and never change run scope.** A Run always sends its
   whole department panel (minus removed rows), exactly as today. Per-panel
   ledger closure math is untouched. This is the bright line against
   filter-driven execution (rejected direction C).
2. **`StepPanel` is untouched.** It is a Done artifact shared with the faculty
   importer. The strip reuses it with `invalid={[]}` and a compact `summary`;
   slimming is layout (list, not 3-col card grid), not a new component.
3. **Blocked-gate unchanged.** A strip row holding blocked rows still cannot Run
   (`BulkStudentImport.tsx:791-798` logic as-is).
4. **No server change.** Route, service, ledger, reason vocabulary all untouched.

## 4. Strip (one line per panel)

Each row shows, in order:

1. **Status dot** — derived by new pure helper `panel-strip-status.ts` from
   `(panel, result?, error?)`: `not-run` / `blocked-gated` / `running` /
   `done` / `failed`. Unit-tested.
2. **`label · N rows`** + mini-counts (`ready` / `flagged` / `blocked`).
3. **Per-panel remove link** (when blocked) — existing `removeBlockedRows`
   behaviour, unchanged.
4. **One-line result or error** after a run (existing `panelResults` /
   `panelErrors` content, condensed).
5. **Run button** — today's disabled logic + confirm dialog, unchanged.
6. ***"view"* link** — sets the table's department filter (plus blocked filter
   when the row is blocked-gated) and scrolls to the table.

## 5. Table (filterable work surface)

1. **Department filter** — single-select + *"All"*, plus a *"with errors only"*
   shortcut across departments. Inline `useMemo` over `previewRows`; no new
   module.
2. **Blocked-only toggle** — kept as-is.
3. **Editable email** — same input pattern as subject/section/faculty/dept
   cells; re-validates via `isMissingEmail` / `isOffDomainEmail`; both grouping
   memos (`panels`, `studentDepartmentByEmail`) recompute because they are
   derived. Editing stays disabled while a run is active (table is already
   `pointer-events-none` under `activePanelId`).
4. **Stable row anchors + highlight** — `id="preview-row-${sourceRow}"` on each
   `<tr>`; strip *"view"* and in-table navigation compute the page, set it,
   scroll to the anchor, and highlight until the next page/filter change.
5. **Per-row × remove** — unchanged.
6. ***"Remove all shown blocked"*** — new table-toolbar verb for the current
   filter; same `removeBlockedRows` helper, new caller. The roll-up's
   *"Remove all N blocked"* (file-wide) is unchanged.

## 6. Files

| Change | Path |
|---|---|
| Edit | `features/users/components/bulk-import/BulkStudentImport.tsx` (only component touched) |
| New | `features/users/components/bulk-import/panel-strip-status.ts` |
| New | `lib/__tests__/panel-strip-status.test.ts` |
| Untouched | `FacultyImportStepper.tsx`, `app/api/import/students/*`, `lib/services/studentImport.ts`, `import-ledger.ts`, S4 (`userMap` merge, still parked) |

## 7. Risks

- **Filter-scope confusion** (admin believes the filter narrowed the Run).
  Mitigated by contract §3.1 + strip copy that always names the department
  (*"Import 4,893 rows from CCS?"*) + an explicit browser-check of
  run-after-filtering.
- **Email-edit ripple** — an edit can move rows between panels and recompute
  first-instance student identity mid-session. Memos absorb it; editing is
  disabled during runs.
- **Strip-to-table jump across pagination** — page computation + anchor, no new
  dependencies.
- **Known accepted exposure** — double-click double-append on removes (S3 note)
  gains callers of the same helper; not widened in kind.

## 8. Verification (owner runs — H1)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

Browser checklist: strip renders slim rows for all panels · blocked strip row
gates with its counts · *"view"* filters the table + lands highlighted · email
edit re-flags/regroups · filtered bulk remove hits only shown blocked rows ·
run-after-filter still sends the whole panel (ledger proves it) · faculty
importer visually untouched.

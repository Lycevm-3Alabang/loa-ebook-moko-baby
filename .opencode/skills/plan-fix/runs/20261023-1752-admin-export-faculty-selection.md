---
skill: plan-fix
story: "The export surface's next shape (spec only, no code): (1) remove the Export button from app/admin/evaluations/results/ — unwire and delete it; (2) the department page keeps ONE 'Download Excel (ZIP)' control at the top, enabled only when at least one faculty is selected; (3) the per-faculty-card ZIP buttons are removed; (4) a select/unselect-all toggle; selecting none disables the top button."
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: "A — SCAN → VISUAL → APPROVE → BUILD"
decision:
status: pending-approval
pending: "approve the five-task plan (E1–E5) written into docs/evaluation-export-department-handover.md"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | What is the story? | **The export surface's next shape** (user, 2026-10-23): remove the list-page export; one top-of-department ZIP gated on faculty selection; no per-card buttons; a select/unselect-all toggle. **Spec only — no code change.** |
| calibration | Use the last calibration (AAAAAA)? | **A — use it** (owner, 2026-10-23): compact card · diagram · 3–5 bullets · SCAN → VISUAL → APPROVE → BUILD · `Step n/N` · teach |

| visual | Approve the after-shape and the five decisions? | **Revision** (user, 2026-10-23): "these are multiple items — create separate verifiable tasks for each tracked in the handover document. be very detailed to be fed on local inference ornith:9b". The after-shape (one picker on the department page) is kept; the plan is decomposed. |
| tasks | The decomposed plan | **E1–E5 in `docs/evaluation-export-department-handover.md`** → "Next work — the faculty picker on the department export". Each task has: goal, files, exact anchors, numbered edits, acceptance, verify commands, commit message, do-not list. |

## Pending

- approval of the five-task plan (E1–E5) in the handover; then `implement-fix`, one task per commit.

## Decisions

| # | Decision |
|---|---|
| D35 | Both department pages (admin + dean). |
| D36 | Nothing selected by default; the top button is disabled. |
| D37 | Select-all acts on the search-visible cards; hidden selections persist; the label says "Select shown" / "Unselect shown" under a search. |
| D38 | All selected ⇒ omit `facultyIds` ⇒ whole department **with** the summary; a proper subset omits the summary. |
| D39 | `facultyId?: string` → `facultyIds?: string[]`; unknown member ⇒ 400; no legacy alias. |
| D40 | The list page loses the export, the row checkboxes and Clear; the routes stay. |
| D41 | D27's no-select-all was about the **department** scope; a faculty select-all inside the current department is allowed (and can still trip the size guard). |

## Scan

```text
Path (list page — to remove):
  app/admin/evaluations/results/page.tsx:233-239  DepartmentZipButton ("Export")
  → :60 selectedDepartmentIds; :335-356 row checkboxes; :260-269 Clear
  → DepartmentZipButton.tsx:34-50 startExport → downloadFromApi
  → app/api/admin/evaluation-results/export/excel/route.ts:14-60

Path (department page — the new gate):
  app/admin/evaluations/results/[departmentId]/page.tsx:182-186  top button (always enabled)
  app/dean/evaluations/results/[departmentId]/page.tsx:169-173    same (dean base)
  → DepartmentSubjectView.tsx:227-237  per-card DepartmentZipButton, facultyId={group.facultyId}
  → DepartmentZipButton.tsx:40-43  departmentIds + facultyId (SINGLE)
  → department-zip.ts:35-42 DepartmentZipOptions.facultyId?: string
  → :119-133 membership check + count for ONE id; :158 department summary omitted;
    :175-183 members/subjects filtered to ONE id
  → routes: admin :29-49 / dean :55-62

Proof:
  - lib/__tests__/department-page-export-button.test.tsx:129-151 pins the PER-CARD
    facultyId call; :75-127 pin the top button (always enabled)
  - lib/__tests__/department-zip-button.test.tsx:53-79 pin the URL with facultyId
  - lib/__tests__/department-zip.test.ts:139-147, 164-167, 304-307 pin the single-faculty filter
  - lib/__tests__/evaluation-results-workbook-export-route.test.ts:242-262 pin the route tree/scope
  - lib/__tests__/admin-results-export-button.test.tsx pins the list-page export (to be removed)
  Command: npm test (repository.md).

Teach:
  Why: the per-card button exists because the builder's filter is a SCALAR (facultyId).
  A "select which faculty" export is a SET; without widening the contract the top
  button can only export the whole department. So the filter moves from one id to a
  set at the builder boundary — the layer that names the folders — and the page
  owns the selection the button reads.
  Alternative: loop the existing route once per selected faculty (N ZIPs, N downloads)
  — no server change, but it is not "one export" and multiplies the reads.

Lens:
  - thin API routes: applies — app/api/*/export/excel/route.ts parse `facultyIds`
    and call buildDepartmentZip; no assembly in the route.
  - proxy.ts access: n/a — no new route and no new path prefix; both pages/routes
    already exist and are guarded.
  - repositories/DI: applies — the builder's reads stay via service/repository;
    no Supabase call is added or moved.
  - double-click prevention: applies — the top DepartmentZipButton gets
    disabled={selected.length === 0}; IosButton keeps its 500ms ref guard + loading.
  - role pipe-delimited: applies — admin uses requireAdmin, dean uses hasRole(DEAN);
    no client-side role branch.
```

**The read on the requirement:** the checkboxes currently on the admin list page are the *export scope picker*
— with the export gone they have no other job. The department cards already carry a checkbox-like control
(the visibility eye) but **no selection checkbox**; the selection is new UI, not a rewire.

## Plan

**The plan of record is now the handover section** —
`docs/evaluation-export-department-handover.md` → *"Next work — the faculty picker on the department
export (E1–E5)"* (written 2026-10-23, spec only, no code). Tracker:

| # | Task | One-line |
|---|---|---|
| E1 | remove the results-list export | page, checkboxes, Clear; delete the list-page test; routes untouched |
| E2 | the export contract takes a set | `facultyIds` in the builder + both routes + tests; the `facultyId` bridge until E3 |
| E3 | the picker (seam + modal + view + pages) | one gated top button, a checkbox per card, per-card ZIP gone; the largest task, one commit |
| E4 | select / unselect all | visible-scoped toggle; hidden selections persist |
| E5 | docs | `03-surface.md` v1.3, parent spec §24, summary-card, TODO, specs/README, handover |

⭐ E3 is deliberately one commit: the prop contract and its call sites cannot be split without a red
`tsc` or a lying button. ⭐ E2 keeps a two-line `facultyId` bridge so the per-card button stays
truthful until E3 deletes it — that is **not** the legacy alias D39 refuses.

## Earlier draft (superseded)

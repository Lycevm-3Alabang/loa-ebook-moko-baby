# The surface — the buttons, the scope picker, the faculty-card decision

**Version:** 1.1
**Status:** Decided (2026-10-23) — **option A** (owner). Ready to implement as slice 05.
**Parent:** [evaluation-results-export.md](../evaluation-results-export.md) (Part II, v6.0)

Where the export is offered, and what happens to the exports that are already on the page.
⭐ **The decision is taken (owner, 2026-10-23): option A** — the ZIP is real, so it is decided in
front of the artifact, not on paper.

---

## 1. Problem

The department's download needs a **button**, and the app already has export buttons in three
places:

| Where | Button | Artifact |
|---|---|---|
| the **results list** page | "Export" | the **CSV** ZIP (all departments) — it ships |
| the **department** page | "Download PDF" | the department PDF (per-subject / per-faculty) |
| the **faculty card** (in the drill-down) | "Download consolidated PDF" | the faculty's PDF |
| the **subject page** (admin · dean · faculty) | "Export Excel" | **the subject's workbook** — Part I |

The new download is the **department ZIP**. ⭐ The question the owner raised: *"where does the
export button sit, and do we still need the exports on the faculty-card level?"*

⭐ The sub-spec held that question open until the ZIP was real; it is now decided (§2).

## 2. The decision — **A** (2026-10-23)

| | Option | What ships | What comes off |
|---|---|---|---|
| **A ⭐ CHOSEN** | the **list page** (with the scope picker) · the **department page** (one department) · ⭐ the **faculty card** (one faculty) — **three surfaces** | the ZIP on all three | ⭐ **nothing** — the per-subject "Export Excel" buttons stay, and so does every PDF |
| **B** | the list page **and** the department page | two surfaces | the **admin/dean** per-subject "Export Excel" buttons (⭐ the **faculty's own** stays) |
| **C** | the **list page only** (the picker covers one / selected) | one surface | the admin/dean per-subject buttons |

- ⭐ **A is the decision (owner, 2026-10-23).** A single form on demand is still a real need (a
  dean asked for *one teacher's form*, not a ZIP), and the ZIP is the bulk artifact. ⭐ Removing
  the per-subject button would make the school unzip a 75-file ZIP to get one form.
- ⭐ **B and C are NOT taken** — every per-subject "Export Excel" button stays, and the faculty
  card's "Download consolidated PDF" stays **beside** the new per-faculty ZIP.
- ⭐ The decision is taken **with the ZIP in hand**, as this sub-spec asked; the measurement
  below is what rules out "all departments" and makes the faculty card the escape hatch.

⭐ **The measurement answers the "faculty-card level" question (2026-10-22).** GENED (199
sections) and CTHM (145) **cannot be exported as one department ZIP** — **8.2 MB** and **6.0 MB**
against the platform's ≈ **4.5 MB** ceiling — and a **faculty ZIP always fits** (≈ **300–600 KB**,
≈ **10–25 s**). ⭐ So the **faculty card's export button STAYS, and becomes the per-faculty
ZIP**: it is the only way the two biggest departments reach the school at all. ⭐ The
per-subject "Export Excel" buttons (admin · dean · faculty) stay exactly as they are.

## 3. Pinned contracts

1. ⭐ **The faculty's own page keeps its "Export Excel" button, always.** A faculty must be
   able to download their own form; the department ZIP does not reach them.
2. ⭐ **The PDF buttons stay** — every one of them, at every level (the owner's instruction:
   *"PDF excluded for now"*). ⭐ This sub-spec touches **no** PDF.
3. ⭐ **The existing CSV "Export" button on the list page stays, untouched** — it is the
   school-wide, flat-data download and it ships.
4. ⭐ **The house style**: `IosButton variant="tinted" size="sm"` with **`loading`** — the
   house's own button, not a hand-rolled `<button>` (AGENTS.md).
5. ⭐ **The error is surfaced, verbatim**: the route's message in the toast — ⭐ the size
   guard's refusal says exactly what to do ("select fewer departments"), and the admin must
   read **that**, not "Failed to export".
6. ⭐ **The dean's twin behaves like the admin's**, except that its scope is **their own
   department** — ⭐ no picker on the dean's side (they manage one department).
7. ⭐ **One read, one set**: the button asks for the **route's** ZIP; it never assembles
   anything on the client.
8. ⭐ **The faculty card calls the page's own route** — the admin's card → the admin route, the
   dean's card → the dean route. ⭐ The shared component takes the base as a **required prop**
   (`exportApiBase`), so neither page can silently call the other role's guard. ⭐ The component's
   existing `basePath` already defaults to the admin's pages (the dean's page does not pass it —
   a pre-existing navigation defect, **not** this sub-spec's); the new prop must not repeat it.
9. ⭐ **The dean's list page gains no button** — it redirects to the department page as soon as a
   period and a department are known (`app/dean/evaluations/results/page.tsx:29-34`), so a button
   there would be unreachable exactly when it is usable. ⭐ The dean's ZIP is offered on the
   **department page** and the **faculty cards**.

## 4. The buttons

- ⭐ **One seam for every call site** — `features/evaluation-results/components/DepartmentZipButton.tsx`
  (client): it owns the `downloadFromApi` call, the `loading` state, the filename and the
  verbatim error. ⭐ The pages pass `{ evaluationPeriodId, departmentIds, facultyId?, exportApiBase }`;
  none of them re-implements the fetch. ⭐ (Justified by four call sites — not a strategy layer.)
- **The admin's results list page** (`app/admin/evaluations/results/page.tsx`): the new button
  beside the existing "Export" (CSV) — ⭐ next to the **period** selector, because the period is
  the export's other input. ⭐ **No button on the dean's list page** (contract 9).
- **The department page** (`app/admin/evaluations/results/[departmentId]/page.tsx` + the dean
  twin): the button in the summary card's cluster, beside **Download PDF** — ⭐ the card is
  **duplicated** across the two pages and stays so (§26); the button is added to **both**.
- ⭐ **The faculty card** (`features/evaluations/components/DepartmentSubjectView.tsx` — the
  shared drill-down component): the **per-faculty ZIP**, next to **Download consolidated PDF**
  (the PDF stays — §3.2). ⭐ The card is used by the admin's and the dean's department pages, so
  it takes a **required** `exportApiBase` (`/api/admin/evaluation-results/export/excel` or
  `/api/dean/…`) — no role branch inside the component. The request is
  `?evaluationPeriodId=<period>&departmentIds=<the page's department>&facultyId=<the card's faculty>`.
  ⭐ The button is rendered for **every member**, not only where `facultyAggregates` has a band:
  a zero-response member still has subject-sections whose workbooks print "—" (the D25 model).
- ⭐ The button's **label** names the artifact ("Download Excel (ZIP)") — ⭐ the school must
  know it is a ZIP before the download starts, not after.

## 5. The scope picker (the list page)

- **The states**: **one department** or **a selected few** — ⭐ **bounded by the size guard**
  (≈ **90** subject-sections, measured). ⭐ **"all departments" is not offered**: GENED (199
  sections) measures **8.2 MB** and **359 s** — the platform's ceiling is ≈4.5 MB. The
  school-wide **data** is the CSV "Export" button that already sits next to it.
- **The surface**: the list page already renders **one row per department** — ⭐ the picker is
  that table's selection (a checkbox per row, plus **Clear**), not a second list.
- ⭐ **There is no "all" control** — that is the one scope D27 refuses, so an "all" checkbox
  would build a button whose whole purpose is to be refused. ⭐ A "Clear" action (shown when
  anything is selected) is the only bulk verb.
- ⭐ **The row is a link**: clicking a row drills into the department
  (`app/admin/evaluations/results/page.tsx:341-345`), so the checkbox cell must
  `stopPropagation` — ticking a department must not navigate away from the list.
- ⭐ **Nothing is selected by default** — the button refuses **locally**, with a toast ("Select
  at least one department before exporting."), the same way the period guard does
  (`:209-214`). ⭐ It sends **no** request the route would answer with a **400**.
- **The scope travels in the request** — `departmentIds` — and is the route's own parameter
  (sub-spec 02); ⭐ the picker holds **no state of its own** beyond the current selection.
- ⭐ **The picker is the admin's only** — the dean's route is their own department (§3).

## 6. The failure states

| What happened | What the user sees |
|---|---|
| the export is running | the button's `loading` state — ⭐ the export is a **download**, not a page |
| the guard refused the scope | ⭐ the route's message, verbatim — the count, the estimate, the way out |
| the route failed | the route's message, verbatim (`Failed to export: …`) — ⭐ AGENTS.md Lesson 8: surface the cause, never a generic string |
| the ZIP is incomplete | ⭐ nothing in the UI — `_INCOMPLETE.txt` **inside** the ZIP says so (sub-spec 02) |

## 7. The tests

- ⭐ **Two buttons, two accessible names.** The existing CSV button's text is **"Export"**
  (`app/admin/evaluations/results/page.tsx:261`); the new one's is **"Download Excel (ZIP)"**
  (§4). ⭐ The tests query the **text**: the CSV cases keep `name: /^export$/i`, the ZIP cases
  use `name: /download excel/i` — never a shared `/export/i`, which would match both the day a
  label changes.
- ⭐ **The admin list's ZIP cases** — `lib/__tests__/admin-results-export-button.test.tsx` (the
  existing file, a new `describe`; its four current cases are about the **CSV** button and stay
  that way): the button exists · with **no department selected** it toasts and calls **no** route
  · with one selected it calls
  `/api/admin/evaluation-results/export/excel?evaluationPeriodId=…&departmentIds=…` · it shows
  `loading` while the download runs · the route's refusal (`body.error`) is toasted **verbatim**.
- ⭐ **The button's own cases** — `lib/__tests__/department-zip-button.test.tsx` (new) against
  the shared `DepartmentZipButton` (one seam: the fetch, the loading state, the filename, the
  verbatim error), so the call sites do not each re-implement them.
- ⭐ **The placement cases** — the department pages and the faculty card render the button with
  the page's `exportApiBase` and, on the card, the card's `facultyId`. ⭐ One case proves the
  dean's card sends the **dean** route and the admin's sends the **admin** route (contract 8).
- ⭐ The **browser pass** (the owner): pick a scope → download → unzip → the tree matches
  §17.1; then the **scope proof** — the dean's route answers 403 for another department.

## 8. Out of scope

- **The route** — sub-spec 02.
- **The PDF** — ⭐ excluded by the owner's instruction; its four defects stay the PDF slice's.
- **The summary card's extraction** — the card is duplicated across the two pages and stays so
  (§26); this sub-spec adds a button to both, it does not refactor them.
- ⭐ **The per-subject "Export Excel" buttons** — not removed: option **A** is the decision (§2).

# The surface — the buttons, the scope picker, the faculty-card decision

**Version:** 1.0
**Status:** Draft (2026-10-22)
**Parent:** [evaluation-results-export.md](../evaluation-results-export.md) (Part II, v6.0)

Where the export is offered, and what happens to the exports that are already on the page.
⭐ **One decision in this sub-spec is deliberately OPEN** — it is taken here, with the ZIP in
hand, not on paper.

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

⭐ The sub-spec exists to hold that question open until the ZIP is real: the decision is
cheaper to make in front of the artifact than in front of a tree.

## 2. The decision — **OPEN** (three options)

| | Option | What ships | What comes off |
|---|---|---|---|
| **A ⭐** | the **list page** (with the scope picker) **and** the **department page** (one department) | two buttons | ⭐ **nothing** — the per-subject "Export Excel" buttons stay |
| **B** | the list page **and** the department page | two buttons | the **admin/dean** per-subject "Export Excel" buttons (⭐ the **faculty's own** stays) |
| **C** | the **list page only** (the picker covers one / selected / all) | one button | the admin/dean per-subject buttons |

- **A ⭐ recommended** — a single form on demand is still a real need (a dean asked for *one
  teacher's form*, not a ZIP), and the ZIP is the bulk artifact. ⭐ Removing the per-subject
  button makes the school unzip a 75-file ZIP to get one form.
- ⭐ **B or C are one line each** — and the surface is decided with the ZIP in hand.

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

## 4. The buttons

- **The results list page** (`app/admin/evaluations/results/page.tsx` + the dean twin): the new
  button beside the existing "Export" (CSV) — ⭐ next to the **period** selector, because the
  period is the export's other input.
- **The department page** (`app/admin/evaluations/results/[departmentId]/page.tsx` + the dean
  twin): the button in the summary card's cluster, beside **Download PDF** — ⭐ the card is
  **duplicated** across the two pages and stays so (§26); the button is added to **both**.
- ⭐ The button's **label** names the artifact ("Download Excel (ZIP)") — ⭐ the school must
  know it is a ZIP before the download starts, not after.

## 5. The scope picker (the list page)

- **The states**: **one department** (the default) · **a selected few** — ⭐ **bounded by the
  size guard** (≈ **90** subject-sections, measured). ⭐ **"all departments" is not offered**:
  GENED (199 sections) measures **8.2 MB** and **359 s** — the platform's ceiling is ≈4.5 MB.
  The school-wide **data** is the CSV "Export" button that already sits next to it.
- **The surface**: the list page already renders **one row per department** — ⭐ the picker is
  that table's selection (a checkbox per row, plus "all" / "none"), not a second list.
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

- `lib/__tests__/admin-results-export-button.test.tsx` (existing) — ⭐ the new button: it is
  there, it calls the **route** (with the period and the scope), it shows `loading` while it
  runs, and it shows the route's error message when the route refuses.
- ⭐ The **browser pass** (the owner): pick a scope → download → unzip → the tree matches
  §17.1; then the **scope proof** — the dean's route answers 403 for another department.

## 8. Out of scope

- **The route** — sub-spec 02.
- **The PDF** — ⭐ excluded by the owner's instruction; its four defects stay the PDF slice's.
- **The summary card's extraction** — the card is duplicated across the two pages and stays so
  (§26); this sub-spec adds a button to both, it does not refactor them.
- **The per-subject export's removal**, unless option **B** or **C** is chosen.

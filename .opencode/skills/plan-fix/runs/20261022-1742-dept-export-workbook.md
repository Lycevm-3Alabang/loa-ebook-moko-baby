---
skill: plan-fix
story: "The consolidated Excel export — the department-faculty grain. REVISED 2026-10-22 by the owner: ONE **ZIP** per department that **reuses the shipping per-subject export process** (Part I's workbook, verbatim, per subject-section) + **one faculty-level consolidated XLSX per faculty**. The ZIP's shape: **department folder → faculty folder → subject (and section)**; the scope: **all / one / selected departments**; the unit: **per department**. **Decomposed into six sub-specs** (owner, 2026-10-22) — the contracts first, then a **spike**, then the build."
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: "A — SCAN → VISUAL → APPROVE → BUILD"
decision: "APPROVED 2026-10-22 — the ZIP shape (the owner's redirect): one ZIP per department, **reusing the shipping per-subject export process** (Part I's workbook, verbatim) + **one faculty-level consolidated XLSX per faculty** (the D25 model, unchanged, in its own file). The ZIP's structure: **department folder → faculty folder → subject (and section)**; the scope: **all / one / selected departments**; the unit: **per department**. Decomposed into **six sub-specs** (the owner's instruction — the task is too big for one session): **01 the contracts** → **02 the spike** → **03 the building blocks** → **04 the department ZIP route** → **05 the surface** → **06 the docs**. The contracts live in `specs/evaluation-results-export.md` (→ v6.0) + the folder `specs/evaluation-results-export/` (the repo's own precedent). ⭐ **The size finding drives the design:** the 47 KB letterhead is in EVERY workbook and the inner zip is store-only → the **outer** zip must DEFLATE (≈57 KB per workbook) → a department ≈ 4.3 MB (⚠️ Vercel's ~4.5 MB response limit) → **\"all departments\" cannot be one download**, so the route refuses loudly. The per-subject \"Export Excel\" buttons and the button's home are **deferred to sub-spec 05** (options A/B/C recorded)."
status: ready-for-implement-fix
pending: "the next session's first slice — 05b: the two routes + their cases + the two spec amendments (the scope is required; an unknown department id is refused)"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | What is the story? | **the consolidated Excel export — the department-faculty grain** (Part II §15–26) |
| calibration | Use the last calibration (AAAAAA)? | **A — use it** (owner, 2026-10-22): 1 compact card · 2 diagram · 3 bullets · 4 SCAN → VISUAL → APPROVE → BUILD · 5 Step n/N · 6 teach |
| visual | The slice sequence (§24) + the read's option | **A — approved 2026-10-22** — ⚠️ **superseded by the owner's redirect** (the shape changed; the read's option is no longer needed) |
| **redirect (owner, 2026-10-22)** | Why not **reuse** the per-subject export process and ship a **ZIP**? | **ACCEPTED** — the ZIP holds **each subject-section's existing workbook (Part I, verbatim)** + a **faculty-level consolidated XLSX per faculty** |
| summary form | What is the consolidated file? | **A — one XLSX per faculty** (owner): the spec's **D25 model, unchanged** — the header block + the band + the table `SUBJECT │ SECTION │ AVG RATING │ HIGHEST │ LOWEST` — in **its own file**, reusing the existing writer. ⭐ **No new writer feature** |
| **shape (owner)** | The ZIP's structure | **department folder → faculty folder → subject (and section)**; the unit is **per department**; the scope is **all / one / selected departments** |
| **decomposition (owner)** | Is the task too big? | **YES — decomposed into six sub-specs** (owner): the contracts → the **spike** → the building blocks → the route → the surface → the docs |
| **contracts (owner)** | Where do the contracts live? | **A — `specs/evaluation-results-export.md` → v6.0 + a FOLDER `specs/evaluation-results-export/`** with one file per sub-spec (the repo's precedent: `specs/student-import-stepper.md` + `specs/student-import-stepper/`) |
| button | Where does the export button sit? | **deferred to sub-spec 05 (the surface)** — nothing upstream depends on it. The options stand: **A ⭐** (the list page + the department page; the per-subject "Export Excel" buttons stay) · B (…and the admin/dean per-subject buttons come off) · C (the list page only) |
| **plan-done** | Is this plan done? | **Done — approved 2026-10-22.** The Plan below is filled from the approved proposal |
| **who-implements** | Who implements? | **B — Code it** (owner, 2026-10-22): the agent implements; **each slice still needs "Apply this slice"** |
| **slice-1** | The contracts | **applied 2026-10-22** — `specs/evaluation-results-export.md` → **v6.0** (Part II rewritten for the ZIP: §15 the ZIP's reason · §16 **D20–D29** · §17.1 the tree · §17.2 the workbook is Part I's verbatim · §17.3 the consolidated file · §18 the field contract · §20 the reads (N + 1) · §21 the routes + the scope · §22 the mechanics · §23 the risks (the size) · §24 the six sub-specs · §25 the proofs · §26 the out-of-scope) + **`specs/evaluation-results-export/`** (`00-spike.md` · `01-building-blocks.md` · `02-department-zip.md` · `03-surface.md` · `04-docs.md`). ⭐ No code changed → the suite is unaffected (the gate is the owner's). ⚠️ `specs/README.md`'s status row still describes v5.0's shape — sub-spec **04** updates it |
| **slice-2** | The spike | **applied 2026-10-22** — `lib/__tests__/spike-department-zip.test.ts` (gated by `ACES_SPIKE=1` → **skipped by default, CI unaffected**; the imports are **dynamic** because `lib/supabase.ts` throws at import time without the env vars; ⭐ it **never asserts a size**) + `00-spike.md` §3 amended (the DEFLATE **effect** is measured by deflating the entries; the writer lands in sub-spec 01). ⭐ **The owner's run is what produces the numbers** → paste the output back and sub-spec 02's size guard is written from it |
| **slice-2 result** | The measured numbers (owner, 2026-10-22 19:57 — **CCA**, 21 subject-sections, **0 failures**) | ⭐ the **workbook** ≈ **100 KB** (min 93,614 · median 99,670 · max 106,678) — the estimate said 57 KB: the **47 KB letterhead is 47% of it**. ⭐ the **store zip** = **2.03 MB** (≈101 KB/entry) · the **deflate estimate** = **0.82 MB (40%)** ≈ **41 KB/entry**. ⭐ the **time**: department read **4,577 ms** · subject reads **33,750 ms** (21 × **1.6 s** — ≈8 sequential round trips each) · builds **86 ms** · zip 58 ms → **40 s total**. ⭐ **The time, not the size, is the tight constraint** (the builds are free — 4 ms per workbook) → the route **must parallelise** (8-way ⇒ a 75-subject department ≈ 20 s ✓ under the 60 s budget). ⭐ **DEFLATE is confirmed necessary**: the store zip for 75 subjects ≈ **7.5 MB** ❌ (> the ~4.5 MB limit) · deflated ≈ **3.1 MB** ✓. ⭐⭐ **"All departments" is impossible**: ≈400 subject-sections ≈ **16 MB** and ≈ **80 s** even 8-way → **D27's scope must change** (the owner's call) |
| **slice-2 result (the two biggest)** | The worst cases (owner, 2026-10-22 20:09 & 20:16 — **0 failures** in both) | ⭐ **GENED**: **199 sections** · workbook median **101,603** · store zip **19.63 MB** · **deflated 8.23 MB** (40%) · dept read **8,012 ms** · subject reads **346,829 ms (347 s)** · builds 1,121 ms · zip 1,143 ms → **359 s**. ⭐ **CTHM**: **145 sections** · median **103,014** · store **14.41 MB** · **deflated 6.00 MB** · dept read **9,600 ms** · subject reads **248,721 ms (249 s)** → **262 s**. ⭐⭐ **The constant holds**: ≈ **41.4 KB per workbook, deflated**, across 21 · 145 · 199 sections (and ≈ 103 KB stored — the 47 KB letterhead is 46% of it). ⭐ **The size binds first**: 4.5 MB ÷ 41.4 KB ≈ **108 sections** ⇒ **CTHM (145) and GENED (199) CANNOT be one download** (6.0 MB / 8.2 MB ❌). ⭐ **The time binds too**: 1.7 s per subject read sequential ⇒ **parallelisation is required**, and ⭐ **the parallel speed-up is NOT measured** (the spike was sequential). ⭐⭐ **The resolution: a department over the bound is exported PER FACULTY** (a faculty ZIP always fits) — ⭐ **which is the measured answer to the owner's "remove the export on faculty card levels?" — no: the faculty card's button BECOMES the per-faculty ZIP** |
| **slice-3** | The contract's measured numbers | **applied 2026-10-22** — the numbers are now in the contract: `specs/evaluation-results-export.md` (**D27** — one/a few, bounded by the guard, a department over the bound goes **per faculty** · §21 the **formula over the measurement** (41.4 KB × count vs the ≈4.5 MB ceiling ⇒ the bound ≈108, the guard refuses above ≈90) + the per-faculty export · §23 the two risk rows with the measurements) · `02-department-zip.md` (the scope table — **"all" is not offered**, **one faculty** added · §5 the threshold **TBD → measured** · §3 the **bounded pool** — parallelisation is *required*, its speed-up *unmeasured*) · `03-surface.md` (the picker's states — one / a few, bounded · ⭐ **the measured answer to the faculty-card question: the faculty card's button STAYS and becomes the per-faculty ZIP**) · `00-spike.md` **§7 — the result** (the three runs, what they decided, ⭐ the estimates superseded). ⭐ No code changed → the suite is unaffected |
| **slice-4 / B1** | The DEFLATE zip | **applied 2026-10-22** — `lib/zip-deflate.ts` (`createDeflatedZip` — ⭐ server-only, `lib/zip.ts` untouched because the client's `downloadBlob` imports it) + `lib/__tests__/zip-deflate.test.ts` (4 cases: it **round-trips through the repo's own reader** `readZip` ✓ · it is smaller than the store zip · the same names in the same order as the store zip · an empty entry and an empty archive). ⭐ The measured payoff it enables: 199 sections 19.63 MB → **8.23 MB** |
| **slice-4 / B2** | The shared builder | **applied 2026-10-22** — `lib/xlsx/subject-workbook.ts` (`buildSubjectWorkbook(input, rubricCategories, logo)` — ⭐ the input is **structural**, so `lib/` never imports `features/`; the service's `SubjectResultSet` satisfies it) + `lib/__tests__/xlsx-subject-workbook.test.ts` (7 cases — ⭐ **the route test's input assertions migrated here**, kept not lost: the criteria, the identity block, the comments' texts, the per-response rows, the letterhead · ⭐ plus the edges the route never covered: **nine criteria** (nothing assumes a criterion count) · a missing teacher ("Unknown") and a missing subject) + the **three shipping routes** now call it (admin · dean · faculty) and **drop their own `section` read** (the result set carries it — one round trip saved per export) + the route test's contract is now the **hand-off** (`the result set, the rubric, the letterhead`) + **the spike's inline copy is deleted** (it calls the builder, so the measurement stays valid and there is ONE assembly in the repo). ⚠️ The LSP caught one thing in the proposal: the builder's input field is **`evaluations`**, not `responses` (the service's name) — corrected before writing. ⭐ The bytes do not move: the result set carries the same faculty/subject/section/period the route looked up, and the input assertions moved with it |
| **slice-4 / B3** | The faculty consolidated file | **applied 2026-10-22** — `lib/xlsx/overall-summary.ts` (`buildFacultySummaryModel` · `renderFacultySummarySheet` · `buildFacultySummaryWorkbook` — the header block · the band · the five-column table; ⭐ **landscape**, the header block + the table's header row repeat on every page; ⭐ the rows are **sorted here** — the subject code, then the section label — so the order is TOTAL) + `lib/xlsx/styles.ts` (**one** token appended: `tableText` — left, **wrapped**, boxed; ⭐ **appended**, so the existing tokens' ids and every shipped workbook's bytes do not move) + `lib/__tests__/xlsx-overall-summary.test.ts` (7 cases: the header block and the band · the band's dash with no remark · a row for an unevaluated section (`—`, blank Highest/Lowest) · **every tie** comma-joined · the order · the row grows with the text · one sheet, landscape). ⚠️ The test's order expectation was wrong in the proposal (the subject code sorts **before** the section label) — corrected before running |
| **slice-5 / 05a** | The department ZIP — the assembly | **applied 2026-10-22** — `features/evaluation-results/department-zip.ts` (`buildDepartmentZip({evaluationPeriodId, departmentIds, facultyId?})` → a discriminated result: the bytes · the failures · the count · **too-large** · **unknown-department** · **nothing-to-export**) + `lib/__tests__/department-zip.test.ts` (5 cases). ⭐ **The rules live here, not in the route**: the **pool** (`mapPool`, 8-wide — the reads are ≈1.7 s each, so sequentially a 90-subject department costs 157 s) · the **guard** (`count × 41.4 KB` vs a 4,000,000-byte ceiling ⇒ ≈**96** sections — ⭐ it runs **after the department reads and before the subject reads**, so a refused export costs one read, not two hundred) · the **failure list** (a subject that could not be built is named in `_INCOMPLETE.txt` **inside** the ZIP). ⭐ Two passes: the department reads (the rows, the bands, the count) → the guard → the work. ⭐ The tree: `<DEPT-CODE>/<Faculty Name>/<subject>_<section>_evaluation.xlsx` + `<Faculty Name>_summary.xlsx`. ⭐ `facultyId` narrows the export to one member — the per-faculty export that gets CTHM and GENED to the school. ⚠️ **One rule changed from the spec:** an **unknown department id is REFUSED** (`unknown-department`), not skipped — ⭐ a typo must not quietly shrink the download (the repo's lesson: a silent loss is a *wrong* artifact). ⭐ The spec's §21/§4 lines are amended in **05b** |
| **fix (2026-10-22)** | The department ZIP's test was red | ⚠️ **the owner's run: 2 failed / 800 passed** — both in `lib/__tests__/department-zip.test.ts`. ⭐ **The cause was the test's fake letterhead**: `loadLetterhead` was mocked as `new Uint8Array([1, 2, 3])` — not a PNG → `pngAspect()` read past the end and threw → the assembly **collected** the failure (correctly ✓) and wrote `_INCOMPLETE.txt` instead of the workbook. ⭐ The **production path is sound** (`loadLetterhead()` returns the real 340×156 PNG ✓). ⭐ **The fix is the house's separation:** the **builder** is now mocked in that test (the assembly's test is about the tree, the guard, the failures and the scope — the workbook's own test owns the bytes ✓, as the route test does), plus `expect(result.failures).toEqual([])` in the tree case (so a silent failure can never pass ✓) and the guard's case now asserts the **reason** (not a vacuous `ok: false` ✓) |
| **slice-6 (partial)** | The docs — the handover to the next session | **applied 2026-10-22** — `docs/evaluation-export-department-handover.md` **updated in place (not deleted)** — ⭐ it now carries: the status (**spec'd + measured + the pieces built, not wired**) · the **measurements** (the spike's three runs) · the six sub-specs' states · **what is on disk** (the five files) · the next session's order (05b → the surface → the Excel proof) · what not to redo · and the **run file's path** ⭐ (the entry point) · `TODO.md`'s NEXT item **rewritten** (the ZIP shape, D20–D29, the measurements, the entry point, the run file) + its context line (v5.0 → **v6.0**) · ⭐ **the session closes here** — the owner asked for a handover to a new session |

## Pending

- **handoff** — `implement-fix` on this file.

## Decisions

- **Calibration reused** — AAAAAA from `20261021-1800-open-gaps.md`, owner-approved 2026-10-22.
- ⭐ **The shape (owner, 2026-10-22)**
  ```
  evaluation-results-${period}.zip
  ├── CCS/                                 ← the department folder (the unit)
  │   ├── Alamo, Nino Francisco/           ← the faculty folder
  │   │   ├── 1815-ITELEC009_BSIT-31E1_evaluation.xlsx   ← per subject (and section)
  │   │   ├── 1815-ITELEC009_BSIT-31E2_evaluation.xlsx
  │   │   └── Alamo_Nino_Francisco_summary.xlsx          ← the faculty-level consolidated file
  │   └── Dela Cruz, Juan/ …
  └── CBA/ …                               ← only when the scope is "all" or "selected"
  ```
  The subject file carries the **section** (`${subjectCode}_${sectionLabel}_evaluation.xlsx`) —
  in the faculty's folder the faculty's name is redundant. The department folder is the **code**
  (`CCS`), the CSV export's own convention.
- ⭐ **The shared builder** — the subject route's assembly becomes **one pure helper**:
  `lib/xlsx/subject-workbook.ts` → `buildSubjectWorkbook(resultSet, rubricCategories, logo) → bytes`.
  The **three shipping subject-grain routes** call it (one line each, **byte-identical output**);
  the ZIP route calls it per subject. The input is a **structural** type — no `features/` import,
  so `lib/` does not invert the layering.
- ⭐ **The size — the finding that shapes the scope** (measured 2026-10-22):
  - the letterhead PNG is **47 KB** (`public/logo-blk.png`, 340×156) and **every** workbook embeds it;
  - the workbook's own zip is **store-only** (`lib/zip.ts`) → the XML is **uncompressed**;
  - ⭐ so the **outer** ZIP must **compress**: a new **server-side** module (`lib/zip-deflate.ts`,
    Node's `zlib.deflateRawSync` — the browser's `lib/zip.ts` stays store-only and client-safe).
    ⭐ The **inner** xlsx bytes do not move (Part I untouched).
  - with DEFLATE: **≈ 57 KB per workbook** → a faculty ≈ **300 KB** ✓ · a department (75) ≈ **4.3 MB** ⚠️ ·
    all departments (≈400–800) ≈ **23–45 MB** ❌.
  - ⚠️ Vercel's Serverless Function response limit is **~4.5 MB** (verify on the plan) — so
    **"all departments" cannot be one download**. The route must **refuse loudly** (with the count
    and the size), not fail on the platform. ⭐ The escape hatch: the logo re-encoded (47 KB →
    ~12 KB) → a department ≈ **1.7 MB** ✓.
  - ⭐ **These are estimates** — the **spike** (sub-spec 00) measures them before the guard, the
    picker and the UI are built on top of them.
- **A partial ZIP is never silent** — a subject that fails to build is named in `_INCOMPLETE.txt`
  **inside** the ZIP. ⭐ The repo's lesson: a silently missing row is a *wrong* artifact.
- **The spec moves** — Part II → **v6.0**: D20 (one workbook → one ZIP) · D21 (the stacked
  Individual → dropped) · D22 (no Comments → **reversed**) · D23/D24/D25/D26 stand · D27 (the
  scope: all / one / selected) · D28 (the DEFLATE outer zip) · D29 (the folder structure).

## Scan

```
[NEW] the button — the results LIST page (admin + the dean twin), next to the existing "Export" (CSV)
  └─ lib/eval-export.ts — downloadDepartmentZip (NEW, beside downloadEvaluationWorkbook)
      └─ [NEW] app/api/admin/evaluation-results/export/excel/route.ts     (admin: the scope picker)
          ├─ [NEW] app/api/dean/evaluation-results/export/excel/route.ts  (dean: their own department)
          ├─ departmentRepository.listAll()  → the scope (all / one / selected)
          ├─ getDepartmentSubjectResults(periodId, deptId)  ← the page's own read: the rows + the bands
          ├─ rubricRepository.getCategoriesWithItems(...)   ← ONCE, hoisted out of the loop
          ├─ per subject (bounded concurrency, Promise.allSettled):
          │     getSubjectResultSet(facultySubjectId, periodId)   ← the SHIPPING subject read
          │     └─ lib/xlsx/subject-workbook.ts (NEW) → buildEvaluationWorkbook  ← UNCHANGED
          ├─ lib/xlsx/overall-summary.ts (NEW)  the faculty-level consolidated XLSX
          └─ lib/zip-deflate.ts (NEW) → createZip(entries, DEFLATE)   ← the size lever
```

**Teach — why reuse is cheaper than a new renderer.** Part I's workbook is **already** the
artifact the school receives per subject-section: the form (the letterhead, the 34 statements,
the footer), the Comments sheet and the per-response Overall sheet. A second renderer for the
same form (the stacked sheet) would be a **second implementation of a shipped artifact** — and
the writer's multi-anchor drawing is exactly where a malformed part hides (Excel offers to
*repair* the file; no assertion sees it). Reusing `buildEvaluationWorkbook` per subject makes
that class of defect **impossible by construction**: the bytes are the ones already shipping.

## Plan

### The goal

**One download for the department**: every member, every subject-section — the workbook the
school already receives per subject-section, **bundled**, plus a **faculty-level consolidated
file** per member.

### ⭐ Where this stands (2026-10-22, the session closed here)

| # | Sub-spec | State |
|---|---|---|
| 01 | **the contracts** | ✅ the spec (**v6.0**) + `specs/evaluation-results-export/` (five sub-spec files) |
| 02 | **the spike** | ✅ **measured** (three departments, 0 failures) — the numbers are in the contract and in `00-spike.md` §7 |
| 03 | **the building blocks** | ✅ `lib/zip-deflate.ts` · `lib/xlsx/subject-workbook.ts` (+ the three shipping routes) · `lib/xlsx/overall-summary.ts` |
| 04 | **the department ZIP route** | 🟡 **05a done** (`features/evaluation-results/department-zip.ts` — the pool · the guard · the tree · `_INCOMPLETE.txt`) · ⭐ **05b next** (the two routes + their cases + the two spec amendments) |
| 05 | **the surface** | ⬜ the buttons · the scope picker · ⭐ the faculty card's button = the per-faculty ZIP |
| 06 | **the docs** | ✅ the handover (`docs/evaluation-export-department-handover.md`) + `TODO.md` — ⭐ **the session closed here** (owner's call) |

⭐ **Nothing the school can see has changed** — no route serves the ZIP and no button exists; the
three shipping subject-grain routes produce **byte-identical** workbooks ✓.

### The order — six sub-specs, one commit each

#### 01 — the contracts (ships the contract, not code)

- `specs/evaluation-results-export.md` → **v6.0**: Part II rewritten for the ZIP shape. The
  decisions **D20** (one workbook → one ZIP) · **D21** (the stacked Individual → dropped) ·
  **D22** (no Comments → **reversed**) · **D23/D24/D25/D26** (unchanged) · **D27** (the scope:
  all / one / selected departments) · **D28** (the DEFLATE outer zip) · **D29** (the folder
  structure). The **status table**, the **slices** and the **proofs** follow.
- **New folder** `specs/evaluation-results-export/` with one file per sub-spec:
  - `00-spike.md` — the brief: what to measure, how, and what the numbers decide
  - `01-building-blocks.md` — the DEFLATE zip · the shared builder · the faculty summary
  - `02-department-zip.md` — the route: the scope, the structure, `_INCOMPLETE.txt`, the size guard
  - `03-surface.md` — the buttons, the scope picker, the faculty-card export decision
  - `04-docs.md` — the handover + `TODO.md`
- Each sub-spec carries: the behaviour · the fields · the rules · the proofs · **what it does
  not do** (the repo's spec convention).
- **Proof:** the contracts are the deliverable. Gate: the owner's.

#### 02 — the spike (ships nothing; it measures)

- **New** `lib/__tests__/spike-department-zip.test.ts` — **gated by `ACES_SPIKE=1`** (the
  `ACES_SAMPLE_PATH` convention → CI skips it) and skipped without the env vars.
- It builds **one department's** ZIP from the live data and **prints**: the subject count · the
  bytes per workbook (store vs deflate) · the ZIP's bytes · the wall time · the request count ·
  the number of failed subjects. It **writes** the ZIP to a path so the owner can unzip it.
- ⭐ **Nothing ships.** The numbers **amend** `specs/evaluation-results-export/02-department-zip.md`
  (the size guard's threshold, and whether "all departments" can exist at all).
- **Proof:** the owner's run. Gate: n/a (a test file that is skipped by default).

#### 03 — the building blocks (ships no surface)

- **New** `lib/zip-deflate.ts` — a **server-only** DEFLATE zip writer (Node's
  `zlib.deflateRawSync`). ⭐ `lib/zip.ts` is **untouched** (the client's `downloadBlob` imports
  it → a `zlib` import there would break the browser bundle).
- **New** `lib/xlsx/subject-workbook.ts` → `buildSubjectWorkbook(resultSet, rubricCategories, logo)
  → bytes`: the subject route's assembly (the rubric join → the criteria mapping → the form
  input → `buildEvaluationWorkbook`), extracted. The input is a **structural** type (no
  `features/` import).
- **Touched** — the **three** shipping subject-grain routes (admin · dean · faculty): each
  replaces its ~30-line assembly with **one call**. ⭐ **Their output must not move.**
- **New** `lib/xlsx/overall-summary.ts` — the faculty summary's model + renderer (the D25 model:
  the header block → the band → the table `SUBJECT │ SECTION │ AVG RATING │ HIGHEST │ LOWEST`),
  reusing the existing writer and the existing style tokens. ⭐ **No new writer feature.**
- **New tests** — `lib/__tests__/zip-deflate.test.ts` (it round-trips; it is smaller than the
  store zip) · `lib/__tests__/xlsx-subject-workbook.test.ts` (⭐ the subject route's **input
  assertions migrate here** — kept, not lost) · `lib/__tests__/xlsx-overall-summary.test.ts`
  (the band's order, the row order, the `—` for an unevaluated section, the every-tie
  comma-join, a member with no responses, a member with no subject-sections).
- **Proof:** `npm test` + ⭐ the three shipping routes' existing tests (their bytes unchanged).

#### 04 — the department ZIP route (ships an API, no button)

- **New** `app/api/admin/evaluation-results/export/excel/route.ts` — `requireAdmin` · the period
  id · the **scope** (`departmentIds`, optional → all) · `maxDuration = 60` · the filename
  `evaluation-results-${period}.zip`.
- **New** `app/api/dean/evaluation-results/export/excel/route.ts` — `hasRole(DEAN)` →
  `findByDeanId` → **their own department only** (a foreign id → 403) · `maxDuration = 60`.
- The route: the departments (the scope) → per department the department read (the rows + the
  bands) → the rubric read **once** → per subject `getSubjectResultSet` → the shared builder
  (**bounded concurrency**, `Promise.allSettled` — the CSV export's precedent) → the entries →
  the faculty summaries → the DEFLATE zip.
- The **structure**: `<DEPT>/<FACULTY>/<subject>_<section>_evaluation.xlsx` + the faculty
  summary in the faculty's folder.
- ⭐ **`_INCOMPLETE.txt`** inside the ZIP naming every subject that failed to build.
- ⭐ **The size guard**: when the selection would exceed the budget (the spike's numbers), the
  route **refuses loudly** — the count and the estimated size — instead of letting the platform
  500. (The escape hatch, if it ever trips: the logo re-encoded.)
- **Proof:** the routes' test file (the entries, the scope, the dean's 403, `_INCOMPLETE.txt`,
  the refusal) + ⭐ **the owner curls it and unzips it**.

#### 05 — the surface (ships the buttons)

- **New** `lib/eval-export.ts` → `downloadDepartmentZip` (beside `downloadEvaluationWorkbook`).
- The **results list page** (admin + the dean twin): the new button next to the existing
  "Export" (CSV) + the **scope picker** (all / one / selected departments).
- The **department page** (admin + the dean twin): a one-department button next to
  "Download PDF" (the card is **duplicated** — §26: the export adds a button to both, it does
  **not** extract the card).
- ⭐ **The faculty-card export decision — taken here, with the ZIP in hand:** the per-subject
  "Export Excel" buttons (admin · dean · **faculty**) **stay** (option A ⭐), or the admin/dean's
  come off (option B), or the list page alone carries the export (option C). ⭐ **The faculty's
  own page keeps its button either way** — they must be able to download their own form.
- **Proof:** `lib/__tests__/admin-results-export-button.test.tsx` + ⭐ the browser pass (the owner).

#### 06 — the docs

- `docs/evaluation-export-department-handover.md` → **rewritten** (the entry point: where the
  work stands · the shapes · the proofs · what not to redo). ⭐ One handover at a time — the
  file is **replaced**, not appended to.
- `TODO.md`'s NEXT row — the owner's file: **listed, not edited**.
- `specs/README.md`'s status row + the specs index.
- **Proof:** the entry point names the contracts and repeats none of them.

### The invariants (how each `applies` invariant is preserved)

| Invariant | How |
|---|---|
| API routes stay thin | the ZIP route reads, assembles the entries, returns the bytes — the CSV-ZIP route's own shape |
| proxy.ts is the access-enforcement point | ⭐ **the matcher does NOT exclude `api/`** (corrected 2026-10-22 — this table said it did). The middleware runs on the API and the API is **closed by default**; both ZIP paths sit under existing prefix grants (`/api/dean/evaluation-results` · the ADMIN fallback) ⇒ **no access change** — but a new top-level path would be a silent 403 for every dean |
| All Supabase access goes through repositories wired by DI | **no new query** — the department read, the subject read, the rubric read, all existing |
| Double-click prevention via SubmitButton | **n/a** — a download with a `loading` state |
| Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT | the dean's guard: `hasRole(…, "DEAN")` → `findByDeanId` → own-department 403 |

### The proof

- Per slice: `npm test` (repository.md: Tests).
- The full gate is **the owner's run** (H1): `npx tsc --noEmit` → `npm run lint` →
  `npx vitest run` → `npm run build`.
- ⭐ **The two proofs no test can do:** the **Excel proof** (unzip, print one subject workbook,
  print one summary — the owner's) and the **scope proof** (the dean's route answers 403/404
  for another department).

### The risks

| Risk | Handling |
|---|---|
| the **shipping routes** change | their bytes are pinned by their existing tests; the input assertions migrate to the helper's test |
| ⭐ the ZIP is **too big** for one response | the spike measures it; the guard refuses loudly; the escape hatch is the logo re-encoded (47 KB → ~12 KB) |
| ⭐ it is **too slow** (300 requests + 75 builds) | the spike measures it; the fallback is **one ZIP per faculty** — a loud fallback, not a silent one |
| a subject **silently missing** | `_INCOMPLETE.txt` names it |
| the workbook's figures vs the summary's | the subject read vs the department read — they differ only in the live-eval (§3.19) and legacy NULL-period (D8) cases, both pre-existing and documented |
| Excel **repairs** a file | ⭐ **impossible by construction** — the bytes are the ones already shipping |

### The blast radius

| What changes | Who else reads it | What breaks if it is wrong |
|---|---|---|
| the subject route's assembly → **one shared helper** | the **three** shipping subject-grain routes (admin · dean · faculty) | their **bytes** must not move — their existing tests pin them |
| `lib/xlsx/workbook.ts` · `lib/xlsx/writer.ts` | the three subject routes | ⭐ **untouched** under the redirect |
| `getDepartmentSubjectResults` · `getSubjectResultSet` | 4 + 3 route callers | ⭐ **untouched** — the page's payload does not change |
| `lib/zip.ts` | the client's `downloadBlob` (`CoveragePage`) + the CSV-ZIP route | ⭐ **untouched** — the DEFLATE writer is a **separate server-only module** |
| the results list page (+ a button + a picker) | the admin + the dean twin | the two must behave identically |
| the per-subject "Export Excel" buttons | the admin/dean/faculty subject pages | ⭐ **the owner's call — sub-spec 05** |
| the **spec** + the **handover** | `specs/evaluation-results-export.md` Part II · `docs/evaluation-export-department-handover.md` | ⭐ the shape changed → **v6.0** + the sub-spec folder; the handover rewritten |

### Out of scope

- The **stacked** workbook (one file with every form) — **dropped** (the owner's redirect).
- The **period-level CSV** export — it ships today, untouched.
- The **PDF** — untouched (its four defects stay the PDF slice's).
- The **dean twin's duplicated summary card** — a separate CLEANUP item; this export adds a
  button to both pages, it does **not** extract the card.
- The **sentiment** figure, the **HTML preview**, the **legend** — other slices.
- Any **database** change (H4).

### The open questions — deferred, none blocking

| # | The question | Lands in |
|---|---|---|
| 1 | **where the button sits** (A ⭐ list + department page, the per-subject exports stay · B …and they come off · C the list page only) | sub-spec **05** |
| 2 | the **size guard's threshold** and whether "all departments" can exist | sub-spec **02** (the spike measures it) |
| 3 | the **60 s budget** | sub-spec **02** |
| 4 | **D26** (every tie) — veto it and the export takes the first tie only | any time — the spec's default stands |

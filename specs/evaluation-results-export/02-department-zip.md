# The department ZIP route

**Version:** 1.1
**Status:** Applied 2026-10-22 (**05a** the assembly · **05b** the two routes)
**Parent:** [evaluation-results-export.md](../evaluation-results-export.md) (Part II, v6.0)

The API that assembles the department ZIP. ⭐ It ships an **API, not a button** — the surface
is sub-spec 03, so this slice can be curled and unzipped before any UI depends on it.

---

## 1. Problem

The department page can show a faculty card, but it cannot hand the school the **files**. The
school asks for one download covering the whole department (D27), and the app has no route
that produces one.

The route has to do three things at once: **scope** (all / one / selected departments), **size**
(the response limit is a hard platform boundary), and **honesty** (a subject that fails must
not vanish).

## 2. The decisions

| # | Decision |
|---|---|
| R1 | ⭐ **One route per role**: the admin's takes the **scope**, the dean's is **their own department** — ⭐ a foreign id is **refused** (**403**), never ignored |
| R2 | ⭐ The **structure** is the ZIP's tree (§17.1): `<DEPT>/<FACULTY>/<subject>_<section>_evaluation.xlsx` + the consolidated file |
| R3 | ⭐ A **partial ZIP is never silent** — `_INCOMPLETE.txt` inside the ZIP names every subject that failed to build |
| R4 | ⭐ The **size guard** refuses loudly, with the count and the estimate — the threshold is **measured** (`00-spike.md`) |
| R5 | ⭐ The **order is total** — the departments by name, the members by name (the id as the tiebreak), the rows by subject code then section label |
| R6 | ⭐ **A scope that matches nobody is REFUSED** — an unknown department id, a `facultyId` that is not a member. ⭐ An empty ZIP would be a quiet wrong artifact |

## 3. Pinned contracts

1. ⭐ **No new query.** The route reads the department read, the subject read and the rubric
   read — all existing (§20). ⭐ The rubric is read **once** for the whole export, not once per
   subject.
2. ⭐ **The guards do not move.** The admin's route is `requireAdmin`; the dean's is
   `hasRole(DEAN)` → `findByDeanId` → **their own department** (a foreign id → **403**) →
   `assertPeriodIsActive`. ⭐ The export must never become a way around a read route's 403.
   ⭐ **The middleware runs on `/api/`** — `proxy.ts`'s matcher does **not** exclude it — and the
   API is **closed by default**: an unconfigured path is refused **before** the route's own
   guard. ⭐ Both paths sit under the existing prefix grants (`/api/dean/evaluation-results`;
   the ADMIN fallback), so **no access-configuration change is needed**.
3. ⭐ **`maxDuration = 60`** on both routes (the read is live — rule 3 of the cache contract)
   — ⭐ and the **subject reads run in a bounded pool**: the measurement is ≈ **1.7 s per
   subject** (≈8 sequential round trips), so 199 subjects cost **347 s** sequentially. ⭐
   **Parallelisation is required, not optional** — ⭐ and its speed-up is **not measured** (the
   spike was sequential; the contention is unknown), so the pool's size is the thing to watch in
   production.
4. ⭐ **The scope cannot exceed the response budget** — the guard refuses with a **message**,
   never a platform 500. ⭐ The refusal names the count, the estimate and the way out.
5. ⭐ **A failed subject is recorded, never dropped** — `_INCOMPLETE.txt` inside the ZIP.
6. ⭐ **The response** is `application/zip` with the filename
   `evaluation-results-<periodId>.zip` — the CSV export's own convention.
7. ⭐ **The order is total** (R5) — two exports of the same data hold the same entries in the
   same order (Lesson 7b's rule).
8. ⭐ **The entries are the shipping bytes** — the workbook the subject route serves, byte for
   byte (the shared builder, sub-spec 01).
9. ⭐ **The scope is REQUIRED** (the admin's route) — a missing `departmentIds` is a **400**.
   ⭐ **"all departments" is not offered** (D27, measured) — the picker offers one department or
   a few.
10. ⭐ **A scope that matches nobody is REFUSED** (R6) — an **unknown department id** (**400**,
    naming it) and a **`facultyId` that is not a member of the scope** (**400**, naming the
    faculty and the department). ⭐ Neither is skipped: a skipped id would quietly shrink the
    download, and an empty ZIP would be a quiet wrong artifact.
11. ⭐ **The refusals are ONE verdict** — `verdictForDepartmentZip` (in the feature) decides the
    status and the message; the route decides the `NextResponse`. ⭐ So the admin's route and
    the dean's twin cannot disagree about a refusal. **400** (too large · unknown department ·
    unknown faculty) · **404** (the period is not there) · **500** (the error names itself —
    Lesson 8).

## 4. The scope

| Scope | The parameter | The dean's route |
|---|---|---|
| **one department** | `departmentIds=<id>` | their own only |
| **a selected few** | `departmentIds=<id>,<id>,…` | their own only |
| **one faculty** | `departmentIds=<id>&facultyId=<id>` | their own only |
| ~~all departments~~ | — | ⭐ **not offered** — measured: GENED (199 sections) ⇒ **8.2 MB** deflated and **359 s**; the ceiling is ≈ **4.5 MB**. The school-wide **data** is the CSV ZIP that ships today |

- The admin's route hands the parameter's ids to the assembly, which **resolves each one**;
  ⭐ an **unknown id is REFUSED** (**400**, naming it) — not skipped: a typo must not quietly
  shrink the download.
- The dean's route **does not ignore** the parameter: with no `departmentIds` it answers for
  their own department, and a **foreign id is REFUSED** (**403**).
- ⭐ **The scope is a choice, not a convenience**: "all" may exceed the response budget, and
  the guard says so (R4).

## 5. The size guard

- ⭐ **The threshold is MEASURED** (`00-spike.md` §7 — three departments, 2026-10-22):

  > **≈ 41.4 KB per workbook** (deflated) · ≈ **103 KB** stored · a workbook ≈ **100 KB** (the
  > **47 KB letterhead is 46% of it**) · **0 failures** in all three runs. ⭐ The constant holds
  > across **21 · 145 · 199** sections.

  So the estimate is `subjectSections × 41.4 KB` against the platform's ≈ **4.5 MB** ceiling ⇒
  ≈ **108 sections**; ⭐ the guard refuses above ≈ **90** (a margin), with the count and the
  estimate in the message.
- ⭐ **A department over the bound is exported PER FACULTY** — a faculty ZIP (a handful of
  sections, ≈ **300–600 KB**, ≈ **10–25 s**) always fits. ⭐ The faculty card's button is that
  export (sub-spec 03).

- **The refusal** is a **400** with a message that names: the number of subject-sections, the
  estimated size, and the way out ("select fewer departments" / "one department at a time").
  ⭐ It is loud and specific — a silent truncation is a *wrong* artifact (Lesson 7b).
- ⭐ **The guard is checked before the work**, not after: the route counts the selection's
  subject-sections from the light read (the term's assignments) and refuses **before** it
  spends the budget.
- ⭐ **The escape hatch**, if a single department ever trips it: the **letterhead** is the
  binding cost (47 KB in every workbook) — re-encoding it (→ ≈12 KB) brings a department to
  ≈ **1.7 MB**. ⭐ That is a **product** change to the school's logo file, and it is the
  owner's call.

## 6. The structure

```
evaluation-results-<periodId>.zip
├── <DEPT-CODE>/
│   ├── <Faculty Name>/
│   │   ├── <subjectCode>_<sectionLabel>_evaluation.xlsx
│   │   ├── …
│   │   └── <Faculty Name>_summary.xlsx
│   └── <Faculty Name>/ …
└── _INCOMPLETE.txt        ← only when a subject failed to build
```

- The **department folder** is the code (`CCS`); the **faculty folder** is the member's name;
  the **subject file** carries the subject code and the section label (§17.1).
- ⭐ The names are **ZIP entry names** — the workbook inside is unchanged.
- ⭐ **`_INCOMPLETE.txt`** lives at the ZIP's root and names every subject that failed, with
  the error. ⭐ Its presence is the signal: a ZIP without it is complete.

## 7. The routes

| Route | Guard | Parameters | Response |
|---|---|---|---|
| `app/api/admin/evaluation-results/export/excel/route.ts` | `requireAdmin` | `evaluationPeriodId` (or `semesterId`), ⭐ **`departmentIds`** (comma-separated), `facultyId?` | `application/zip`, `evaluation-results-<periodId>.zip` |
| `app/api/dean/evaluation-results/export/excel/route.ts` | `hasRole(DEAN)` + their own department + `assertPeriodIsActive` | `evaluationPeriodId` (or `semesterId`), `departmentIds?` (their own only), `facultyId?` | the same |

- Both are **thin**: parse → the service reads → the entries → the zip → the response. ⭐ The
  assembly lives with the blocks (sub-spec 01), not in the route.
- The dean's **403** for a foreign department is the **scope proof** (§25).
- ⭐ **One verdict for the refusals** — the route asks the feature what the answer is
  (`verdictForDepartmentZip`) and turns it into a `NextResponse`; the **status and the message
  live in the feature**, so the two routes cannot disagree.

## 8. The tests

- ⭐ **The assembly's test** (`lib/__tests__/department-zip.test.ts`) owns the **tree** (the
  entries and their names) · the **guard's refusal** (the count and the estimate) · the
  **failures** (`_INCOMPLETE.txt`) · the **scope** (one / a faculty / an unknown id).
- ⭐ **The routes' test** (`lib/__tests__/evaluation-results-workbook-export-route.test.ts` — the
  subject-grain routes' file, extended) owns the **hand-off** (the scope parsed → the assembly
  called with it) and the **guards**: the non-admin's **403** · the **required scope** and the
  **required period** (**400**) · the **unknown department** (**400**) · the **size guard's
  refusal** (**400**, with the count and the estimate) · the **dean's own department** · the
  **foreign department's 403** · the **inactive period** · the dean's **404**. ⭐ The route's
  test runs the **real assembly** (the service, the builder and the letterhead are mocked), so
  it proves the whole chain: the scope → the tree → the bytes the browser receives.
- ⭐ **The verdict's test** (the assembly's test file) owns the **statuses and the messages** —
  one place, so the two routes cannot drift.
- ⭐ **The owner's curl**: the route is run by hand, the ZIP is unzipped, and the tree is
  checked against §17.1.

## 9. Out of scope

- **The buttons** and the scope picker — sub-spec 03.
- **The size threshold's value** — it comes from the spike (`00-spike.md`); this sub-spec is
  **amended** when the numbers land.
- **A change to the subject-grain routes** — the shared builder (sub-spec 01) already did it.
- **The CSV export** — untouched; it ships.

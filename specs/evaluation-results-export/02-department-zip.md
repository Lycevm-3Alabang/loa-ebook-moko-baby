# The department ZIP route

**Version:** 1.0
**Status:** Draft (2026-10-22)
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
| R1 | ⭐ **One route per role**: the admin's takes the **scope**, the dean's is **their own department** |
| R2 | ⭐ The **structure** is the ZIP's tree (§17.1): `<DEPT>/<FACULTY>/<subject>_<section>_evaluation.xlsx` + the consolidated file |
| R3 | ⭐ A **partial ZIP is never silent** — `_INCOMPLETE.txt` inside the ZIP names every subject that failed to build |
| R4 | ⭐ The **size guard** refuses loudly, with the count and the estimate — the threshold is **measured** (`00-spike.md`) |
| R5 | ⭐ The **order is total** — the departments by name, the members by name (the id as the tiebreak), the rows by subject code then section label |

## 3. Pinned contracts

1. ⭐ **No new query.** The route reads the department read, the subject read and the rubric
   read — all existing (§20). ⭐ The rubric is read **once** for the whole export, not once per
   subject.
2. ⭐ **The guards do not move.** The admin's route is `requireAdmin`; the dean's is
   `hasRole(DEAN)` → `findByDeanId` → **their own department** (a foreign id → **403**) →
   `assertPeriodIsActive`. ⭐ The export must never become a way around a read route's 403.
3. ⭐ **`maxDuration = 60`** on both routes (the read is live — rule 3 of the cache contract).
4. ⭐ **The scope cannot exceed the response budget** — the guard refuses with a **message**,
   never a platform 500. ⭐ The refusal names the count, the estimate and the way out.
5. ⭐ **A failed subject is recorded, never dropped** — `_INCOMPLETE.txt` inside the ZIP.
6. ⭐ **The response** is `application/zip` with the filename
   `evaluation-results-<periodId>.zip` — the CSV export's own convention.
7. ⭐ **The order is total** (R5) — two exports of the same data hold the same entries in the
   same order (Lesson 7b's rule).
8. ⭐ **The entries are the shipping bytes** — the workbook the subject route serves, byte for
   byte (the shared builder, sub-spec 01).

## 4. The scope

| Scope | The parameter | The dean's route |
|---|---|---|
| **all departments** | no `departmentIds` | ⭐ **their own only** — the dean never gets a school-wide ZIP |
| **one department** | `departmentIds=<id>` | their own only |
| **a selected few** | `departmentIds=<id>,<id>,…` | their own only |

- The admin's route reads `departmentRepository.listAll()` and filters by the parameter;
  ⭐ an **unknown id** is skipped, not fatal — and the ZIP says what it carries.
- The dean's route **ignores** the parameter: it answers for their department, always.
- ⭐ **The scope is a choice, not a convenience**: "all" may exceed the response budget, and
  the guard says so (R4).

## 5. The size guard

- ⭐ **The threshold comes from the spike** (`00-spike.md`) — ⭐ the number below is **not yet
  measured**:

  > **TBD — the spike's numbers.** The estimate is ≈ **4.3 MB** per department and ≈ **23–45 MB**
  > for all departments; the platform's limit is ≈ **4.5 MB**.

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
| `app/api/admin/evaluation-results/export/excel/route.ts` | `requireAdmin` | `evaluationPeriodId`, `departmentIds?` | `application/zip`, `evaluation-results-<periodId>.zip` |
| `app/api/dean/evaluation-results/export/excel/route.ts` | `hasRole(DEAN)` + their own department + `assertPeriodIsActive` | `evaluationPeriodId` | the same |

- Both are **thin**: parse → the service reads → the entries → the zip → the response. ⭐ The
  assembly lives with the blocks (sub-spec 01), not in the route.
- The dean's **403** for a foreign department is the **scope proof** (§25).

## 8. The tests

- The routes' test file (`lib/__tests__/evaluation-results-workbook-export-route.test.ts` —
  the subject-grain routes' file, extended): the **entries** the ZIP holds (the tree, the
  names) · the **scope** (all / one / selected / an unknown id) · the **dean's 403** · the
  **dean's** own department · **`_INCOMPLETE.txt`** when a subject fails · ⭐ **the guard's
  refusal** (the count and the message).
- ⭐ **The owner's curl**: the route is run by hand, the ZIP is unzipped, and the tree is
  checked against §17.1.

## 9. Out of scope

- **The buttons** and the scope picker — sub-spec 03.
- **The size threshold's value** — it comes from the spike (`00-spike.md`); this sub-spec is
  **amended** when the numbers land.
- **A change to the subject-grain routes** — the shared builder (sub-spec 01) already did it.
- **The CSV export** — untouched; it ships.

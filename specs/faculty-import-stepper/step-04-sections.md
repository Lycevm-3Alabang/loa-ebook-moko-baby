# Step 4 — Sections

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [faculty-import-stepper.md](../faculty-import-stepper.md).

---

# Purpose

Resolve every section in the file to an id, upserting any that do not exist. Sections hang
off a course, so this step is where a missing course becomes a visible failure rather than a
silently dropped row.

# Position

| | |
|---|---|
| Depends on | step 3 (`programToCourseId`) |
| Produces | `sectionKeyToId: Map<string, string>` consumed by step 7 |
| Distinct values (2026-1 file) | 142 sections, 100% already loaded after the seed |

# Request

```ts
POST /api/import/faculties
{ step: "sections", semesterId, fileId, items: { name: string; program: string }[] }
```

# Server work

```
for each distinct (name, program):
  courseId = programToCourseId.get(program)
  if !courseId → classify INVALID ("No department course found for program X")
  else → sectionItems.push({ name, program, departmentCourseId: courseId })

{ data, created } = sectionRepository.upsertMany(sectionItems)
inserted = created
existing = sectionItems.length - created
```

`sectionRepository.upsertMany` (`section.repository.ts:21`) already returns
`{ data, created }`, so **`inserted` comes directly from the repository and no counting
logic is needed**. `created` is the number of rows actually inserted.

# Classification rules

| Outcome | Rule | Counted as |
|---|---|---|
| Row already existed | `upsertMany` returns it in `data` but not in `created` | `existing` |
| Row inserted | counted in `created` | `inserted` |
| Program has no course | `programToCourseId` miss | `invalid` — reason: `No department course found for program "X"` |

This maps cleanly onto the current service, which reports `createdSections` from the same
`created` value.

# Data note

`sections` is `UNIQUE(name, program)` (`supabase-schema.sql:702`), and the key used
throughout the service is `` `${sectionName}|${sectionProgram}` ``. The client must trim the
section string before splitting it — the real file carries trailing whitespace on **22,099
of 28,096 rows**, and an untrimmed `BSIE-41M2 ` would produce a spurious new section.

# Idempotency

`upsertMany` is inherently idempotent. Re-running reports `inserted: 0`, `existing: 142`.

# Edge cases

- **Section string parsing** — split on the first `-`, else the first space, per
  `parseSectionIdentifier` (`etlEvaluation.ts:5-16`). A section with neither (e.g. `Main`)
  parses to `program: ""`, which will have no course → `invalid`, correctly.
- **`departmentCourseId` is `NOT NULL`** — a section must never be inserted without a
  resolved course. The `if (!courseId)` guard is load-bearing, not defensive.
- **Duplicate keys** — deduplicate `(name, program)` client-side before sending; sending
  142 items rather than 28,096 is the whole point of this step.

# Tests required

| Test | Asserts |
|---|---|
| upserts all distinct sections | `upsertMany` called with 142 items |
| splits created from existing | `inserted === created`, `existing === items.length - created` |
| program without course flagged | `invalid` contains the program reason; that section never sent |
| trailing whitespace trimmed | `BSIE-41M2 ` and `BSIE-41M2` produce one item |
| composed path unchanged | existing `importFacultySubjects` assertions still pass |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

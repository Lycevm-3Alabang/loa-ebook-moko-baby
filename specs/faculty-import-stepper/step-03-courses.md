# Step 3 — Courses

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [faculty-import-stepper.md](../faculty-import-stepper.md).

---

# Purpose

Resolve every course (department_course) referenced by the file, creating any missing. A
course is created with a **visibly synthetic name** so it is easy to find and rename later.

# Position

| | |
|---|---|
| Depends on | step 2 (`deptCodeToId`) |
| Produces | `programToCourseId: Map<string, string>` consumed by step 4 |
| Distinct values (2026-1 file) | 16 programs, unambiguous |

# The critical constraint

`department_courses` is **`UNIQUE("departmentId", code)`** (`supabase-schema.sql:388`) — the
`code` column alone is **not** unique. A course may only be looked up and created by the
**pair**.

> `departmentCourseRepository.findByDepartmentAndCode(departmentId, code)` must be used.
> **Never** look a course up by `code` alone.

# Request

```ts
POST /api/import/faculties
{ step: "courses", semesterId, fileId, pairs: { departmentCode: string; program: string }[] }
```

`pairs` is the distinct set of `(departmentCode, program)` from the file. The client derives
`program` from the section string's prefix before the first `-` or space.

# Server work

```
for each pair:
  departmentId = deptCodeToId.get(pair.departmentCode)
  if !departmentId → classify INVALID  ("no department for code X") and skip
  existing = departmentCourseRepository.findByDepartmentAndCode(departmentId, pair.program)
  if existing → classify EXISTING, map program → existing.id
  else:
    try   created = create({ departmentId, code: program, name: `${program} [unmapped]` }) → INSERTED
    catch 23505 → re-read the pair → EXISTING if found, else rethrow
```

The `[unmapped]` marker is the user-approved choice: it makes a synthetically created course
visibly incomplete in course pickers, so it is safe to discover later. The seeded convention
is expanded names (`'BSIT'` → `'Bachelor of Science in Information Technology'`), so a bare
`name = code` would be a visible regression; the marker avoids that ambiguity.

# Classification rules

| Outcome | Rule | Counted as |
|---|---|---|
| Found by pair | `(departmentId, code)` resolves | `existing` |
| Created | `create` succeeded | `inserted` |
| Found after `23505` | racing caller inserted the same pair | `existing` |
| Program with no resolvable department | `deptCodeToId` has no entry | `invalid` — reason: `No department for course "X"` |
| Blank program | `program.trim().length === 0` | not sent; excluded client-side |

# Data guarantee (verified)

The 2026-1 file has **16 programs mapping to exactly 16 distinct departments, with zero
ambiguity** — no program appears under two departments. So the `departmentId` derivation is
unambiguous for this file. The spec still assumes a file *could* violate this; if it does,
the pair-based lookup keeps the inserts correct but the resulting `programToCourseId` map
would be first-writer-wins, which is a documented limitation rather than a corruption risk.

# Idempotency

Re-running reports `inserted: 0`, `existing: 16`.

# Edge cases

- **Looking up by code alone** would match a course belonging to a *different* department
  and attach sections to the wrong course. This is the single highest-risk mistake in this
  step; the pair lookup is mandatory.
- **Program string variance** — leading/trailing whitespace must be trimmed before lookup;
  the section column in the real file has trailing spaces on 22,099 rows.
- **Fallback warning** — the previous `"No department course found for program"` error
  remains reachable, but only when step 2 failed to produce a department for that program.

# Tests required

| Test | Asserts |
|---|---|
| creates missing courses with marked name | `inserted === 16`, `create` called with `name: "BSIE [unmapped]"` |
| reuses existing courses by pair | `inserted === 0`, `existing === 16` |
| program without a department flagged | `invalid` contains the program; no insert attempted |
| `23505` re-read yields existing | `existing` incremented, no throw |
| composed path unchanged | existing `importFacultySubjects` assertions still pass |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

---
skill: plan-fix
story: C1 integrity + C2 batched resolution per specs/student-import-stepper.md §7 and §9 (7 defects, no UI layer, no CSV measurement dependency)
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "Option A — C1 integrity + C2 batched resolution, zero new interface methods. semesterId derived server-side via findActive(). D8 (stale UNIQUE constraint vs live schema) rides in C2."
status: implementing
pending: slice-1
---

# Plan — session

## Progress

| id | question | answer |
|----|----------|--------|
| story | What to plan | B — C1 integrity + C2 batched resolution |
| calibration-pre | Use last calibration (1C 2E 3B 4A 5A 6A)? | A — Use it |
| visual | Approve the visual proposal? | A — Option A, then narrowed by the semesterId decision; see D8 |
| semesterid | Insert semesterId from the active semester? | A — derive server-side via `semesterRepository.findActive()` |
| batched | Batched reads: new methods or reuse `list()`? | B — 0 new methods; reuse `list()` / `list({ semesterId })` |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, plus client error surfacing |
| who-implements | Who implements? | B — Code it |

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**Client error surfacing — added at approval, before the first slice.**

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

**semesterId — DECIDED: derive server-side from the active semester.**
`semesterRepository.findActive()` (`features/admin-data/semester.repository.ts:22-27`) exists and
is wired at `lib/repositories/factory.ts:55`. The route calls it and 400s when it returns `null`.
The client-sent `semesterId` becomes advisory, not authoritative — it can no longer be null,
stale, or mismatched. This closes D1 at the only layer that cannot be bypassed. The UI already
offers only the active semester (`EnrollmentsTab.tsx:47` filters `isActive`), so deriving it costs
the admin nothing.

> Nuance worth stating: `findActive()` returns `null` both when **no** semester is active and when
> **more than one** is. The 400 message must distinguish them, or an admin who accidentally
> activated two gets told "no active semester" and chases the wrong problem. A `list({ isActive:
> true })` length check alongside the `findActive()` call resolves it.

## Pending

- id: handoff
- prompt: Plan file is ready. Run implement-fix with it?
- options:
  - A. Yes
  - B. No
  - Other.. type your thoughts

**STALE SPEC CLAIM — found while checking, affects this decision.**
`step-07-mappings.md:35` states: "`faculty_subjects` is **`UNIQUE(subject_id, section_id)`**
(`supabase-schema.sql:713`)". That is the **base** `CREATE TABLE` at `supabase-schema.sql:711`.
Migration 20 drops that constraint and replaces it:
`supabase-schema.sql:1029` drops `faculty_subjects_subject_id_section_id_key`, and `:1034` adds
`UNIQUE(subject_id, section_id, "semesterId")`.

So a `(subject, section)` pair **may hold one row per semester**. Two live methods violate that:

| Method | Filter | Problem |
|---|---|---|
| `findBySubjectAndSection` `faculty-subject.repository.ts:62-72` | `subject_id`, `section_id` — **no semester** | `.maybeSingle()` against a multi-row-per-semester constraint |
| `findBySubjectSectionAndFaculty` `:76-86` | + `faculty_id`, **no semester** | same |

`findBySubjectSectionSemester` (`:88-106`) filters correctly but is declared **optional** in the
interface (`lib/types/evaluation.ts:401`) and has **no production caller**.

Reachable from the student import at `studentImport.ts:220` (blank-faculty fallback) and `:214`.
**Either it throws, or — if PostgREST codes the multi-row case `PGRST116` — the handler returns
`null`** and the row is rejected as *"No faculty assigned to X in Y"* (`studentImport.ts:222`), a
false reason. Which of the two happens needs one confirming read; the fix is needed either way.

This is **D8**, new, and it lands in C2 with the batched lookup — because the batched method must
group by `(subject_id, section_id, "semesterId")` anyway, per `step-03-enrollments.md`. Doing the
batch without the semester key would reproduce the bug at scale.

**Useful consequence:** `facultySubjectRepository.list({ semesterId })`
(`faculty-subject.repository.ts:5-13`) is **already semester-aware and already exists** —
`etlEvaluation.ts:455-456` uses exactly that call. So the faculty-subject batch needs **no new
method at all**; only subject and section are in question.

## Decisions

**Scope** — C1 integrity + C2 batched resolution. C3 (per-department stepper) excluded; it is the
only slice that needs the 2026-1 CSV measurements first (`specs/student-import-stepper.md` §10).

**Gold paths** — read-first, in `repository.md` order:
`app/api/` (route thinness, guard alignment) → `features/` (repository + service) →
`lib/repositories/factory.ts` (DI wiring) → `lib/auth.ts` (not touched; guard uses session only).

**Proof command** — `npm test` (`vitest run`). Baseline 259 tests / 18 files, all green as of
`20261009-1706-faculty-stepper-step-07.md`. Type gate `npx tsc --noEmit`, lint `npm run lint`.

**Invariant lens** — how each `applies` invariant is preserved:

| Invariant | Applies | How preserved |
|---|---|---|
| API routes stay thin | yes — `app/api/import/students/` | semester guard + `reasonCode` mapping are parse/validate/return. No classification logic moves into the route |
| proxy.ts is the access point | **n/a** | no new route, no page change. The D5 guard fix is in `lib/route-guard.ts` usage inside an existing route, not proxy |
| Supabase access via repositories wired by DI | yes — the load-bearing one | every new read is a repository method reached via `lib/repositories/factory.ts`. Zero `supabase.from` in `studentImport.ts` |
| Double-click prevention via SubmitButton | **n/a** | C1/C2 add no form buttons. The existing Import button is untouched; C3 would own this |
| Role is pipe-delimited | yes — `studentImport.ts:178` | the faculty-role test stays on `role.includes(...)`. No change to how a role string is read |

**Layering order** (Route Handler → Controller → Service → Repository → Supabase) drives slice order.

## Scan

```
Path (C1 — integrity)
  app/api/import/students/route.ts:44          semesterId accepted as null  ← D1
  app/api/import/students/reference/route.ts:13 requireAdmin vs POST requireRole ← D5
  lib/services/studentImport.ts:232            { skipped } only; inserted discarded ← D6
  features/.../student-enrollment.repository.ts:53-59  dedupe key omits semesterId ← D2
  lib/csv-utils.ts                             no shared reason vocabulary ← D3
  features/.../BulkStudentImport.tsx:504,:155-157  legend claims server resolution ← D4

Path (C2 — resolution)
  features/.../BulkStudentImport.tsx:301  POST chunk (500 rows)
    → app/api/import/students/route.ts:93  importStudents(rows, deptId, semesterId)
      → lib/services/studentImport.ts:137  findManyByEmail          BATCHED ✓
      → lib/services/studentImport.ts:160  findByCode      per distinct code per chunk
      → lib/services/studentImport.ts:166  findByNameAndProgram   per distinct section per chunk
      → lib/services/studentImport.ts:176  findManyByEmail (faculty) BATCHED ✓
      → lib/services/studentImport.ts:214  findBySubjectSectionAndFaculty   PER ROW  ← the hot spot
      → lib/services/studentImport.ts:220  findBySubjectAndSection         PER ROW
      → lib/services/studentImport.ts:232  addEnrollments          BATCHED ✓ (but key omits semesterId)

Proof: lib/__tests__/studentImport.test.ts — "importStudents — faculty inserts prerequisites,
student looks them up" (:113), "no-pass rows (server half of the preview contract)" (:185),
"student accounts" (:226), "enrollments" (:261). Command: npm test

Teach: why the round trips dominate
  Postgres is fast; PostgREST round-trip latency is not. The row loop at :186-229 is O(rows) in
  NETWORK LATENCY, not in work — each iteration awaits a fresh HTTP call to find one mapping.
  315 subjects + 142 sections + ~22k rows over 44 chunks ≈ 40k sequential awaits inside a
  maxDuration=60 route (route.ts:10). The fix is not a faster query; it is asking once per chunk
  and answering 500 rows from memory. When: any O(rows) loop holding an await on a unique lookup.
  One alternative — cache the reference set client-side and post resolved ids — rejected: it moves
  trust to the browser for 22k rows and breaks the moment two admins import concurrently.

NOT IN THE SPEC — the idempotency read is O(table), not O(chunk)
  student-enrollment.repository.ts:52-57 selects .in("section_id", sectionIds). A chunk spans many
  sections, and those sections accumulate enrollments across the whole run. By the final chunk
  this single SELECT returns most of the table — so a re-run of an already-complete import reads
  ~22k rows to conclude "nothing to do". Same defect class as D2, opposite direction: D2 makes the
  key too narrow, this makes the read too wide. Fix alongside D2 — select the dedupe columns for
  the chunk's (student_id, faculty_subject_id) pairs, not every enrollment in those sections.

Lens:
- API routes stay thin: applies + app/api/import/students/ — guard + reason mapping stay thin
- proxy.ts is the access point: n/a — no new route or page
- Supabase access via repositories + DI: applies + features/admin-data/*.repository.ts,
  lib/repositories/factory.ts — load-bearing; no supabase.from in the service
- Double-click prevention via SubmitButton: n/a — no form buttons in C1/C2
- Role is pipe-delimited: applies + studentImport.ts:178 — faculty-role check unchanged
```

## Plan

### Problem

Eight defects in the student CSV importer, all in the data path, none in the UI:

| ID | Defect | Where |
|---|---|---|
| D1 | `semesterId` unguarded at every layer — mass-produces enrollment rows that satisfy `findPending` and fail `findExisting`, the proven 403 (`spike-student-eval-enrollment-gate.md:71-88`) | `route.ts:44`, `BulkStudentImport.tsx:297` |
| D2 | `addEnrollments` dedupe key omits `semesterId` while the constraint is `UNIQUE(student_id, faculty_subject_id, "semesterId")` — re-importing for a new term writes nothing, silently | `student-enrollment.repository.ts:53-59` |
| D3 | No per-row reason vocabulary; three downloads with three schemas; `removed-rows.csv` records no reason; `ALREADY_PERSISTED` unattributable | `csv-utils.ts`, `BulkStudentImport.tsx:261-283` |
| D4 | Preview legend claims the server resolves amber rows; the service rejects all five amber cases | `:504`, `:155-157` vs `studentImport.ts:201,204,211,216,222` |
| D5 | Reference route is `requireAdmin` while POST is `requireRole([ADMIN,DEAN,FACULTY])`; the 403 is swallowed by `if (!res.ok) return`, so a Dean's preview renders every row falsely amber | `reference/route.ts:13` |
| D6 | `inserted` discarded at `:232` | `studentImport.ts:232` |
| D7 | ~40k sequential PostgREST round trips per import | `studentImport.ts:160,166,214,220` |
| D8 | Two `faculty_subjects` lookups omit the semester filter against a semester-scoped constraint | `faculty-subject.repository.ts:62-86` |

### Current behavior

`POST /api/import/students` accepts a 500-row chunk, accepts `semesterId: null`, resolves the
student by email (creating if absent), then resolves subject → section → faculty mapping **one row
at a time**, and writes enrollments through a read-before-insert whose key omits the semester. The
client previews against a full-table reference dump, labels unresolved rows amber, and tells the
admin the server will resolve them.

### Options

**Option A — Recommended: fix the data path only.**

C1 lands the integrity fixes; C2 hoists resolution onto existing batch methods and rebuilds the
membership lookup keyed by semester. No new interface methods, no new tables, no UI layer, no CSV
measurement dependency. Every defect's root cause is addressed; the per-row round-trip count drops
to ~6 per chunk.

*Why:* D1 is a live data-corruption path with a documented production incident behind it. D2 loses
whole terms silently. Neither needs the stepper, and both are cheaper to fix before the stepper
lands than after — C3 will build panels on top of whatever predicate exists here.

*Cons:* The ledger is honest but the admin still sees one monolithic progress modal; per-department
control stays C3.

**Option B — C1 only.** Defect fixes ship; the 40k round trips remain. Smallest possible change,
but re-imports stay slow and D7 stays open.

*Cons:* the dominant cost of the import is left unaddressed while the file is already open.

**Option C — Reuse `findBySubjectAndSection` unchanged, accept the stale-constraint risk.** Rejected:
it reproduces D8 across two semesters the moment the school runs a second term.

### Blast radius

**In scope:**
- `app/api/import/students/route.ts` — `findActive()` guard (D1), reason-code mapping (D3)
- `app/api/import/students/reference/route.ts` — guard alignment (D5), `users` projection trim
- `lib/services/studentImport.ts` — batched resolution (D7), `inserted` surfaced (D6), reason codes (D3/D4)
- `features/admin-data/student-enrollment.repository.ts` — `semesterId` in the dedupe key (D2), scoped idempotency read, `skippedItems` attribution (D3)
- `features/admin-data/faculty-subject.repository.ts` — **behaviour of two existing methods** (D8); no interface change, `list({semesterId})` already correct
- `lib/csv-utils.ts` — reason-code vocabulary (D3)
- `features/users/components/bulk-import/BulkStudentImport.tsx` — legend relabel (D4), guard alignment (D1/D5), ledger assembly (D3)

**Out of scope — do not touch:**
`lib/services/etlEvaluation.ts` and `app/api/import/faculties/route.ts` (faculty Step 7 landed
2026-10-09; its 259-test suite is the regression net) · `supabase-schema.sql` (no schema change —
D1/D2/D8 are code fixes) · `proxy.ts` · `lib/workflows/`, `lib/services/email.ts` (no email,
deliberately — general spec §12) · `lib/types/evaluation.ts` (**no interface change at all**) ·
the other five `Bulk*Import.tsx` · any C3 file.

**Edge cases:**
`findActive()` null is ambiguous (none vs many active) — must disambiguate the 400 message ·
`ALREADY_PERSISTED` means *already in the database*, not *already in this file* · a duplicate
spanning two chunks reads `persisted` then `already-persisted` · same student + same section +
different subject in one chunk → two valid rows, so the in-payload key must include
`faculty_subject_id` · `createMany` is not transactional across its 200-row chunks, so a
mid-request failure leaves earlier chunks inserted and the re-run reports them `existing` · an
existing FACULTY email must never gain a `STUDENT` role.

### Proof

`npm test` — extend `lib/__tests__/studentImport.test.ts` (existing 4 describes are the regression
net) and `lib/__tests__/csv-utils.test.ts`. Gate: `npx tsc --noEmit` → `npm run lint` →
`npm test` (≥259, all green) → `npm run build`.

Required, per `step-02`/`step-03` test tables:
`semesterId` absent → 400 before any repository call · same file for 2026-2 after 2026-1
**inserts**, does not skip · membership map groups by semester; two semesters in one chunk resolve
correctly · round-trip count ≤ 6 per chunk · `inserted` non-zero on a fresh import ·
`skippedItems` attributes per row · unresolvable department still enrols, flagged ·
every non-persisted row carries a code and remark · client and server agree on a blocking row ·
legacy path (no `step`) byte-compatible.

### Out of scope

C3 per-department stepper and the Unassigned panel · the `findManyBySubjectSectionIds` method ·
schema migrations · email on account creation · relocating `FacultyImportStepper.tsx` · the
unverified CSV quantities in `specs/student-import-stepper.md` §10 (blocks C3 sizing only — C1
and C2 do not depend on them).

### Client error surfacing (added at approval)

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` — the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` — **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` — **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* — the client
shows whichever the server sends.

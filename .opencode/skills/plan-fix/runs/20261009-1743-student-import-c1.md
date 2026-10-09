---
skill: plan-fix
story: C1 integrity + C2 batched resolution per specs/student-import-stepper.md §7 and §9 (7 defects, no UI layer, no CSV measurement dependency)
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "Option A — C1 integrity + C2 batched resolution, zero new interface methods. semesterId derived server-side via findActive(). D8 (stale UNIQUE constraint vs live schema) rides in C2."
status: implementing
pending: slice-4
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
| slice-1 | Apply Slice 1 (semesterId guard) to `app/api/import/students/route.ts`? | Applied — guard at `:26-41`, `bodySemesterId` destructuring removed. tsc clean · lint 0 errors · `studentImport` + `csv-utils` 37/37 green |
| slice-2 | Apply Slice 2 (reference guard + projection trim) to `app/api/import/students/reference/route.ts`? | Applied — `requireAdmin` → `requireRole(request, ["ADMIN","DEAN","FACULTY"])` at `:13`, `name` dropped from the `users` projection at `:29`. tsc clean · **lint 0 errors, 0 warnings** · `studentImport` + `csv-utils` 37/37 green |
| slice-3 | Apply Slice 3 (client error surfacing) to `BulkStudentImport.tsx`? | Applied — `referenceError` state + render; `fetchReferenceData` now surfaces 403/500; merged `stoppedEarly`/`failedChunks` branches show the server's message verbatim when uniform; `AbortError` reported correctly. tsc clean · lint 0 errors · `studentImport` + `csv-utils` 37/37 green |
| section-repro | Reported live defect (not in spec): student preview marks BSIE-41M2 "Section not found" | Confirmed preview-path, server innocent — see D9 below |
| d9-fix | Apply the D9 fix to `BulkStudentImport.tsx`? | A — Code it by the assistant. `resolveSection` now matches `name` + `program`; `existingSections` carries `program`; `existingDCourses` state + setter deleted. tsc exit 0 · lint 0 errors 0 warnings · vitest 260/18 green. Committed inside `d52afba` |
| deferred-course-payload | Trim `departmentCourses` from the reference payload? | Deferred — documented in §Deferred. Not harmful; separate cleanup pass |
| d10-chunk | Apply the 504 mitigation (`STUDENT_CHUNK_SIZE` 500 → 100) to `BulkStudentImport.tsx`? | Applied — `:92` now 100 with the latency rationale in a comment. tsc exit 0 · lint 0 errors 0 warnings · vitest 260/18 green |
| d2-key | Apply D2 — `semesterId` into the `addEnrollments` key/select + scoped read? | Applied — see the D2 note in the ledger. **Interface widened** (`evaluation.ts:411`) to carry `skippedItems`. New test file, mutation-checked. tsc 0 · lint 0 · vitest 267/19 green |

> **D9 — NEW DEFECT, found live, not in `specs/student-import-stepper.md` §7.**
>
> The student preview resolves a section by **`departmentCourseId`**, obtained by looking the course up
> **by `code` alone**. `UNIQUE("departmentId", code)` on `department_courses` makes `BSIE` legitimately
> non-unique, so `Array.find()` can return the wrong course and every section under the right one
> renders amber even though the row exists.
>
> Confirmed against live data: `sections` holds `name: "41M2"`, `program: "BSIE"`,
> `departmentCourseId: "d76bde55-…"`, so the **server** (`findByNameAndProgram`, `studentImport.ts:169`)
> resolves it. The failure appears **in the preview grid**, per admin, so the fault is
> `BulkStudentImport.tsx:180-184`.
>
> This is a **second instance of D4** (preview/server disagreement), in the opposite direction: D4 is
> the preview being *optimistic* ("server resolves it"); D9 is the preview being *pessimistic*
> (rejecting what the server would accept). Same root cause — two implementations of one rule.
>
> Verification of the collision itself is still open: `select id, code, "departmentId", name from
> department_courses where code = 'BSIE';` — expect 2+ rows.

> Slice numbering is 1-based by slice, not by UI step. Slice 1 = D1 route guard. Slice 2 = D5
> reference guard. Client error surfacing is tracked as its own slice because it is the requirement
> you added at approval; its detail lives in the Plan section rather than being duplicated here.

**Client error surfacing** — requirement added at your approval. Full detail in the Plan section
§"Client error surfacing". Three client paths must surface the server's real reason instead of a
generic or swallowed message, and the D1 400 must distinguish *no active semester* from *more than
one active*.

**semesterId — DECIDED: derive server-side from the active semester.**
`semesterRepository.findActive()` (`features/admin-data/semester.repository.ts:22-27`) exists and
is wired at `lib/repositories/factory.ts:55`. The client-sent `semesterId` becomes advisory, not
authoritative — it can no longer be null, stale, or mismatched. This closes D1 at the only layer
that cannot be bypassed. The UI already offers only the active semester (`EnrollmentsTab.tsx:47`
filters `isActive`), so deriving it costs the admin nothing.

> Nuance worth stating: `findActive()` returns `null` both when **no** semester is active and when
> **more than one** is, so the 400 message could not disambiguate. **Built with
> `list({ isActive: true })` instead** (Slice 1) — one call whose length distinguishes the two
> cases, and the UI displays whichever 400 body the route returns.

## Pending

- id: slice-4
- prompt: Apply D2 — put `semesterId` into the `addEnrollments` select and dedupe key, and scope the read to the chunk's pairs (`features/admin-data/student-enrollment.repository.ts:50-65`)?
- options:
  - Apply this slice
  - Stop
  - Other.. type your thoughts

## Defect ledger — verified against code, not the record

| ID | Defect | Status |
|---|---|---|
| D1 | `semesterId` unguarded at every layer | **CLOSED** — `route.ts:26-41` derives server-side, 400 on 0 or >1 active; threaded `route.ts:41` → `:108` → `studentImport.ts:109` → `:184` → `:227` → insert. Client value ignored (`route.ts:57` destructures `departmentId` only) |
| D5 | Reference route `requireAdmin` vs POST `requireRole` | **CLOSED** — `reference/route.ts:13` |
| D6 | `inserted` discarded at `studentImport.ts:232` | **OPEN** — still `const { skipped: dupSkipped } = …` |
| D7 | ~40k sequential PostgREST round trips (per-row mapping lookup at `:214`, `:220`) | **OPEN** — but see D10 |
| D2 | `addEnrollments` dedupe key omits `semesterId` | **OPEN** — `student-enrollment.repository.ts:53-59` |
| D3 | No per-row reason vocabulary; three CSVs, three schemas | **OPEN** — `csv-utils.ts` still has no reason codes |
| D4 | Preview legend claims server resolves amber | **OPEN** — `BulkStudentImport.tsx:527` still reads "Amber imports, or the server resolves it." |
| D8 | Two `faculty_subjects` lookups omit semester filter | **OPEN** — `faculty-subject.repository.ts:62-86` |
| D9 | Student preview resolved section via `departmentCourseId` found by `code` alone | **CLOSED** — see Progress; committed in `d52afba` |
| D10 | 504 `FUNCTION_INVOCATION_TIMEOUT` on `/api/import/students` | **MITIGATED** — `STUDENT_CHUNK_SIZE` 500→100. Root cause unchanged until D7 lands |

> **D2 — CLOSED this slice** (`student-enrollment.repository.ts:50-88`).
> Key is now `${student_id}|${faculty_subject_id}|${semesterId ?? ""}` — column-for-column with
> `student_enrollments_student_id_faculty_subject_id_key` — and the select carries
> `"semesterId"`. `section_id` is gone from the key; it is not part of the constraint.
>
> The read is scoped too, not just re-keyed: `.eq("semesterId", …)` (or `.is(…, null)` when a
> chunk genuinely carries no semester, mirroring `findExisting`), `.in("student_id", …)`,
> `.in("faculty_subject_id", …)`. A fresh term now reads ~0 rows where it previously re-read
> every enrollment in the chunk's sections — the final chunk of a run read the whole table to
> conclude "nothing to do".
>
> **Interface widened** — `lib/types/evaluation.ts:411` now returns
> `skippedItems: { student_id, faculty_subject_id, section_id }[]` per the D3 precondition in
> `step-03-enrollments.md:104-108`. This required a change the original plan had marked
> "no interface change at all"; the sub-spec's explicit contract overrides that note.
>
> **Caller unchanged** — `studentImport.ts:232` still destructures only `{ skipped }`. D6
> (`inserted` discarded) is deliberately still open; surfacing it needs an `ImportResult` field
> and the client to render it, which is its own slice.
>
> **Proof** — new `lib/__tests__/student-enrollment-repository.test.ts`, 7 tests, following the
> `subject-repository.test.ts` harness. **Mutation-checked:** reverting only the key to the
> pre-fix form fails 3 of the 7, including "INSERTs when the same file is re-imported for a
> second semester" — so the suite genuinely bites rather than passing vacuously.
> Gates: tsc 0 · lint 0 · vitest **267 passed / 19 files** (was 260/18).

> **D10 — 504 timeout, observed on staging 2026-10-09 20:20:12 (62.8s, `maxDuration=60`).**
> One 500-row chunk awaits ~500 sequential Supabase calls — one per row at
> `studentImport.ts:214`. The log shows sin1 ingress routed to iad1, so each call carries
> ~150 ms of Pacific latency. The insert is 6 of ~72 calls, so the insert is *not* the bottleneck.
>
> `STUDENT_CHUNK_SIZE` 500→100 cuts per-request work 5× (~15 s worst case) and is shipped.
> It does not remove the root cause: a 22k-row file still issues ~22k sequential round trips,
> merely 100 at a time. **D7 (batch the per-row lookups) is the real fix.** Note the faculty
> importer never batched either — `etlEvaluation.ts:871` inserts one row per request to stay
> under the same ceiling, which is the same coping strategy, not a solution.

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

## Deferred — non-blocking cleanup

| Item | Why deferred | Impact if left |
|---|---|---|
| `departmentCourses` in the `/api/import/students/reference` payload (`reference/route.ts:31`) is now unconsumed — D9 removed the only client consumer (`existingDCourses`) | Not harmful: one extra key in a JSON response fetched once per page load. Trimming it is a payload-hygiene change, not a defect fix | Slightly larger reference response; a reader may assume a consumer that no longer exists |

**Do not remove it as part of a defect slice.** Remove it in its own cleanup pass, and confirm at that time that no other feature consumes `d.departmentCourses` from this route — the section importer (`BulkSectionImport.tsx`) keeps its own course reference state and must not be touched.

## Verification log — D9 (section preview false amber)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 — 0 errors, 0 warnings |
| `npx vitest run` | 260 passed / 18 files (baseline was 259; slice 3 added one) |

Rejected on purpose: a test for `resolveSection`. It lives inside a `useCallback` in a component with no
test harness (`lib/__tests__` has no `BulkStudentImport` case), so a test would require extracting the
function first — a refactor, not a verification. Verified by rule-inspection instead: the new lookup
mirrors `BulkFacultyImport.tsx:127` and `studentImport.ts:169`, both of which are already covered.

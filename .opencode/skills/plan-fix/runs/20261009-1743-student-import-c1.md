---
skill: plan-fix
story: C1 integrity + C2 batched resolution per specs/student-import-stepper.md Â§7 and Â§9 (7 defects, no UI layer, no CSV measurement dependency)
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "Option A â€” C1 integrity + C2 batched resolution, zero new interface methods. semesterId derived server-side via findActive(). D8 (stale UNIQUE constraint vs live schema) rides in C2."
status: implementing
pending: u1
---

# Plan â€” session

## Progress

| id | question | answer |
|----|----------|--------|
| story | What to plan | B â€” C1 integrity + C2 batched resolution |
| calibration-pre | Use last calibration (1C 2E 3B 4A 5A 6A)? | A â€” Use it |
| visual | Approve the visual proposal? | A â€” Option A, then narrowed by the semesterId decision; see D8 |
| semesterid | Insert semesterId from the active semester? | A â€” derive server-side via `semesterRepository.findActive()` |
| batched | Batched reads: new methods or reuse `list()`? | B â€” 0 new methods; reuse `list()` / `list({ semesterId })` |
| plan-done | Is this plan done? | A â€” Done |
| handoff | Run implement-fix with it? | A â€” Yes, plus client error surfacing |
| who-implements | Who implements? | B â€” Code it |
| slice-1 | Apply Slice 1 (semesterId guard) to `app/api/import/students/route.ts`? | Applied â€” guard at `:26-41`, `bodySemesterId` destructuring removed. tsc clean Â· lint 0 errors Â· `studentImport` + `csv-utils` 37/37 green |
| slice-2 | Apply Slice 2 (reference guard + projection trim) to `app/api/import/students/reference/route.ts`? | Applied â€” `requireAdmin` â†’ `requireRole(request, ["ADMIN","DEAN","FACULTY"])` at `:13`, `name` dropped from the `users` projection at `:29`. tsc clean Â· **lint 0 errors, 0 warnings** Â· `studentImport` + `csv-utils` 37/37 green |
| slice-3 | Apply Slice 3 (client error surfacing) to `BulkStudentImport.tsx`? | Applied â€” `referenceError` state + render; `fetchReferenceData` now surfaces 403/500; merged `stoppedEarly`/`failedChunks` branches show the server's message verbatim when uniform; `AbortError` reported correctly. tsc clean Â· lint 0 errors Â· `studentImport` + `csv-utils` 37/37 green |
| section-repro | Reported live defect (not in spec): student preview marks BSIE-41M2 "Section not found" | Confirmed preview-path, server innocent â€” see D9 below |
| d9-fix | Apply the D9 fix to `BulkStudentImport.tsx`? | A â€” Code it by the assistant. `resolveSection` now matches `name` + `program`; `existingSections` carries `program`; `existingDCourses` state + setter deleted. tsc exit 0 Â· lint 0 errors 0 warnings Â· vitest 260/18 green. Committed inside `d52afba` |
| deferred-course-payload | Trim `departmentCourses` from the reference payload? | Deferred â€” documented in Â§Deferred. Not harmful; separate cleanup pass |
| d10-chunk | Apply the 504 mitigation (`STUDENT_CHUNK_SIZE` 500 â†’ 100) to `BulkStudentImport.tsx`? | Applied â€” `:92` now 100 with the latency rationale in a comment. tsc exit 0 Â· lint 0 errors 0 warnings Â· vitest 260/18 green |
| d2-key | Apply D2 â€” `semesterId` into the `addEnrollments` key/select + scoped read? | Applied â€” see the D2 note in the ledger. **Interface widened** (`evaluation.ts:411`) to carry `skippedItems`. New test file, mutation-checked. tsc 0 Â· lint 0 Â· vitest 267/19 green |
| d11-23505 | Live 500 `23505` on `/api/import/students` â€” duplicate rows in one INSERT | Root-caused and fixed. See D11 below |
| d4-legend | Relabel the D4 legend + preview summary? | Applied — two instances of the identical false promise relabelled (component legend, preview summary). The amber badges were already accurate. Gates folded into the term-mismatch run below |
| term-mismatch | Surface mappings-attached-to-inactive-semester instead of investigating? | Applied — `termMismatch: { mappedTerms, activeTerm }` in the service result, red banner in the client, aggregated per run. Null-semester fallback explicitly not a mismatch. 3 new tests. tsc 0 · lint 0 · vitest 280/20 |
| readme-1.7 | Update `specs/README.md` (+ entry-point docs) for the next session? | Applied — v1.7: new status table (C1/C2 done, C3/D3/D6/U1-U4 open), measured §10 table, decisions, traps, read order; repaired own typo/broken link/drifting line refs. Also: general spec §3/§9/§10 updated, AGENTS.md test counts (9→20, LOC) |
| defer-u1 | Defer remaining work to another session, track U1 as next? | Deferred by owner. U1 tracked as NEXT in root TODO.md; queued order U2-U4, D3, D6, C3 S1-S4, payload cleanup. specs/README 'Next slice' updated to match. status stays implementing, pending u1. |

> **D11 â€” 23505 on a live import. Fixed this slice.**
>
> `student_enrollments` is `UNIQUE(student_id, faculty_subject_id, "semesterId")`
> (`supabase-schema.sql:1219`) and `faculty_subjects` is
> `UNIQUE(subject_id, section_id, "semesterId")` (`:1034`) â€” **faculty is not a key**.
> An enrollment's identity is therefore `(student, subject, section) + semester`, and
> the CSV's own `(student, subject code, section)` triple plus the active semester is
> exactly that.
>
> The CSV is 18% redundant: **28,096 rows â†’ 22,934 distinct tuples; 4,208 tuples repeat,
> contributing 5,162 extra rows**, with **zero** cases of the same triple carrying a
> different faculty. `importStudents` pushed one `toEnroll` entry per CSV row, so a
> chunk holding a repeat **twice** put two copies of one key into a single multi-row
> INSERT; Postgres checks the index per row, the second copy raised `23505`, and the
> whole statement â€” the entire chunk â€” rolled back.
>
> **This was pre-existing, not introduced by D2.** The old code never deduped `items`
> against itself either.
>
> **Amplifier:** the thrown Supabase error carries `code: "23505"` and **no `status`**,
> so `isRetryableChunkError` hit `status === undefined â†’ true` and retried the doomed
> chunk twice. That is the 46.14s / ~90 GETs in the incident log â€” 46s spent failing
> deterministically three times.
>
> **Fixed at both layers:**
> - `importStudents` dedupes `toEnroll` on the constraint key and reports each collapse
>   in a new `duplicateRows` (counted into `skipped` so the client's row reconciliation
>   stays exact; D3 will give them their own ledger code).
> - `addEnrollments` dedupes the request against itself as defence in depth â€” the
>   constraint is that layer's to guarantee regardless of caller.
> - `isRetryableChunkError` returns false for any error carrying a Postgres SQLSTATE, so
>   class-23 integrity errors fail fast instead of retrying.
>
> **A test had asserted the bug.** `studentImport.test.ts` claimed
> `enrolled).toBe(2)` for one student + one topic appearing twice â€” two copies of one
> key. Corrected, and mutation-checked: reverting the dedupe fails it.
>
> **Proof** â€” new `chunk-error-policy.test.ts` (6 tests). Gates: tsc 0 Â· lint 0 Â·
> vitest **278 passed / 20 files**.

## Semester alignment — SUPERSEDED by the "Semester mismatch — SURFACED" section below

Owner chose surfacing over investigation; the two queries were never run and are not needed.
Kept for the evidence trail only: â€” UNVERIFIED, needs two queries

`faculty_subjects_rows.json` (100-row sample, itself capped by PostgREST `max-rows`)
shows every row stamped `semesterId = e0000000-â€¦-000000000101`, while the failing
enrollment carried `e0000000-â€¦-000000000000` (the active semester the route derives).
Those are **different terms**.

`resolveSlot` (`studentImport.ts:205-210`) prefers the active semester, then a
null-semester row, and **returns null otherwise** â€” it never substitutes another term's
mapping. So if mappings exist only under `â€¦0101` and the active term is `â€¦0000`, every row
fails with *"not assigned to X in Y"* rather than a 23505. The incident produced a 23505
instead, so mappings presumably exist under both â€” **but this is unverified and has a bad
failure mode.**

## Semester mismatch — SURFACED, not investigated

Neither of the two SQL queries was run or needed. The decision was to **make the mismatch
visible rather than prove its absence**, which is cheaper and catches every future occurrence.

`faculty_subjects` keeps its `semesterId` forever, and activating a new term deactivates the
old one without re-stamping its mappings — so the mappings a student import needs can all sit
under a now-inactive term. `resolveSlot` (`studentImport.ts:209-215`) deliberately refuses to
substitute another term's mapping, so the symptom would have been **every row failing with
"not assigned to X in Y"**, which reads like bad CSV data and sends an admin hunting for typos
that do not exist.

**Fixed this slice** — the detection reuses rows already fetched, so it costs nothing:

- `studentImport.ts:217-233` compares the chunk's mapping terms against the active one and
  returns `termMismatch: { mappedTerms, activeTerm } | null`. A **null-semester** mapping is
  explicitly *not* a mismatch, because `resolveSlot` falls back to those and they still work.
- `BulkStudentImport.tsx` renders a red banner above results: *"Faculty mappings are attached to
  an inactive semester"*, naming how many other terms they sit under and warning that the
  "not assigned" failures below are caused by this, not a typo.
- Aggregated per run (`results.find(r => r.termMismatch)`), so one mismatched chunk flags the
  whole import.

**Second D4 instance found and fixed in the same pass:** the preview summary at
`BulkStudentImport.tsx:566` carried the identical false promise — *"flagged — resolved or
reported server-side"*. Relabelled to match the legend: a new student is created and an unknown
department imports as Unassigned, but an unknown subject, section or faculty fails that row.

**Proof** — 3 new tests (mismatch reported, no false positive when active-term mappings exist,
null-semester fallback not treated as a mismatch). tsc 0 · lint 0 · vitest **280 / 20 files**.

## Order of work — as chosen

1. ~~D4~~ ✅ 2. Semester mismatch surfaced ✅ 3. **C3 the stepper — next.**
C3 slices: S1 department grouping (client-side at preview) → S2 grid + panels → S3 Unassigned
panel → S4 `userMap` merge. 176 of 3,303 students span >1 department, so §3.3 first-instance
discards a value for them — the number is known, the choice is the spec's and already accepted.

> **D9 â€” NEW DEFECT, found live, not in `specs/student-import-stepper.md` Â§7.**
>
> The student preview resolves a section by **`departmentCourseId`**, obtained by looking the course up
> **by `code` alone**. `UNIQUE("departmentId", code)` on `department_courses` makes `BSIE` legitimately
> non-unique, so `Array.find()` can return the wrong course and every section under the right one
> renders amber even though the row exists.
>
> Confirmed against live data: `sections` holds `name: "41M2"`, `program: "BSIE"`,
> `departmentCourseId: "d76bde55-â€¦"`, so the **server** (`findByNameAndProgram`, `studentImport.ts:169`)
> resolves it. The failure appears **in the preview grid**, per admin, so the fault is
> `BulkStudentImport.tsx:180-184`.
>
> This is a **second instance of D4** (preview/server disagreement), in the opposite direction: D4 is
> the preview being *optimistic* ("server resolves it"); D9 is the preview being *pessimistic*
> (rejecting what the server would accept). Same root cause â€” two implementations of one rule.
>
> Verification of the collision itself is still open: `select id, code, "departmentId", name from
> department_courses where code = 'BSIE';` â€” expect 2+ rows.

> Slice numbering is 1-based by slice, not by UI step. Slice 1 = D1 route guard. Slice 2 = D5
> reference guard. Client error surfacing is tracked as its own slice because it is the requirement
> you added at approval; its detail lives in the Plan section rather than being duplicated here.

**Client error surfacing** â€” requirement added at your approval. Full detail in the Plan section
Â§"Client error surfacing". Three client paths must surface the server's real reason instead of a
generic or swallowed message, and the D1 400 must distinguish *no active semester* from *more than
one active*.

**semesterId â€” DECIDED: derive server-side from the active semester.**
`semesterRepository.findActive()` (`features/admin-data/semester.repository.ts:22-27`) exists and
is wired at `lib/repositories/factory.ts:55`. The client-sent `semesterId` becomes advisory, not
authoritative â€” it can no longer be null, stale, or mismatched. This closes D1 at the only layer
that cannot be bypassed. The UI already offers only the active semester (`EnrollmentsTab.tsx:47`
filters `isActive`), so deriving it costs the admin nothing.

> Nuance worth stating: `findActive()` returns `null` both when **no** semester is active and when
> **more than one** is, so the 400 message could not disambiguate. **Built with
> `list({ isActive: true })` instead** (Slice 1) â€” one call whose length distinguishes the two
> cases, and the UI displays whichever 400 body the route returns.

## Pending

- id: u1
- prompt: Take U1 next session - status-to-message mapping in useChunkedImport, stop both postChunk bodies reading raw response bodies (spec chunked-import-failure-ux.md U1)? Tracked as NEXT in TODO.md.
- options:
  - Take U1
  - Take C3 S1 instead
  - Other.. type your thoughts

Record: the `decision` above said "zero new interface methods". That call was explicitly
superseded — the sub-spec contract required `findManyBySubjectSectionIds` plus a widened
`addEnrollments` return, and both shipped (D2, D7). Do not re-litigate it.

## Defect ledger â€” verified against code, not the record

| ID | Defect | Status |
|---|---|---|
| D1 | `semesterId` unguarded at every layer | **CLOSED** â€” `route.ts:26-41` derives server-side, 400 on 0 or >1 active; threaded `route.ts:41` â†’ `:108` â†’ `studentImport.ts:109` â†’ `:184` â†’ `:227` â†’ insert. Client value ignored (`route.ts:57` destructures `departmentId` only) |
| D5 | Reference route `requireAdmin` vs POST `requireRole` | **CLOSED** â€” `reference/route.ts:13` |
| D6 | `inserted` discarded at `studentImport.ts:232` | **OPEN** — `addEnrollments` now returns it, but nothing surfaces it. Needs an `ImportResult` field + client rendering |
| D7 | ~40k sequential PostgREST round trips (per-row mapping lookup) | **CLOSED** — `findManyBySubjectSectionIds` added and the per-row lookups hoisted out of the loop (`studentImport.ts:205-260`); ~22k round trips → 1 per chunk |
| D2 | `addEnrollments` dedupe key omits `semesterId` | **CLOSED** — see the D2 note below |
| D3 | No per-row reason vocabulary; three CSVs, three schemas | **OPEN** â€” `csv-utils.ts` still has no reason codes |
| D4 | Preview legend claims server resolves amber | **CLOSED** — legend relabelled at `BulkStudentImport.tsx:533`; the amber badges themselves were accurate, only the legend lied |
| D8 | Two `faculty_subjects` lookups omit semester filter | **CLOSED as a side effect** — both per-row methods are now uncalled; the batched read groups by `(subject, section, semester)` |
| D9 | Student preview resolved section via `departmentCourseId` found by `code` alone | **CLOSED** â€” see Progress; committed in `d52afba` |
| D11 | 23505 on multi-row INSERT from duplicate CSV rows | **CLOSED** — see the D11 note below |
| D10 | 504 `FUNCTION_INVOCATION_TIMEOUT` on `/api/import/students` | **CLOSED** — D7 removed the ~22k per-row round trips that caused it; `STUDENT_CHUNK_SIZE` 500→100 also landed |

> **D2 â€” CLOSED this slice** (`student-enrollment.repository.ts:50-88`).
> Key is now `${student_id}|${faculty_subject_id}|${semesterId ?? ""}` â€” column-for-column with
> `student_enrollments_student_id_faculty_subject_id_key` â€” and the select carries
> `"semesterId"`. `section_id` is gone from the key; it is not part of the constraint.
>
> The read is scoped too, not just re-keyed: `.eq("semesterId", â€¦)` (or `.is(â€¦, null)` when a
> chunk genuinely carries no semester, mirroring `findExisting`), `.in("student_id", â€¦)`,
> `.in("faculty_subject_id", â€¦)`. A fresh term now reads ~0 rows where it previously re-read
> every enrollment in the chunk's sections â€” the final chunk of a run read the whole table to
> conclude "nothing to do".
>
> **Interface widened** â€” `lib/types/evaluation.ts:411` now returns
> `skippedItems: { student_id, faculty_subject_id, section_id }[]` per the D3 precondition in
> `step-03-enrollments.md:104-108`. This required a change the original plan had marked
> "no interface change at all"; the sub-spec's explicit contract overrides that note.
>
> **Caller unchanged** â€” `studentImport.ts:232` still destructures only `{ skipped }`. D6
> (`inserted` discarded) is deliberately still open; surfacing it needs an `ImportResult` field
> and the client to render it, which is its own slice.
>
> **Proof** â€” new `lib/__tests__/student-enrollment-repository.test.ts`, 7 tests, following the
> `subject-repository.test.ts` harness. **Mutation-checked:** reverting only the key to the
> pre-fix form fails 3 of the 7, including "INSERTs when the same file is re-imported for a
> second semester" â€” so the suite genuinely bites rather than passing vacuously.
> Gates: tsc 0 Â· lint 0 Â· vitest **267 passed / 19 files** (was 260/18).

> **D10 â€” 504 timeout, observed on staging 2026-10-09 20:20:12 (62.8s, `maxDuration=60`).**
> One 500-row chunk awaits ~500 sequential Supabase calls â€” one per row at
> `studentImport.ts:214`. The log shows sin1 ingress routed to iad1, so each call carries
> ~150 ms of Pacific latency. The insert is 6 of ~72 calls, so the insert is *not* the bottleneck.
>
> `STUDENT_CHUNK_SIZE` 500â†’100 cuts per-request work 5Ã— (~15 s worst case) and is shipped.
> It does not remove the root cause: a 22k-row file still issues ~22k sequential round trips,
> merely 100 at a time. **D7 (batch the per-row lookups) is the real fix.** Note the faculty
> importer never batched either â€” `etlEvaluation.ts:871` inserts one row per request to stay
> under the same ceiling, which is the same coping strategy, not a solution.

**STALE SPEC CLAIM â€” found while checking, affects this decision.**
`step-07-mappings.md:35` states: "`faculty_subjects` is **`UNIQUE(subject_id, section_id)`**
(`supabase-schema.sql:713`)". That is the **base** `CREATE TABLE` at `supabase-schema.sql:711`.
Migration 20 drops that constraint and replaces it:
`supabase-schema.sql:1029` drops `faculty_subjects_subject_id_section_id_key`, and `:1034` adds
`UNIQUE(subject_id, section_id, "semesterId")`.

So a `(subject, section)` pair **may hold one row per semester**. Two live methods violate that:

| Method | Filter | Problem |
|---|---|---|
| `findBySubjectAndSection` `faculty-subject.repository.ts:62-72` | `subject_id`, `section_id` â€” **no semester** | `.maybeSingle()` against a multi-row-per-semester constraint |
| `findBySubjectSectionAndFaculty` `:76-86` | + `faculty_id`, **no semester** | same |

`findBySubjectSectionSemester` (`:88-106`) filters correctly but is declared **optional** in the
interface (`lib/types/evaluation.ts:401`) and has **no production caller**.

Reachable from the student import at `studentImport.ts:220` (blank-faculty fallback) and `:214`.
**Either it throws, or â€” if PostgREST codes the multi-row case `PGRST116` â€” the handler returns
`null`** and the row is rejected as *"No faculty assigned to X in Y"* (`studentImport.ts:222`), a
false reason. Which of the two happens needs one confirming read; the fix is needed either way.

This is **D8**, new, and it lands in C2 with the batched lookup â€” because the batched method must
group by `(subject_id, section_id, "semesterId")` anyway, per `step-03-enrollments.md`. Doing the
batch without the semester key would reproduce the bug at scale.

**Useful consequence:** `facultySubjectRepository.list({ semesterId })`
(`faculty-subject.repository.ts:5-13`) is **already semester-aware and already exists** â€”
`etlEvaluation.ts:455-456` uses exactly that call. So the faculty-subject batch needs **no new
method at all**; only subject and section are in question.

## Decisions

**Scope** â€” C1 integrity + C2 batched resolution. C3 (per-department stepper) excluded; it is the
only slice that needs the 2026-1 CSV measurements first (`specs/student-import-stepper.md` Â§10).

**Gold paths** â€” read-first, in `repository.md` order:
`app/api/` (route thinness, guard alignment) â†’ `features/` (repository + service) â†’
`lib/repositories/factory.ts` (DI wiring) â†’ `lib/auth.ts` (not touched; guard uses session only).

**Proof command** â€” `npm test` (`vitest run`). Baseline 259 tests / 18 files, all green as of
`20261009-1706-faculty-stepper-step-07.md`. Type gate `npx tsc --noEmit`, lint `npm run lint`.

**Invariant lens** â€” how each `applies` invariant is preserved:

| Invariant | Applies | How preserved |
|---|---|---|
| API routes stay thin | yes â€” `app/api/import/students/` | semester guard + `reasonCode` mapping are parse/validate/return. No classification logic moves into the route |
| proxy.ts is the access point | **n/a** | no new route, no page change. The D5 guard fix is in `lib/route-guard.ts` usage inside an existing route, not proxy |
| Supabase access via repositories wired by DI | yes â€” the load-bearing one | every new read is a repository method reached via `lib/repositories/factory.ts`. Zero `supabase.from` in `studentImport.ts` |
| Double-click prevention via SubmitButton | **n/a** | C1/C2 add no form buttons. The existing Import button is untouched; C3 would own this |
| Role is pipe-delimited | yes â€” `studentImport.ts:178` | the faculty-role test stays on `role.includes(...)`. No change to how a role string is read |

**Layering order** (Route Handler â†’ Controller â†’ Service â†’ Repository â†’ Supabase) drives slice order.

## Scan

```
Path (C1 â€” integrity)
  app/api/import/students/route.ts:44          semesterId accepted as null  â† D1
  app/api/import/students/reference/route.ts:13 requireAdmin vs POST requireRole â† D5
  lib/services/studentImport.ts:232            { skipped } only; inserted discarded â† D6
  features/.../student-enrollment.repository.ts:53-59  dedupe key omits semesterId â† D2
  lib/csv-utils.ts                             no shared reason vocabulary â† D3
  features/.../BulkStudentImport.tsx:504,:155-157  legend claims server resolution â† D4

Path (C2 â€” resolution)
  features/.../BulkStudentImport.tsx:301  POST chunk (500 rows)
    â†’ app/api/import/students/route.ts:93  importStudents(rows, deptId, semesterId)
      â†’ lib/services/studentImport.ts:137  findManyByEmail          BATCHED âœ“
      â†’ lib/services/studentImport.ts:160  findByCode      per distinct code per chunk
      â†’ lib/services/studentImport.ts:166  findByNameAndProgram   per distinct section per chunk
      â†’ lib/services/studentImport.ts:176  findManyByEmail (faculty) BATCHED âœ“
      â†’ lib/services/studentImport.ts:214  findBySubjectSectionAndFaculty   PER ROW  â† the hot spot
      â†’ lib/services/studentImport.ts:220  findBySubjectAndSection         PER ROW
      â†’ lib/services/studentImport.ts:232  addEnrollments          BATCHED âœ“ (but key omits semesterId)

Proof: lib/__tests__/studentImport.test.ts â€” "importStudents â€” faculty inserts prerequisites,
student looks them up" (:113), "no-pass rows (server half of the preview contract)" (:185),
"student accounts" (:226), "enrollments" (:261). Command: npm test

Teach: why the round trips dominate
  Postgres is fast; PostgREST round-trip latency is not. The row loop at :186-229 is O(rows) in
  NETWORK LATENCY, not in work â€” each iteration awaits a fresh HTTP call to find one mapping.
  315 subjects + 142 sections + ~22k rows over 44 chunks â‰ˆ 40k sequential awaits inside a
  maxDuration=60 route (route.ts:10). The fix is not a faster query; it is asking once per chunk
  and answering 500 rows from memory. When: any O(rows) loop holding an await on a unique lookup.
  One alternative â€” cache the reference set client-side and post resolved ids â€” rejected: it moves
  trust to the browser for 22k rows and breaks the moment two admins import concurrently.

NOT IN THE SPEC â€” the idempotency read is O(table), not O(chunk)
  student-enrollment.repository.ts:52-57 selects .in("section_id", sectionIds). A chunk spans many
  sections, and those sections accumulate enrollments across the whole run. By the final chunk
  this single SELECT returns most of the table â€” so a re-run of an already-complete import reads
  ~22k rows to conclude "nothing to do". Same defect class as D2, opposite direction: D2 makes the
  key too narrow, this makes the read too wide. Fix alongside D2 â€” select the dedupe columns for
  the chunk's (student_id, faculty_subject_id) pairs, not every enrollment in those sections.

Lens:
- API routes stay thin: applies + app/api/import/students/ â€” guard + reason mapping stay thin
- proxy.ts is the access point: n/a â€” no new route or page
- Supabase access via repositories + DI: applies + features/admin-data/*.repository.ts,
  lib/repositories/factory.ts â€” load-bearing; no supabase.from in the service
- Double-click prevention via SubmitButton: n/a â€” no form buttons in C1/C2
- Role is pipe-delimited: applies + studentImport.ts:178 â€” faculty-role check unchanged
```

## Plan

### Problem

Eight defects in the student CSV importer, all in the data path, none in the UI:

| ID | Defect | Where |
|---|---|---|
| D1 | `semesterId` unguarded at every layer â€” mass-produces enrollment rows that satisfy `findPending` and fail `findExisting`, the proven 403 (`spike-student-eval-enrollment-gate.md:71-88`) | `route.ts:44`, `BulkStudentImport.tsx:297` |
| D2 | `addEnrollments` dedupe key omits `semesterId` while the constraint is `UNIQUE(student_id, faculty_subject_id, "semesterId")` â€” re-importing for a new term writes nothing, silently | `student-enrollment.repository.ts:53-59` |
| D3 | No per-row reason vocabulary; three downloads with three schemas; `removed-rows.csv` records no reason; `ALREADY_PERSISTED` unattributable | `csv-utils.ts`, `BulkStudentImport.tsx:261-283` |
| D4 | Preview legend claims the server resolves amber rows; the service rejects all five amber cases | `:504`, `:155-157` vs `studentImport.ts:201,204,211,216,222` |
| D5 | Reference route is `requireAdmin` while POST is `requireRole([ADMIN,DEAN,FACULTY])`; the 403 is swallowed by `if (!res.ok) return`, so a Dean's preview renders every row falsely amber | `reference/route.ts:13` |
| D6 | `inserted` discarded at `:232` | `studentImport.ts:232` |
| D7 | ~40k sequential PostgREST round trips per import | `studentImport.ts:160,166,214,220` |
| D8 | Two `faculty_subjects` lookups omit the semester filter against a semester-scoped constraint | `faculty-subject.repository.ts:62-86` |

### Current behavior

`POST /api/import/students` accepts a 500-row chunk, accepts `semesterId: null`, resolves the
student by email (creating if absent), then resolves subject â†’ section â†’ faculty mapping **one row
at a time**, and writes enrollments through a read-before-insert whose key omits the semester. The
client previews against a full-table reference dump, labels unresolved rows amber, and tells the
admin the server will resolve them.

### Options

**Option A â€” Recommended: fix the data path only.**

C1 lands the integrity fixes; C2 hoists resolution onto existing batch methods and rebuilds the
membership lookup keyed by semester. No new interface methods, no new tables, no UI layer, no CSV
measurement dependency. Every defect's root cause is addressed; the per-row round-trip count drops
to ~6 per chunk.

*Why:* D1 is a live data-corruption path with a documented production incident behind it. D2 loses
whole terms silently. Neither needs the stepper, and both are cheaper to fix before the stepper
lands than after â€” C3 will build panels on top of whatever predicate exists here.

*Cons:* The ledger is honest but the admin still sees one monolithic progress modal; per-department
control stays C3.

**Option B â€” C1 only.** Defect fixes ship; the 40k round trips remain. Smallest possible change,
but re-imports stay slow and D7 stays open.

*Cons:* the dominant cost of the import is left unaddressed while the file is already open.

**Option C â€” Reuse `findBySubjectAndSection` unchanged, accept the stale-constraint risk.** Rejected:
it reproduces D8 across two semesters the moment the school runs a second term.

### Blast radius

**In scope:**
- `app/api/import/students/route.ts` â€” `findActive()` guard (D1), reason-code mapping (D3)
- `app/api/import/students/reference/route.ts` â€” guard alignment (D5), `users` projection trim
- `lib/services/studentImport.ts` â€” batched resolution (D7), `inserted` surfaced (D6), reason codes (D3/D4)
- `features/admin-data/student-enrollment.repository.ts` â€” `semesterId` in the dedupe key (D2), scoped idempotency read, `skippedItems` attribution (D3)
- `features/admin-data/faculty-subject.repository.ts` â€” **behaviour of two existing methods** (D8); no interface change, `list({semesterId})` already correct
- `lib/csv-utils.ts` â€” reason-code vocabulary (D3)
- `features/users/components/bulk-import/BulkStudentImport.tsx` â€” legend relabel (D4), guard alignment (D1/D5), ledger assembly (D3)

**Out of scope â€” do not touch:**
`lib/services/etlEvaluation.ts` and `app/api/import/faculties/route.ts` (faculty Step 7 landed
2026-10-09; its 259-test suite is the regression net) Â· `supabase-schema.sql` (no schema change â€”
D1/D2/D8 are code fixes) Â· `proxy.ts` Â· `lib/workflows/`, `lib/services/email.ts` (no email,
deliberately â€” general spec Â§12) Â· `lib/types/evaluation.ts` (**no interface change at all**) Â·
the other five `Bulk*Import.tsx` Â· any C3 file.

**Edge cases:**
`findActive()` null is ambiguous (none vs many active) â€” must disambiguate the 400 message Â·
`ALREADY_PERSISTED` means *already in the database*, not *already in this file* Â· a duplicate
spanning two chunks reads `persisted` then `already-persisted` Â· same student + same section +
different subject in one chunk â†’ two valid rows, so the in-payload key must include
`faculty_subject_id` Â· `createMany` is not transactional across its 200-row chunks, so a
mid-request failure leaves earlier chunks inserted and the re-run reports them `existing` Â· an
existing FACULTY email must never gain a `STUDENT` role.

### Proof

`npm test` â€” extend `lib/__tests__/studentImport.test.ts` (existing 4 describes are the regression
net) and `lib/__tests__/csv-utils.test.ts`. Gate: `npx tsc --noEmit` â†’ `npm run lint` â†’
`npm test` (â‰¥259, all green) â†’ `npm run build`.

Required, per `step-02`/`step-03` test tables:
`semesterId` absent â†’ 400 before any repository call Â· same file for 2026-2 after 2026-1
**inserts**, does not skip Â· membership map groups by semester; two semesters in one chunk resolve
correctly Â· round-trip count â‰¤ 6 per chunk Â· `inserted` non-zero on a fresh import Â·
`skippedItems` attributes per row Â· unresolvable department still enrols, flagged Â·
every non-persisted row carries a code and remark Â· client and server agree on a blocking row Â·
legacy path (no `step`) byte-compatible.

### Out of scope

C3 per-department stepper and the Unassigned panel Â· the `findManyBySubjectSectionIds` method Â·
schema migrations Â· email on account creation Â· relocating `FacultyImportStepper.tsx` Â· the
unverified CSV quantities in `specs/student-import-stepper.md` Â§10 (blocks C3 sizing only â€” C1
and C2 do not depend on them).

### Client error surfacing (added at approval)

The server must not be the only place an error is correct. Three client paths currently hide or
generalise the real reason:

| Path | Today | Must become |
|---|---|---|
| `postChunk` catch (`BulkStudentImport.tsx:319`) | `withRetryHints(new Error(\`Chunk ${n} failed (${res.status}). ${text}\`))` â€” the server's `error` field is already in `text`, so this is mostly right | surface the server's `error` message verbatim in the toast; do not wrap it in a generic "Could not reach the server" |
| `handleConfirm` catch (`:379`) | `setError("Could not reach the server. Please check your connection and try again.")` â€” **always** this, even on a 400 with a specific message | surface the server's `error` message; fall back to the generic only on a true network failure |
| `fetchReferenceData` (`:127`) | `if (!res.ok) return` â€” **silent** | surface the 403/500 so a Dean sees "no permission to preview" rather than a preview full of false amber |

The D1 400 message must distinguish *no active semester* from *more than one active* â€” the client
shows whichever the server sends.

## Deferred â€” non-blocking cleanup

| Item | Why deferred | Impact if left |
|---|---|---|
| `departmentCourses` in the `/api/import/students/reference` payload (`reference/route.ts:31`) is now unconsumed â€” D9 removed the only client consumer (`existingDCourses`) | Not harmful: one extra key in a JSON response fetched once per page load. Trimming it is a payload-hygiene change, not a defect fix | Slightly larger reference response; a reader may assume a consumer that no longer exists |

**Do not remove it as part of a defect slice.** Remove it in its own cleanup pass, and confirm at that time that no other feature consumes `d.departmentCourses` from this route â€” the section importer (`BulkSectionImport.tsx`) keeps its own course reference state and must not be touched.

## Verification log â€” D9 (section preview false amber)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 â€” 0 errors, 0 warnings |
| `npx vitest run` | 260 passed / 18 files (baseline was 259; slice 3 added one) |

Rejected on purpose: a test for `resolveSection`. It lives inside a `useCallback` in a component with no
test harness (`lib/__tests__` has no `BulkStudentImport` case), so a test would require extracting the
function first â€” a refactor, not a verification. Verified by rule-inspection instead: the new lookup
mirrors `BulkFacultyImport.tsx:127` and `studentImport.ts:169`, both of which are already covered.

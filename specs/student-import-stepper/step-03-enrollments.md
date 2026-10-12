# Step 3 — Enrollments

**Version:** 1.1
**Status:** Draft
**Last Updated:** 2026-10-12

Sub-spec of [student-import-stepper.md](../student-import-stepper.md).

---

# Purpose

The terminal step and the **only `O(rows)` step in the family**. Resolve each row to an existing
student, subject, section and `faculty_subjects` mapping, then write the enrollment.

Nothing is created here — **except** the opt-out Unassigned-parking path below. Every other
unresolved prerequisite **fails the row** with a reason code — it is never invented on the fly.

# Step 2 ownership rule (shipped 2026-10-12)

For a blank-faculty row, ownership resolves dummy-ward and the department code plays no role
in the decision (resolution reads subject + section + term only):

1. Slot exists (any owner) → enrol under it. Dummy-owned when truly unassigned, real-owned
   when assigned. A blank cell never evicts a real owner.
2. No slot + parking on → one dummy-owned loading per unique pair (active term), then enrol.
3. No slot + parking off → `NO_FACULTY_ASSIGNED`; nothing created.

Named-faculty rows always face all three gates (role, slot existence, ownership) and never
touch the dummy path. `FACULTY_NOT_FOUND` is unreachable for blank rows by construction.

# Position

| | |
|---|---|
| Depends on | step 2 Done-or-Skipped (soft gate) for the file, and an active `semesterId` |
| Produces | the enrollment rows; the ledger's `persisted` / `already-persisted` outcomes; `parkedSlots` when parking |
| Distinct values (2026-1) | 21,989 enrollments |

# Request

The existing chunked shape, scoped to one department:

```ts
POST /api/import/students
{ mode: "enroll", step1: "done" | "skipped", allowUnassigned: boolean,
  rows: { email, name, subjectCode, section, facultyEmail?, departmentId?, _originRow }[],
  chunkIndex, totalChunks, fileId, isLast }
```

`mode: "enroll"` dispatches to `enrollStudentRows` (lookup-only, never creates).
`step1` is carried into the enroll audit so a skipped Step 1 stays visible.
`allowUnassigned` is strict-boolean, default false. Omitting `mode` keeps the legacy composed
path working — that path is both the compatibility guarantee and the test safety net, exactly
as in the faculty family (`faculty-import-stepper.md:110-131`).

`semesterId` is derived server-side per request (active term, exactly one) and echoed back —
chunks carry it, the route does not trust it. A mid-run flip is surfaced, never silently split.

# Batched resolution — the main change

The current implementation re-derives every prerequisite per chunk, and one of them per row:

| Line | Call | Times per 2026-1 import |
|---|---|---|
| `:160-164` | `subjectRepository.findByCode` | once per distinct code **per chunk** (~315 × chunks) |
| `:166-171` | `sectionRepository.findByNameAndProgram` | once per distinct section **per chunk** (~142 × chunks) |
| `:214` | `findBySubjectSectionAndFaculty` | **once per row**, sequentially awaited (~21,989) |
| `:220` | `findBySubjectAndSection` | once per row with a blank faculty email |

Order of magnitude **~40,000 sequential PostgREST round trips**. The row loop is `O(rows)` in
*network latency*, not in work.

`facultySubjectRepository` has no batch finder today — only `findByIds`
(`faculty-subject.repository.ts:101`) plus the three singles. **Add
`findManyBySubjectSectionIds(subjectIds, sectionIds)`** returning all mappings for the chunk's
pairs, and hoist the other three into their existing batch forms:

```
// once per chunk
userMap   = userRepository.findManyByEmail(distinct emails)     // already batched
subjects  = subjectRepository.findManyByCodes(distinct codes)    // new
sections  = sectionRepository.findManyByNameAndProgram(distinct keys)  // new
mappings  = facultySubjectRepository.findManyBySubjectSectionIds(distinct subject ids, section ids)  // new

// row loop is now pure in-memory map lookups + one batched write
for each row: resolve → toEnroll.push(...) | failed.push(reason)
if toEnroll.length: addEnrollments(toEnroll)
```

**~1,500 → ~6 round trips per chunk.** The classification logic is untouched; only the I/O moves.

# The constraint that governs the mapping lookup

`faculty_subjects` is **`UNIQUE(subject_id, section_id, "semesterId")`**
(`supabase-schema.sql:1034`) — `faculty_id` is **not** in the constraint. One subject+section pair
per semester holds exactly one faculty mapping, enforced by the database.

Two consequences for the batched form:

- `findBySubjectAndSection` can never return more than one row for a semester, so the batched
  lookup must **group by `(subject_id, section_id, "semesterId")`**. A naive
  `.in("section_id", ids)` returning flat rows would let the row loop pick the wrong one.
- The blank-faculty fallback (`:220`) resolves to whatever the slot already holds — the dummy for
  unassigned slots (`step-07-mappings.md:43-44`). It must be preserved, not replaced by "no
  mapping = use the section's only mapping".

# `semesterId` in the idempotency key

`addEnrollments` reads back `student_id, section_id, faculty_subject_id`
(`student-enrollment.repository.ts:53`) — **`semesterId` is absent from both the select and the
dedupe key** — while the constraint is
`UNIQUE(student_id, faculty_subject_id, "semesterId")` (`supabase-schema.sql:1219`).

Import the 2026-1 file, then the same file for 2026-2: every row matches the existing set,
`newItems` is empty, and the function returns `{ inserted: 0, skipped: N }` **having written
nothing**. Silent cross-term loss.

**Two changes:**

1. `semesterId` joins the select and the dedupe key.
2. The return carries **per-row attribution**, not just a count:

```ts
{ inserted: number, skipped: number, skippedItems: { student_id, faculty_subject_id, section_id }[] }
```

Without (2), `ALREADY_PERSISTED` cannot be attributed to a row in the ledger — which is one of the
two reasons the current bare `skipped` count is unusable (general spec §4.4).

# Report `inserted`, not only `skipped`

`studentImport.ts:232` destructures `{ skipped: dupSkipped }` and **discards `inserted`**. A step
that cannot report its own write cannot satisfy `StepResult`
(`faculty-import-stepper.md:83-85`). Both counters surface in the panel summary and in the
department grid.

# Unassigned parking, opt-out (shipped 2026-10-12)

Step 2 header checkbox *"Park unmapped on Unassigned"*, on by default, reset per file,
applies to panels started after toggling. When on, a pre-pass (after slot fetch, before the
row loop — the loop itself is byte-identical) collects distinct valid pairs with blank faculty
and no slot, resolves the placeholder account by `DUMMY_FACULTY_EMAIL`, and creates one
dummy-owned loading per pair via a single `createMany` stamped with the active term. The
created ids join the in-memory slot map, so rows enrol normally.

- Blank-only, never-evict: created only where `resolveSlot` finds nothing; named rows and
  real owners untouched. Legacy fallback rows need no creation.
- No dummy account, or nothing created → rows fail `NO_FACULTY_ASSIGNED` as before. Typos
  fail earlier (subject/section checks precede parking), so parking cannot mask bad codes.
- Reported, not silent: `parkedSlots: { subjectCode, section }[]` on the result, named in the
  enroll audit, counted in the scope line. Parked rows enrol as normal `persisted` ledger
  lines — parking adds **no** reason code (ledger-reason-codes.md).
- Local literal `UNASSIGNED_FACULTY_EMAIL` mirrors the canonical `DUMMY_FACULTY_EMAIL`
  (`etlEvaluation.ts`) deliberately: importing that module pulls the live Supabase client into
  the mocked test graph.

# Classification rules

| Outcome | Rule | Ledger status |
|---|---|---|
| Resolved and newly written | `addEnrollments.inserted` | `persisted` |
| Resolved, already in the database | in `skippedItems` | `already-persisted` (`ALREADY_PERSISTED`) |
| Blank email | `r.email` empty | `invalid` (`EMAIL_BLANK`) |
| Off-domain email | `!isAllowedStudentEmail` | `invalid` (`EMAIL_DOMAIN_NOT_ALLOWED`) |
| Excel error cell | `isExcelErrorCell` on any column | `invalid` (`EXCEL_ERROR_CELL`) |
| Student not a user | absent from `userMap` | `invalid` (`STUDENT_NOT_FOUND`) |
| Subject unknown | `subjects` miss | `invalid` (`SUBJECT_NOT_FOUND`) |
| Section unknown | `sections` miss | `invalid` (`SECTION_NOT_FOUND`) |
| Faculty email not a user | named address absent from the faculty map, or lacks FACULTY/DEAN/ADMIN | `invalid` (`FACULTY_NOT_FOUND`) — named only; blank never reports this |
| Faculty not assigned to the slot | no mapping for `(subject, section, semester, faculty)` | `invalid` (`FACULTY_NOT_ASSIGNED`) — named only |
| Blank faculty, slot unresolvable, parking off | no mapping for `(subject, section, semester)` | `invalid` (`NO_FACULTY_ASSIGNED`) |
| Blank faculty, slot unresolvable, parking on | one dummy-owned loading created per unique pair, then enrolled | `persisted` + `parkedSlots` entry |
| Department code unresolvable | **not a rejection** — row enrolls, department stays `null` | `persisted` + flag `DEPARTMENT_UNRESOLVED` |
| Department code ≠ section's department | **not a rejection** — the code wins | `persisted` + flag `DEPARTMENT_MISMATCH` |

# Preview mirrors (shipped 2026-10-12)

- Blank faculty email is never a preview flag (`isNewFaculty` is computed for non-blank
  only) and blank cells render as informational "Unassigned Faculty" (blue, hover explains).
  Named unknowns still flag and fail — the `no-teacher` facet now fires on named rows only.
- `new-student` left the issue vocabulary (`issue-filter.ts`): newcomer status is Step 1's
  business. The Will Create tooltip no longer names it; the `has-issues`/`no-issues` union
  never included it.

> **The last two are the D4 fix.** `BulkStudentImport.tsx:504` currently tells the admin amber rows
> "import, or the server resolves it", and `:155-157` claims unknown subject/section/faculty "is
> created, resolved, or reported". **The service does none of the first two** — `:201, 204, 211,
> 216, 222` push all five into `failed[]`. Badges are relabelled to say a row will be **reported
> as a failure**, and the legend at `:502-505` is corrected to match.

# Idempotency

`addEnrollments` read-before-insert, keyed on
`(student_id, faculty_subject_id, "semesterId")`. Re-running a department reports `inserted: 0`
and lists every row as `already-persisted`.

Chunked runs cannot collide: each chunk re-reads inside its own request, so the constraint is
checked after that read. No `23505` handler is required.

# Edge cases

- **A duplicate spanning two chunks** reads `inserted` in the first and `already-persisted` in the
  second. `ALREADY_PERSISTED` means *already in the database*, never *already in this file* — the
  two are different statements and the UI must not conflate them.
- **A chunk failing entirely.** Its rows are recorded as `invalid` with the transport error as the
  remark, so no row is silently unaccounted for. The client's existing "unaccounted for" check
  (`:360-365`) becomes exact.
- **Section with no separator.** `parseSectionIdentifier` yields `program: ""`
  (`studentImport.ts:4-8`), which matches no course → `SECTION_NOT_FOUND`. Never insert it.
- **Same student, same section, different subject in one chunk.** Two distinct
  `faculty_subject_id` values → two enrollment rows, both valid under
  `UNIQUE(student_id, faculty_subject_id, "semesterId")`. The in-payload dedupe key must include
  `faculty_subject_id`, or one is silently dropped.
- **Retrying after `stoppedEarly`.** Completed chunks are idempotent; re-running re-reports them as
  `already-persisted`.

# Tests required

| Test | Asserts |
|---|---|
| batched resolution, same results | classification identical to the pre-batching per-row path |
| round-trip count drops | ≤ 6 repository calls per chunk for a 500-row chunk |
| `inserted` is reported | `StepResult.inserted` equals `addEnrollments.inserted`, not 0 |
| `skippedItems` attributes per row | a re-run lists every row as `ALREADY_PERSISTED` |
| **`semesterId` in the dedupe key** | same file imported for 2026-2 after 2026-1 **inserts**, does not skip |
| mappings grouped by semester | a chunk spanning two semesters resolves the correct mapping for each |
| blank-faculty fallback preserved | `findBySubjectAndSection` equivalent still resolves the dummy slot |
| unknown prerequisite fails the row | all five amber cases land in `failed[]` with their reason code, and **nothing is created** |
| unresolvable department still enrolls | row is `persisted` + `DEPARTMENT_UNRESOLVED`, enrollment written, `departmentId` stays `null` |
| legacy composed path unchanged | omitting `step` produces today's response shape |
| missing `semesterId` | 400 before any repository call |
| ledger closure | `rows = persisted + already-persisted + invalid` exactly |
| allowUnassigned off | blank + no slot fails loud, creates nothing (`parkedSlots: []`) |
| allowUnassigned on | one dummy loading per pair, rows enrol, `parkedSlots` names them |
| allowUnassigned shared pair | two students, one pair → single `createMany` |
| allowUnassigned named path | unknown mapping still `FACULTY_NOT_ASSIGNED`, no creation |
| allowUnassigned missing dummy | falls back to loud `NO_FACULTY_ASSIGNED` |
| allowUnassigned legacy slot | fallback resolves, no creation |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

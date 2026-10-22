# ACES — Specs

**Version:** 1.8
**Status:** Draft
**Last Updated:** 2026-10-22

---

# Purpose

This directory contains specs for the e-consultation app's integration with the loa-auth-platform,
plus feature specs for the admin data importers. Each spec is a focused, versioned document.
Specs must be Final before code is written (per loa-apache-server-apps convention).

---

# Spec Index

| Spec | Status | Purpose |
|------|--------|---------|
| [faculty-import-stepper.md](faculty-import-stepper.md) | Draft | Decompose the faculty-subject CSV import into a per-phase stepper wizard — step registry, `StepResult` contract, idempotency and resume |
| [faculty-import-stepper/step-02-departments.md](faculty-import-stepper/step-02-departments.md) | Draft | Step 2 — create-if-absent departments, `name = code`, never discard a row |
| [faculty-import-stepper/step-03-courses.md](faculty-import-stepper/step-03-courses.md) | Draft | Step 3 — create-if-absent courses keyed by `(departmentId, code)` pair, `[unmapped]` name marker |
| [faculty-import-stepper/step-04-sections.md](faculty-import-stepper/step-04-sections.md) | Draft | Step 4 — upsert sections, `created`-driven classification, missing-course flagging |
| [faculty-import-stepper/step-05-subjects.md](faculty-import-stepper/step-05-subjects.md) | Draft | Step 5 — upsert subjects; documents the `name = code` fallback firing on all 315 |
| [faculty-import-stepper/step-06-faculty-users.md](faculty-import-stepper/step-06-faculty-users.md) | Draft | Step 6 — create missing faculty, dummy is dept-agnostic, off-domain never becomes a user |
| [faculty-import-stepper/step-07-mappings.md](faculty-import-stepper/step-07-mappings.md) | Draft | Step 7 — terminal step; `existing` vs `invalid`, real-beats-dummy, real-vs-real refused |
| [student-import-stepper.md](student-import-stepper.md) | Draft | Decompose the student CSV import into per-department panels — unordered step registry, required `semesterId`, first-instance department, Unassigned panel |
| [student-import-stepper/step-02-student-users.md](student-import-stepper/step-02-student-users.md) | Draft | Step 2 — the only `create` in this importer; department resolved client-side at preview time, not per chunk |
| [student-import-stepper/step-03-enrollments.md](student-import-stepper/step-03-enrollments.md) | Draft | Step 3 — terminal `O(rows)` step; batched resolution; `semesterId` in the dedupe key; per-row skip attribution |
| [student-import-stepper/ledger-reason-codes.md](student-import-stepper/ledger-reason-codes.md) | Draft | One CSV in which every input row appears exactly once, with status + reason code + remark |
| [chunked-import-failure-ux.md](chunked-import-failure-ux.md) | Draft | Failure UX and timeout policy for the shared chunk driver `useChunkedImport` — status→message mapping, no raw response bodies, retry policy, correlation key. Sub-spec of both importer families |
| [breadcrumb-friendly-labels.md](breadcrumb-friendly-labels.md) | Final | Replace GUID path segments in the desktop breadcrumb with names/codes on the admin + dean evaluation-results routes — page-driven crumb registry, no new fetch |
| [evaluation-surfaces-verification.md](../docs/evaluation-surfaces-verification.md) | — | The manual checks for the evaluation surfaces (dean's coverage, admin's coverage, the results pages) and the **home-less teachers** check — the one number no test can give you: how much coverage the home-only attribution rule moved |
| [evaluation-results-attribution.md](evaluation-results-attribution.md) | Final (2026-10-21) | Why users go missing from the evaluation results — one department attribution rule across the admin/dean/coverage surfaces, the dean's duplicated route retired, an integrity warning, and a visible zero-response count. **Built and green 2026-10-20** (S1–S4 + F5: resolver, service, repository, dean route, visibility guard, coverage, null-safe rendering, integrity warning row, per-department "No responses" count, reconciled faculty counts, the dean's dashboard and evaluations page on the teaching roster; the pseudo-department row and its dead-end link are gone; both visibility routes now require `evaluationPeriodId`). **v1.2: the rule is faculty-driven** — the teacher's own department owns the result, with the section's department as the fallback for a teacher based somewhere that cannot own coverage; the coverage and the results surfaces now share one resolver. **v1.3 (2026-10-20, later the same day): one headcount, one membership** — every surface counts the faculty **homed in** a department (the school-wide headcount), the drill-downs' faculty lists are that same set, the results drill-down's subject tab is the members' subjects (evaluated or not), the no-response roster is gone from the results surfaces, and the dean's guards read the same set. **v1.4: the home is the only rule** — the section's department is no longer a fallback; a teacher with no home is unattributed. **v1.6–v1.14 (2026-10-21): the membership gate is closed** — the period scopes the responses (the term scopes the subject list only), the response set is decided in one read, the dean's guards read the members and the subject page's department guard (D9) is built, the results list's offSemester banner is retired, the surfaces show the ratings rather than the counts, every department is a row, and a tie is shown as a tie everywhere. Next: the data check — the home-less teachers |
| [evaluation-results-summary-card.md](evaluation-results-summary-card.md) | Final (2026-10-21) | The department drill-down's header card — a summary, not a dashboard: the average is the headline with the verdict beside it, the rubric read-out is full-width rows (the alarm first, the ties joined on one line), the counts are the coverage page's, and the card's shape does not change with the data. **Built 2026-10-21** (Option A) |
| [evaluation-results-export.md](evaluation-results-export.md) | Final (Part I) · Part II spec'd | The evaluation results as the school's legacy workbook, **generated from scratch** (the template is the reference, read by nothing at runtime). **Part I (§1–14, v4.0)** — the subject-grain workbook, three sheets (Individual, Comments, Overall one-row-per-response), everything follows the live rubric; **done 2026-10-22**, three routes (admin, dean, faculty). **Part II (§15–26, v5.0)** — the consolidated **department-faculty workbook** served off the faculty cards: the Individual sheet stacked (one full form per subject-section), no Comments sheet, the Overall sheet a NEW summary model (one row per subject-section under a per-faculty band); owner decisions D20–D26; **spec'd 2026-10-22, not built** |
| [coverage-parity.md](coverage-parity.md) | Final (2026-10-20) | Bring the evaluation coverage pages onto the results surfaces' footing — the dean's coverage page was non-functional (400 on the list, 403 on every detail), its scope unscoped, the detail guard asking the wrong question, and the dummy inflating the counts. **Built in 9 slices** (the dean's list exists and is scoped, the detail guard uses the list's resolver with 404 vs 403, the dummy is out of the counts, the integrity warning is carried and scoped, the Unresolved group counts its faculty, and the dean always loads their own department with no back link) |
| [coverage-faculty-grouping.md](coverage-faculty-grouping.md) | Final (2026-10-20) | Give the coverage page's department drill-down the results page's two groupings — "By Subject & Section" and "By Faculty" — with a per-department faculty aggregate on distinct students. **Built**: the rows carry faculty + section, the service returns per-department faculty aggregates, the drill-down gains the switch and the faculty cards (one shared `components/ui/Tabs.tsx` for both pages). **v1.2: the coverage page is faculty-driven** — a teacher's coverage belongs to their own department, with the section's department as the fallback for a teacher based somewhere that cannot own coverage (no home, or a home with no courses — the "Unassigned"/"Admin" buckets). **v1.3: the results surfaces adopted the same rule** — one resolver, one rule, every surface. **v1.4 (2026-10-20): the home is the only rule** — no section fallback; a department's teaching is its members' teaching, and a teacher with no home is unattributed (the "Unresolved" group) |
| *(unfiled)* | Done (2026-10-20) | Closed an authorization hole on `/api/dean/evaluation-results/details` — it resolved the dean's department and then ignored it, so any `facultyId` returned another department's per-student breakdown. Now scoped with the same membership the results page and the visibility toggle use (a new test file covers it). Also fixed the "anonymised" student id, which the object spread had been restoring to the real id |
| [auth-integration.md](auth-integration.md) | Draft | Contract between e-consultation and loa-auth — SSO flow, JWT claims, shared secrets, what each side owns |
| [endpoint-catalog.md](endpoint-catalog.md) | Draft | Full endpoint catalog (~130 entries) with required levels — must stay in sync with loa-auth-platform |
| [migration-checklist.md](migration-checklist.md) | Draft | Step-by-step tasks for each side, verification checklist, timeline |
| [spike-student-eval-enrollment-gate.md](spike-student-eval-enrollment-gate.md) | Investigation | `POST /api/evaluations` 403 for students with visible pending items — root cause proven to `route.ts:98`; `findPending` Branch A/B read-write drift; trigger blocked on one query |
| [spike-consultation-enrollment-scope.md](spike-consultation-enrollment-scope.md) | Investigation | Does the enrollment-gate defect reach consultation booking? No — no gate exists; redirects blast radius to the shared writer `replaceBySection` |

---

# Implementation Status

Tracks which Draft specs have working code, so the next session knows where to resume.
Spec `Status` above is unchanged — promotion to Final still needs re-approval per Convention.

| Spec | Build | Notes |
|------|-------|-------|
| [faculty-import-stepper/step-02-departments.md](faculty-import-stepper/step-02-departments.md) | Done (2026-10-09) | 4 slices: `importDepartmentsStep` in `lib/services/etlEvaluation.ts`, `step` discriminator in `app/api/import/faculties/route.ts`, Step 2 panel in `FacultyLoadingTab.tsx`, 5 tests. `tsc`/`lint` clean, 230/230 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1000-faculty-stepper-step-02.md` |
| [faculty-import-stepper/step-03-courses.md](faculty-import-stepper/step-03-courses.md) | Done (2026-10-09) | 7 slices: `importCoursesStep` in `lib/services/etlEvaluation.ts`, `courses` discriminator in `app/api/import/faculties/route.ts`, new `FacultyImportStepper.tsx` shell (`StepperTrace` + `StepPanel`), Step 2 retrofit (trace, Yes/No confirm, denominators) + Step 3 panel in `FacultyLoadingTab.tsx`, 5 tests. Verification gate (`tsc`/`lint`/`vitest`) with user per standing rule. Run file: `.opencode/skills/plan-fix/runs/20261009-1347-step-03-courses.md` |
| [faculty-import-stepper/step-04-sections.md](faculty-import-stepper/step-04-sections.md) | Done (2026-10-09) | 4 slices: `importSectionsStep` in `lib/services/etlEvaluation.ts`, `sections` discriminator in `app/api/import/faculties/route.ts`, Step 4 panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets), 5 tests. `tsc`/`lint` clean, 240/240 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1506-faculty-stepper-step-04.md` |
| [faculty-import-stepper/step-05-subjects.md](faculty-import-stepper/step-05-subjects.md) | Done (2026-10-09) | 4 slices: `importSubjectsStep` in `lib/services/etlEvaluation.ts`, `subjects` discriminator in `app/api/import/faculties/route.ts`, Step 5 panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets), 5 tests. `tsc`/`lint` clean, 245/245 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1605-faculty-stepper-step-05.md` |
| [faculty-import-stepper/step-06-faculty-users.md](faculty-import-stepper/step-06-faculty-users.md) | Done (2026-10-09) | 4 slices: `importFacultyUsersStep` in `lib/services/etlEvaluation.ts`, `faculty-users` discriminator in `app/api/import/faculties/route.ts`, Step 6 panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets), 5 tests. `tsc`/`lint` clean, 250/250 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1638-faculty-stepper-step-06.md` |
| [faculty-import-stepper/step-07-mappings.md](faculty-import-stepper/step-07-mappings.md) | Done (2026-10-09) | 4 slices: `importMappingsStep` in `lib/services/etlEvaluation.ts`, `mappings` discriminator in `app/api/import/faculties/route.ts`, Step 6 Faculty Loading panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets; panels renumbered 1-6 per UI numbering), 9 tests. `tsc`/`lint` clean, 259/259 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1706-faculty-stepper-step-07.md` |
| `FacultyLoadingTab.tsx` dead-code removal | Done (2026-10-10) | Deleted dead `handleCsvImport` + orphaned chunk wiring/overlay/result panel (~230 lines). Hook + student caller untouched. Gates green. Run file: `.opencode/skills/plan-fix/runs/20261010-1100-u1.md` |
| [breadcrumb-friendly-labels.md](breadcrumb-friendly-labels.md) | Built (2026-10-20), awaiting owner verification | 7 changes: `lib/contexts/breadcrumb.tsx` (new context) · `Providers.tsx` (mount) · `NavigationBar.tsx` (resolve segment labels, shortened-GUID fallback) · 4 result pages (register department + faculty-subject crumbs). Admin + dean mirror. Gates: owner to run `tsc`/`lint`/`vitest`/`build` |
| All other specs | Not started | **Faculty stepper complete (Steps 1-6). Next: Final promotion per Convention.** |

---

## Student Import Stepper — Implementation Status

A **separate importer with a different step shape**: per-department, unordered, two writes
(`student-users`, `enrollments`) rather than the faculty family's six ordered create-phases.
Sliced C1 → C2 → C3 so the integrity fixes do not wait on the UI layer.

| Slice | Build | Contents |
|-------|-------|----------|
| **C1** — integrity | **Done (2026-10-09)** | D1 `semesterId` derived server-side and 400s on zero-or-many active · D2 `semesterId` in the `addEnrollments` dedupe key + select, read scoped to the chunk, `skippedItems` per-row attribution · D5 reference guard aligned to `requireRole([ADMIN, DEAN, FACULTY])` · client error surfacing (`referenceError` banner, systematic-failure message, abort path) |
| **C2** — batched resolution | **Done (2026-10-09)** | D7 `findManyBySubjectSectionIds` batches the faculty-subject read; the per-row lookups are hoisted out of the loop (~22k round trips → 1 per chunk) · D8 both semester-blind per-row finders are now uncalled, closed as a side effect · D10 the 504 `FUNCTION_INVOCATION_TIMEOUT` is closed by D7, with `STUDENT_CHUNK_SIZE` 500→100 as belt-and-braces |
| **D4** — preview honesty | **Done (2026-10-09)** | Legend + preview summary relabelled (two instances of the same false promise; the amber badges themselves were accurate) |
| **D9** — section preview | **Done (2026-10-09)** | Student preview matched sections by `departmentCourseId` obtained from a course looked up by `code` alone; now matches `name` + `program` like the faculty client and the server |
| **D11** — 23505 | **Done (2026-10-09)** | Duplicate CSV rows put two copies of one key into a single multi-row INSERT. Deduped in `importStudents` *and* in `addEnrollments` as defence in depth; `23505` removed from the retryable set |
| **Semester mismatch** | **Done (2026-10-09)** | Not a spec'd defect — found live. Mappings attached to a now-inactive semester now surface a red banner instead of every row failing "not assigned" |
| **C3** — department stepper | **S1 Done (2026-10-10, user-reported green)** | S1: `department-grouping.ts` + 6 tests — first-instance-in-file-order per student (§3.3, strict null → Unassigned), wired via `useMemo` over `previewRows`; payload carries the student's department so the server's first-to-arrival map is degenerate by construction; the row's own code stays on `resolvedDepartmentId` for the panels. Data layer only — nothing renders it yet. Run file: `.opencode/skills/plan-fix/runs/20261010-1300-c3-s1-department-grouping.md` (also surfaced + fixed D6's block-scoped `inserted` bug). Remaining: S2 grid + panels → S3 Unassigned → S4 `userMap` merge |
| **D3** — ledger | **Done (2026-10-10, user-reported green)** | One `student-import-ledger.csv`, every input row exactly once. 17-code shared vocabulary (`lib/csv-utils.ts`) · server `reasonCode` at all 9 reject sites + `alreadyPersisted` key-join + `DUPLICATE_IN_FILE` · pure builder `import-ledger.ts` + 25 tests · three downloads → one, closure assert exact · `DEPARTMENT_UNRESOLVED`/`DEPARTMENT_MISMATCH` flags · legend + 4 badges red. Run file: `.opencode/skills/plan-fix/runs/20261010-1600-d3-ledger.md`. `DEPARTMENT_FROM_FIRST_ROW` deferred to C3 |
| **D6** — `inserted` surfaced | **Done (2026-10-10, user-reported green)** | `StudentImportResult.inserted` returned (0 on the early path) + client field + `?? 0` sum + tile "Enrollments Resolved" + summary line "resolved · newly written · skipped" + 2 service tests. A re-run now SHOWS enrolled>0 with inserted 0 instead of claiming it in prose. Run file: `.opencode/skills/plan-fix/runs/20261010-1115-d6-inserted.md`. Remaining: C3 S1–S4 |
| [chunked-import-failure-ux.md](chunked-import-failure-ux.md) | **U1 Done (2026-10-10)** | `getChunkFailureMessage` in `useChunkedImport` + both `postChunk` typed errors + `lib/__tests__/chunk-failure-message.test.ts` (8 tests). Gates green. Run file: `.opencode/skills/plan-fix/runs/20261010-1100-u1.md`. **S1 done (2026-10-10)** — 504→fail-fast predicate + 504/503 policy test (+1 test), gates waived (suite unverified). Run file: `.opencode/skills/plan-fix/runs/20261010-1200-u2a-504-retry-split.md`. Remaining: halve-once/persist (S3/S4), 70s, `fileId` |
| **U2b** — halve-once + persist | **Done (2026-10-10, user-reported green)** | Offset/size-driven loop (`CHUNK_MIN_SIZE = 25`, halve-to-floor, meta recompute) + `chunk-halve.test.ts` (4 tests) + student exact boundaries (`resultMetas`/`endOfChunk`). Zero hook-interface change. Full-suite green retro-covers S1's tests. Run file: `.opencode/skills/plan-fix/runs/20261010-1300-u2b-halve-persist.md`. Remaining: U3 (70s), U4 (`fileId`) |
| **U3** — 70s alignment | **Done (2026-10-10, user-reported green)** | `CHUNK_TIMEOUT_MS = 70000` exported + default uses it + one const assert (+1 test). `maxDuration = 60` untouched, zero callers pass the option. Full 294/294 green pasted. Run file: `.opencode/skills/plan-fix/runs/20261010-1400-u3-timeout-70s.md`. Remaining: U4 (invariant + `fileId`) |
| **U4** — invariant + `fileId` | **Done (2026-10-10, user-reported green)** | Optional meta widen + `savedTotal` + suffix on mapper-authored branches (verbatim pure, Abort bare) + 6 message tests + 2 banner sentences. Family `chunked-import-failure-ux.md` complete (U1→U4). Run file: `.opencode/skills/plan-fix/runs/20261010-1500-u4-invariant-fileid.md`. Remaining: D3 (ledger), D6, C3 |

**Gate:** `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
Current **332 tests / 24 files, user-reported green 2026-10-10** (was 259 / 18 when this work began; +8 U1, +1 S1, +4 U2b, +1 U3, +6 U4, +26 D3, +2 D6, +6 C3 S1). Failure-UX family, D3 ledger, D6 `inserted`, and C3 S1 grouping complete. Remaining: C3 S2–S4.

### The 2026-1 CSV is now measured — §10's unknowns are closed

Measured directly from `student-import-template (latest 2026-1).csv`:

| Quantity | Value |
|---|---|
| CSV row count | **28,096** |
| Distinct `(student, subject, section, faculty)` tuples | **22,934** |
| Redundant rows | **5,162** — 4,208 tuples repeat; **zero** repeat with a different faculty |
| Distinct students | **3,303** (8.5 rows each) |
| Distinct subject codes / sections | **315 / 142** |
| Rows per department | CAS 2,997 · CBA 2,531 · CCA 1,357 · CCJ 2,396 · CCS 4,893 · COA 1,648 · COE 2,710 · COED 1,118 · CREM 229 · CTHM 8,217 |
| Students whose rows span >1 department | **176 of 3,303** |

**The 945-row gap is explained:** 22,934 distinct tuples against 21,989 persisted leaves 945
genuinely unpersisted. The file was always the deduplicated count.

### Decisions worth carrying forward

- **Faculty is not part of any key.** `faculty_subjects` is `UNIQUE(subject_id, section_id, "semesterId")`, so one faculty per (subject, section) per term; the CSV's faculty email is a *validation*, never a join key. An enrollment's identity is `(student, subject, section) + semester`.
- **"Only one semester is active" does not prevent a term mismatch.** Deactivating a term never re-stamps `faculty_subjects`, so mappings can all sit under a dead term. This is now surfaced, not investigated — no SQL is needed to proceed.
- **5,162 redundant rows in the real file is why the per-row insert failed.** Any future CSV with repeated rows exercises this path; the dedupe is load-bearing, not defensive.
- **The stepper buys containment, not correctness.** It does not prevent a 23505; the dedupe does. Its value is that a failure costs one department's rows rather than 28,096, and users created in step 2 survive an enrollment failure.

---

# Next Session — Start Here

The student CSV importer had three live production failures (504 timeout, 23505 duplicate key,
silent cross-term loss). **All three are closed.** 280 tests / 20 files green. The remaining work
is containment and reporting, not correctness.

## Read in this order

1. **`student-import-stepper.md`** — the general spec. §3 step registry, §4.2 why `semesterId` is
   load-bearing, §4.3 the dedupe key, §5 the state machine. §7's defect table and §9's C1/C2/C3
   split are now partly historical — C1 and C2 are built, read §"Implementation Status" above
   instead of trusting §7 or §10.
2. **`student-import-stepper/step-03-enrollments.md`** — the slice with the most design in it.
   §"Batched resolution" is implemented (`findManyBySubjectSectionIds`); §"`semesterId` in the
   idempotency key" is implemented; per-row skip attribution is implemented.
3. **`ledger-reason-codes.md`** — **implemented (D3, 2026-10-10).** §4.1's message table
   is §2.1's codes; the vocabulary now lives in `lib/csv-utils.ts`, the builder (the
   pure module to read first) in `import-ledger.ts`, and the closure assert replaced
   the old `unaccounted` arithmetic. `DEPARTMENT_FROM_FIRST_ROW` is deliberately
   unbuilt — it is C3's first-instance rule and lands there.
4. **`chunked-import-failure-ux.md`** — new, spec'd, **not built**. U1–U4. U1 (status→message
   mapping, no raw response bodies) is the one that stops platform HTML reaching the admin.
5. **`.opencode/skills/plan-fix/runs/20261009-1743-student-import-c1.md`** — the authoritative
   defect ledger and the D8/D9/D10/D11 discovery notes. Read the ledger table first; it is now
  accurate.

## Do not re-derive these — they are settled and measured

- The 2026-1 file's shape (28,096 rows / 22,934 distinct / 5,162 redundant). §10 of the general
  spec still lists these as UNKNOWN; **the table above supersedes it.**
- Faculty is not a join key anywhere; it is a validation. `UNIQUE(subject, section, semester)`.
- An enrollment's identity is `(student, subject, section) + semester`.
- `student_enrollments` is `UNIQUE(student_id, faculty_subject_id, "semesterId")` after Migrations
  21 + 25. Any dedupe key must match it column-for-column.
- The student CSV contains redundant rows as normal input, not as an edge case.

## Known traps in this area

| Trap | Why it bites |
|---|---|
| `useChunkedImport` defaults `chunkTimeoutMs` to 120s while both routes cap at `maxDuration = 60` | A 504 is decided by the platform, not the client timer |
| `isRetryableChunkError` now rejects any error carrying a Postgres SQLSTATE | Before that, a `23505` was retried — 46s to fail deterministically three times |
| `resolveSlot` refuses to substitute another term's mapping | Correct, but makes a term mismatch look like 22,000 rows of bad data. Now surfaced |
| `PostgREST` caps responses at ~1000 rows by default | Both DB sample exports came back at 100. `users.repository.ts:215-233` pages for this reason; any new wide read must too |
| `BulkStudentImport.tsx` carries its own `ImportResult` shape, separate from the service's | Adding a field to the service result does not reach the client unless added here too |

## Next slice to take

**C3 S2** (`student-import-stepper.md` §3, §5): department grid + panels — S1's derived grouping made visible. Per-department panels grouped by the row's own code (§3.2), Unassigned rows in their own panel, global running guard. No new writes — panels drive the per-department chunk runs C1/C2 already made safe. C3 S1 done 2026-10-10 (user-reported green).
Tracked as NEXT in root `TODO.md`. After: S3 (Unassigned polish) → S4 (`userMap` merge).

After U2–U4, proposed order (reorder freely): D3 → D6 → C3 S1–S4 → deferred
course-payload cleanup. S1 remains the zero-UI-risk C3 entry point — department grouping,
computed client-side at preview, stamped onto every row — with 176 multi-department students
already measured and first-instance-wins already accepted.

---

# Cross-References

| This spec | Corresponding doc in loa-apache-server-apps |
|-----------|---------------------------------------------|
| `auth-integration.md` | `assemblies/loa-consult-platform/consult-readiness.md` §3-5 |
| `endpoint-catalog.md` | `assemblies/loa-consult-platform/consult-readiness.md` §2.3-2.4 |
| `migration-checklist.md` | `assemblies/loa-consult-platform/consult-readiness.md` §6-7 |

---

# Convention

- Each spec has a `Version`, `Status` (Draft → Final), and `Last Updated` date
- Draft = open for discussion, not yet implemented
- Final = approved, code may be written to match it
- Changes to Final specs require a version bump and re-approval

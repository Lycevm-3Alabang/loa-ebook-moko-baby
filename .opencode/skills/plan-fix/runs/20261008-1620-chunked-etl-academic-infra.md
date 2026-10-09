---
skill: plan-fix
story: Chunked idempotent ETL upload on AcademicInfrastructurePage for student + faculty 2026-1 CSVs (batched inserts, reference specs/seed-2026-1-etl.md)
repo: regie-worktree
calibration: {1: "A", 2: "B", 3: "A", 4: "D", 5: "B", 6: "Other — reused from 1559 run"}
workflow: "D"
decision: "option-1 client-chunked JSON over existing routes — approved"
status: implementing
pending: slice-1
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | Chunked ETL upload on academic-infrastructure page | recorded 2026-10-08 |
| calibration-reuse | Use last calibration (1A 2B 3A 4D 5B 6Other) | A — Use it |
| scan-pick | Client-chunked JSON (option 1) | 1 |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes |
| who-implements | Who implements? | B — Code it |
| slice-1 | Slice 1/6 shared client chunker → features/admin-data/components/useChunkedImport.ts | applied; npm test not runnable — node_modules missing in worktree (vitest not found), new file is client-only so existing tests unaffected |
| continue-1 | Continue to slice-2? | continue |
| slice-2 | Slice 2/6 faculty chunk loop → FacultyLoadingTab.tsx (decode + 500/chunk POST + global-row aggregate + determinate progress/cancel) | applied; npm test not runnable — vitest missing in worktree, no server change |
| continue-2 | Continue to slice-3? | continue |
| slice-3 | Slice 3/6 student chunk loop → BulkStudentImport.tsx (decode + 500/chunk POST + origin-row failed mapping + CSV concat + determinate progress/cancel) | applied; npm test not runnable — vitest missing in worktree, no server change |
| continue-3 | Continue to slice-4? | continue |
| slice-4 | Slice 4/6 route chunk-metadata → import/faculties + import/students routes (optional cursor fields, audit on isLast only, echo cursor) | applied; npm test not runnable — vitest missing in worktree |
| continue-4 | Continue to slice-5? | continue |
| slice-5 | Slice 5/6 service idempotency → etlEvaluation.ts additive create+ignore-23505 (replaces replaceBySection); student addEnrollments verified chunk-safe, no change | applied; npm test not runnable — vitest missing in worktree |
| continue-5 | Continue to slice-6? | continue |
| slice-6 | Slice 6/6 verify UX → accounting + seed-reference boxes in faculty + student result panels (display-only) | applied; tsc/vitest unavailable — node_modules missing in worktree, verification must run where deps exist |
| followup-assert | Assert expected (CSV rows) vs generated | Other — CSV is the denominator, not seed constants |
| slice-7 | Slice 7/6 CSV-grounded assert → unaccounted = sent − mapped/enrolled − skipped − errors; loud incomplete state + per-box accounted line | applied; tsc/vitest unavailable at the time — node_modules missing in worktree |
| verify-1 | User ran lint/test/tsc where deps exist | lint 0 errors (1 pre-existing warning in untouched users.service.ts); 3 test failures in etlEvaluation.test.ts caused by slice-5 (mock lacks create); 17 tsc errors in 3 test files pre-existing (untouched areas) |
| slice-8 | Slice 8 test-mock fix → etlEvaluation.test.ts facultySubjectRepository mock gains create, fsRepo helper + success assertion updated to additive call shape | applied; etlEvaluation.test.ts 35/35 green |
| verify-2 | Live-CSV verification (C: UI canonical) → profiled 28,096 rows/file; found blank-email hole: JSON path would createMany({email:""}) garbage user + attach 189 enrollments (assert-blind) | confirmed via users.repository.ts createMany |
| slice-9 | Slice 9 server guards → importStudents skips blank student/faculty email into failed-with-remark (mirrors FormData validation + seed §4 skip-and-report); excludes "" from batch user creation | applied; npm test 211/211 green |
| followup-wrong | Wrong-uploads downloadable report (blank emails, wrong domains) — fork: report-only vs exclude-from-insert | B — Exclude (totals drop vs seed; wrong rows still seed subjects/sections, create no users/mappings/placeholder) |
| slice-10 | Slice 10 service exclude → faculty parse+import filters (blank/wrong-domain → error buckets, no placeholder/users/mappings); student import domain guard; route JSON passes blanks through (no DUMMY substitution); fixtures moved to lyceumalabang domain | applied; npm test 211/211 green; lint 0 errors (1 pre-existing warning untouched) |
| tsc-drift | 17 pre-existing tsc errors in 3 untouched test files — root-caused, fix applied | applied; tsc clean, npm test 211/211 green, lint 0 errors |
| commit | Commit relevant changes, no SQL (not migrations) | 0ab15e8 — 10 files (routes, ETL UI, services, tests); seed artifacts + .opencode left untracked |
| continue-6 | Continue to slice-11? | continue |
| slice-11 | Slice 11 faculty wrong-uploads CSV → built at aggregation from global-row errors joined with preview rows + download button; student side already via import-failures.csv | applied; tsc clean, npm test 211/211 green, lint 0 errors |
| commit-2 | Commit only relevant (slice-11 on top of 0ab15e8) | de5622c — FacultyLoadingTab only; seed/SQL artifacts left untracked |
| commit-3 | Commit specs/md only, no py/sql | 7a22649 — specs/seed-2026-1-etl.md only; generator, SQL dumps, zip, .opencode scratch left untracked |
| followup-leave | Refresh/leave guard during import (progress exists but nothing blocks accidental unload; state is in-memory) | slice-12: beforeunload guard + do-not-leave hint in both importers |
| slice-12 | Slice 12 leave-guard → beforeunload while importing + stay-on-page hint in faculty + student progress UI | proposed |

| slice-12 | Slice 12 leave-guard → beforeunload while importing + stay-on-page hint in faculty + student progress UI | applied; tsc clean, npm test 211/211 green, lint 0 errors |

| lint-warn | Pre-existing `_err` warning in untouched users.service.ts (caught-errors not covered by args `_` exemption) | applied optional `catch`; lint fully clean, tests green |
| slice-13 | Slice 13 bulk-remove blocked rows + refresh CSV hints (chunking, email-domain rules, no-placeholder, idempotent re-upload) in faculty + student previews | applied; tsc clean, npm test 211/211 green, lint fully clean |
| slice-14 | Slice 14 auto-download removed-rows CSV on import completion (faculty: track removals + build; student: reuse removed list; manual buttons stay as fallback) | applied; tsc clean, npm test 211/211 green, lint fully clean |
| slice-15 | Slice 15 per-chunk persistence ledger → hook history (rows/saved/skipped/issues per chunk incl. failures) + ledger UI with persisted % in both importers | applied; tsc clean, npm test 211/211 green, lint fully clean |
| keepalive | Keep-alive so chunks never time out + rest period vs rate limits — vectors: (A) serverless cap/chunk, (B) hung request, (C) rate limits between chunks | slice-16: abortable rest + per-chunk deadline w/ sub-controller + retry w/ backoff + maxDuration |
| slice-16 | Slice 16 keep-alive → hook restMs/deadline/retry/backoff, routes maxDuration=60; call sites unchanged (hook defaults); server concurrency deferred | proposed |
| backoff-align | Supabase-aligned retry: honor Retry-After/X-RateLimit-Reset, exp base 1s ×2 cap 30s + jitter, retryable = 429/408/425/5xx/network (never 4xx/Abort) | verified vs docs + SDK conventions |
| slice-16b | Slice 16 applied with aligned backoff → abortable 750ms rest, 120s per-attempt deadline on sub-controller, error-hint enrichment at both call sites, maxDuration on both routes (attempts revised by slice-17) | applied; tsc clean, npm test 211/211 green, lint fully clean |
| slice-17 | Slice 17 retry-exhausted rows → failed downloads (see Decisions extension below) | applied; tsc clean, npm test 211/211 green, lint fully clean |
| rebrand | Rename LOA Connect Hub → ACES / Academic Consultation & Evaluation System (17 files: UI marks, layout, emails, iCal+test, package+lock, docs) | applied; zero stragglers, npm test 211/211 green, lint clean |
| spec-access | specs/student-access-activation.md — imported-user states, activate/forgot/change-password contract, domain rules, 2026-1 access counts (3,212 students + 147 faculty activatable), email-delivery gate, runbook, drift notes | written, uncommitted |

## Pending

- done (uncommitted: slices 12–17 + lint-warn; remaining: live 2026-1 upload; server concurrency batches deferred)

## Decisions

- tsc-drift root causes: (1) email-templates line 126 — template gained required `variant`, sibling tests pass it per-call but the attendee-join test was never updated (fixture predates the field); (2) etlEvaluation 6× arity — `importStudentEnrollments` has zero prod callers and its tests predate the required `semesterId` param; sibling `importFacultySubjects` uses optional `semesterId?`, so optional matches file convention (also avoids breaking the exact-match `seRepo` assertion, which treats missing≈undefined but not null); (3) middleware 10× — `proxy(request: NextRequest)` but the test double is cast to `Request`; the double already carries `nextUrl`/`headers` and tests only assert status codes, so re-targeting the cast is behavior-preserving.
- repository.md read: Layering = Route Handler → Controller → Service → Repository → Supabase; tracker = user text only (using request text); proof command = npm test
- Calibration reused from 20261008-1559 run per answer A (compact card, bullets, 3-5 bullets max, workflow D, quiet implement, teach-only-when-load-bearing reframed for UI work)
- Gold paths read-first: features/admin-data/components/AcademicInfrastructurePage.tsx, FacultyLoadingTab.tsx, csv-helpers.ts, lib/services/etlEvaluation.ts + studentImport.ts, app/api/import/faculties|students|preview route.ts
- Scan-pick option-1 approved: client-chunked JSON over existing routes (sequential 500-row POSTs, resume/aggregate)
- Invariant preservation for option-1: thin routes (chunk loop in client hook, routes keep parse+call+JSON); proxy guards reused (requireAdmin/requireRole, no service_role bypass); repo-DI only (no new direct supabase writes; chunk still calls upsertMany/findManyByEmail/createMany/addEnrollments); SubmitButton/progress disable per chunk (no double-submit); pipe-role kept (FACULTY/STUDENT via existing user creation + userrole)
- Layering order for slices: client chunk hook → Route Handler (faculties/students, add chunkIndex metadata + single audit at end) → Service (per-chunk idempotent batch, keep parse once client-side) → Repository (upsertMany/ON CONFLICT, addEnrollments dedup) → Supabase
- Proof: npm test must stay green + second-run no-op + 08-verify counts (148/3302/903/21989); manual check with 2026-1 CSVs in 500-row chunks

## Scan

Path: AcademicInfrastructurePage.tsx (tabs) → FacultyLoadingTab.tsx handleCsvFile/handleCsvImport (single POST /api/import/faculties with all rows) + EnrollmentsTab → etlEvaluation.ts importFacultySubjects (upsertMany subjects/sections, findManyByEmail+createMany users, replaceBySection per section) → studentImport.ts importStudents (per-row findByCode/findByNameAndProgram + per-row findBySubjectSectionAndFaculty, then addEnrollments) → repositories via factory → Supabase
Proof: lib/__tests__/etlEvaluation.test.ts, csv-helpers.test.ts, import-preview.test.ts. Command: npm test
Teach: chunk boundary must sit at service layer so preview/flags stay client-side while inserts stay idempotent via existing uniques + ON CONFLICT; alternative is SQL-dump path from seed-2026-1 spec (bypasses app invariants)
Lens:
- API routes stay thin: applies — chunk loop lives in client/service, routes keep parse+call+JSON (faculties/route.ts, students/route.ts)
- proxy.ts access-enforcement: applies — reuse requireAdmin/requireRole guards, no bypass
- Supabase via repositories/DI: applies — etlEvaluation.ts + studentImport.ts already go through factory; chunked ETL must not add direct supabase writes outside repos
- SubmitButton double-click guard: applies — FacultyLoadingTab/EnrollmentsTab import buttons need guard + per-chunk progress disable
- Pipe-delimited role priority: applies — users/userrole rows keep FACULTY/STUDENT convention from seed spec §5

## Plan

Slice order follows layering (one slice per implement-fix turn):
1. Shared client chunker in features/admin-data/components/ (parse once cp1252-aware + TRIM + section split, deriveCsvFlags once, 500/chunk sequential POST with chunkIndex/totalChunks/fileId/isLast, progress + retry-failed-chunk + cancel, SubmitButton guard).
2. Faculty path in FacultyLoadingTab importer (toggle Faculty|Student): aggregate matched/createdSubjects/createdSections/errors with global row numbers; blocked + invalid-dept still gate start; semester-gated.
3. Student path in EnrollmentsTab/BulkStudentImport wiring: same chunker; faculty-first ordering (disable until faculty chunks done or mapping exists); keep blank-email skip + placeholder rules from seed §4.
4. Route Handler touch-up in app/api/import/faculties + students (accept optional chunk metadata, no breaking change; single audit log on isLast; keep parse+call+JSON thin).
5. Service idempotency fix in lib/services/etlEvaluation.ts (+ studentImport.ts check): chunked faculty mode uses additive ON CONFLICT DO NOTHING on UNIQUE(subject,section,semester), not replaceBySection per chunk (replace would wipe prior chunks); student addEnrollments stays additive with dup skip.
6. Verify UX: post-run counts panel mirroring 08-verify (148/3302/903/21989) + second-run no-op note + failure-CSV download.
Proof: npm test must stay green + second-run no-op + 08-verify counts; manual check with 2026-1 CSVs in 500-row chunks. Out of scope: dept official names, subject.name real names, source-data fixes, server-staging alternative.

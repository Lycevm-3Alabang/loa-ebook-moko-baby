---
skill: plan-fix
story: coverage-redesign-unique-students-disputes-matrix (coverage KPIs and department/subject matrix: unique students, disputes, in-progress)
repo: e-consultation (regie-worktree)
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: D
decision: Option A (extend getEvaluationStatus to compute unique students, participated, disputed, inProgress, notParticipated per subject and per department; keep existing counts for backward compat)
status: done
pending:
slice-1
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| who-implements | Who implements | B (Code it) |
| slice-1 | Apply slice 1 (batched enrollment fetch) | Applied — listStudentIdsByFacultySubjectIds added |
| slice-2 | Apply slice 2 (service rewrite + UI + CSV) | Applied — service aggregation, KPIs, dept/subject tables, export columns |
| slice-3 | Apply slice 3 (service tests + proof) | Applied — evaluation-status-aggregate.test.ts (8 tests); tsc+lint clean; 493/493 pass |

## Pending
none

## Decisions

Option A (extend getEvaluationStatus to compute unique students, participated, disputed, inProgress, notParticipated per subject and per department; keep existing counts for backward compat). User confirmed: unique students per department YES; export CSV includes new columns YES; 4-state bucket model same. Invariants: API routes stay thin — app/api/; Supabase via repositories + DI — lib/repositories/factory.ts; proxy.ts access enforcement admin/dean/faculty; Role priority; SubmitButton. Layering: service (evaluation-status.service.ts) → repositories → Supabase. Gold paths: app/api/, features/, proxy.ts, lib/repositories/factory.ts. Proof: npm test + tsc --noEmit. Out of scope: faculty views, scoring/results, PDF, enrollment edits, recompute/invalidation.

## Scan

Path: app/admin/evaluations/coverage/page.tsx → CoveragePage.tsx → useApiGet("/api/admin/evaluation-status") → app/api/admin/evaluation-status/route.ts → features/evaluations/evaluation-status.service.ts (getEvaluationStatus) → evaluationRepository.countSubmittedByFacultySubjectIds + studentEnrollmentRepository.countByFacultySubjectIdsPaged. Detail modal → getEvaluationStatusDetail → listByFacultySubject + listStatusByPeriodAndFacultySubjectIds.
Proof: lib/__tests__/evaluation-status-detail.test.ts covers detail method only; no test for getEvaluationStatus aggregate. Command: npm test.
Teach: Current service only counts; needs to fetch enrolled student IDs + eval status rows to compute distinct counts and 4 buckets per subject and per department. Heavier query but bounded by roster size.
Lens:
- API routes stay thin — app/api/ — applies
- All Supabase access via repositories wired by DI — lib/repositories/factory.ts — applies
- proxy.ts access enforcement — applies (admin/dean/faculty gating)
- Role priority ADMIN > DEAN > FACULTY > STUDENT — applies
- Double-click prevention via SubmitButton — applies
Gold paths: app/api/, features/, proxy.ts, lib/repositories/factory.ts

## Plan

- S1: Service rewrite evaluation-status.service.ts — getEvaluationStatus fetches enrolled students + eval status rows; compute per-subject enrolled/participated/disputed/inProgress/notParticipated; per-department facultyCount/subjectCount/uniqueStudents (distinct across subjects)/participated/disputed/inProgress/notParticipated (distinct student sets)/completion%. Keep existing submitted/expected/pct for backward compat.
- S2: Batched enrollment fetch student-enrollment.repository.ts — listByFacultySubjectIds(fsIds[], semesterId) returning Map<fsId, studentId[]> (chunked) to avoid N+1.
- S3: Service tests — distinct-count correctness (student in 2 subjects counts once), 4-bucket classification, disabled-submitted→disputed, empty department zeros, multi-dept de-dupe.
- S4: Route shape — verify app/api/admin/evaluation-status/route.ts passes new fields; dean route unaffected.
- S5: UI KPIs + tables CoveragePage.tsx — replace Responses card with Unique Students/Participated/Disputed/In-progress; department table columns (Faculties, Subjects, Students, Participated, Disputed, In-progress, Not Participated, Completion%); subject table columns (Enrolled, Participated, Disputed, In-progress, Not Participated, Completion%).
- S6: Export CSV columns CoveragePage.tsx — add new columns.
- S7: Proof — npm test + tsc --noEmit + lint.
Out of scope: faculty views, scoring/results, PDF, enrollment edits, recompute/invalidation.

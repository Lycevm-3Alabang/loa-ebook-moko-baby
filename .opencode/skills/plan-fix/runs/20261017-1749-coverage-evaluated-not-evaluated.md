---
skill: plan-fix
story: coverage-evaluated-not-evaluated-lists (admin + dean see evaluated vs not-evaluated students per faculty-subject)
repo: e-consultation (regie-worktree)
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: D
decision: Option A (reuse admin coverage via shared component; thin dean route delegating to same service; role-scoped)
status: done
pending:
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| who-implements | Who implements | B (Code it) |
| slice-1 | Apply slice 1 (service + repo method) | Applied — getEvaluationStatusDetail + listStatusByPeriodAndFacultySubjectIds added |
| slice-2 | Apply slice 2 (admin route facultySubjectId) | Applied — route updated |
| slice-3 | Apply slice 3 (dean route) | Applied — app/api/dean/evaluation-status/route.ts created |
| slice-4 | Apply slice 4 (access grants) | Applied — lib/access.ts + supabase-schema.sql migration 37 |
| slice-5 | Apply slice 5 (shared CoveragePage + admin refactor) | Applied — features/evaluations/components/CoveragePage.tsx created; admin page thinned |
| slice-6 | Apply slice 6 (dean page) | Applied — app/dean/evaluations/coverage/page.tsx created |
| slice-7 | Apply slice 7 (sidebar dean Coverage link) | Applied earlier |
| slice-8 | Apply slice 8 (tests) | Applied — evaluation-status-detail (6), admin route (4), dean route (6) |
## Pending
none

## Decisions

Option A refined: reuse admin's coverage (no duplicate page) — extract the coverage page body into a shared component; dean page renders the same component scoped to his department. Endpoint: thin dean route that delegates to the same service method with dean scope (consistent with existing evaluation-results split), rather than duplicating logic. Invariants: API routes stay thin (parse, call service, return JSON) — app/api/; All Supabase access via repositories wired by DI — lib/repositories/factory.ts; proxy.ts access enforcement — admin/dean/faculty gating; Role priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts; SubmitButton double-click prevention for any new actions. Layering: service (evaluation-status.service.ts) → repositories → Supabase; routes thin. Gold paths: app/api/, features/, proxy.ts, lib/repositories/factory.ts. Proof: npm test. Out of scope: faculty views, scoring/results, PDF export, enrollment edits, recompute/invalidation. Privacy: server-side scoping (dean own dept, admin all); faculty excluded. Performance: lazy per-row fetch to avoid large payloads.

## Scan

Path: app/admin/evaluations/coverage/page.tsx → useApiGet("/api/admin/evaluation-status") → app/api/admin/evaluation-status/route.ts (GET) → features/evaluations/evaluation-status.service.ts (getEvaluationStatus) → evaluationRepository.countSubmittedByFacultySubjectIds + studentEnrollmentRepository.countByFacultySubjectIdsPaged + userRepository.listByDepartment. Per-subject drill: features/evaluations/evaluations.repository.ts (listSubmittedByPeriodAndFacultySubjectIds) + features/admin-data/student-enrollment.repository.ts (listByFacultySubject).
Proof: lib/__tests__/evaluation-report-dashboard.test.ts covers dashboard service only; no test for evaluation-status.service or its route. Command: npm test.
Teach: Coverage currently aggregates counts only. The raw ingredients for "who evaluated vs not" already exist (submitted eval rows + enrolled students) but are never joined/surfaced. Dean has no coverage page or endpoint today; faculty must stay excluded via proxy/route guards.
Lens:
- API routes stay thin (parse, call controller/service, return JSON) — app/api/ — applies; new endpoints follow this
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts — applies
- proxy.ts is the access-enforcement point (JWT + DB role + tokenVersion) — proxy.ts — applies; admin/dean/faculty gating
- Double-click prevention via SubmitButton — components/ui — applies to any new action buttons
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — applies
Gold paths: app/api/, features/, proxy.ts, lib/repositories/factory.ts

## Plan

- S1: Service method getEvaluationStatusDetail(evaluationPeriodId, facultySubjectId, scope) in features/evaluations/evaluation-status.service.ts — resolve period semesterId; fetch enrolled students via studentEnrollmentRepository.listByFacultySubject(fsId, semesterId); fetch evals via evaluationRepository (all statuses) for that fs+period; classify each enrolled student into exactly one bucket: Participated (status SUBMITTED & !isDisabled), Disputed (status INVALID OR status SUBMITTED & isDisabled), In-progress (status DRAFT, no participated/disputed), Not Participated (none of the above). Priority: Participated > Disputed > In-progress > Not Participated. Returns { participated, notParticipated, disputed, inProgress } each {id,name,email}[]. Scope enforced by caller.
- S2: Admin route app/api/admin/evaluation-status/route.ts — add optional facultySubjectId query param; when present call detail method (admin scope) and return {participated, notParticipated, disputed, inProgress}; otherwise existing behavior. Guarded by requireAdmin.
- S3: Dean route new thin app/api/dean/evaluation-status/route.ts — auth + hasRole(DEAN); resolve dean's department via departmentRepository.findByDeanId; verify the requested fs belongs to that department (403 otherwise); call same service method with dean scope.
- S4: proxy.ts — add /dean/evaluations/coverage to dean pages and /api/dean/evaluation-status to dean API access; faculty excluded.
- S5: Shared coverage component features/evaluations/components/CoveragePage.tsx — extract coverage page body (props: apiBase, role) with expandable per-subject rows that lazily fetch ?facultySubjectId=... and render four buckets: Participated, Not Participated, Disputed, In-progress. Refactor app/admin/evaluations/coverage/page.tsx to render it.
- S6: Dean page app/dean/evaluations/coverage/page.tsx — renders shared component with dean apiBase. No duplicated page logic.
- S7: Sidebar — add dean Coverage link.
- S8: Tests — service detail method (classification, scoping, disabled exclusion, empty roster) + admin route (400/403/shape) + dean route (403 on cross-dept fs). Proof: npm test.
Out of scope: faculty views, scoring/results, PDF export, enrollment edits, recompute/invalidation. Privacy: server-side scoping (dean own dept, admin all); faculty excluded. Performance: lazy per-row fetch.

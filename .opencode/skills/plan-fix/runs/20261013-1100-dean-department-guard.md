---
skill: plan-fix
story: dean assigned to a department must belong to that department (strict guard, option A)
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A strict guard both layers (POST role-check, PATCH full match, filtered dropdowns)"
status: ready-for-implement-fix
pending: handoff
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| option | Which option (A/B/Other)? | A — strict guard both layers |
| plan-done | Is this plan done? | A — Done |

## Pending

- handoff: Run implement-fix with this file?

## Plan

Slice 1 — POST guard (app/api/admin/departments/route.ts): when deanId present, findById → 404 unknown; 400 when role lacks DEAN. Membership check vacuous at create (no id yet); unassigned/null always allowed.
Slice 2 — PATCH guard (app/api/admin/departments/[id]/route.ts): unknown → 404; non-DEAN → 400; user.departmentId ≠ id (incl. null) → 400 naming actual department; deanId null always allowed.
Slice 3 — UI filters (DepartmentsCoursesTab.tsx): Edit dropdown = deans with departmentId === editing dept; Add dropdown = DEAN-role users with departmentId == null + hint to set home department via Users first; server errors via existing setError.

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Calibration reused (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text: Departments Management Edit (and Add) lets any DEAN-role user head any department; Nin Alamo (home dept ≠ COE) assignable as COE dean. Request pre-selected option A (strict guard, both layers). No issue fetch (tracker is user text only).
- Layering order for trace/slices: Route Handler → Repository → Supabase (no service/controller exists for departments; verification stays as guard calls in routes). Gold paths read first: features/admin-data/components/DepartmentsCoursesTab.tsx, app/api/admin/departments/route.ts + [id]/route.ts, features/admin-data/department.repository.ts, features/users/users.repository.ts.
- Proof command: npm test (no tests cover dean assignment; department-panels/etlEvaluation/reports touch departments but not this path).
- Invariant preservation: API thin (applies — guard lookups via repos, routes stay parse/verify/return); Supabase via repos+DI (applies — userRepository.findById via factory, zero direct supabase in routes); proxy.ts (n/a — requireAdmin first line untouched); SubmitButton (n/a — saving flag already guards, no new submit path); role pipe priority (applies — dean derivation from pipe roles kept, only department-filtered).
- Option A approved: server 400 on mismatch (POST + PATCH) + filtered dropdowns (Add + Edit). Layering order for slices: Route Handler (POST, then PATCH) → UI (dropdown filters). Gold paths to re-read at build: app/api/admin/departments/route.ts, app/api/admin/departments/[id]/route.ts, features/admin-data/components/DepartmentsCoursesTab.tsx. Proof: npm test. NULL-department assignees rejected by default; existing bad rows flagged, not migrated.
- Who implements: Code it (each slice still needs explicit Apply this slice).

## Scan

Path: features/admin-data/components/DepartmentsCoursesTab.tsx:55 unfiltered deans → :204-207 edit dropdown + :236-239 add dropdown → app/api/admin/departments/route.ts:34-38 POST + [id]/route.ts:38-41 PATCH (deanId pass-through) → features/admin-data/department.repository.ts create/update → Supabase departments.deanId FK (existence only)
Proof: none. Command: npm test
Teach: the FK departments.deanId → users(id) guarantees the user exists, never that the user belongs here — membership (users.departmentId = this department) is not expressible as an FK and would need a trigger in SQL, so the check belongs in the application via userRepository.findById. One alternative is filtering the dropdown only, but direct fetch bypasses UI entirely.
Lens:
- API routes stay thin: applies — app/api/admin/departments/route.ts, [id]/route.ts
- Supabase via repositories + DI: applies — lib/repositories/factory.ts, features/users/users.repository.ts:75 findById (returns departmentId + pipe role)
- proxy.ts access-enforcement: n/a + requireAdmin untouched, no new unauthenticated path
- SubmitButton double-click prevention: n/a + saving-flag guard already present, no new submit path
- Role pipe-delimited priority: applies + dean derivation from pipe roles kept, department filter added

## Plan

- empty (awaiting plan-done; draft proposed in chat)

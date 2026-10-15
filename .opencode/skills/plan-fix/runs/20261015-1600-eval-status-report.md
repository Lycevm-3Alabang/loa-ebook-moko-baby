---
skill: plan-fix
story: Admin-only student evaluation status per department with drilldown to all evaluated subjects; own nav item under Evaluation(s); propose page layout
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A dedicated status page with dept→subject drilldown (ADMIN-only nav)"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| reuse | Use last calibration 1A 2A 3B 4D 5A 6C? | Use it |
| layout | Which layout for status report? | A dedicated page |
| plan-done | Is this plan done? | Done |
| who-implements | Who implements this slice? | Code it |
| slice-1a | Apply Sidebar Status item? | Applied |
| slice-1b | Apply route shell (page + loading)? | Applied (native input; SearchInput is meetings-specific) |
| slice-2a | Apply status service (new file)? | Applied |
| slice-2b | Apply status API route? | Applied |
| slice-3 | Apply page wiring? | Applied — subject rows show subject only, no faculty names (display + search) |
| slice-4 | Apply access grants? | Applied (access.ts + page-api-map.ts + Migration 35) |
| fix-500 | Server import in client bundle? | Applied (STATUS_ON_TRACK_PCT → constants.ts) |
| scale-1 | Paginated submitter counter? | Applied (interface + repo method, service switched) |
| scale-2 | Paginated enrollment counter? | Applied (additive countByFacultySubjectIdsPaged, service switched; original untouched) |
| scale-3 | Drilldown pagination? | Applied (usePagination + Paginator, 25/page, resets on dept/search) |
| faculty-col | Show faculty in drilldown? | Applied (expected-vs-actual per faculty-subject; search includes faculty) |
| dedupe | Strip Results overlap? | Applied (Coverage title, no Responses on dept table, Ratings → bridge) |
| rename | Status → Coverage? | Applied (route + nav + grants + M36; /status kept as redirect stub) |

## Pending

- none

## Pending

- handoff

## Pending

- plan-done

## Decisions

- Calibration reused: 1A 2A 3B 4D 5A 6C
- Layering order: Route Handler → Controller → Service → Repository → Supabase
- Gold paths read-first: components/layouts/Sidebar.tsx (nav), app/admin/evaluations/results/page.tsx + [departmentId]/page.tsx (drilldown pattern), features/evaluations/evaluations.repository.ts (SUBMITTED status)
- Proof command: npm test (no status-report test exists; add service count test on build)
- Approved layout A: dedicated /admin/evaluations/status — filters + KPI strip + dept table → subject drilldown; nav Status under Evaluations ADMIN-only
- Invariants preserved by: thin GET route → controller → service → repository (factory); PAGE_ACCESS + group_access ADMIN gate; SubmitButton on filter/export; role priority untouched
- Threshold assumption: evaluated subject = ≥1 SUBMITTED response; expected = enrolled students per mapping (confirm on Done)
- Invariants: API thin / proxy gate / repos-via-factory / SubmitButton / role-priority — all apply on build; spec only for now

## Scan

```text
Path: Sidebar getEvaluationChildren (components/layouts/Sidebar.tsx:42-58) → admin results page (app/admin/evaluations/results/page.tsx) → dept detail ([departmentId]/page.tsx + DepartmentSubjectView) → evaluations.repository status SUBMITTED (features/evaluations/evaluations.repository.ts:276,327)
Proof: none. Command: npm test
Teach: status ≠ results — evaluations.status (SUBMITTED/DRAFT/INVALID) + enrollments expected = coverage; existing Results pages show ratings, not completion; new page is the missing coverage leg
Lens:
- API routes stay thin: applies — new GET under /api/admin/... parses, calls controller, returns JSON
- proxy.ts access-enforcement: applies — new page + API ADMIN-only via PAGE_ACCESS + group_access seed
- Supabase via repositories: applies — status counts via evaluations.repository + enrollments, wired in factory
- SubmitButton guard: applies — any filter/export form buttons use it
- Role pipe-delimited priority: applies — ADMIN-only nav + API guard
```

## Scan

## Plan

Slice 1 — shell + nav gate: Sidebar Status item (ADMIN), proxy PAGE_ACCESS + group_access seed, page + loading + error shell with filters/KPI/table skeletons (no data)
Slice 2 — coverage API: thin GET /api/admin/evaluation-status → controller → service math (evaluated = ≥1 SUBMITTED, expected = enrolled, INVALID excluded) → repository counts via factory + service test
Slice 3 — tables + drilldown: dept table (sort/search/badges/%) → ?dept= subject table (search/paginate/badge/View link to results detail), empty/error states, dark mode

---
skill: plan-fix
story: Avg. Rating column sometimes not displaying at app/admin/evaluations/results/ (department level and individual/faculty level)
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option C live source of truth (dept list reads live averages; cache writes continue)"
status: implementing
pending: slice-1
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| option | Which option (A/B/C/Other)? | C — Live source of truth |
| who-implements | Who implements Slice 1? | B — Code it |
| slice-1 | Apply Slice 1 (repository live reader + interface)? | Applied — LiveDeptAverage + listLiveDeptAverages; tests not run per H1 |
| slice-2 | Apply Slice 2 (route switch)? | Applied — route reads listLiveDeptAverages; shape frozen; no dangling imports |
| slice-3 | Proof review | Done — checklist + consumer check below; user-run commands pending |

## Pending

- none (run closed; user verifies via tsc + vitest + visual)
- Gold paths re-read for Slice 2: app/api/admin/evaluation-results/route.ts (full, 177 lines), Slice 1 listLiveDeptAverages, drill-in departments/[departmentId]/route.ts:40-48 (submitted-evals + ratings pattern)

## Decisions

- repo refined: read repository.md (Layering Route Handler → Controller → Service → Repository → Supabase; tracker user text only)
- Calibration reused (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text: Avg. Rating column sometimes not displaying ("—") at app/admin/evaluations/results/, both department level (page.tsx) and individual/faculty level ([departmentId]/ + DepartmentSubjectView). No issue fetch (tracker is user text only).
- Verified pre-scan via two explore passes against HEAD 00ab927 (post-pull): results pages + drill-in route + evaluation-utils + api/client unchanged by the 7 pulled commits; 9c36e3d added only live home-dept mapping to admin/dean results routes; hasCategoryData/hasMissing gate predates the pull.
- Layering order for slices: Route Handler (gate heal) → Repository (placeholder/compute fixes) → Supabase (verify columns exist via migrations). Pages, services, tests untouched.
- Gold paths read first: app/api/admin/evaluation-results/route.ts:16-30 gate, :46-115 liveDeptMap, :129-141 avgRating; features/evaluation-results/evaluation-results.repository.ts:168-183 rating-less null, :212-227 GC-in-compute, :261-272 setVisibility placeholders; lib/evaluation-utils.ts (computeGeneralRating/getRemark null-safe).
- Proof command: npm test (repo Tests line). Plus diagnostic SQL: zero rows with generalRating IS NULL for the period; visual check both pages. No new tests (none cover this path today).
- Option C approved: dept list reads live-computed averages like the drill-in route; cached generalRating keeps being written (dashboard service + other consumers untouched); response shape frozen.
- Slices (layering order, one file per build turn): Slice 1 Repository — add live per-dept average reader in features/evaluation-results/ reusing computeCategoryAverages/computeGeneralRating over submitted evals (route stays thin); Slice 2 Route Handler — app/api/admin/evaluation-results/route.ts sources avgRating/remarks/highest/lowest from the live reader, grouping still via liveDeptMap; Slice 3 Proof — npm test + diagnostic SQL + visual both pages + confirm dashboard-service cache consumers unaffected.
- Gold paths to re-read at build: app/api/admin/evaluation-results/departments/[departmentId]/route.ts:59-100 (reference pooling pattern), lib/evaluation-utils.ts, lib/repositories/factory.ts.
- Risks: per-request live compute over all depts is heavier than cache read (mitigate by reusing the drill-in route's existing helpers, no new queries); cached writes continue so no dashboard regression; __unknown__/Unassigned bucket behavior preserved via liveDeptMap.
- Invariant preservation: API thin — strained, route already embeds supabase + fallback chain (noted as concern, fix keeps logic in repository where possible); Supabase via repos + DI — same strain, new code prefers repository methods; proxy.ts — n/a (no new routes, requireAdmin unchanged); SubmitButton — n/a (read-only pages, no forms); role priority — n/a (no gates touched).

## Scan

```text
Path: results/page.tsx:169 cell → :90 formatScore (null → "—") → GET api/admin/evaluation-results/route.ts:129-141 (avgRating null iff no non-null generalRating) → gate :16-30 (recompute only if all-null or wholly-missing faculty) → repository compute :168-183 (general=null when zero usable ratings) + setVisibility :261-272 (writes null-generalRating placeholder rows, totalRespondents 0) → evaluations/evaluation_ratings/rubric_* tables. Faculty level: [departmentId]/page.tsx:73-76 → DepartmentSubjectView.tsx:363 → departments/[departmentId]/route.ts:78-80 live computeGeneralRating.
Proof: none — no test covers results route/compute (evaluation-report-dashboard.test.ts covers dashboard service only). Command: npm test
Teach: the cache heals only on all-null or brand-new faculty, so any null row written beside rated rows (placeholder toggle, rating-less compute) persists forever — the blank is stored, not rendered.
Lens:
- API routes stay thin: strained + route.ts:46-115 embeds direct supabase fallback chain (pre-existing; fix moves new logic into repository)
- Supabase via repositories + DI: strained + same direct-supabase import (pre-existing; no new violations)
- proxy.ts access-enforcement: n/a + no new routes, requireAdmin unchanged
- SubmitButton double-click prevention: n/a + read-only pages, no forms
- Role pipe-delimited priority: n/a + no role branching touched
```

## Plan

Slice 1 — Repository (live per-dept average reader): add a method in features/evaluation-results/ that returns live per-department averages (avgRating, remarks, highest/lowest rubrics, facultyCount, totalRespondents) computed via computeCategoryAverages/computeGeneralRating over SUBMITTED, non-disabled, facultySubjectId-bound evals; grouping follows live home dept (users.departmentId + existing fallback chain). Route stays thin.
Slice 2 — Route Handler (switch the read path): GET app/api/admin/evaluation-results/route.ts sources avgRating/remarks/highest/lowest from the Slice 1 reader; response shape frozen (DepartmentRow unchanged, page.tsx untouched); cached generalRating keeps being written by compute(); __unknown__/Unassigned bucket preserved via liveDeptMap.
Slice 3 — Proof: npm test green; diagnostic SQL (generalRating IS NULL per period) reviewed; visual check dept list + drill-in; confirm dashboard-service cache consumers (deptPeriodAverages) unaffected.
Out: gate/heal logic changes (superseded), placeholder dashboards, pooled-dept-ratings story, loading shells, dean/faculty pages, new tests.

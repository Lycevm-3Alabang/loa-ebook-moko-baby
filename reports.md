# Reports Feature — Current State

## ADMIN

| Report | Route | Type | Filterable By |
|--------|-------|------|---------------|
| Department Health (General) | `/admin/reports/health` | Consultation | department, date range, status |
| Faculty Response Monitor (Backlog) | `/admin/reports/backlog` | Consultation | department, date range, status |
| Consultation Reach (Coverage) | `/admin/reports/coverage` | Consultation | department, date range, status |
| Consultation Demand Trend | `/admin/reports/demand` | Consultation | department, date range, status, granularity |
| Faculty Consultation Distribution | `/admin/reports/distribution` | Consultation | department, date range, status |
| Responsiveness (TAT) | `/admin/reports/responsiveness` | **redirects to health** — component exists but unrouted | — |
| Evaluation Results | `/admin/evaluations/results` | Evaluation | department, period, per-subject toggle, source, **ZIP export** |
| Evaluation Coverage | `/admin/evaluations/coverage` | Evaluation | period, department drill-down, subject drill-down, **CSV export** |
| Evaluation Reports Hub | `/admin/evaluations/reports` | Evaluation | links to sentiment |
| Sentiment Analysis | `/admin/evaluations/reports/sentiment` | Evaluation | sentiment label, period |

## DEAN

| Report | Route | Type | Filterable By |
|--------|-------|------|---------------|
| Department Health (General) | `/dean/reports/health` | Consultation | date range, status *(locked to own department)* |
| Faculty Response Monitor (Backlog) | `/dean/reports/backlog` | Consultation | date range, status *(locked to own department)* |
| Consultation Reach (Coverage) | `/dean/reports/coverage` | Consultation | date range, status *(locked to own department)* |
| Consultation Demand Trend | `/dean/reports/demand` | Consultation | date range, status, granularity *(locked to own department)* |
| Faculty Consultation Distribution | `/dean/reports/distribution` | Consultation | date range, status *(locked to own department)* |
| Responsiveness (TAT) | `/dean/reports/responsiveness` | **redirects to health** | — |
| Evaluation Results | `/dean/evaluations/results` | Evaluation | period, **ZIP export** *(department-filtered by API)* |
| Evaluation Coverage | `/dean/evaluations/coverage` | Evaluation | period, **CSV export** *(locked to own department)* |
| Evaluation Reports Hub | `/dean/evaluations/reports` | Evaluation | links to sentiment |
| Sentiment Analysis | `/dean/evaluations/reports/sentiment` | Evaluation | sentiment label, period |

## FACULTY

| Report | Route | Type | Filterable By |
|--------|-------|------|---------------|
| Consultation Reports | `/faculty/reports` | **redirects to `/admin/reports/health` (broken)** | — |
| Evaluation Results (own) | `/faculty/evaluations/results` | Evaluation | period *(visibility-gated by admin toggle)* |

## Gaps vs Requirements

| Requirement | Status |
|-------------|--------|
| **ADMIN:** Filterable report of evaluation results per department and per faculty | ✅ Exists at `/admin/evaluations/results` — department filter + per-subject toggle |
| **ADMIN:** Filterable report of consultations per department and per faculty | ✅ Exists — 5 consultation report types, all filterable by department |
| **DEAN:** Filtered report on department level for evaluations and faculty | ✅ Exists at `/dean/evaluations/results` — locked to own department |
| **DEAN:** Filtered report on department level for consultations and per faculty | ✅ Exists — same 5 report types, locked to dean's department (no department dropdown) |
| **FACULTY:** Individual report for evaluations (toggled by admin) | ✅ Partial — evaluation results page exists with visibility gating; "toggled by admin" is implemented via `setVisibility()` |
| **FACULTY:** Individual report for consultations | ❌ **Missing** — `/faculty/reports` redirects to admin (broken) |

## Naming: two different "coverage" reports

| Report | Scope | Counts |
|--------|-------|--------|
| **Consultation Reach (Coverage)** — `/admin\|dean/reports/coverage` | Consultations | Reached vs. unreached faculty, filtered by date range + status |
| **Evaluation Coverage** — `/admin\|dean/evaluations/coverage` | Evaluations | Participated / Disputed / In-progress / Not Participated, filtered by evaluation period |

They are unrelated features and share only a name. Do not conflate them in requirements
or tickets.

## Architecture Notes

- **Consultation reports** are server-side rendered (async server components → controller → service → repository → Supabase). No REST endpoints.
- **Evaluation results** are client-side fetched via REST API endpoints (`/api/{role}/evaluation-results`).
- **Evaluation coverage** shares one component, `features/evaluations/components/CoveragePage.tsx`, between admin and dean. Status semantics:
  - Bucket priority is `Participated > Disputed > In-progress > Not Participated` — a student is counted in exactly one bucket.
  - `SUBMITTED` + `isDisabled` counts as **Disputed**, not Participated.
  - **Unique students are deduplicated per department.** The headline `Unique students` KPI sums those per-department counts, so it is *not* distinct across departments — a student enrolled in two departments counts twice.
  - The status query revalidates on window focus and polls every 30s, so an admin who toggles `isDisabled` mid-window sees the change without a manual reload. (Global `SWRConfig` keeps `revalidateOnFocus: false`; only this page opts in.)
- **Exports** are generated client-side:
  - Coverage CSV — built in the page from the already-fetched status payload.
  - Results ZIP — one CSV per department plus a `summary.csv`, zipped by the dependency-free `lib/zip.ts` (`store` method, no compression; ZIP is small enough that size is irrelevant).
  - Download flows go through `downloadFromApi` in `lib/api/client.ts` and surface failures via `dispatchToast`. Buttons are never disabled for an "empty" period — the request is allowed to run and report what it found.
- **Dean is role-locked** to own department via `resolveReportDepartment()` in `report-helpers.ts`.
- **Responsiveness report** component (`ResponsivenessReport.tsx`) is fully built but routes redirect to health.
- **Faculty consultation reports** have no implementation — the page is a placeholder redirect.
- **Faculty has no evaluation coverage page** — coverage is admin/dean only.

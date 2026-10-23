# Evaluation coverage department drill-down

**Version:** 1.0
**Status:** Owner-approved and implemented — validation pending
**Last Updated:** 2026-10-24
**Scope:** Admin evaluation coverage when a department is selected via
`?dept={departmentId}`.

## 1. Problem

The department view on `/admin/evaluations/coverage` does not provide the same
faculty search and ordering tools as the faculty cards on
`/admin/evaluations/results/[departmentId]`. It should follow that page's
faculty-card interaction pattern without bringing over its export-selection
checkboxes or evaluation-results-specific controls.

Coverage faculty-card figures also disagree with the student breakdown shown
by the subject's **Details** modal. Some card-level response buckets appear as
zero even though Details lists students in those buckets. The coverage
snapshot and the on-demand detail response must use consistent status
classification and aggregation rules.

## 2. Desired behavior

### 2.1 Faculty controls on the selected department

1. When `?dept={departmentId}` selects a department, display the department's
   faculty cards with controls consistent with the faculty-card view used by
   `app/admin/evaluations/results/[departmentId]/page.tsx` and
   `features/evaluations/components/DepartmentSubjectView.tsx`.
2. Provide a search field that filters faculty and their subject rows using
   faculty name (including its displayed form), email, subject code, subject
   name, and section label. A faculty card is visible during search only when
   one or more of its subject rows match. Search must not alter the displayed
   aggregate values for a matching faculty. This search is the view's filter;
   this spec does not add separate categorical filters.
3. Provide a faculty-name sort control, ordered by displayed surname/name,
   with a clear ascending/descending state and the same A–Z / Z–A toggle
   behavior as the Results page.
4. Preserve the faculty count for the current search result and provide
   **Expand all / Collapse all** controls for visible faculty cards.
5. Preserve each faculty card's identity, coverage summary, expandable
   subject rows, and per-subject **Details** action.
   The card's respondent summary must show accurate counts for participated,
   not participated, in-progress, and disputed statuses; a zero is valid only
   when the corresponding eligible student set is empty.
6. Do not add faculty-selection checkboxes, selected-faculty state, or
   selection-driven export controls. Do not add Results-only visibility
   controls. The existing period selector and page-level cached-data Refresh
   banner remain unchanged.
7. Search, sorting, and expansion are transient view state; they do not change
   the cached coverage response or request additional status data.

### 2.2 Correct faculty response counts

1. Investigate the complete path for the selected department and period:
   status repository/service aggregation, API payload, client faculty grouping,
   and the per-subject detail response. Find and fix the source of the
   discrepancy; do not mask it with UI fallback zeros.
2. The faculty card's participated, not-participated, in-progress, and
   disputed counts must agree with the coverage status of that faculty's
   eligible subject rows. For a subject row, each displayed bucket count must
   agree with the corresponding student list returned by that subject's
   on-demand **Details** request.
3. Faculty cards must resolve aggregates by stable faculty ID and the
   selected department/period. Missing aggregate data must not silently
   become zero-valued counts.
4. Define and preserve the count grain (for example, student-subject
   assignments versus distinct students) in the existing service contract.
   Do not derive a distinct-student count by summing subject enrollments; use
   the existing eligible student sets and aggregation rules.
5. The page-level cache continues to contain only the status snapshot.
   **Details** remains a live, on-demand request and must not be populated
   from, or refreshed by, the page-level cache action.

## 3. Scope

Applies to the admin route:

- `/admin/evaluations/coverage?dept={departmentId}`

The selected department is view state over the current period/scope coverage
snapshot. No new database objects, columns, or Supabase setup are in scope.
The dean coverage route is not changed by this follow-up unless its shared
component behavior requires the same controls for consistency; if so, preserve
its department-scoped data access and cache key.

Out of scope:

- Changes to the Evaluation Results page or its selection/visibility behavior
- New export-selection behavior for coverage
- Changes to the status definitions, enrollment eligibility, or modal UX
- Changes to caching, timestamps, or automatic refresh behavior
- Schema or Supabase changes

## 4. Acceptance checks

1. Opening an admin coverage URL with `?dept={departmentId}` shows search,
   faculty-name sort, faculty result count, and expand/collapse-all controls
   matching the Results faculty-card interaction pattern.
2. Search matches the specified faculty, subject, and section fields and
   filters cards/subject rows without changing the aggregate values on cards
   that remain visible.
3. Faculty sorting toggles A–Z and Z–A by displayed faculty name. Expand all
   and Collapse all affect the currently visible cards.
4. No faculty-selection checkboxes, selected-faculty export controls, or
   Results visibility controls appear in the coverage department view.
5. For each faculty, period, and selected department, card-level status
   buckets match the sums/sets defined by the service's documented count
   grain. Every per-subject bucket matches the number of students in the
   corresponding Details list.
6. A fixture with nonzero student lists in Details cannot produce zero card or
   subject counts for those same statuses. Include coverage for all four
   buckets: participated, not participated, in-progress, and disputed.
7. Missing aggregate data is surfaced as an integrity/error condition rather
   than displayed as plausible zeros or silently omitted faculty.
8. Search, sorting, expansion, and opening Details do not cause an unnecessary
   coverage status request. Details remains an on-demand read.

## 5. Implementation notes

- Use `DepartmentSubjectView` as the interaction reference, but do not reuse
  Results-specific fields or behavior where the coverage data model differs.
- Trace data source to UI before changing aggregation. The Details response
  provides a per-subject cross-check; determine the source of truth and apply
  the same status eligibility rules to the card aggregates.
- Keep all database reads and writes within the existing repository and
  service layers.
- Enrollment roster reads use stable, 1,000-row pages in both the snapshot
  and on-demand Details paths, preventing PostgREST row-cap truncation. The
  snapshot roster also excludes enrollments without a student record, matching
  the student list shown by Details.
- Snapshot and Details use the same status classifier. Snapshot faculty
  buckets count distinct students with each status in at least one eligible
  subject; a student may appear in different buckets across subjects.
- Search, sorting, and expansion remain local view state. Details remains a
  live on-demand request, separate from the cached status snapshot.

## 6. Verification

Owner-run validation gate:

```powershell
npx tsc --noEmit
if ($?) { npm run lint }
if ($?) { npx vitest run }
if ($?) { npm run build }
```

Add focused tests for faculty search and sort behavior, absence of selection
controls, card and subject bucket accuracy, missing aggregate handling, and
the separation between cached status and live Details requests.

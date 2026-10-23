# Evaluation coverage — faculty-only view and explicit refresh

**Version:** 1.0
**Status:** Draft — owner review required
**Last Updated:** 2026-10-24
**Scope:** Admin and dean evaluation-coverage pages, using the shared
`features/evaluations/components/CoveragePage.tsx`.

## 1. Problem

The coverage drill-down currently offers both "By Subject & Section" and "By
Faculty". The subject-table view is no longer needed; coverage should open
directly to the faculty cards.

The department-filtered faculty cards can also be incomplete or show missing
figures. The selected department is represented by the `dept` query parameter,
while the component filters subject rows and looks up separate faculty
aggregates. The rows and aggregates must resolve to the same department and
faculty population; a faculty member or subject must not disappear or render
without its available aggregate because those sources disagree.

Finally, the current coverage request uses SWR focus revalidation and a
30-second polling interval. Coverage figures should instead follow the
explicit-refresh pattern used by the admin evaluation-results list: persist the
loaded snapshot in local storage, and refresh only on the user's Refresh
action.

## 2. Desired behavior

### 2.1 Faculty-only drill-down

1. The department drill-down displays **By Faculty** cards only.
2. Remove the "By Subject & Section" view, its tab, and the grouping toggle.
   Do not leave a hidden or reachable subject-table mode.
3. Preserve each faculty card's existing behavior: its identity, aggregate
   coverage, expandable subject rows, section labels, and per-subject Details
   action.
4. Preserve department summaries, KPIs, search, department selection, CSV
   export, and the unresolved group unless another contract explicitly changes
   them.

### 2.2 Accurate department and faculty data

1. The selected `dept` query parameter selects the displayed department; it
   must not cause a partial or inconsistent faculty-card payload.
2. For a selected department, construct the faculty cards from the complete
   subject and aggregate data for that department. The subject rows and
   `facultyAggregates[departmentId]` must use the same attribution and
   membership rule defined in
   `specs/evaluation-results-attribution.md` and
   `specs/coverage-faculty-grouping.md`.
3. Every included faculty card must use its stable faculty ID to resolve its
   matching aggregate. A card with no aggregate must not silently display
   zeros or omit available coverage. Investigate and fix the data mismatch at
   its source (service, route payload, or client grouping) and test the joined
   result.
4. Every displayed grouping, including the Unresolved group if it remains,
   must provide the same aggregate fields for its faculty cards. Where an
   aggregate must be added, compute it from the underlying student sets in the
   service; do not approximate distinct students by summing per-subject
   enrollment counts.
5. A faculty member with no eligible subject rows for the selected department
   is not shown as a card. A faculty member with eligible rows must not be
   filtered out merely because of search or a mismatch between row and
   aggregate sets. Search continues to filter the visible matching faculty
   and their subject rows, without changing the aggregate values.
6. Keep the dummy/placeholder faculty exclusion and distinct-student
   aggregation contracts already established in
   `specs/coverage-faculty-grouping.md`.

### 2.3 Period-scoped persistent cache

1. Cache the coverage status response in `localStorage`, scoped at minimum by
   evaluation period and by the route's data scope. Admin's all-department
   response and a dean's department-scoped response must never share an entry.
2. When a period is selected, immediately render a valid cached response when
   one exists. Do not request the coverage status endpoint on browser reload,
   component remount, returning to the same period, or changing the `dept`
   query selection if that scope's cached response is present.
3. On a cache miss only, fetch the status response and persist it. A cache
   miss may make one initial request; it must not trigger repeated requests
   from re-renders, focus, reconnect, or a timer.
4. Remove the current 30-second polling and focus revalidation for the coverage
   status response. The period selector's existing evaluation-period read is
   outside this cache contract.
5. The cache key is period- and scope-specific. Changing periods or switching
   between admin/dean scopes must never display another scope's snapshot.
6. The banner must identify the displayed coverage as cached and potentially
   stale, show the last successful manual Refresh time, and emphasize the
   Refresh action. Use the shared component contract in
   `specs/cached-data-refresh-banner.md`; the timestamp means the last button
   refresh, not browser load or cache restoration.
7. The Refresh action is the only way to refresh the cached status response.
   It clears the selected period/scope's local entry, fetches the status
   response again, and stores it on success. It updates the displayed snapshot
   and persisted timestamp only after success.
8. If refresh fails, retain the last successful snapshot on screen, restore
   its cache entry, preserve the prior timestamp, report the failure through
   the existing error-notification pattern, and allow retry.
9. Browser storage failures must not turn into false success. Preserve the
   usable in-memory snapshot and surface persistence failure through the
   repository-standard error notification.

### 2.4 Student detail modal

Opening a subject's **Details** action remains an on-demand request for that
subject's student breakdown. It is not part of the cached status snapshot and
is not refreshed or populated by the page-level Refresh action. Preserve the
existing behavior of loading the detail when requested.

## 3. Scope

Applies to both:

- `/admin/evaluations/coverage`
- `/dean/evaluations/coverage`

Both routes use the shared `CoveragePage` component. The same behavior and
correctness rules apply, while their cached data remains separate by route
scope. The department drill-down selection in `?dept=...` is view state over
the cached status payload; it is not a separate API-cache key.

The stale-data warning and manual Refresh control use the shared UI specified
in `specs/cached-data-refresh-banner.md`, also used by admin Evaluation
Results. Sharing presentation does not share or alter the pages' cache logic.

Out of scope:

- Evaluation-results figures cache and its drill-downs
- Changes to coverage attribution, counting, status, or student-detail
  semantics beyond repairing mismatched faculty rows/aggregates
- Schema or Supabase changes
- Persisting search text, sort order, selected period, expanded faculty, or
  modal state

## 4. Acceptance checks

1. Admin and dean coverage show faculty cards without a subject-view tab or
   grouping toggle.
2. For each department and period, compare the faculty cards and expanded
   subjects against the response's faculty aggregates. Every eligible faculty
   appears exactly once, with the correct aggregate; no aggregate is missing
   or attached to the wrong faculty. The Unresolved group, if displayed, also
   has correct aggregate fields, including a distinct-student count.
3. Changing `?dept=...` selects the correct department from the full payload.
   It does not create an API request when the current period/scope is cached.
   Directly loading a valid department URL produces the same faculty cards as
   selecting that department from the list.
4. After the status response has been cached, browser reload, returning to the
   page, switching department selections, and waiting longer than 30 seconds
   cause no status-endpoint request.
5. A cold period/scope cache makes one status request and stores its result.
6. Admin and dean caches, and different periods, never cross-display.
7. Clicking Refresh clears the selected period/scope entry, makes one fresh
   status request, stores the successful response, and updates the banner's
   last-manual-refresh time.
8. A failed refresh preserves visible prior data and timestamp, restores the
   cache, and surfaces an error. Retry succeeds when the endpoint is available.
9. Opening a subject Details modal still fetches its student breakdown on
   demand; page refresh does not fetch modal details.

## 5. Implementation notes

- Keep the service as the source of the attribution, membership, and aggregate
  rules. Fix any mismatch where those rules are constructed or joined; do not
  hide missing rows with fallback zero values in the UI.
- The `dept` query parameter is selection state. Derive the selected
  department's rows and cards consistently from the period/scope response.
- Use the explicit-refresh behavior in
  `specs/evaluation-results-cache.md` as the UX/cache precedent, adjusted for
  coverage's role-scoped payload and live student-detail modal.
- No database changes are authorized or needed by this spec.

## 6. Verification

Owner-run gate:

```powershell
npx tsc --noEmit
if ($?) { npm run lint }
if ($?) { npx vitest run }
if ($?) { npm run build }
```

Add or update focused tests for faculty-row/aggregate alignment, department
selection, cache hit/miss behavior, no timed/focus refresh, manual refresh
success/failure, and the faculty-only page rendering. Owner manual checks
should cover both admin and dean routes and use at least one department with
multiple faculty members and assignments across departments.

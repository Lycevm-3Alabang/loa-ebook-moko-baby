# Evaluation coverage faculty/cache handover

Updated: 2026-10-24

## Status

The shared stale-cache banner and manual Refresh control are implemented as
`components/ui/CachedDataRefreshBanner.tsx` and are used by admin Evaluation
Results and admin/dean Evaluation Coverage. The component is presentation-only;
each page retains its own cache, timestamp, error, and refresh behavior.

The approved contract is in
[cached-data-refresh-banner.md](../specs/cached-data-refresh-banner.md). The
related cache contracts remain in
[evaluation-coverage-faculty-cache.md](../specs/evaluation-coverage-faculty-cache.md)
and [evaluation-results-cache.md](../specs/evaluation-results-cache.md).

Focused tests were added for the component and both page integrations. They
have not been run; the owner must run the project validation gate before
considering the work verified. No CLI commands were run in this task.

## Follow-up: coverage test expectations

The coverage freshness tests now assert the department overview before
selecting a department to verify faculty details. The failed-refresh case
starts with a cached snapshot, then checks that the selected faculty view
remains visible after refresh fails. The results-page integration assertion
matches the department label without requiring an exact string. These test
adjustments have not been run.

## Follow-up: keep cached data visible on refresh failure

When a manual coverage refresh fails and a prior snapshot exists, the page
now keeps that snapshot rendered and reports the failure through the existing
toast. It no longer sets the full-page status error that hid the cached
content. The focused test asserts the view remains visible; validation has
not been run.

## Next

Run the owner validation gate. Do not add automatic refresh behavior: the
banner's **Refresh** action remains manual-only.

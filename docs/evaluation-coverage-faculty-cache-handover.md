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

## Next

Run the owner validation gate. Do not add automatic refresh behavior: the
banner's **Refresh** action remains manual-only.

# Shared cached-data refresh banner

**Status:** Implemented — owner-run validation pending
**Updated:** 2026-10-24
**Scope:** Shared UI for the admin Evaluation Results and Evaluation Coverage pages.

## Purpose

Both pages keep a client-side snapshot and require the user to refresh it
explicitly. Their warning, last-manual-refresh timestamp, and refresh button
should look and behave consistently without coupling their cache or request
logic.

## Component contract

Create `components/ui/CachedDataRefreshBanner.tsx` as a presentational
component. It owns no cache, timestamp, loading, or request state; each page
continues to supply those values and its existing refresh callback.

Required props:

- `lastManualRefreshAt: string | null` — timestamp of the last successful
  manual refresh for the page's current cache key.
- `isRefreshing: boolean` — drives the button's loading state.
- `onRefresh: () => void | Promise<void>` — invokes the page's existing
  manual-refresh behavior.

Optional props:

- `disabled?: boolean` — disables refresh when the current page has no
  refreshable snapshot.
- `contextLabel?: string` — optional scope context, such as "admin scope" or
  "department scope".
- `statusMessage?: string` — an additional page-specific status note. Results
  uses this for its existing notice that sorting is paused while uncached
  rows are loading.

The component must:

1. Render the amber stale-data reminder: "Displayed figures are cached and
   may be stale. Click Refresh to fetch current figures."
2. Show the supplied timestamp as the last button refresh, or "Not manually
   refreshed yet" when it is null. Never represent page load or cache restore
   time as a successful manual refresh.
3. Use the shared `IosButton` with the primary variant and **Refresh** label.
   Show its loading state while refreshing and disable it when refreshing or
   when `disabled` is true.
4. Show `contextLabel` and `statusMessage` when supplied, without requiring
   either page to pass them.
5. Keep the warning visible whenever the parent renders it for displayed
   cached data. The component must not decide when data is stale or whether a
   cache exists.

## Consumers and behavior boundaries

- Admin Evaluation Results renders the component while results rows are
  displayed. Its existing manual refresh, cache restoration, timestamp update,
  error reporting, and sorting-paused behavior remain unchanged.
- Admin and dean Evaluation Coverage render the component while a coverage
  snapshot is displayed. The current period/scope timestamp, explicit refresh,
  failure recovery, and scope-specific cache behavior remain unchanged.
- Refresh remains manual-only. Do not add an auto-refresh switch, timer,
  focus/reconnect refresh, or new cache policy.
- The component is presentation only; it must not perform fetches, read or
  write browser storage, or emit notifications.

## Acceptance checks

1. Both pages use the same shared component and display the same stale-data
   warning and primary Refresh control.
2. Each page retains its current refresh callback, loading state, disabled
   conditions, cache keys, failure behavior, and last-successful-refresh
   timestamp semantics.
3. Results retains its sorting-paused notice when uncached rows are loading;
   Coverage may supply its scope label without changing the common warning.
4. A missing timestamp displays "Not manually refreshed yet"; cache restoration
   does not update the timestamp.
5. Component tests cover warning copy, timestamp fallback, optional context
   and status messages, button loading/disabled behavior, and callback
   invocation. Consumer tests verify the component is wired to both pages.
6. No automatic refresh behavior is introduced.

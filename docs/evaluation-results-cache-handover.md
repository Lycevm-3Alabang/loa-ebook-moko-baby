# Evaluation results cache UX handover

Updated: 2026-10-24

## Status

The admin results list now persists its department list and attribution warnings per evaluation
period, in addition to its department figures. Reloading a period with cached results skips
`/api/admin/evaluation-results`; the **Refresh** button clears the selected period's local cache,
requests the department list and figures again, then stores the results. An initial API request
still occurs once when a period has no cached department-list data.

Implementation: [admin results page](../app/admin/evaluations/results/page.tsx). The behavior and
acceptance checks are in [the cache spec](../specs/evaluation-results-cache.md).

The repository gate has not been run by the agent. The owner can run:

```powershell
npx tsc --noEmit
if ($?) { npm run lint }
if ($?) { npx vitest run }
if ($?) { npm run build }
```

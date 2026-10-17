---
skill: plan-fix
story: coverage-stale-freshness (coverage table/KPIs do not refresh while the page stays mounted — revalidateOnFocus false, no polling)
repo: e-consultation (regie-worktree)
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: D
decision: Option A (per-page SWR freshness config on CoveragePage only; leave global revalidateOnFocus:false alone)
status: done
pending:
none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| who-implements | Who implements | B (Code it) |
| slice-1 | Apply slice 1 (per-page freshness config) | Applied — CoveragePage.tsx status useApiGet now gets { revalidateOnFocus: true, refreshInterval: 30000 }; tsc clean |
| slice-2 | Apply slice 2 (proof test) | Applied — lib/__tests__/coverage-page-freshness.test.tsx (3 tests); verified it FAILS (2/3) with the config removed, passes with it |
| slice-3 | Apply slice 3 (proof run) | Applied — tsc clean, eslint clean, 507/507 tests pass across 45 files |

## Pending
plan-done

## Decisions

Option A (per-page SWR freshness config on CoveragePage only; leave global revalidateOnFocus:false alone). User confirmed staleness is a hypothesis, not yet reproduced. Invariants: proxy.ts access enforcement unchanged (n/a, no gate change); API routes stay thin n/a (server already dynamic/fresh); Supabase via repositories n/a (no data-layer change); SubmitButton n/a (no new action button); role priority n/a. Layering: client component config only — no service/repository/route change. Gold paths: features/, components/layouts/Providers.tsx, lib/api/client.ts. Proof: npm test + tsc --noEmit; new test asserts the config is passed (pins config, not network). Out of scope: server caching, modal (already fresh), results/dashboard pages, the uncommitted Export (ZIP) fix.

## Scan

Path: app/admin/evaluations/coverage/page.tsx (thin wrapper) → features/evaluations/components/CoveragePage.tsx:92 useApiGet(url) with NO config arg → lib/api/client.ts:97 useApiGet = useSWR(url, fetcher, config) → components/layouts/Providers.tsx:33 <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>. Modal detail bypasses SWR entirely: CoveragePage.tsx:211 raw fetch().
Proof: none. No test asserts SWR freshness config on any page. Command: npm test.
Teach: SWR is stale-while-revalidate — it refetches on mount/key-change, but revalidateOnFocus:false disables refetch-on-tab-return and there is no refreshInterval, so nothing polls. Server side is NOT cached (dynamic route handler, no revalidate/Cache-Control; the 19:39 Supabase log shows live reads), so the only staleness layer is the client. Blast radius of a global flip is the whole app: 40+ useApiGet call sites across app/, features/, components/, and NO page currently passes a per-page config (grep for refreshInterval|revalidateOn* returns only Providers.tsx:33).
Lens:
- API routes stay thin (parse, call controller, return JSON) — app/api/ — n/a; no route change needed (server already dynamic/fresh)
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts — n/a; no data-layer change
- proxy.ts is the access-enforcement point — proxy.ts — applies; untouched
- Double-click prevention via SubmitButton — components/ui — n/a; no new action button
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — n/a
Gold paths: features/, components/layouts/Providers.tsx, lib/api/client.ts

## Plan

- S1: Per-page freshness config — features/evaluations/components/CoveragePage.tsx passes { revalidateOnFocus: true, refreshInterval: 30_000 } as the second arg to the status useApiGet (line 92). Periods call and global Providers.tsx SWRConfig untouched.
- S2: Proof test — lib/__tests__/coverage-page-freshness.test.tsx mocks useApiGet, mounts CoveragePage, asserts the status call received { revalidateOnFocus: true, refreshInterval: 30000 } and the periods call did NOT (scoped, not global).
- S3: Proof run — tsc --noEmit + full npm test (also clears the uncommitted Export (ZIP) fix in the tree).
Proof: npm test + tsc --noEmit. Out of scope: server caching (already correct), modal (already fresh), results/dashboard pages, Export (ZIP) fix.
Verification in browser: submit an eval in incognito while the coverage tab sits idle; KPI should move within ~30s without touching the page.
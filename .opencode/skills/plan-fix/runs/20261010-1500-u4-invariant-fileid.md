---
skill: plan-fix
story: U4 safety invariant + Reference fileId in every failure per specs/chunked-import-failure-ux.md §4.1 (F5) + §4.5 (F6) — mapper widens, student banner aligns, 400 stays verbatim
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "", 2: "", 3: "", 4: "", 5: "", 6: ""}
workflow: ""
decision: ""
status: in-progress
pending: calibration-pre
---

# Plan — U4 (invariant + fileId)

## Progress

| id | question | answer |
|----|----------|--------|

## Pending

- calibration-pre: Use last calibration (1C 2E 3B 4A 5A 6A)?

## Decisions

- repository.md read: refined true; Tests npm test; Issue tracker user text only so story from user text + spec; Layering Route Handler → Controller → Service → Repository → Supabase; Gold paths app/api/, features/, proxy.ts, lib/auth.ts, lib/repositories/factory.ts.
- Specs locked: chunked-import-failure-ux.md §4.1 (message table + invariant) + §4.5 (Reference: fileId, no x-vercel-id) + §7 (invariant-present + no-code/no-body gates); prior run files U1/S1/U2b/U3 as baseline (all done).
- Scope: `getChunkFailureMessage` meta widen (fileId + saved) + run-loop savedTotal tracking + student systematic-failure banner alignment. No routes/DB/auth, no faculty, no BulkFacultyImport (UX ref only), Vercel flake still parked.
- Open before slicing (the genuine decisions): `{saved}` source (recommend run-total tracked in-loop, NOT history state which is stale in-closure); 400-verbatim vs `Reference:` suffix tension (recommend 400 stays pure verbatim — server owns that copy; invariant+Reference go on 5xx/504/network); cancel wording (recommend untouched — spec marks it "(shipped, slice 3)" and current bare text is out of U4's 5xx scope); new meta fields optional-with-fallback so U1's 8 tests stay green untouched; `fileId` unresolvable when `stoppedEarly` skips `isLast` audit — copy must not promise DB resolvability (already the agreed reading).
- Tracking artifact is this run file.

## Scan

- (pending — read-only trace on approval of calibration path)

## Plan

- (empty until plan-done)

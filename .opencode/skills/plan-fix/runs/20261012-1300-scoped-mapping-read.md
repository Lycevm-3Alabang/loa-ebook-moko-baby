---
skill: plan-fix
story: faculty-enroll [id] page scoped single-mapping read (replace bulk ?type=faculty fetch + client find(id))
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "C", 2: "A", 3: "A", 4: "D", 5: "B", 6: "C"}
workflow: "D"
decision: "Option A — Single-id read: findByIdWithEmbeds + route ?type=faculty&id= + scoped page key"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1C 2A 3A 4D 5B 6C)? | A — Use it |
| option | Which option (A/B/C/Other)? | A — Single-id read |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file (no slice starts yet) |
| who-implements | Who implements Slice 1 (findByIdWithEmbeds)? | B — Code it (agent writes after Apply, one file per turn) |
| slice-1 | Apply Slice 1 (repository findByIdWithEmbeds)? | Applied — findByIdWithEmbeds + interface (repo layer) |
| slice-2 | Apply Slice 2 (route id param)? | Applied — single-id early-return with backfill + headcount (route layer) |
| slice-3 | Apply Slice 3 (page scoped key)? | Applied — scoped SWR key, first-row mapping, useMemo import dropped (UI layer) |
| slice-4 | Apply Slice 4 (proof/tests)? | Applied — single-id + missing-id faculty route tests (test layer) |
| gates | Close-out gate (full vitest)? | GREEN user-reported: 31 files, 396 passed / 1 skipped (agent-verified nothing per H1) |

## Pending

- none

## Decisions

- calibration-pre: Use last calibration (1C 2A 3A 4D 5B 6C)?

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Prior run 20261012-1200 (same repo, status done) holds full calibration 1C 2A 3A 4D 5B 6C.
- Option A approved: single-id read, no new endpoint family, bulk paths untouched.
- Invariant preservation: thin route kept (parse id, call repository, return JSON); DI kept (single-id query lives in faculty-subject repository via factory).
- Layering order for slices: Repository → Route Handler → UI (Controller/Service bypass preserved as-is for this route).
- Gold paths read first: app/api/data/evaluation-mappings/route.ts, features/admin-data/faculty-subject.repository.ts, lib/repositories/factory.ts, lib/__tests__/evaluation-mappings-route.test.ts, app/admin/data/academic-infrastructure/faculty-enroll/[id]/page.tsx.
- Proof command: npm test (extend evaluation-mappings-route.test.ts with single-id case).
- Backfill spike audit (user-ran, read-only): 0 rows with faculty_subject_id IS NULL → no migration; null-drop hypothesis eliminated for this dataset.

## Scan

```text
Path: app/admin/data/academic-infrastructure/faculty-enroll/[id]/page.tsx:14 (useApiGet ?type=faculty bare, find(id) client-side :16-19)
  → app/api/data/evaluation-mappings/route.ts:18-52 (type=faculty: listAllWithEmbeds({}) when no params; headcounts={})
  → features/admin-data/faculty-subject.repository.ts:15-42 (unbounded listAllWithEmbeds) + :53-60 findById (raw select, no embeds)
  → Supabase faculty_subjects (+ PostgREST ~1000-row cap on bulk read)
Proof: lib/__tests__/evaluation-mappings-route.test.ts — faculty bulk + per-faculty cases; none for single-id read. Command: npm test
Teach: page counts on a capped bulk slice because the route has no single-id form — load-bearing, so the fix adds one id-scoped read mirroring Slices 1–4.
Lens:
- API routes stay thin — applies + route.ts (parse id param, call repository, return JSON)
- All Supabase via repositories + DI — applies + faculty-subject.repository.ts via lib/repositories/factory.ts
- proxy.ts access-enforcement — n/a + post-auth read scoping, no auth change
- SubmitButton double-click prevention — n/a + read path
- Role pipe-delimited priority — n/a + admin-only route
Tracker: user text only — story from request, no issue fetch.
```

## Plan

Slice 1 — Repository: findByIdWithEmbeds(id) in faculty-subject repository (+ interface), same embeds as bulk, maybeSingle null-safe.
Slice 2 — Route: id param on ?type=faculty branch, single enriched mapping + headcount, bulk path untouched.
Slice 3 — UI: [id] page scoped SWR key, drop client find, keep Loading/Failed/not-found states.
Slice 4 — Proof: single-id + bulk-preserved route tests. Command: npm test.
Out of scope: student branch, backfill, modal/list, auth/roles.

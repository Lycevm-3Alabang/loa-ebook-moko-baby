---
skill: plan-fix
story: FacultyLoadingTab table + faculty profile modal show skeletons instead of appearing slow
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "C", 2: "A", 3: "A", 4: "D", 5: "B", 6: "C"}
workflow: "D"
decision: "Option A — Close the holes: combined skeleton gate + modal header/footer shimmer"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1C 2A 3A 4D 5B 6C)? | A — Use it |
| scan | Read-only trace table + modal loading states? | Done — skeletons exist; holes are SWR-flash + modal header/footer text |
| option | Which option (A/B/C/Other)? | A — Close the holes |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file (no slice starts yet) |
| who-implements | Who implements Slice 1 (table gate)? | B — Code it (agent writes after Apply, one file per turn) |
| slice-1 | Apply Slice 1 (table gate)? | Applied — usersLoading + showTableSkeleton gate (UI layer) |
| slice-2 | Apply Slice 2 (modal chrome)? | Applied — header/footer shimmer while modalLoading, valid nesting (UI layer) |
| gates | Close-out gate (tsc + eslint + suite)? | GREEN user-reported (agent-verified nothing per H1) |
| fix-double-fetch | Post-load reload (user-reported, off-plan defect)? | Applied — effect gated on semestersData; one scoped fetch per mount |
| fix-enrollments-memo | EnrollmentsTab regroup jank (user-asked "same")? | Applied — filtered memoized on [data, search]; table gate + modal already sound, untouched |
| enroll-scope-1 | Student bulk repo semester filter? | Applied — listAllWithEmbeds({ semesterId }) + interface (repo layer) |
| enroll-scope-2 | Route bulk pass-through? | Applied — semesterId forwarded on bulk path (route layer) |
| enroll-scope-3 | Tab scoped fetch + semesters gate? | Applied — active-term URL, one fetch per mount (UI layer) |
| enroll-scope-4 | Semester-only bulk route test? | Applied — filter arg + negative asserts (test layer) |

## Pending

- gates: user runs tsc + eslint + npm test, pastes output

## Pending

- none

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Prior runs 20261012-1200 / 20261012-1300 (same repo, status done) hold full calibration 1C 2A 3A 4D 5B 6C.
- Option A approved: close the holes, refresh stale-table accepted, no new Skeleton variants.
- Invariant preservation: Skeleton variants reused as-is (no new variants); no data-layer, auth, role, or submit changes.
- Layering order for slices: UI only (single file FacultyLoadingTab.tsx; Skeleton.tsx read-only).
- Gold paths read first: features/admin-data/components/FacultyLoadingTab.tsx (:1418,:1612,:1621,:1679), components/ui/Skeleton.tsx, components/ui/Paginator.tsx (null on 0 items — untouched).
- Proof command: npm test (suite stays green; proof is tsc + visual, no new tests).

## Scan

```text
Path: features/admin-data/components/FacultyLoadingTab.tsx:1418-1419 (loading && !data → SkeletonTable rows=4 cols=3)
  → :1420 facultyRows.length===0 → "No faculty found." flash while useApiGet users/subjects/sections still in flight (:240-242, gate ignores their isLoading)
  → :1621-1622 modalLoading → SkeletonTable rows=3 cols=6 (exists); gaps are header "Loading..." text (:1612) + footer "…" (:1679)
  → refresh fetchData(true) (:208 loading=true, data present) → stale table, no indicator
  → components/ui/Skeleton.tsx:37-49 SkeletonTable, :22-35 Skeleton text shimmer; lib/api/client useApiGet exposes isLoading (as used in [id]/page.tsx:14)
Proof: none — no test covers FacultyLoadingTab/SkeletonTable (grep lib/__tests__). Command: npm test (suite must stay green; proof is tsc + visual)
Teach: skeletons exist but gate only on the manual fetch state — the SWR-fed rows (faculties/users) arrive later, so first paint flashes "No faculty found"; modal body is covered, only its header/footer fall back to text.
Lens:
- API routes stay thin — n/a + UI-only change, no route touched
- All Supabase via repositories + DI — n/a + no data-layer change
- proxy.ts access-enforcement — n/a + no auth change
- SubmitButton double-click prevention — n/a + no submit race (IosButton loading props untouched)
- Role pipe-delimited priority — n/a + no role branching
- AGENTS.md Key Conventions Skeleton variants — applies + reuse SkeletonTable/Skeleton text, no new variants
Tracker: user text only — story from request, no issue fetch.
```

## Plan

Slice 1 — Table gate: isLoading from users/subjects/sections hooks; skeleton while loading or rows-empty-and-pending; settled-empty shows "No faculty found".
Slice 2 — Modal chrome: header subtitle + footer count shimmer while modalLoading; body/error states untouched.
Proof: tsc + visual + npm test green. Out: refresh dim, route loading.tsx, import flow, EnrollmentsTab.

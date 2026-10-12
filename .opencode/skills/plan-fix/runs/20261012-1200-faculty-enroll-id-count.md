---
skill: plan-fix
story: faculty-enroll [id] does not load correct number of data and result
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "C", 2: "A", 3: "A", 4: "D", 5: "B", 6: "C"}
workflow: "D"
decision: "Option A — Scope the read: pass semesterId/faculty_subject scope through evaluation-mappings route to existing repository counts; header uses server count"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-1 | Output shape? | C — A first, B only when tree adds |
| calibration-2 | When you need to understand something? | A — Diagram |
| calibration-3 | Agent explanations? | A — 3–5 bullets max |
| calibration-4 | Workflow? | D — SCAN → PLAN → I REVIEW → BUILD |
| calibration-5 | During implementation? | B — Implementing..., then one visual summary |
| calibration-6 | Teach or orient? | C — Hybrid |
| option | Which option (A/B/C/Other)? | A — Scope the read |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file (no slice starts yet) |
| who-implements | Who implements Slice 1 (repository scope)? | B — Code it (agent writes after Apply, one file per turn) |
| slice-1 | Apply Slice 1 (repository scope)? | Applied — listByFacultySubject + semester-aware countByFacultySubjectId (repo layer) |
| slice-2 | Apply Slice 2 (route scope)? | Applied — scoped student branch with server total (route layer) |
| slice-3 | Apply Slice 3 (UI scope)? | Applied — scoped studentKey + server-total header + scoped invalidates (UI layer) |
| lint-offplan | FacultyLoadingTab lint (user-asked, out of plan scope)? | Applied — subjects/sections wrapped in useMemo; openFacultyProfile useCallback → plain fn (callers use inline arrows; compiler owns memoization) |
| slice-4 | Apply Slice 4 (proof/tests)? | Applied — student scoped/bulk route tests (test layer) |
| gates | Close-out gate (tsc + route tests)? | GREEN user-reported (agent-verified nothing per H1) |

## Pending

- none (all 4 slices applied; gates await user run per H1)

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Option A approved 2026-10-12: scope the read, no new endpoint, no client-only cap fix.
- Invariant preservation: thin route kept (parse semesterId/faculty_subject_id params, call repository, return JSON; no Supabase in route); DI kept (all new queries in faculty-subject/student-enrollment repositories via lib/repositories/factory.ts).
- Layering order for slices: Route Handler → Repository → Supabase (Controller/Service bypass preserved as-is for this route; no new layers).
- Gold paths read first for slices: app/api/data/evaluation-mappings/route.ts, features/admin-data/faculty-subject.repository.ts, features/admin-data/student-enrollment.repository.ts, lib/repositories/factory.ts, lib/__tests__/evaluation-mappings-route.test.ts.
- Proof command: npm test (repository.md Tests line); extend evaluation-mappings-route.test.ts for scoped student/count path.

## Scan

```text
Path: app/admin/data/academic-infrastructure/faculty-enroll/[id]/page.tsx:14 (useApiGet ?type=faculty, no params, find(id) client-side)
  → features/admin-data/components/FacultySubjectDetail.tsx:17 (useApiGet ?type=student) + :27-37 group by faculty_subject_id (skips null) + :80-83 map.get(mapping.id) + :321 header enrolledStudents.length + :93 usePagination 15
  → app/api/data/evaluation-mappings/route.ts:18-52 (type=faculty: listAllWithEmbeds({}) headcounts={} when no facultyId) + :54-61 (type=student: listAllWithEmbeds() no args)
  → features/admin-data/faculty-subject.repository.ts:15-42 (unbounded select, no range) + features/admin-data/student-enrollment.repository.ts:218-235 (unbounded select, no range) + :196-216 countByFacultySubjectIds (chunk 100, unused on this path) + :237-244 countByFacultySubjectId (exact head:true, unused)
  → Supabase faculty_subjects / student_enrollments (PostgREST default ~1000-row cap; UNIQUE(student_id,faculty_subject_id,"semesterId"))
Proof: lib/__tests__/evaluation-mappings-route.test.ts — "skips the enrollment count on the bulk fetch" + "counts per faculty_subject on the per-faculty path"; none for ?type=student unbounded or [id] grouping. Command: npm test
Teach: PostgREST caps unbounded selects (~1000); detail counts the capped slice client-side with no semesterId predicate, so header/rows diverge from modal (semester-filtered + countByFacultySubjectIds) — load-bearing because any fix must scope the read or the count.
Lens:
- API routes stay thin — applies + app/api/data/evaluation-mappings/route.ts (keep parse→repository→JSON; currently bypasses Controller/Service, do not widen further)
- proxy.ts access-enforcement — n/a + count bug is post-auth data scoping, no auth change
- All Supabase via repositories + DI — applies + features/admin-data/*.repository.ts via lib/repositories/factory.ts (new queries go here, not in components/routes)
- SubmitButton double-click prevention — n/a + read/count path, no submit race
- Role pipe-delimited priority — n/a + admin-only route, no role branching in count
Tracker: user text only — story taken verbatim from request, no issue fetch.
```

## Plan

Slice 1 — Repository scope (student-enrollment + faculty-subject repos via factory): filtered list + exact count by faculty_subject_id + semesterId, chunk-safe, no unbounded reads.
Slice 2 — Route scope (evaluation-mappings route): parse scoped params, call Slice 1, return { data, total } JSON thin.
Slice 3 — UI scope ([id] page + FacultySubjectDetail): SWR key carries mapping.id + activeSemesterId, header reads server total, rows paginate scoped list, header/paginator/select-all share filtered denominator, null-linked rows surfaced.
Slice 4 — Proof: extend evaluation-mappings-route.test.ts (scoped student + count, bulk-skips-count preserved). Command: npm test.
Out of scope: new endpoint, importer rewrites, bulk/modal paths, auth/roles/SubmitButton.

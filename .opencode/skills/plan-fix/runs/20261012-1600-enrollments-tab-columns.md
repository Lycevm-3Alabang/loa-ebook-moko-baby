---
skill: plan-fix
story: minor edit on features/admin-data/components/EnrollmentsTab.tsx - table columns Student | Enrolled Subjects | Action
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "C", 2: "A", 3: "A", 4: "D", 5: "B", 6: "C"}
workflow: "D"
decision: "Option B — Desktop columns Student | Enrolled Subjects | Action + mobile wording unify"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1C 2A 3A 4D 5B 6C)? | A — Use it |
| option | Which option (A/B/Other)? | B — Include mobile wording |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file |
| who-implements | Who implements Slice 1? | B — Code it |
| slice-1 | Apply Slice 1 (desktop columns + mobile wording)? | Applied — UI-only column swap in EnrollmentsTab.tsx |
| close | Continue with nothing pending? | Closed — single-slice plan complete, no further slices |

## Pending

- none (Slice 1 applied; verify via user-run command below)

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Story from user text: EnrollmentsTab table to render Student ({student name} ({email})) | Enrolled Subjects (number of subjects enrolled in this active semester) | Action (View Enrolments). No issue fetch (tracker is user text only).
- Calibration reused from 20261012-1400 (1C 2A 3A 4D 5B 6C): compact card first, diagram for understanding, 3-5 bullets max, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach.
- Option B approved: desktop column swap + unify mobile/modal wording to "View Enrolments".
- Invariant preservation (all n/a, preserved by not touching): API thin — no route touched; proxy.ts — no auth change; Supabase via repos — no data change; SubmitButton — no submit race (read-only table); role priority — roleBase unchanged.
- Layering order for slices: UI only, single slice single file (features/admin-data/components/EnrollmentsTab.tsx).
- Gold paths read first: features/admin-data/components/EnrollmentsTab.tsx (:101-112 grouping/pagination, :178-215 table + mobile cards, :193 modal opener).
- Proof command: npm test (suite stays green; proof is visual + tsc, no new tests).

## Scan

```text
Path: features/admin-data/components/EnrollmentsTab.tsx:178-196 (desktop table Student | Email | Action)
  → :101-110 groupedStudents memo groups filtered enrollments per student.id (count = enrollments.length)
  → :112 usePagination(groupedStudents) → paginatedItems
  → :193 setSelectedStudentEnrollments(group.enrollments) opens modal; data from /api/data/evaluation-mappings?type=student&semesterId=activeSemesterId (:42-55)
Proof: none — no test covers EnrollmentsTab/groupedStudents (grep lib/__tests__). Command: npm test
Teach: count already exists in memory — mobile card renders it (:209); desktop just omits it, so this is a render-only column swap.
Lens:
- API routes stay thin — n/a + UI-only, no route touched
- proxy.ts access-enforcement — n/a + no auth change
- All Supabase via repositories + DI — n/a + no data-layer change
- Double-click prevention via SubmitButton — n/a + no submit race (read-only table, IosButton untouched)
- Role pipe-delimited priority — n/a + no role branching (roleBase unchanged)
Tracker: user text only — story from request, no issue fetch.
```

## Plan

Slice 1 — EnrollmentsTab columns (UI only, single file): desktop thead becomes Student | Enrolled Subjects | Action; Student cell shows name plus email; middle cell shows per-student enrollment count for the active semester; Action button reads View Enrolments and opens the same modal; mobile card wording aligned to the same label; SkeletonTable stays 3 cols; search, grouping, pagination, modal, Quick Add untouched.
Proof: npm test green + visual (3 desktop columns, count matches modal subtitle). Out: API/service/repo, semester scoping, import flow, new tests, Skeleton variants.

---
skill: plan-fix
story: maintenance page data-clearing suite - clear loading (enrollments+mappings), evaluations, consultations, students (enrolments-only/hard-delete toggle + cascade), soft-delete by role (ADMIN never)
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "C", 2: "A", 3: "A", 4: "D", 5: "B", 6: "C"}
workflow: "D"
decision: "Option A — Vertical per-action slices (clear-loading, evaluations, students toggle, role soft-delete, consultations settle)"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1C 2A 3A 4D 5B 6C)? | A — Use it |
| option | Which slicing strategy (A/B/Other)? | A — Vertical per action |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file |
| who-implements | Who implements Slice 1? | B — Code it |
| slice-1a | Apply Slice 1a (clear-loading service)? | Applied — exportAndClearLoading in admin-data.service.ts |
| slice-1b | Apply Slice 1b (clear-loading route)? | Applied — new POST clear-loading route (thin, audit, attachment) |
| slice-1c | Apply Slice 1c (clear-loading UI)? | Applied — danger card + semester picker + SubmitButton confirm |
| slice-2a | Apply Slice 2a (clear-evaluations service)? | Applied — exportAndClearEvaluations in admin-data.service.ts |
| slice-2b | Apply Slice 2b (clear-evaluations route)? | Applied — new POST clear-evaluations route (thin, audit, attachment) |
| slice-2c | Apply Slice 2c (clear-evaluations UI)? | Applied — danger card + shared scope picker branch |
| slice-3a | Apply Slice 3a (clear-students service)? | Applied — exportAndClearStudents (toggle + preview) in admin-data.service.ts |
| slice-3b | Apply Slice 3b (clear-students route)? | Applied — new POST clear-students route (thin, preview, audit) |
| slice-3c | Apply Slice 3c (clear-students UI)? | Applied — toggle card replaces orphaning version; preview counts prompt |
| slice-4a | Apply Slice 4a (role soft-delete + faculty hard-delete service)? | Applied — exportAndSoftDeleteByRoles + exportAndHardDeleteFaculty |
| slice-4b | Apply Slice 4b (soft-delete-users route)? | Applied — new POST soft-delete-users route |
| slice-4c | Apply Slice 4c (hard-delete-faculty route)? | Applied — new POST hard-delete-faculty route |
| slice-4d | Apply Slice 4d (role + faculty UI)? | Applied — two cards, role checkboxes, department picker, guards |
| slice-5 | Accept Slice 5 verify-only and close suite? | Done — consultations verified as-is, no changes; suite closed |
| verify | Final tsc + eslint + npm test? | Pending user-run (Slice 4a checkpoint was GREEN) |

## Pending

- none (suite complete)

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Story from user text (spec gathered over 6 calibration rounds): semester-or-ALL picker; two-button structure grown to suite (clear loading, evaluations, consultations, students toggle, role soft-delete); hard-delete cascades with confirm prompt; soft-delete hides from pickers, listed/restorable in /deleted; ADMIN never included.
- Spec under approval: Button 1 clear loading (enrollments + faculty-subject mappings, never user accounts); Button 2 clear evaluations; Button 3 clear consultations; Button 4 clear students (toggle enrolments-only vs hard-delete accounts; hard-delete cascades consultations+evaluations with are-you-sure prompt; soft path sets deletedAt); Button 5 soft-delete users by role inclusion (students/deans/faculties, ADMIN never); faculty hard-delete + soft-delete.
- Shared conventions (from page read): red danger cards, CONFIRM-typed modal, JSON export download before deletion, result banner, audit log, one endpoint per action.
- Calibration reused (1C 2A 3A 4D 5B 6C): compact card first, diagram, 3-5 bullets, workflow D, step-wise implement, hybrid teach.
- Layering order for slices: vertical per-action slices, each Route → Service → Repository; actions ordered clear-loading, evaluations, students toggle, role soft-delete (+faculty), consultations alignment last.
- Gold paths read first: app/api/admin/data/delete-students + export-consultations + reset-db routes (thin requireAdmin → service → audit pattern), features/admin-data/admin-data.service.ts (exportAndClearConsultations, exportAndDeleteStudents), features/users/users.repository.ts (softDelete/bulkSoftDelete/permanentDelete already exist).
- Proof command: npm test (suite stays green; destructive paths proven by counts in export payload + audit entries, no live wipes in tests).
- Option A approved: vertical per-action slices, each independently shippable; within a slice follow Route → Service → Repository.
- Invariant preservation: API routes stay thin (applies — new routes copy requireAdmin → service → audit shape, no logic in handlers); Supabase via repositories + DI (applies — bulk deletes via repository methods); SubmitButton double-click prevention (applies — new confirm buttons use SubmitButton); proxy.ts (n/a — ADMIN-only, no access-config change); role priority (n/a — ADMIN-never enforced server-side by role check, not UI hiding).
- Layering order for slices: per action Route → Service → Repository; actions ordered clear-loading, evaluations, students toggle, role soft-delete, consultations verify-only.
- Gold paths to read before slices: app/api/admin/data/delete-students|export-consultations routes, admin-data.service.ts:47/:84, users.repository.ts soft/bulk/permanent delete, student-enrollment + faculty-subject + evaluation + appointment repositories (bulk delete surface).

## Scan

```text
Path: app/admin/data/maintenance/page.tsx:117-143 (danger cards + CONFIRM modal :145-186)
  → app/api/admin/data/delete-students|export-consultations/route.ts (thin: requireAdmin → service → audit → export download)
  → features/admin-data/admin-data.service.ts:47 exportAndClearConsultations, :84 exportAndDeleteStudents (exist; no semester scope, no mapping/evaluation clear, no toggles)
  → users.repository.ts softDelete/bulkSoftDelete/permanentDelete (exist) + users.service.ts guards (sound)
  → missing: semester-scoped deletes for enrollments/faculty_subjects/evaluations/appointments, student toggle, role-inclusion soft-delete
Proof: none — no tests cover maintenance clear paths (grep lib/__tests__). Command: npm test
Teach: each destructive action is one thin route over one service fn with export-first + audit — new buttons copy that shape; repositories already have single-row deletes, bulk semester deletes are the new part.
Lens:
- API routes stay thin — applies + new routes copy requireAdmin → service → audit shape
- proxy.ts access-enforcement — n/a + ADMIN-only routes, no access-config change
- All Supabase via repositories + DI — applies + bulk deletes via repositories, no raw table access from services
- Double-click prevention via SubmitButton — applies + use SubmitButton for new confirm buttons (500ms guard)
- Role pipe-delimited priority — applies + ADMIN-never rule enforced server-side, not just UI-hidden
Tracker: user text only — spec from request rounds, no issue fetch.
```

## Plan

Slice 1 — Clear loading: semester-or-ALL picker; enrollments + mappings deleted in scope (mappings blocked if evaluations reference them); never users; export-first + audit.
Slice 2 — Clear evaluations: semester/period-or-ALL; evaluations + ratings/comments in scope; export-first + audit.
Slice 3 — Clear students toggle: enrolments-only vs hard-delete; hard-delete cascades consultations + evaluations with counts prompt; soft path sets deletedAt; export-first + audit.
Slice 4 — Role soft-delete (+faculty hard/soft): inclusion students/deans/faculties, ADMIN-never server-side; export-first + audit.
Slice 5 — Consultations + UI settle: verify existing clear as-is; cards/picker/toggles/CONFIRM land per slice.
Proof: npm test green per slice. Out: reset-db, imports, RLS, migrations.

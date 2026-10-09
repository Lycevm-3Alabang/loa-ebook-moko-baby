# ACES — Specs

**Version:** 1.6
**Status:** Draft
**Last Updated:** 2026-10-09

---

# Purpose

This directory contains specs for the e-consultation app's integration with the loa-auth-platform,
plus feature specs for the admin data importers. Each spec is a focused, versioned document.
Specs must be Final before code is written (per loa-apache-server-apps convention).

---

# Spec Index

| Spec | Status | Purpose |
|------|--------|---------|
| [faculty-import-stepper.md](faculty-import-stepper.md) | Draft | Decompose the faculty-subject CSV import into a per-phase stepper wizard — step registry, `StepResult` contract, idempotency and resume |
| [faculty-import-stepper/step-02-departments.md](faculty-import-stepper/step-02-departments.md) | Draft | Step 2 — create-if-absent departments, `name = code`, never discard a row |
| [faculty-import-stepper/step-03-courses.md](faculty-import-stepper/step-03-courses.md) | Draft | Step 3 — create-if-absent courses keyed by `(departmentId, code)` pair, `[unmapped]` name marker |
| [faculty-import-stepper/step-04-sections.md](faculty-import-stepper/step-04-sections.md) | Draft | Step 4 — upsert sections, `created`-driven classification, missing-course flagging |
| [faculty-import-stepper/step-05-subjects.md](faculty-import-stepper/step-05-subjects.md) | Draft | Step 5 — upsert subjects; documents the `name = code` fallback firing on all 315 |
| [faculty-import-stepper/step-06-faculty-users.md](faculty-import-stepper/step-06-faculty-users.md) | Draft | Step 6 — create missing faculty, dummy is dept-agnostic, off-domain never becomes a user |
| [faculty-import-stepper/step-07-mappings.md](faculty-import-stepper/step-07-mappings.md) | Draft | Step 7 — terminal step; `existing` vs `invalid`, real-beats-dummy, real-vs-real refused |
| [student-import-stepper.md](student-import-stepper.md) | Draft | Decompose the student CSV import into per-department panels — unordered step registry, required `semesterId`, first-instance department, Unassigned panel |
| [student-import-stepper/step-02-student-users.md](student-import-stepper/step-02-student-users.md) | Draft | Step 2 — the only `create` in the student importer; department resolved client-side at preview time, not per chunk |
| [student-import-stepper/step-03-enrollments.md](student-import-stepper/step-03-enrollments.md) | Draft | Step 3 — terminal `O(rows)` step; batched resolution (~40k → ~6 round trips/chunk); `semesterId` in the dedupe key |
| [student-import-stepper/ledger-reason-codes.md](student-import-stepper/ledger-reason-codes.md) | Draft | One CSV in which every input row appears exactly once, with status + reason code + remark |
| [auth-integration.md](auth-integration.md) | Draft | Contract between e-consultation and loa-auth — SSO flow, JWT claims, shared secrets, what each side owns |
| [endpoint-catalog.md](endpoint-catalog.md) | Draft | Full endpoint catalog (~130 entries) with required levels — must stay in sync with loa-auth-platform |
| [migration-checklist.md](migration-checklist.md) | Draft | Step-by-step tasks for each side, verification checklist, timeline |
| [spike-student-eval-enrollment-gate.md](spike-student-eval-enrollment-gate.md) | Investigation | `POST /api/evaluations` 403 for students with visible pending items — root cause proven to `route.ts:98`; `findPending` Branch A/B read-write drift; trigger blocked on one query |
| [spike-consultation-enrollment-scope.md](spike-consultation-enrollment-scope.md) | Investigation | Does the enrollment-gate defect reach consultation booking? No — no gate exists; redirects blast radius to the shared writer `replaceBySection` |

---

# Implementation Status

Tracks which Draft specs have working code, so the next session knows where to resume.
Spec `Status` above is unchanged — promotion to Final still needs re-approval per Convention.

| Spec | Build | Notes |
|------|-------|-------|
| [faculty-import-stepper/step-02-departments.md](faculty-import-stepper/step-02-departments.md) | Done (2026-10-09) | 4 slices: `importDepartmentsStep` in `lib/services/etlEvaluation.ts`, `step` discriminator in `app/api/import/faculties/route.ts`, Step 2 panel in `FacultyLoadingTab.tsx`, 5 tests. `tsc`/`lint` clean, 230/230 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1000-faculty-stepper-step-02.md` |
| [faculty-import-stepper/step-03-courses.md](faculty-import-stepper/step-03-courses.md) | Done (2026-10-09) | 7 slices: `importCoursesStep` in `lib/services/etlEvaluation.ts`, `courses` discriminator in `app/api/import/faculties/route.ts`, new `FacultyImportStepper.tsx` shell (`StepperTrace` + `StepPanel`), Step 2 retrofit (trace, Yes/No confirm, denominators) + Step 3 panel in `FacultyLoadingTab.tsx`, 5 tests. Verification gate (`tsc`/`lint`/`vitest`) with user per standing rule. Run file: `.opencode/skills/plan-fix/runs/20261009-1347-step-03-courses.md` |
| [faculty-import-stepper/step-04-sections.md](faculty-import-stepper/step-04-sections.md) | Done (2026-10-09) | 4 slices: `importSectionsStep` in `lib/services/etlEvaluation.ts`, `sections` discriminator in `app/api/import/faculties/route.ts`, Step 4 panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets), 5 tests. `tsc`/`lint` clean, 240/240 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1506-faculty-stepper-step-04.md` |
| [faculty-import-stepper/step-05-subjects.md](faculty-import-stepper/step-05-subjects.md) | Done (2026-10-09) | 4 slices: `importSubjectsStep` in `lib/services/etlEvaluation.ts`, `subjects` discriminator in `app/api/import/faculties/route.ts`, Step 5 panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets), 5 tests. `tsc`/`lint` clean, 245/245 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1605-faculty-stepper-step-05.md` |
| [faculty-import-stepper/step-06-faculty-users.md](faculty-import-stepper/step-06-faculty-users.md) | Done (2026-10-09) | 4 slices: `importFacultyUsersStep` in `lib/services/etlEvaluation.ts`, `faculty-users` discriminator in `app/api/import/faculties/route.ts`, Step 6 panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets), 5 tests. `tsc`/`lint` clean, 250/250 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1638-faculty-stepper-step-06.md` |
| [faculty-import-stepper/step-07-mappings.md](faculty-import-stepper/step-07-mappings.md) | Done (2026-10-09) | 4 slices: `importMappingsStep` in `lib/services/etlEvaluation.ts`, `mappings` discriminator in `app/api/import/faculties/route.ts`, Step 6 Faculty Loading panel in `FacultyLoadingTab.tsx` (state, handler, trace count, resets; panels renumbered 1-6 per UI numbering), 9 tests. `tsc`/`lint` clean, 259/259 tests green. Run file: `.opencode/skills/plan-fix/runs/20261009-1706-faculty-stepper-step-07.md` |
| All other specs | Not started | **Faculty stepper complete (Steps 1-6). Next: Final promotion per Convention.** |

---

## Student Import Stepper — Implementation Status

A **separate importer with a different step shape**: per-department, unordered, two writes
(`student-users`, `enrollments`) rather than the faculty family's six ordered create-phases.
Sliced C1 → C2 → C3 so the integrity fixes do not wait on the UI layer.

| Spec | Build | Notes |
|------|-------|-------|
| [student-import-stepper.md](student-import-stepper.md) + 3 sub-specs | Not started | **C1** integrity — required `semesterId`, `semesterId` in the dedupe key, single ledger with reason codes, badge + reference-guard alignment · **C2** batched resolution (~40k → ~6 round trips/chunk) · **C3** per-department panels + Unassigned panel |

**Blocked on one measurement before slicing.** Row count, distinct `(student, section)` count,
distinct `department code` values and rows-per-department are all unverified for the 2026-1
student CSV. `faculty-import-stepper.md:60` claims 22,934 distinct pairs while
`seed-2026-1-etl.md:22` persists 21,989 enrollments — the 945-row gap is unexplained and moves the
chunk-count estimate. See [student-import-stepper.md](student-import-stepper.md) §10.

**Seven defects are spec'd and closed** (general spec §7): D1 unguarded `semesterId` (mass-produces
rows no reader can use — the proven cause of the 403 in
[spike-student-eval-enrollment-gate.md](spike-student-eval-enrollment-gate.md)), D2 `semesterId`
missing from the dedupe key (silent cross-term loss), D3 no per-row rejection vocabulary, D4 preview
claims the server resolves what it rejects, D5 Dean's preview 403s silently, D6 `inserted`
discarded, D7 ~40k sequential round trips.

---

# Cross-References

| This spec | Corresponding doc in loa-apache-server-apps |
|-----------|---------------------------------------------|
| `auth-integration.md` | `assemblies/loa-consult-platform/consult-readiness.md` §3-5 |
| `endpoint-catalog.md` | `assemblies/loa-consult-platform/consult-readiness.md` §2.3-2.4 |
| `migration-checklist.md` | `assemblies/loa-consult-platform/consult-readiness.md` §6-7 |

---

# Convention

- Each spec has a `Version`, `Status` (Draft → Final), and `Last Updated` date
- Draft = open for discussion, not yet implemented
- Final = approved, code may be written to match it
- Changes to Final specs require a version bump and re-approval

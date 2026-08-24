# Endpoint Catalog Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-08-24
**Cross-reference:** `assemblies/loa-consult-platform/consult-readiness.md` §2.3-2.4

---

# 1. Purpose

This spec lists every API endpoint in the e-consultation app with its required access level. The Auth Platform seeds these into `TenantAppEndpoint`. The consult app enforces them via `EndpointPolicyMiddleware`.

**Both sides must keep these lists in sync.** If one adds/removes/changes an endpoint, the other must be updated.

---

# 2. Level Definitions

| Level | Ordinal | Usage |
|-------|---------|-------|
| `read` | 1 | View/list/download operations |
| `write` | 2 | Create/update/delete non-destructive |
| `admin` | 3 | Destructive/sensitive: reset DB, delete users, invalidate evaluations |

---

# 3. Public Endpoints (no auth)

These bypass JWT validation entirely. Defined in the consult app's public allowlist.

| Method | Path |
|--------|------|
| POST | `/api/auth/callback` |
| POST | `/api/auth/refresh` |
| POST | `/api/auth/logout` |
| GET | `/api/health` |
| GET | `/api/semesters/count-active` |
| GET | `/api/bug-reports` |
| POST | `/api/bug-reports` |
| GET | `/api/audit/forbidden` |

---

# 4. Endpoint Catalog

## Auth & User Profile (4)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/auth/me` | read |
| GET | `/api/auth/access` | read |
| GET | `/api/auth/users` | read |
| POST | `/api/auth/onboarding` | write |

## Appointments (13)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/appointments` | read |
| POST | `/api/appointments` | write |
| GET | `/api/appointments/{id}` | read |
| PATCH | `/api/appointments/{id}` | write |
| POST | `/api/appointments/batch` | write |
| GET | `/api/appointments/faculty-booked` | read |
| PATCH | `/api/appointments/{id}/student-cancel` | write |
| POST | `/api/appointments/{id}/retry-sync` | write |
| POST | `/api/appointments/{id}/files` | write |
| GET | `/api/appointments/{id}/{action}` | read |
| POST | `/api/appointments/{id}/{action}` | write |
| GET | `/api/appointments/slots/{slotId}/teams-link` | read |
| PATCH | `/api/appointments/slots/{slotId}/teams-link` | write |

## Users — Admin (12)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/admin/users` | read |
| POST | `/api/admin/users` | admin |
| GET | `/api/admin/users/{id}` | read |
| PATCH | `/api/admin/users/{id}` | write |
| DELETE | `/api/admin/users/{id}` | admin |
| GET | `/api/admin/users/{id}/related-data` | read |
| POST | `/api/admin/users/{id}/soft-delete` | admin |
| POST | `/api/admin/users/{id}/restore` | admin |
| POST | `/api/admin/users/bulk-soft-delete` | admin |
| GET | `/api/admin/users/deleted` | read |
| GET | `/api/users/primary` | read |
| GET | `/api/users/attendees` | read |

## Departments & Academic Structure (22)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/admin/departments` | read |
| POST | `/api/admin/departments` | write |
| GET | `/api/admin/departments/{id}` | read |
| PATCH | `/api/admin/departments/{id}` | write |
| DELETE | `/api/admin/departments/{id}` | admin |
| GET | `/api/admin/department-courses` | read |
| POST | `/api/admin/department-courses` | write |
| GET | `/api/admin/department-courses/{id}` | read |
| PATCH | `/api/admin/department-courses/{id}` | write |
| DELETE | `/api/admin/department-courses/{id}` | admin |
| GET | `/api/admin/subjects` | read |
| POST | `/api/admin/subjects` | write |
| GET | `/api/admin/subjects/{id}` | read |
| PATCH | `/api/admin/subjects/{id}` | write |
| DELETE | `/api/admin/subjects/{id}` | admin |
| GET | `/api/admin/sections` | read |
| POST | `/api/admin/sections` | write |
| GET | `/api/admin/sections/{id}` | read |
| PATCH | `/api/admin/sections/{id}` | write |
| DELETE | `/api/admin/sections/{id}` | admin |
| POST | `/api/admin/sections/fix-names` | admin |
| GET | `/api/admin/faculty-subjects` | read |
| POST | `/api/admin/faculty-subjects` | write |
| POST | `/api/admin/faculty-subjects/reassign` | write |
| GET | `/api/admin/student-enrollments` | read |
| POST | `/api/admin/student-enrollments` | write |
| GET | `/api/admin/student-enrollments/{id}` | read |
| PATCH | `/api/admin/student-enrollments/{id}` | write |
| DELETE | `/api/admin/student-enrollments/{id}` | admin |

## Semesters (6)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/semesters` | read |
| POST | `/api/semesters` | write |
| GET | `/api/semesters/{id}` | read |
| PATCH | `/api/semesters/{id}` | write |
| DELETE | `/api/semesters/{id}` | admin |
| GET | `/api/semesters/{id}/impacts` | read |

## Evaluations (11)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/evaluations` | read |
| POST | `/api/evaluations` | write |
| GET | `/api/evaluations/{id}` | read |
| PATCH | `/api/evaluations/{id}` | write |
| GET | `/api/evaluations/pending` | read |
| POST | `/api/evaluations/{id}/submit` | write |
| GET | `/api/evaluations/{id}/ratings` | read |
| POST | `/api/evaluations/{id}/ratings` | write |
| GET | `/api/evaluations/{id}/comments` | read |
| POST | `/api/evaluations/{id}/comments` | write |
| POST | `/api/evaluations/dispute` | write |

## Evaluation Periods (15)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/evaluation-periods` | read |
| POST | `/api/evaluation-periods` | write |
| GET | `/api/evaluation-periods/{id}` | read |
| PATCH | `/api/evaluation-periods/{id}` | write |
| DELETE | `/api/evaluation-periods/{id}` | admin |
| POST | `/api/evaluation-periods/{id}/activate` | write |
| POST | `/api/evaluation-periods/{id}/reset` | admin |
| GET | `/api/evaluation-periods/{id}/rubric` | read |
| PUT | `/api/evaluation-periods/{id}/rubric` | write |
| POST | `/api/evaluation-periods/{id}/rubric/copy` | write |
| GET | `/api/evaluation-periods/{id}/rubrics/items` | read |
| POST | `/api/evaluation-periods/{id}/rubrics/items` | write |
| GET | `/api/evaluation-periods/{id}/rubrics/items/{itemId}` | read |
| PATCH | `/api/evaluation-periods/{id}/rubrics/items/{itemId}` | write |
| DELETE | `/api/evaluation-periods/{id}/rubrics/items/{itemId}` | admin |

## Evaluation Results (15)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/admin/evaluation-results` | read |
| GET | `/api/admin/evaluation-results/departments/{departmentId}` | read |
| GET | `/api/admin/evaluation-results/departments/{departmentId}/faculty/{facultyId}` | read |
| GET | `/api/admin/evaluation-results/departments/{departmentId}/groups/{facultySubjectId}` | read |
| POST | `/api/admin/evaluation-results/invalidate` | admin |
| PUT | `/api/admin/evaluation-results/visibility` | admin |
| GET | `/api/dean/evaluation-results` | read |
| GET | `/api/dean/evaluation-results/department` | read |
| GET | `/api/dean/evaluation-results/departments/{departmentId}` | read |
| GET | `/api/dean/evaluation-results/departments/{departmentId}/faculty/{facultyId}` | read |
| GET | `/api/dean/evaluation-results/departments/{departmentId}/groups/{facultySubjectId}` | read |
| GET | `/api/dean/evaluation-results/details` | read |
| GET | `/api/faculty/evaluation-results` | read |
| GET | `/api/faculty/evaluation-results/subjects` | read |
| GET | `/api/faculty/evaluation-results/subjects/{facultySubjectId}` | read |

## Evaluation Comments (2)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/evaluation-comments` | read |
| POST | `/api/evaluation-comments` | write |

## Disabled Evaluations — Admin (4)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/admin/evaluations/disabled` | read |
| POST | `/api/admin/evaluations/disabled/restore` | admin |
| GET | `/api/admin/evaluations/{evaluationId}/details` | read |
| POST | `/api/admin/evaluations/{evaluationId}/invalidate` | admin |

## Rubric Groups (14)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/rubric-groups` | read |
| POST | `/api/rubric-groups` | write |
| GET | `/api/rubric-groups/{id}` | read |
| PATCH | `/api/rubric-groups/{id}` | write |
| DELETE | `/api/rubric-groups/{id}` | admin |
| POST | `/api/rubric-groups/{id}/duplicate` | write |
| GET | `/api/rubric-groups/{id}/items` | read |
| POST | `/api/rubric-groups/{id}/items` | write |
| GET | `/api/rubric-groups/{id}/items/{itemId}` | read |
| PATCH | `/api/rubric-groups/{id}/items/{itemId}` | write |
| DELETE | `/api/rubric-groups/{id}/items/{itemId}` | admin |
| POST | `/api/rubric-groups/{id}/snapshot` | write |
| GET | `/api/rubric-groups/{id}/categories` | read |
| POST | `/api/rubric-groups/{id}/categories` | write |

## Import — Admin (10)

| Method | Path | Level |
|--------|------|-------|
| POST | `/api/import/preview` | admin |
| GET | `/api/import/users/reference` | read |
| GET | `/api/import/departments-courses/reference` | read |
| POST | `/api/import/departments-courses` | admin |
| GET | `/api/import/faculties/reference` | read |
| POST | `/api/import/faculties` | admin |
| GET | `/api/import/students/reference` | read |
| POST | `/api/import/students` | admin |
| GET | `/api/import/subjects/reference` | read |
| GET | `/api/import/sections/reference` | read |

## Availability Rules (2)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/availability-rules` | read |
| POST | `/api/availability-rules` | write |

## Data & Audit — Admin (4)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/admin/audit-logs` | read |
| POST | `/api/admin/data/delete-students` | admin |
| POST | `/api/admin/data/reset-db` | admin |
| POST | `/api/admin/data/export-consultations` | admin |
| GET | `/api/data/evaluation-mappings` | read |

## Access Config — Admin (4)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/admin/access-config` | read |
| POST | `/api/admin/access-config` | admin |
| GET | `/api/admin/access-config/export` | admin |
| POST | `/api/admin/access-config/import` | admin |

## User Permissions — Admin (3)

| Method | Path | Level |
|--------|------|-------|
| GET | `/api/admin/user-permissions/paths` | read |
| GET | `/api/admin/user-permissions/{userId}` | read |
| PUT | `/api/admin/user-permissions/{userId}` | admin |

## Student Evaluations (1)

| Method | Path | Level |
|--------|------|-------|
| POST | `/api/student/evaluations/bootstrap` | write |

---

# 5. Default Group Grants

Recommended per-group defaults. These are the levels assigned to each group for each endpoint domain.

## ADMIN

All endpoints: `admin` level. Full access.

## DEAN

| Domain | Level |
|--------|-------|
| `/api/admin/departments/*` | read |
| `/api/admin/department-courses/*` | read |
| `/api/admin/subjects/*` | read |
| `/api/admin/sections/*` | read |
| `/api/admin/faculty-subjects/*` | read |
| `/api/admin/student-enrollments/*` | read |
| `/api/admin/users` | read |
| `/api/admin/evaluation-results/*` | read |
| `/api/admin/evaluation-results/visibility` | write |
| `/api/admin/evaluations/disabled/*` | read |
| `/api/admin/audit-logs` | read |
| `/api/dean/*` | read |
| `/api/semesters/*` | read |
| `/api/evaluation-periods/*` | read |
| `/api/evaluation-periods/{id}/activate` | write |
| `/api/rubric-groups/*` | read |
| `/api/evaluations/*` | read |
| `/api/appointments/*` | read |
| `/api/users/*` | read |
| `/api/import/*` | read |
| `/api/data/*` | read |
| `/api/admin/access-config` | read |

## FACULTY

| Domain | Level |
|--------|-------|
| `/api/appointments` | read |
| `/api/appointments/{id}` | read |
| `/api/appointments/{id}/{action}` | write |
| `/api/appointments/faculty-booked` | read |
| `/api/appointments/slots/*/teams-link` | write |
| `/api/availability-rules` | write |
| `/api/faculty/*` | read |
| `/api/evaluations/{id}/ratings` | read |
| `/api/evaluations/{id}/comments` | read |
| `/api/evaluation-periods/{id}/rubric` | read |
| `/api/rubric-groups` | read |
| `/api/rubric-groups/{id}` | read |
| `/api/rubric-groups/{id}/items` | read |
| `/api/users/primary` | read |
| `/api/users/attendees` | read |
| `/api/semesters` | read |
| `/api/evaluation-periods` | read |

## STUDENT

| Domain | Level |
|--------|-------|
| `/api/appointments` | write |
| `/api/appointments/{id}` | read |
| `/api/appointments/{id}/student-cancel` | write |
| `/api/appointments/batch` | write |
| `/api/evaluations` | write |
| `/api/evaluations/{id}` | read |
| `/api/evaluations/{id}/submit` | write |
| `/api/evaluations/{id}/ratings` | write |
| `/api/evaluations/{id}/comments` | write |
| `/api/evaluations/pending` | read |
| `/api/evaluations/dispute` | write |
| `/api/student/*` | write |
| `/api/evaluation-periods/{id}/rubric` | read |
| `/api/rubric-groups` | read |
| `/api/rubric-groups/{id}/items` | read |
| `/api/users/primary` | read |
| `/api/semesters` | read |
| `/api/evaluation-periods` | read |

---

# 6. Summary Counts

| Domain | Endpoints |
|--------|-----------|
| Auth & User Profile | 4 |
| Appointments | 13 |
| Users (Admin) | 12 |
| Departments & Academic Structure | 22 |
| Semesters | 6 |
| Evaluations | 11 |
| Evaluation Periods | 15 |
| Evaluation Results | 15 |
| Evaluation Comments | 2 |
| Disabled Evaluations | 4 |
| Rubric Groups | 14 |
| Import | 10 |
| Availability Rules | 2 |
| Data & Audit | 5 |
| Access Config | 4 |
| User Permissions | 3 |
| Student Evaluations | 1 |
| **Total** | **143** |

---

## Document Control

- **Status:** Draft v1.0
- **Created:** 2026-08-24
- **Aligns with:** `consult-readiness.md` §2.3-2.4

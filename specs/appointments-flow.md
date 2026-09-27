# EC-APPT-001 — Appointments Flow Cutover (Book / Meetings / Availability / Admin Consultations)

| Field | Value |
|-------|-------|
| ID | EC-APPT-001 |
| Title | Appointments Flow Cutover (Book / Meetings / Availability / Admin Consultations) |
| Status | Final v1.0 |
| Owner | TBD (awaiting user confirmation) |
| Version | 1.0 |
| Scope | First T2 data area per `CONSULT-CUTOVER-001`: student booking, student/faculty meetings, faculty availability, admin consultations list. Replaces Server-Component direct-repository calls with typed client → same-origin BFF → `loa-consult-platform`. Auth pages and T3 gate are out of scope. Reports are out of scope (Phase E last). |
| Non-goals | No code, migration, or dependency change lands on this Draft. No backend shape changes. No visual redesign. No Teams-sync orchestration changes. No report parity in this spec. |

## RFC 2119 terminology

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in RFC 2119.

## Context

What exists today (verified paths in `D:\loa\e-consultation`):

- `app/student/book/page.tsx` — Server Component: `auth()` → `userRepository.listByRole("FACULTY")` + `listByRole("DEAN")` (lyceumalabang filter, `!isDisabled`) + `departmentRepository.listAll()` + `availabilityRuleRepository.listByFaculties(ids)` → `<StudentBooking facultyList userRole="STUDENT" serverNow />`.
- `app/student/meetings/page.tsx` — Server Component: `auth()` → `listStudentAppointments(studentId)` from `features/appointments/appointments.service` → client-side time/ownership filters (`filter=all|this_week|this_month`, `tab`, `sort`) via `getWeekRange`/`getMonthRange`, `AppointmentCard`, `FacultyAppointmentTabs`, `SegmentedControl`.
- `app/student/meetings/[id]/page.tsx`, `app/student/history/page.tsx` — same service family (detail + history views).
- `app/faculty/meetings/page.tsx` — Server Component: `auth()` → `getMeetingsForUser` from `features/appointments/appointments.controller` → week/month + status filters (`PENDING|APPROVED|REJECTED|COMPLETED|CANCELLED`), `SearchBar`, `SegmentedControl`, `Toggle`.
- `app/faculty/meetings/[id]/page.tsx`, `app/faculty/meetings/new/page.tsx` — detail + create views (same controller family).
- `app/faculty/availability/page.tsx` — already client-side: `"use client"`, `useJwt()` from `@/lib/jwt-context`, `useApiGet` from `@/lib/api/client`, `LockedTab` + `ErrorState` + `ErrorBoundary`, ADMIN faculty picker via `/api/admin/users`. Reference implementation for the cutover pattern (normalize, not rewrite).
- `app/admin/consultations/page.tsx` — thin wrapper: `<ConsultationsPage {...props} />` from `features/admin-consultations/components/ConsultationsPage`.
- Data layer: `features/appointments/appointments.service.ts`, `features/appointments/appointments.controller.ts`, `features/appointments/appointments.repository.ts`, `features/appointments/availability.repository.ts`, wired via `lib/repositories/factory.ts`; components under `features/appointments/components/` (`StudentBooking`, `AppointmentCard`, `FacultyAppointmentTabs`).

Backend Final truth (cite by ID, never duplicate):

- `endpoints-appointments.md` Final v1.0 — booking model (STUDENT books self, FACULTY/DEAN on-behalf or internal, creator≠student 400, batch `sessionGroupId`, PENDING→APPROVED|REJECTED→COMPLETED|CANCELLED, conflicts returned), 10 appointment endpoints + 2 availability endpoints (see CON-2).
- `api-endpoints.md` v2.1 §5.1/§5.2 — levels, scoping, bare shapes; `url-flattening.md` v1.1 flat scheme.
- `frontend-transition.md` Final v1.0 (`CONSULT-CUTOVER-001`) DEC-4 — this area ships first in T2; internal `route.ts` files stay live until parity gate passes, then thin out; T5 rollback kept.

## Constraints

- `CON-1` — This spec MUST NOT change backend shapes, levels, or routes. All behavior cites `endpoints-appointments.md` Final v1.0 + `api-endpoints.md` v2.1 by ID.
- `CON-2` — Page → endpoint mapping MUST use only these Final endpoints: `GET /api/v1/appointments` (read, role-split list, in-memory `q`), `POST /api/v1/appointments` (write), `POST /api/v1/appointments/batch` (write), `GET /api/v1/appointments/{id}` (read, 404 on throw), `POST /api/v1/appointments/{id}/{action}` (`accept|approve|decline|reject|complete|cancel|teams-link|attendee-accept|attendee-decline`, else 400), `POST /api/v1/appointments/{id}/student-cancel` (write), `GET /api/v1/appointments/faculty-booked` (`facultyId`+`startDate`+`endDate` required, lightweight slots only), `POST /api/v1/appointments/{id}/retry-sync` (write), `POST /api/v1/appointments/slots/{slotId}/teams-link` (FACULTY/DEAN, https teams URL), `POST /api/v1/appointments/{id}/files` (FACULTY/DEAN + owner `appointment.facultyId === caller`, 5MB images-only, dedup fileName+fileSize), `GET /api/v1/availability-rules` (`facultyId?`; others' rules ADMIN-only), `POST /api/v1/availability-rules` (upsert per faculty/day/start_date, non-ADMIN forced self).
- `CON-3` — Transport MUST be e-cert D2: browser same-origin `/api/v1/*` → BFF Route Handlers → `CONSULT_API_URL` (no rewrites, no direct cross-origin). BFF MUST NOT transform/validate/enrich. Every call carries `Authorization: Bearer <in-memory JWT>`; 401→refresh→retry once→else SSO; 403 shows locked UI (`LockedTab`, no retry); PDFs as Blob (files are base64-in-JSON per §3.7 on upload only — never base64 download).
- `CON-4` — No new direct Supabase calls on these pages. `auth()` + `userRepository` / `departmentRepository` / `availabilityRuleRepository` / `listStudentAppointments` / `getMeetingsForUser` imports on these pages are deprecated in T2 order.
- `CON-5` — Existing UX semantics MUST survive: `filter=all|this_week|this_month` + `tab` + `sort=asc|desc` on student meetings; week/month + status labels (Invited/Accepted/Rejected/Completed/Cancelled) on faculty meetings; day-of-week grid + start/end dates on availability; faculty `lyceumalabang.edu.ph` + `!isDisabled` filtering on booking. Filters stay client-side unless the backend `q` param provably covers them (verify at build, never assume).
- `CON-6` — Guards: unauthenticated → SSO (never `/login` Credentials); tenant mismatch → 403; unknown `action` → 400 "Invalid action"; validation failures → 400 with `conflicts` key when present; non-owner files POST → 403; non-ADMIN reading others' rules → 403/401 per §3.
- `CON-7` — On this Draft, code MUST NOT change. Promotion to Final REQUIRES explicit user yes with no normative change, or a revised Draft first.

## Goal

### Decisions

- `DEC-1` — `app/student/book/page.tsx` becomes a client page: faculty candidates via link-reads (`GET /users/primary`, `GET /users/attendees` family per `api-endpoints.md` §2.1) + departments via academic list + rules via `GET /availability-rules?facultyId=` + booked slots via `GET /appointments/faculty-booked` (all required query keys enforced). Booking submits `POST /appointments` (single) or `POST /appointments/batch` (`facultyIds[]` non-empty, timeSlots array OR date+start+end triple). Creator≠student enforced (400). Conflicts render alongside, never silently dropped.
- `DEC-2` — `app/student/meetings/page.tsx` (+ `[id]`, `history`) lists via `GET /appointments` (student view), detail via `GET /appointments/{id}` (404 → not-found state). Cancel flows via `POST /appointments/{id}/student-cancel` (own-booking rule downstream). Time/tab/sort filters render identically to today.
- `DEC-3` — `app/faculty/meetings/page.tsx` (+ `[id]`, `new`) lists via `GET /appointments` (faculty view), detail via `GET /appointments/{id}`, mutations via `POST /appointments/{id}/{action}` dispatch table (accept/approve, decline/reject, complete + `actionTaken`, cancel, teams-link with `body.teamsLink`, attendee-accept/decline). Internal-create path (`studentId` null) preserved where the UI offers it.
- `DEC-4` — `app/faculty/availability/page.tsx` is normalized (not rewritten): rules load via `GET /availability-rules` (self; ADMIN may pass `facultyId`), saves via `POST /availability-rules` (dayOfWeek 0–6, `startDate` YYYY-MM-DD required, upsert semantics; non-ADMIN `facultyId` forced self). ADMIN picker stays on link-reads. Pending-changes UX and error/locked states stay.
- `DEC-5` — `app/admin/consultations/page.tsx` reads via `GET /appointments` (role-split admin-visible view) + detail/actions per DEC-3 dispatch; no admin-only mutation beyond backend levels.
- `DEC-6` — Files + Teams-link stay narrow: slot link via `POST /appointments/slots/{slotId}/teams-link` (FACULTY/DEAN, valid `https://teams.microsoft.com/...` else 400, 404 unknown slot); files via `POST /appointments/{id}/files` (FACULTY/DEAN owner only, images-only 5MB, dedup silent-skip). Retry-sync via `POST /appointments/{id}/retry-sync` (stubbed orchestration preserved).

### Acceptance — Objective (deterministic, machine-checkable)

- `ACC-1` — Book: 2 sampled faculty + date range — cutover `faculty-booked` slots + `availability-rules` match legacy `listByFaculties` output; `POST` single + `POST` batch return 201 `{appointment[, sessionGroupId], conflicts}`; creator=student submit → 400.
- `ACC-2` — Student meetings: same student — cutover `GET /appointments` IDs/dates/statuses equal legacy `listStudentAppointments`; `filter`/`tab`/`sort` produce identical visible sets; detail 404 on unknown id; `student-cancel` on own booking → `{appointment}` CANCELLED.
- `ACC-3` — Faculty meetings: same faculty — cutover list equals legacy `getMeetingsForUser`; each `action` in dispatch table returns `{appointment}` (or service payload for attendee-*) and invalid action → 400; `new` internal create (where offered) returns 201.
- `ACC-4` — Availability: same faculty — `GET` rules equal legacy rows; `POST` upsert per (faculty/day/start_date) returns `{rule}`; non-ADMIN `facultyId` spoof ignored (forced self); ADMIN other-faculty write audited.
- `ACC-5` — Guards: tokenless → SSO/401; forged JWT → 401/403; non-owner files POST → 403; bad teams URL → 400; `faculty-booked` missing query key → 400.
- `ACC-6` — Static: these pages import zero from `@/lib/repositories/factory`, `@/lib/auth` `auth()`, `@supabase/supabase-js` after Final; all data via typed client + `/api/v1`.

### Acceptance — Subjective (human-judged, observable reviewer actions)

- `ACC-S1` — Reviewer books a consultation as STUDENT for 2 sampled faculty/date ranges with no error toast and sees identical slot grids legacy-vs-cutover.
- `ACC-S2` — Reviewer confirms meetings filters (week/month/tab/sort/status labels) behave identically and action buttons (accept/decline/complete/cancel) complete with no toast.
- `ACC-S3` — Reviewer confirms a revoked action surfaces the locked tab (not blank/redirect) with forbidden telemetry fired.

## Deliverables

- `D-1` — This file (`specs/appointments-flow.md`, ID `EC-APPT-001`, Draft v0.1). No other file changes in this step (one-change rule).
- `D-2` (gated: only after this spec is Final) — Typed client `appointments.ts` + `availability.ts` (Base `/api/v1`, Bearer inject, 401-refresh-retry-once, Blob/errors per `EC-CUTOVER-001` CON-7/CON-11) + BFF handlers (consult vs auth targets, header/cookie forwarding, 502/400) + page rewiring per DEC-1…DEC-6 with legacy `route.ts` kept live.
- `D-3` (gated: with `D-2`) — Parity pastes per ACC-1…ACC-5 (2 sampled inputs each) + thinning of the area's internal routes + T5 rollback kept.
- `D-4` (gated: with `D-2`) — Vitest (mocked adapters, one behavior per test: booking validation, batch triple-or-slots, dispatch table, teams-URL, files owner/type/size/dedup, availability upsert/forcing, guard mapping, closed-by-default, pagination/filter parity) + e2e auth-flow reuse + manual checks (ACC-S1…S3, cookie flags) tests cannot prove.

## Glossary + References

- **SessionGroupId** — server-generated UUID grouping one batch booking across primary + attendee faculty.
- **Action dispatch** — `POST /appointments/{id}/{action}` verb set (accept/approve, decline/reject, complete, cancel, teams-link, attendee-*).
- **Faculty-booked** — lightweight `{date, startTime, endTime}` slots, never full records.
- References (by ID, never pasted): `EC-CUTOVER-001` Final v1.0, `CONSULT-CUTOVER-001` (T2 first area), `api-endpoints.md` v2.1 §5.1/§5.2, `endpoints-appointments.md` Final v1.0, `endpoints-reports.md` v1.0 (out of scope), `url-flattening.md` v1.1, backend `auth-integration.md` §9 (matrices), e-cert `specs/services/api-client.md` + `specs/decisions/bff-passthrough.md` + `src/lib/api/client.ts`.

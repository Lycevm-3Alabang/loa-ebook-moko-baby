# TODO — e-consultation cutover (EC-CUTOVER-001 / EC-APPT-001)

Source of truth: specs are normative. Code matches spec, never the reverse.
Backend contracts cited by ID only (`api-endpoints.md` v2.1, `endpoints-reports.md` v1.0, `CONSULT-CUTOVER-001`).

## Done

- [x] Reviewed `AGENTS.md` (advisory mode, one-change rule, spec lifecycle).
- [x] Wrote `specs/cutover-headline.md` — EC-CUTOVER-001 Draft v0.1 → v0.2 → **Final v1.0** (pure frontend; `loa-consult-platform` sole domain API; `loa-auth-platform` sole auth; e-cert CSR+BFF pattern; 104+5 truth).
- [x] Perspective check: `D:\loa\e-cert` (CSR D1, BFF D2, JWT-display D3, typed client, `localStorage` drift flagged — do not copy) + `loa-apache-server-apps/assemblies/loa-consult-platform` (`api-endpoints.md` v2.1, `FRONTEND-INTEGRATION.md` v1.0, `CONSULT-CUTOVER-001` T0→T5).
- [x] Wrote `specs/appointments-flow.md` — EC-APPT-001 Draft v0.1 → **Final v1.0** (T2 first area: book/meetings/availability/admin-consultations).
- [x] Implemented EC-APPT-001 `D-2` (partial, additive, legacy-live): `lib/api/appointments.ts` + `lib/api/availability.ts` typed modules with `V1` constants staged. `tsc` clean for new files (pre-existing `lib/__tests__` errors only); `eslint` clean.

## Next (in order — one change + yes per step)

- [ ] EC-APPT-001 `D-2` remaining: rewire one consumer at a time onto typed modules (availability page `saveAll`/loader → `AppointmentCard` actions → `StudentBooking` batch/faculty-booked → `AppointmentDetail`). Legacy routes stay live.
- [ ] EC-APPT-001 `D-3`: parity pastes per ACC-1…ACC-5 (2 sampled inputs each) + thin area routes + keep T5 rollback.
- [ ] EC-APPT-001 `D-4`: Vitest (one behavior/test) + BFF routing tests + manual ACC-S1…S3 + cookie flags.
- [ ] EC-CUTOVER-001 `D-2`: promote/supersede `auth-integration` + `endpoint-catalog` (143 → 104+5) + `migration-checklist`; add `services/api-client|auth|platform` mirrors.
- [ ] T1 auth swap (prereq for Bearer): fragment handler, memory store, refresh, logout, guard, `useSession()` → JWT context.
- [ ] T2 remaining areas: academic/semesters → evaluations/periods/rubrics/results → admin-import link-reads → reports last (Phase E).
- [ ] T3 gate swap: delete server gate → groups-claim matrices + semester-lock decision + 403-lock UX.
- [ ] T4 decommission: NextAuth, RBAC tables/columns (`group_access`, `user_permissions`, `passwordHash`, `tokenVersion`, `hasLoggedInBefore`), `bcryptjs`, secrets, Supabase client.
- [ ] T5 E2E + rollback drill (matrices, parity sampling, 403-lock drill, pasted results).
- [ ] Housekeeping: update `specs/README.md` index; confirm spec Owner (currently TBD); fix pre-existing test errors separately (`email-templates` variant, `etlEvaluation` args, `middleware` NextRequest casts).

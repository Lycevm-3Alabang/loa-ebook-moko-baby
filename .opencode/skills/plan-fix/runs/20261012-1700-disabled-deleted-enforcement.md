---
skill: plan-fix
story: disabled (isDisabled) and soft-deleted (deletedAt) users must not be able to login, be assigned to transactions, or be edited; they can be deleted
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "C", 2: "A", 3: "A", 4: "D", 5: "B", 6: "C"}
workflow: "D"
decision: "Option A — Service-layer guards (auth, assignment, edit boundary)"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1C 2A 3A 4D 5B 6C)? | A — Use it |
| option | Which enforcement approach (A/B/Other)? | A — Service-layer guards |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file |
| who-implements | Who implements Slice 1? | B — Code it |
| slice-1 | Apply Slice 1 (authorize + session deletedAt checks)? | Applied — lib/auth.ts rejects deletedAt at login and session revalidation |
| slice-2 | Apply Slice 2 (enrollment + booking guards)? | Applied — createEnrollment asserts resolved student; requestAppointment asserts all parties via assertUsersAssignable |
| slice-3 | Apply Slice 3 (edit boundary + picker)? | Applied — update rejects deletedAt targets; bulk import fails deleted rows; Quick Add picker hides disabled |
| verify | npm test result? | GREEN (user-reported) |

## Pending

- none (all 3 slices applied; verify via user-run command)

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Story from user text: disabled/deleted users must not login, be assigned, or edited; deletable. Prior audit (same session) found login/session ignore deletedAt, assignment/edit paths unchecked, delete flow sound. No issue fetch (tracker is user text only).
- Calibration reused from 20261012-1600 (1C 2A 3A 4D 5B 6C): compact card first, diagram for understanding, 3-5 bullets max, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach.
- Layering order for slices: Service → Repository → Route/UI (auth service first, then assignment/edit guards, then picker filter). Gold paths read first: lib/auth.ts, features/users/users.service.ts + users.repository.ts, features/admin-data/student-enrollment.service.ts, features/appointments/appointments.service.ts.
- Proof command: npm test (suite must stay green; no dedicated tests exist for these paths).
- Option A approved: explicit service/auth-layer guards; routes stay thin, repositories keep unfiltered finders for delete/restore flows.
- Invariant preservation: API routes stay thin (applies — no route logic added; guards live in services/auth); Supabase via repositories + DI (applies — status reads through userRepository); proxy.ts (n/a — path matching untouched); SubmitButton (n/a — no forms touched); role priority (n/a — no role branching).
- Layering order for slices: Service/Auth first (login+session), then assignment services (enrollment, booking), then edit boundary (update/import) + UI picker filter last.
- Gold paths to read before slices: lib/auth.ts (:21-47,:90-124), features/admin-data/student-enrollment.service.ts (:60-82), features/appointments/appointments.service.ts (:87-91, attendee resolution), features/users/users.repository.ts (:262-285 update, :34-74 findManyByEmail), features/users/users.service.ts (:200-363 bulkUpsert), features/admin-data/components/EnrollmentsTab.tsx (student picker).

## Scan

```text
Path: lib/auth.ts:21-31 authorize (checks isDisabled, never deletedAt)
  → features/users/users.repository.ts:19-32 findByEmail (no deletedAt filter) → soft-deleted users authenticate
  → lib/auth.ts:91-124 session revalidation (selects deletedAt:93, enforces isDisabled:110 only) → deleted sessions survive
  → features/admin-data/student-enrollment.service.ts:60-82 createEnrollment resolves by email/id with no status check → disabled/deleted enrollable
  → features/appointments/appointments.service.ts:87-91 resolveCreator + attendee ids by findById, no status checks → bookable
  → app/api/admin/users/route.ts:102-128 PATCH → users.repository.ts:262-285 update, no guard → deleted editable; bulkUpsert via unfiltered findManyByEmail:34-74 → import edits deleted/disabled
  → features/users/users.service.ts:4-23 delete/restore/permanentDelete guards sound
Proof: none — no test covers deletedAt/isDisabled enforcement (only fixtures carry the flags). Command: npm test
Teach: soft-delete sets only deletedAt (users.repository.ts:286-291), never isDisabled — so every check that keys on isDisabled alone lets deleted accounts through.
Lens:
- API routes stay thin — applies + enforcement goes in services/auth, routes unchanged
- proxy.ts access-enforcement — n/a + proxy matches paths, not user status; login block happens in authorize/session
- All Supabase via repositories + DI — applies + status reads via userRepository, no direct table access
- Double-click prevention via SubmitButton — n/a + no form/submit changes
- Role pipe-delimited priority — n/a + no role branching touched
Tracker: user text only — story from request, no issue fetch.
```

## Plan

Slice 1 — Login + session (lib/auth.ts): authorize rejects deletedAt; session revalidation returns null on deletedAt.
Slice 2 — Assignment guards (services): createEnrollment rejects disabled/deleted students (email + student_id paths); booking asserts creator/faculty/attendees active.
Slice 3 — Edit boundary + picker: update/PATCH rejects deletedAt targets (disabled stays editable); bulk import fails deleted-account rows; Quick Add picker filters isDisabled.
Proof: npm test green per slice. Out: evaluatee-side pending exclusion, RLS, delete flows, migrations.

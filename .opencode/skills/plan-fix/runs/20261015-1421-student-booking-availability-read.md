---
skill: plan-fix
story: Student booking 403s on availability-rules read; add student-safe read path so booking works and stops logging API_ACCESS_DENIED noise
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A fold rules into faculty-booked (guard frozen; caller fixed)"
status: implementing
pending: slice-1
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — reused per request, asked once skipped |
| option | Fix caller, guard frozen — which way? | A — Fold into faculty-booked |
| who-implements | Who implements Slice 1? | B — Code it |
| slice-1 | Apply Slice 1 (faculty-booked)? | Applied — rules in response + wired catch |
| slice-2 | Apply Slice 2 (StudentBooking)? | Applied — bookedData.rules; forbidden fetch gone |
| who-implements | Who implements Slice 1? | B — Code it |

| slice-2 | Apply Slice 2 (StudentBooking)? | Applied — rulesUrl fetch deleted, bookedData.rules wired; zero availability-rules refs left |

## Pending

- close-out: Slices 1-2 applied; awaiting STOP (close run) / Other

## Decisions

- repo refined: read repository.md (Layering Route Handler → Controller → Service → Repository → Supabase; tracker user text only)
- Calibration reused (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text: student booking flow calls GET /api/availability-rules?facultyId= (StudentBooking.tsx:120) but the route 403s non-faculty/dean/admin (route.ts:27-28); each denial auto-logs API_ACCESS_DENIED and rulesData stays null so booking degrades. No issue fetch (tracker is user text only).
- Layering order for slices: Route Handler (guard) → Page/Component (unchanged — same URL works once allowed). Service/Repository untouched (listAvailabilityRules already serves reads). Gold paths: app/api/availability-rules/route.ts:7-37, features/appointments/components/StudentBooking.tsx:120, lib/api/client.ts:36-65 (403 → audit), features/appointments/availability.service.ts.
- Proof command: npm test. Plus manual: student booking loads faculty windows with zero API_ACCESS_DENIED rows. No new tests (none cover booking-rules read).
- Invariant preservation: API thin — route/service calls only, no new layers; Supabase via repos + DI — applies, rules read goes through availability.service (already the pattern); proxy.ts — n/a, no new pages; SubmitButton — n/a, read-only GET; role priority — applies, rules-endpoint guard untouched, student path grants nothing beyond booking windows.
- Pivot (user correction): the guard is CORRECT and stays — direct student access to /api/availability-rules must remain forbidden (probe denials are true positives). The bug is the UI misfire: StudentBooking calls an endpoint it should never touch. Fix the caller, not the guard. Supporting evidence: /api/appointments/faculty-booked explicitly allows STUDENT ("Only students, faculty, and deans can check faculty availability") — product intent is students CAN see availability for booking, just not through the rules endpoint.
- Revised slices: Slice 1 Route — faculty-booked GET returns { appointments: slots, rules } via listAvailabilityRules(facultyId) (import from availability.service); bare catch binds e + console.error + logServerError with session email/role (session assigned pre-try, provably safe); Slice 2 Component — StudentBooking drops rulesUrl/rulesData fetch, types bookedData as { appointments, rules }, getActiveRule/freeRanges unchanged; rules guard file untouched. Gold paths to re-read at build: app/api/appointments/faculty-booked/route.ts, StudentBooking.tsx:99-130 (bookedData/rulesData/freeRanges), FacultyRule type vs listAvailabilityRules return shape.

## Scan

```text
Path: StudentBooking.tsx:120 rulesUrl → GET /api/availability-rules?facultyId= → guard route.ts:27 (student ≠ target, not admin → 403) → patchedFetch lib/api/client.ts:36-65 → POST /api/audit/forbidden → API_ACCESS_DENIED row; rulesData null → getActiveRule null → booking degraded.
Proof: none — no test covers booking-rules read. Command: npm test
Teach: the GET guard conflates read and write authority — booking needs read, while POST:42-44 already gates writes separately; granting STUDENT read changes nothing about who can modify rules.
Lens:
- API routes stay thin: applies + guard-only edit, service call unchanged (route.ts:35)
- Supabase via repositories + DI: n/a + no data-layer change
- proxy.ts access-enforcement: n/a + no new pages
- SubmitButton double-click prevention: n/a + read-only GET
- Role pipe-delimited priority: applies + STUDENT read must not escalate POST writes
```

## Plan

Slice 1 — Route (faculty-booked): import listAvailabilityRules from availability.service; return { appointments: slots, rules }; bind bare catch (e) + console.error + logServerError with route/method/params + session email/role (session assigned pre-try).
Slice 2 — Component (StudentBooking): delete rulesUrl + rulesData fetch; retype bookedData as { appointments, rules }; point getActiveRule at bookedData.rules; verify FacultyRule shape matches service return. Rules guard file untouched.
Proof: npm test green + student booking shows faculty windows with zero new API_ACCESS_DENIED rows.
Out: rules guard (frozen), POST writes, other booking flows, audit-logs probing rows.

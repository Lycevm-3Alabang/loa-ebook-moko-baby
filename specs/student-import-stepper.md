# Student Import Department Stepper — General Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec family of [faculty-import-stepper.md](../faculty-import-stepper.md), which shares the
`StepResult` contract, the client-held-map model and the `StepPanel` / `StepperTrace` primitives.

---

# 1. Purpose

Decompose the student CSV import into **per-department panels** so an admin can observe and
control each department independently, and so every input row lands in exactly one downloadable
ledger outcome with a stated reason.

Two properties distinguish this importer from the faculty one and drive every decision below.

**The student importer creates nothing but users and enrollments.** Subjects, sections, faculty
users and `faculty_subjects` mappings are **lookup-only** — they are the faculty CSV's residue by
contract (`lib/__tests__/studentImport.test.ts:4-6, 113`;
`specs/faculty-import-stepper.md:25`; `specs/seed-2026-1-etl.md:69-70`). A missing subject,
section, faculty or mapping **fails the row**; it is never created here.

**Enrollment is genuinely `O(rows)`.** `faculty-import-stepper.md:59-61` contrasts this
explicitly. Chunking is retained for step 3 and only step 3.

---

# 2. Scope

| | |
|---|---|
| **In scope** | `POST /api/import/students`, `GET /api/import/students/reference`, `lib/services/studentImport.ts`, `features/users/components/bulk-import/BulkStudentImport.tsx`, `features/admin-data/student-enrollment.repository.ts` |
| **Out of scope** | The faculty importer (`etlEvaluation.ts`, `app/api/import/faculties/route.ts`) — Steps 2-6 Done, Step 7 in flight. The other five `Bulk*Import.tsx` components. Schema changes. |
| **Not a goal** | Durable server-side jobs, rollback/undo, reordering departments, or a "run all" button. |

---

# 3. Step Registry

| Step | ID | Scope | Request shape | Distinct values (2026-1) | Depends on |
|---|---|---|---|---|---|
| 1 | `upload` | file | none (client-side) | 0 | — |
| 2 | `student-users` | per department | distinct-set | 3,302 emails / 10 departments | active semester |
| 3 | `enrollments` | per department | chunked rows | 21,989 enrollments | step 2 (same department) |

**Total for the 2026-1 file: 20 requests** — 10 departments × (1 user step + ⌈rows/500⌉ enrollment
chunks).

## 3.1 Departments are unordered, so the trace is not linear

`StepperTrace` (`FacultyImportStepper.tsx:11-33`) computes
`current = Math.min(doneCount, steps.length - 1)` and renders a 1→N sequence. That asserts an
ordering departments do not have, and there is no "current" department when any may run next.

**A department grid replaces the trace.** `StepPanel` is reused **unchanged** — its `disabled`
chain in the faculty wizard encodes FK ordering, which departments do not have, so every panel is
enabled from the start except by the shared blocked-row gate and a global running guard. This is
a simpler and better-fitting use of the same component.

## 3.2 Department is determined by the `department code` column

A row's department is its `department code`, resolved against `departments.code`. **The section
does not determine department.** The template keeps the column and it is load-bearing.

`sections.departmentCourseId → department_courses."departmentId"` exists and is authoritative, but
it is used only as a **non-blocking cross-check**: when a row's department code disagrees with its
section's owning department, the code wins and the row is reported as `DEPARTMENT_MISMATCH`
(ledger-reason-codes.md §4). Looking a course up by `code` alone is unsafe —
`UNIQUE("departmentId", code)` (`supabase-schema.sql:388`) means `BSIT` can exist under two
departments.

## 3.3 A student's department is the first instance in file order

`users.departmentId` is a single value, but a student's rows may carry more than one department
code. The **first row in CSV file order** wins.

This is resolved **client-side at preview time**, not server-side. `BulkStudentImport.tsx:225`
holds the whole parsed file in `previewRows` before any POST, so the client computes
`email → departmentId` once and stamps the authoritative value onto **every** row for that
student. Consequences:

- `users.departmentId` is identical regardless of which department panel runs, or in what order.
  The chunk-arrival dependence in `studentImport.ts:141-145`
  (`if (!deptIdByEmail.has(key))` — first row *to arrive*, not first row *in the file*) stops
  mattering.
- The server needs no row-origin threading.

`users.departmentId` is **reporting metadata, not an access gate.** Access is role-based via
`proxy.ts` `PAGE_ACCESS`. It determines grouping in evaluation results
(`evaluation-results/departments/[departmentId]/route.ts:34` → `userRepository.listByDepartment`),
the user-management filter (`DataUsersPage.tsx:350`), and is already bucketed as `"__unknown__"` →
"Unassigned" (`evaluation-results/route.ts:57, 102`). A manual correction already exists
(`DataUsersPage.tsx:199-211`). A mis-filed department is a reporting error, not a permissions
leak — which is what makes first-instance acceptable rather than needing most-common-wins.

## 3.4 The Unassigned panel

A row whose `department code` is blank or does not resolve to a persisted department belongs to no
department and therefore to no panel. Such rows run in an **Unassigned** panel, created lazily on
first run.

- **Enrollment proceeds.** Subject, section and faculty resolve independently of department, so a
  bad department code does not invalidate a valid enrollment.
- **The row is flagged** in the ledger as `DEPARTMENT_UNRESOLVED`, with a remark distinguishing
  *blank* from *code not found*.
- **Users created here get `departmentId: null`.** Existing surfaces already render that as
  "Unassigned" / "—".

> **Deliberate decision.** Rejecting these rows would be the simpler ledger, but department is
> reporting metadata and the enrollment is the substance. Losing enrollments over a typo'd
> department code is the worse failure. This is decision **(b)**; the alternative **(a)** — reject
> with `status: invalid` — remains available as a one-line change to the Unassigned panel if
> product judgement later reverses.

---

# 4. Contracts

## 4.1 `StepResult`

Reused verbatim from `faculty-import-stepper.md` §4.1. Every request returns
`{ ...StepResult, fileId }`; step 3 additionally returns `chunkIndex` / `totalChunks` / `isLast` so
the client's `useChunkedImport` continues to work unchanged.

## 4.2 `semesterId` is required

**`semesterId` is load-bearing and must never be `null`.**

- `student_enrollments."semesterId"` is what `studentEnrollmentRepository.findExisting` matches
  (`student-enrollment.repository.ts:32`), which is the 403 gate at
  `app/api/evaluations/route.ts:95` and `app/api/evaluations/dispute/route.ts:41`.
- `evaluationRepository.findPending` filters on **`faculty_subjects`.`"semesterId"`**
  (`evaluations.repository.ts:91`), not the enrollment's.

These two disagree by design gap, and the result is the documented production 403: *"pending list
populates, submit 403s"* (`spike-student-eval-enrollment-gate.md:71-88`).

**Enforcement:**

| Layer | Rule |
|---|---|
| Route | `400` when `semesterId` is absent or does not resolve via `semesterRepository.findById` |
| Client | every panel disabled on `!activeSemesterId`, mirroring `FacultyLoadingTab.tsx:1234` |
| Ledger | a row persisted without `semesterId` is impossible — the route refuses the request |

Today `EnrollmentsTab.tsx:121-126` renders a *"No active semester"* banner and then mounts
`<BulkStudentImport semesterId={activeSemesterId || null} />` **anyway**, the client never checks
it, and `route.ts:44` accepts `null`. Every one of those is closed by this spec.

Consultation has **no** enrollment gate today (`spike-consultation-enrollment-scope.md:33-39`), so
writing `semesterId` correctly costs nothing now and is the precondition for any future gate
there.

## 4.3 `semesterId` in the idempotency key — silent cross-term loss

`studentEnrollmentRepository.addEnrollments` reads back
`student_id, section_id, faculty_subject_id` (`student-enrollment.repository.ts:53`) — **`semesterId`
is neither selected nor in the dedupe key** — while the constraint is
`UNIQUE(student_id, faculty_subject_id, "semesterId")` (`supabase-schema.sql:1219`).

Import the 2026-1 file, then import the same file for 2026-2: every row matches the existing set,
`newItems` is empty, and the function returns `{ inserted: 0, skipped: N }` **having written
nothing**. No error, no warning.

**Fix:** `semesterId` joins both the select and the dedupe key. The repository must also return
**which** rows it skipped, not only how many — see §4.4 and ledger-reason-codes.md §3.

## 4.4 The ledger

One CSV replaces the three current downloads (`import-successes.csv`, `import-failures.csv`,
`removed-rows.csv`), which have three different header sets and between them omit the department,
the status and the reason. Full contract in
[ledger-reason-codes.md](student-import-stepper/ledger-reason-codes.md).

Every input row appears exactly once with a `status` and, when not `persisted`, a `reasonCode` and
a human `remarks`. `addEnrollments` returning per-row skip attribution is a **precondition** —
without it `ALREADY_PERSISTED` cannot be attributed to a row, which is one of the two reasons the
current `skipped` count is unusable.

---

# 5. State Machine

```
                   ┌──────────┐
                   │  upload  │  client-side parse, flags, ledger skeleton
                   └────┬─────┘
                        ▼
     ┌──────────────────────────────────────────────┐
     │  per department, any order, any number of    │
     │  times, independently:                      │
     │                                              │
     │   student-users ──► enrollments              │
     │   (O(distinct))     (O(rows), chunked)       │
     └──────────────────────────────────────────────┘
                        ▲
              ┌─────────┴─────────┐
              │   Unassigned       │  lazily created
              │   (no resolvable   │  department code
              │    dept code)      │
              └───────────────────┘
```

- Steps 2 and 3 are ordered **within** a department (users before enrollments — a real FK
  dependency). Departments have no such dependency and may run in any order.
- There is deliberately **no "run all" button** — per-department control is the point of the design.
- Stopping after any panel leaves a valid intermediate state; every panel is idempotent (§6).
- Re-running a completed panel reports `inserted: 0`, `existing: N`. A panel never reached is
  `not-reached` in the grid.

---

# 6. Idempotency and Resume

| Phase | Mechanism |
|---|---|
| student-users | `userRepository.findManyByEmail` before `createMany`; missing only |
| enrollments | `addEnrollments` read-before-insert, **`semesterId` in the key** (§4.3) |

**Concurrency:** step 3 is chunked, so two chunks racing the same `(student, faculty_subject,
semesterId)` cannot collide — `addEnrollments` re-reads inside the request and Postgres `23505`
cannot fire because the constraint is checked after that read. Step 2 creates distinct emails only.
Both are safe as written; neither needs a `23505` re-read.

**Resume semantics:** a re-run reports `inserted: 0`, `existing: N`, and every already-persisted
row appears in the ledger as `ALREADY_PERSISTED` — never as a new enrollment, and never as a
generic "skipped".

---

# 7. Defects This Spec Closes

| ID | Defect | Closed by |
|---|---|---|
| D1 | `semesterId` unguarded at every layer; mass-produces rows no reader can use | §4.2 |
| D2 | `addEnrollments` dedupes without `semesterId` → silent cross-term data loss | §4.3 |
| D3 | Rejection reasons are scattered free text; two categories carry none at all; per-row "already persisted" impossible | §4.4, [ledger-reason-codes.md](student-import-stepper/ledger-reason-codes.md) |
| D4 | Preview claims amber rows are "resolved by the server"; the service fails all five amber cases (`studentImport.ts:201, 204, 211, 216, 222`) | step-02/steps-03 classification + badge relabel |
| D5 | Reference route is `requireAdmin` while POST is `requireRole([ADMIN, DEAN, FACULTY])`; a Dean's preview 403s and is swallowed by `if (!res.ok) return` (`BulkStudentImport.tsx:127`), rendering every row falsely amber | step-02 guard alignment |
| D6 | `inserted` discarded at `studentImport.ts:232`; a step cannot report its own write | step-03 |
| D7 | ~40,000 sequential PostgREST round trips — `findByCode` per distinct code per chunk (`:160-164`), `findByNameAndProgram` per distinct section per chunk (`:166-171`), mapping lookup **once per row** (`:214`, `:220`) | step-03 batched resolution |

---

# 8. Risks

| Risk | Mitigation |
|---|---|
| Reference data stale across panels | After step 2, `existingUsers` is stale for **every** panel. Each step returns its own `userMap`; the client merges it, same client-held-map model as the faculty steps (`app/api/import/faculties/route.ts:63-64`) |
| Orphan accounts | The blocked-row gate applies to **both** steps within a department. Never gate enrollments without gating user creation |
| Ledger scale ≈ 22,000 rows | Assemble client-side from preview state + per-chunk results; drop `concatCsvBodies` (`BulkStudentImport.tsx:94-99`) and its header-stripping fragility |
| `DEPARTMENT_MISMATCH` noise | Non-blocking remark, never a rejection. A file-wide mismatch count in the grid footnote makes a systematic problem visible without blocking a single row |
| Invalid-list volume | `StepPanel` renders `invalid[]` in a `max-h-32` scroll. 10 departments × hundreds of rows needs an aggregate roll-up above the grid |
| `ALREADY_PERSISTED` read wrong | It means *already in the database*, not *already in this file*. Duplicates spanning two chunks read `existing` in one and `inserted` in the other |
| Cross-feature import direction | `features/admin-data` already imports from `features/users` (`EnrollmentsTab.tsx:10`). The student stepper lives in `features/users` and imports the primitive **from** `admin-data` — the arrow stays one-way. `FacultyImportStepper.tsx` is **not** relocated: it is a Done artifact cited by Steps 2-6 verification records, and `useChunkedImport` already sets the cross-feature precedent |

---

# 9. Verification order

C1 (integrity) → C2 (batched resolution) → C3 (stepper). Each ships independently.

| Slice | Contents |
|---|---|
| **C1** | §4.2 semester gate · §4.3 dedupe key · §4.4 ledger + reason codes · D4 badge relabel · D5 guard alignment · D6 `inserted` surfaced |
| **C2** | step-03 batched resolution; `facultySubjectRepository.findManyBySubjectSectionIds` |
| **C3** | department grid · per-department panels · Unassigned panel · `userMap` merge |

Gate per slice: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` (baseline 250 tests / 18
files) → `npm run build`.

---

# 10. Unverified Before Sizing

Measure directly from `student-import-template (latest 2026-1).csv`:

| Quantity | Status |
|---|---|
| CSV row count | **UNKNOWN** |
| Distinct `(student, section)` pairs | **22,934** (`faculty-import-stepper.md:60`) vs **21,989 persisted** (`seed-2026-1-etl.md:22`) — 945 unexplained |
| Distinct `department code` values | **UNKNOWN**; 10 departments persisted (`seed-2026-1-etl.md:16`) |
| Rows per department | **UNKNOWN** — drives chunk count and therefore the 20-request estimate in §3 |
| Students whose rows span >1 department | **UNKNOWN** — drives how often first-instance (§3.3) discards a value |

---

# 11. Sub-Specs

| Spec | Purpose |
|---|---|
| [step-02-student-users.md](student-import-stepper/step-02-student-users.md) | Per-department create-if-absent users; the only `create` in this importer |
| [step-03-enrollments.md](student-import-stepper/step-03-enrollments.md) | Terminal chunked step; batched resolution; lookup-only prerequisites |
| [ledger-reason-codes.md](student-import-stepper/ledger-reason-codes.md) | Status vocabulary, reason codes, remarks, single-CSV contract |

---

# 12. Email

**No import path sends email.** `userRepository.createMany`
(`features/users/users.repository.ts:106-150`) inserts `users`, inserts `userrole`, and logs
`BULK_CREATE_USERS` — nothing else. Created rows are `passwordHash: NULL`,
`hasLoggedInBefore: false`, exactly the state `/activate` expects, and activation is **pull-based**
(`app/api/auth/activate/route.ts`).

Two reasons not to add it: volume (3,302 messages need a workflow plus a rate-limit and
partial-failure story), and **link expiry** — `activate/route.ts:26` sets
`expiresAt = now + 15 minutes`, so a bulk send would deliver mostly-dead links once the queue
drains. Activation stays admin-triggered per user.

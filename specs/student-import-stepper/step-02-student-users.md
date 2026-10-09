# Step 2 — Student Users

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [student-import-stepper.md](../student-import-stepper.md).

---

# Purpose

Ensure every student referenced by **this department's** rows exists as a user. Missing users are
created with role `STUDENT` and the department already resolved client-side.

This is the **only** `create` in the entire student importer. Subjects, sections, faculty users and
`faculty_subjects` mappings are lookup-only — they are the faculty CSV's residue by contract
(`lib/__tests__/studentImport.test.ts:4-6`; `faculty-import-stepper.md:25`). A student stepper
panel claiming otherwise would be inventing behaviour the service does not have.

# Position

| | |
|---|---|
| Depends on | an active `semesterId` (general spec §4.2) — **not** on other departments |
| Produces | `userMap: Map<email, id>` consumed by step 3, and merged client-side into reference state |
| Distinct values (2026-1) | 3,302 emails across 10 departments |

# Request

```ts
POST /api/import/students
{ step: "student-users", semesterId, fileId, departmentCode, items: { email, name, departmentId }[] }
```

`items` is the **distinct email set of one department's rows**. `departmentId` is sent per item,
not as a single envelope value, because the Unassigned panel (`general spec` §3.4) legitimately
passes `null` while every named department passes an id — and because the client has already
resolved it (see below).

The route **rejects the request with 400** when `semesterId` is absent or does not resolve.
Enforcement table at general spec §4.2.

# Department resolution happens client-side, once

The service's current behaviour is chunk-arrival order, not file order:

```ts
// studentImport.ts:141-145 — first row to ARRIVE wins
for (const r of rows) {
  const key = r.email.toLowerCase().trim()
  if (!deptIdByEmail.has(key)) deptIdByEmail.set(key, r.departmentId ?? departmentId ?? null)
}
```

Under a per-department panel model this becomes non-deterministic: a student with rows under two
departments would be stamped with whichever panel the admin clicked first.

**The fix is in the client, before any POST.** `BulkStudentImport.tsx:225` already holds the whole
parsed file in `previewRows`, so `handlePreview` computes the authoritative department once, from
the **first row in file order**, and stamps it onto every row for that student:

```
deptByEmail = new Map()                       // first row in file order wins
for r of withFlags:
    key = r.email.toLowerCase().trim()
    if key && !deptByEmail.has(key): deptByEmail.set(key, r.resolvedDepartmentId)
// every row of that student now carries the same departmentId
```

The server then receives a single consistent `departmentId` per student regardless of panel order,
and the service's own fallback becomes dead code for well-formed input. It stays as a guard for
the direct-API and `formData` paths, which have no client-side preview.

**Why first-instance rather than most-common:** `users.departmentId` is reporting metadata, not an
access gate (general spec §3.3). Most-common would need a full pass over a student's rows inside
a request that receives only one department's slice — it cannot see the other departments at all.
First-instance is computable once, client-side, where the whole file exists.

# Server work

```
emails = distinct lowercased trimmed emails from items
userMap = userRepository.findManyByEmail(emails)
missing = emails.filter(e => !userMap.has(e))

if missing.length:
    createdUsers = userRepository.createMany(missing.map(email => ({
        email,
        name:     nameByEmail.get(email) || email.split("@")[0] || email,
        role:     "STUDENT",
        departmentId: deptIdByEmail.get(email),   // null for the Unassigned panel
    })))
inserted = createdUsers.size
existing = emails.length - missing.length
```

This is the existing body of `importStudents` (`:136-158`), unchanged except for taking the
department from the request rather than from arrival order.

# Classification rules

| Outcome | Rule | Counted as |
|---|---|---|
| Email already a user | found in `findManyByEmail` | `existing` |
| User created | in the `createMany` result | `inserted` |
| Blank email | never sent; the row is blocked client-side as `EMAIL_BLANK` before it reaches this step | ledger `invalid` |
| Off-domain email | blocked client-side as `EMAIL_DOMAIN_NOT_ALLOWED` | ledger `invalid` |
| Unresolvable department code | **not** an `invalid` — the row belongs to the Unassigned panel and is created with `departmentId: null` | ledger flag `DEPARTMENT_UNRESOLVED` |

> **Off-domain asymmetry with faculty.** Faculty rows with a non-`@lyceumalabang.edu.ph` address are
> hard-rejected and never become users (`step-06-faculty-users.md:61-73`), because a faculty account
> can read evaluation data. Students may legitimately hold `@itmlyceumalabang.onmicrosoft.com`
> addresses, so the student rule is `STUDENT_ALLOWED_DOMAINS` (`lib/csv-utils.ts`), enforced
> client-side as a ledger `invalid` — never silently created.

# `departmentId: null` is legitimate, not a fallback

The Unassigned panel creates students with `departmentId: null`. That is the same state the
faculty placeholder faculty uses (`step-06-faculty-users.md:52-59`, deliberately dept-agnostic so
it never inflates one department's filter) and every existing surface already renders it: "Unassigned"
(`evaluation-results/route.ts:102`), "—" (`DataUsersPage.tsx:615, 749`).

# Idempotency

`findManyByEmail` before `createMany`. Re-running a department reports `inserted: 0`,
`existing: N`. `createMany` chunks its own inserts at 200 (`users.repository.ts:110`) and splits
`users` / `userrole` writes, so a 3,302-email request is bounded without client chunking.

# Edge cases

- **A student in two departments' panels.** Panel A creates them; panel B reports `existing`.
  The stored `departmentId` is A's. That is correct and deterministic — the first-instance value
  from the client, not the click order (see above).
- **Same email, two names in one department.** `nameByEmail` is first-wins on arrival. The
  client pre-resolves this identically, so the client's value is what is sent.
- **Re-running after a partial failure.** `createMany` is not transactional across its 200-row
  chunks; a mid-request failure leaves earlier chunks inserted. The re-run's `findManyByEmail`
  finds them and reports `existing` — no duplicates.
- **An email already used by a faculty account.** `findManyByEmail` returns the existing user and
  it counts `existing`; no `STUDENT` role is added. Step 3's mapping lookup is what actually gates
  them, unchanged from current behaviour.

# No email is sent

`userRepository.createMany` (`features/users/users.repository.ts:106-150`) inserts `users`,
inserts `userrole`, logs `BULK_CREATE_USERS`. No workflow, no message. Created rows are
`passwordHash: NULL, hasLoggedInBefore: false` and activate later by pull
(`app/api/auth/activate/route.ts`). Rationale at general spec §12 — a 3,302-message blast would
deliver links already dead against the 15-minute expiry at `activate/route.ts:26`.

# Tests required

| Test | Asserts |
|---|---|
| creates missing students for one department | `inserted === N`, `createMany` called with `role: "STUDENT"` |
| reuses existing users | `inserted === 0`, `createMany` not called |
| re-run is idempotent | second call reports `inserted: 0`, `existing: N` |
| `departmentId` comes from the request, not arrival order | a student listed in two items carries the client's resolved id on both |
| Unassigned panel creates with `departmentId: null` | `createMany` receives `departmentId: null` |
| no role escalation | an existing FACULTY/DEAN email is never given a `STUDENT` role |
| no email is sent | `sendActivationWorkflow` / `sendActivationEmail` never called |
| missing `semesterId` | route returns 400 before any repository call |
| ledger closure | every input row of the department appears exactly once in the ledger |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

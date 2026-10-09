# Step 6 — Faculty Users

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [faculty-import-stepper.md](../faculty-import-stepper.md).

---

# Purpose

Ensure every faculty/dean referenced by the file exists as a user. Missing users are created
with role `FACULTY` and stamped with their department from step 2's map.

This step is where **"wrong uploads never become users"** is enforced.

# Position

| | |
|---|---|
| Depends on | step 2 (`deptCodeToId`) |
| Produces | `facultyUserMap` consumed by step 7 |
| Distinct values (2026-1 file) | 148 emails |

# Request

```ts
POST /api/import/faculties
{ step: "faculty-users", semesterId, fileId, items: string[] }   // distinct emails, lowercased
```

# Server work

```
emails = distinct lowercased trimmed faculty emails from rows
userMap = userRepository.findManyByEmail(emails)
missing = emails.filter(e => !userMap.has(e))
if missing.length:
  createdUsers = userRepository.createMany(missing.map(email => ({
    email,
    name: row?.name?.trim() || email.split("@")[0],
    role: "FACULTY",
    departmentId: deptCodeToId.get(row.departmentCode),   // undefined when unresolvable
  })))
inserted = createdUsers.size
existing = emails.length - missing.length
```

# The dummy/dept-agnostic rule

When the faculty email column is **blank**, the service maps the row to
`DUMMY_FACULTY_EMAIL` (`placeholder@lyceumalabang.edu.ph`). That placeholder must be created
with **`departmentId: undefined`** — deliberately dept-agnostic so it never inflates one
department's filter.

> `deptId = isPlaceholder ? undefined : deptCodeToId.get(row.departmentCode)`

This is existing behaviour (`etlEvaluation.ts:239`) and must survive decomposition.

# Classification rules

| Outcome | Rule | Counted as |
|---|---|---|
| Email already a user | found in `findManyByEmail` | `existing` |
| User created | in the `createMany` result | `inserted` |
| Email is blank | never sent; mapped to the dummy upstream | n/a |
| Email off-domain (`!@lyceumalabang.edu.ph`) | **must not become a user** | `invalid` — reason: `Email domain not allowed: <email>` |

The off-domain rule is deliberately strict for faculty: `@itmlyceumalabang.onmicrosoft.com` is
valid for *students*, not faculty. Faculty rows with a wrong domain are reported, never
silently created, because creating a faculty account with a stray personal address would let
that account see evaluation data.

The dummy email itself is exempt — it is synthesised by the importer, not uploaded.

# Idempotency

`findManyByEmail` before `createMany` makes this idempotent. Re-running reports
`inserted: 0`, `existing: 148`. The dummy is created once and reused thereafter.

# Edge cases

- **Blank email** — 902 rows in the 2026-1 file. All collapse onto one dummy user, so this
  step reports `149 existing` on a re-run (148 real + 1 dummy), not `1,051`.
- **Name is an Excel error cell** — an unassigned row with e.g. `#N/A` in the name column is
  repaired to `"Unassigned Faculty"` upstream; the error is *not* propagated as a rejection,
  per the existing narrow-translation rule at `etlEvaluation.ts:156`.
- **Role check** — `createMany` stamps `FACULTY`. A pre-existing user found by email who is
  not a FACULTY/DEAN/ADMIN is still counted `existing`; step 7's mapping lookup is what
  actually gates them.

# Tests required

| Test | Asserts |
|---|---|
| creates missing faculty | `inserted === expected`, `createMany` called with role `FACULTY` |
| reuses existing faculty | `inserted === 0`, `createMany` not called |
| dummy is dept-agnostic | `createMany` called with `departmentId: undefined` for the placeholder |
| off-domain flagged, not created | `invalid` contains the email; it is absent from `createMany` input |
| blank emails collapse to one dummy | 902 blank rows → exactly one dummy user |
| composed path unchanged | existing `importFacultySubjects` assertions still pass |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

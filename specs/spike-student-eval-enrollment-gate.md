# SPIKE — Student Evaluation Enrollment Gate Mismatch

Status: investigation complete · Root cause proven to line · Trigger unproven, needs one query
Incident: `POST /api/evaluations` → `403 {"error":"Forbidden"}` for students with visible pending items
Scope: `app/api/evaluations/route.ts:95`, `features/evaluations/evaluations.repository.ts:86-91`,
`features/admin-data/student-enrollment.repository.ts:24-38`

---

## 1. Symptom

A student on `loa-aces.vercel.app/student/evaluations` sees two pending evaluations rendered
from `/api/student/evaluations/bootstrap`. Clicking **Start** on either returns:

```
POST https://loa-aces.vercel.app/api/evaluations
{"evaluateeId":"ea35c80e-...","facultySubjectId":"aed79328-..."}
→ 403 {"error":"Forbidden"}
```

The UI then replaces the whole page with an "Access Restricted" panel naming `/api/evaluations`.

---

## 2. Evidence — request sequence

From `loa-aces.vercel.app.har` (2026-10-09, `sin1`):

| # | Endpoint | Status |
|---|---|---|
| 1 | `GET /api/auth/session` | 200 |
| 2 | `GET /api/semesters` | 200 |
| 3 | `GET /api/student/evaluations/bootstrap` | **200** |
| 4 | `GET /api/auth/access` | **200** |
| 5 | `POST /api/evaluations` | **403** |

Steps 3 and 4 are the load-bearing facts. Bootstrap returning 200 means the student passed
`hasRole(role, "STUDENT")` at `app/api/student/evaluations/bootstrap/route.ts:16` and the
`group_access` layer resolved. Both gates *upstream* of the failure are open.

---

## 3. Root cause — proven to the line

`POST /api/evaluations` emits `{"error":"Forbidden"}` from two places:

| Line | Condition | Status |
|---|---|---|
| `route.ts:68` | `!hasRole(role, "STUDENT")` | 403 |
| `route.ts:98` | `!enrollment` | 403 |

Identical bodies. Distinguishing them required elimination, not response shape:

| Candidate | Eliminated because |
|---|---|
| `proxy.ts:89` / `proxy.ts:104` | both include `message` + `path`; observed body has neither |
| `route.ts:68` (role) | bootstrap ran the identical `hasRole(role,"STUDENT")` check on the same session and returned 200 |
| `route.ts:77` (`id` branch) | request payload contains no `id` |
| `route.ts:85`, `:92` (400s) | wrong status code |
| duplicate enrollment rows | `.maybeSingle()` error → `throw` → outer catch → **500** `route.ts:107`, not 403 |

**`route.ts:98` is the only remaining 403 producer.**

### 3.1 Why it returns null

Two queries answer "is this student enrolled in this faculty-subject?" and they join on
**different keys**:

| Query | Called from | Enrollment key used | Semester filter applied to |
|---|---|---|---|
| `evaluationRepository.findPending` | `bootstrap` (read/list) | `section_id` — `.in("section_id", sectionIds)` | `faculty_subjects.semesterId` (`:91`) |
| `studentEnrollmentRepository.findExisting` | `route.ts:95` (write) | `faculty_subject_id` — `.eq(...)` | `student_enrollments.semesterId` (`:32`) |

`findPending` derives pending items from the **section** a student is enrolled in, then lists
every `faculty_subject` in that section (`evaluations.repository.ts:86-91`). It never reads
`student_enrollments.faculty_subject_id` or `student_enrollments.semesterId`.

`findExisting` requires all three simultaneously:

```ts
.eq("student_id", student_id)
.eq("faculty_subject_id", faculty_subject_id)
.eq("semesterId", semesterId)      // ← exact, no fallback
```

The list query and the write query therefore disagree on what "enrolled" means. Any
`student_enrollments` row written with a null or divergent `faculty_subject_id` / `semesterId`
satisfies the list query and fails the write query. That is the drift.

### 3.2 Not the faculty-subject upload

The period's `semesterId` is `e0000000-0000-0000-0000-000000000000`. This literal is a seed
constant (`supabase-schema.sql:1587`, `scripts/reset-data.sql:90`) and it resolves to a real,
titled semester — `SY 2026-2027 First Semester` (`supabase-schema.sql:1594-1596`), echoed in
the bootstrap body as `semesterTitle`.

`findPending` filters `faculty_subjects` on that same value (`:91`). For
`facultySubjectId: aed79328-...` to appear in the pending list, its `faculty_subjects` row
**already matches**. The upload did not write a wrong semester.

---

## 4. Open question — the trigger

Three distinct data states produce an identical 403 here. Not yet discriminated:

1. `student_enrollments.semesterId` is NULL or ≠ the period's semester
2. `student_enrollments.faculty_subject_id` is NULL (section-only enrollment)
3. no `student_enrollments` row links this student to that faculty-subject at all

### Discriminating query

```sql
SELECT se.student_id, se.section_id, se.faculty_subject_id, se.semesterId,
       fs.section_id AS fs_section, fs."semesterId" AS fs_semester
FROM student_enrollments se
LEFT JOIN faculty_subjects fs ON fs.id = 'aed79328-7936-4ecd-aa96-33e0015f047b'
WHERE se.student_id = (
  SELECT id FROM users WHERE email = 'nin.alamo@lyceumalabang.edu.ph'
);
```

Reading the result:

- `section_id = fs_section` but `faculty_subject_id` NULL → cause 2
- all three match yet still 403 → re-check `.maybeSingle()` duplicate-row path returns 500, so
  suspect the `source` flag reaching `route.ts:88`
- `semesterId` NULL or ≠ `fs_semester` → cause 1
- zero rows → cause 3

### Wider blast-radius query

```sql
SELECT
  count(*) FILTER (WHERE "faculty_subject_id" IS NULL)                    AS null_fs,
  count(*) FILTER (WHERE "semesterId" IS NULL)                           AS null_sem,
  count(*) FILTER (WHERE "faculty_subject_id" IS NOT NULL
                     AND "semesterId" IS NOT NULL)                       AS fully_populated,
  count(*)                                                            AS total
FROM student_enrollments;
```

`seed-2026-1-etl.md:92` asserts `enrollments with NULL semesterId = 0` for the 21,989-row
2026-1 seed. If that verification was actually run against this database, cause 1 is unlikely
and cause 2 or 3 leads. Worth confirming rather than assuming.

---

## 5. Same defect, second site

`app/api/evaluations/dispute/route.ts:41` performs the identical semester-scoped
`findExisting` call. If the trigger in §4 is a data-state cause rather than a one-off, the
"Wrong faculty?" affordance on `app/student/evaluations/page.tsx:126-152` will 403 the same
way for the same students. Not yet observed, not yet fixed.

---

## 6. Fix options

Not yet selected. Listed with trade-offs for review.

| Option | Change | Pros | Cons |
|---|---|---|---|
| A | Fix the data — backfill `faculty_subject_id` / `semesterId` on `student_enrollments` | Correct at the source; no behavior change | One-off; any future import path that omits the columns reintroduces it |
| B | Relax `findExisting` — semester-agnostic match | Fixes the class | Weakens the semester boundary; needs a matching change in `dispute` |
| C | Make `findPending` and `findExisting` share one predicate | Eliminates the drift permanently | Largest blast radius; changes list semantics for all students |

Option C is the durable one. A and B are stopgaps. C should not be started before §4 returns,
since the correct predicate depends on which data state is actually wrong.

---

## 7. Diagnostic notes — dead ends

Recorded so they are not re-investigated.

- **`group_access` / `EMAIL_FEATURE_FLAG` — not involved.** `access-config-2026-10-09.json`
  confirms STUDENT holds every evaluation API (`:305-312`) and `userPermissions` is empty
  (`:319`). `/api/auth/access` returned 200 in the HAR. The stale CSV export
  (`group_access_rows.csv`, STUDENT = `["/student/evaluations/history"]`) predates the JSON
  export by months and reflects a since-corrected state.
- **`LockedTab` "requires the ADMIN role" text — not evidence.** `components/ui/LockedTab.tsx:17`
  hardcodes that string for *any* 403 regardless of actual role. It sent this investigation
  down the access-control path twice.
- **Proxy middleware — eliminated.** `proxy.ts:89` and `:104` both emit `message` + `path`;
  the observed body has neither.
- **Missing `userrole` row — eliminated.** Bootstrap's `hasRole(role,"STUDENT")` passed.
- **`evaluation_periods.semesterId` being a dangling placeholder — wrong framing.** It is a
  legitimate seeded semester that `faculty_subjects` matches correctly.

---

## 8. Status

| Item | State |
|---|---|
| Failing line identified | Done — `route.ts:98` |
| Access control cleared as cause | Done — bootstrap + `/api/auth/access` both 200 |
| Trigger identified | **Blocked on §4 query** |
| Fix selected | Not started |
| Code changed | None |

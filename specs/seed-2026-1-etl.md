# SEED 2026-1 ETL — Academic Infrastructure Seed Spec

Status: drafted · Scope: `seed-2026-1/` SQL set + `scripts/generate-seed-2026-1.py`

## 1. Goal

Seed the `2026-1` academic infrastructure (semester, departments, courses,
subjects, sections, faculty loadings, student enrollments) from the two 2026-1
ETL CSVs without any manual admin-page entry, and do it idempotently so every
file is safe to re-run against Supabase.

## 2. Artifacts

| Artifact | Purpose |
|---|---|
| `seed-2026-1/01-semester-departments-courses.sql` | one active semester (`e0000000-0000-0000-0000-000000000101`), 10 departments, 16 `department_courses` |
| `seed-2026-1/02-subjects-sections.sql` | 315 `subjects`, 142 `sections` |
| `seed-2026-1/03-users-faculty.sql` | 148 faculty `users` (147 real + `placeholder@lyceumalabang.edu.ph`) |
| `seed-2026-1/04-users-students.sql` | 3,302 student `users` (generated) |
| `seed-2026-1/05-user-roles.sql` | `userrole` rows: 148 FACULTY + 3,302 STUDENT (generated) |
| `seed-2026-1/06-faculty-loading.sql` | 903 `faculty_subjects` (generated) |
| `seed-2026-1/07-enrollments.sql` | 21,989 `student_enrollments`, batched 5,000/INSERT (generated) |
| `seed-2026-1/08-verify.sql` | count + integrity checks (generated) |
| `scripts/generate-seed-2026-1.py` | regenerates 04–08 from the 2 CSVs (stdlib only, deterministic) |

Run order in the Supabase SQL Editor (as `service_role`): `01` → `02` → `03` → `04` → `05` → `06` → `07` → `08`.
Each file is its own transaction and each statement uses `ON CONFLICT DO NOTHING`;
re-running any file is a no-op.

## 3. Source CSVs and Column Mapping

Both are read as **cp1252** (they contain `ñ`; `utf-8` decode fails). Headers are
trimmed; rows are pre-trimmed at parse time.

**Faculty CSV:** `faculty email, name, section, subject code, subject name, department code`
- `subject name` is 100% blank in 2026-1 → `subjects.name` falls back to the code.
- Blank `faculty email` → `placeholder@lyceumalabang.edu.ph` / "Unassigned Faculty",
  dept = most common blank-row dept (hourly CTHM).

**Student CSV:** `name, email, subject code, section, faculty email, department code`

Mapping to schema (`supabase-schema.sql`):

| Source | Table | Resolution rule |
|---|---|---|
| `section` (e.g. `BSCS-21A1` or `BSHM-CM 21A1`) | `sections` | split on first `-`, else first space: program left, name rest; `departmentCourseId` via `department_courses.code = program` |
| `subject code` | `subjects` | upsert by `code`, `name = code` when blank |
| `department code` | `departments` | `LEFT JOIN` by `code`; dept inserts default `name = code` (TODO official names) |
| faculty email | `users` | upsert by lowercase `email`; most-common `name`/`departmentId`; `passwordHash` NULL |
| student email | `users` | upsert by lowercase `email`; `departmentId` NULL (mirrors app ETL); `passwordHash` NULL |
| faculty email / student email | `userrole` | role per email; pipe-role convention (`ADMIN > DEAN > FACULTY > STUDENT`) |
| (faculty email, subject code, section) | `faculty_subjects` | one row per deduped combo; `UNIQUE(subject_id, section_id, "semesterId")` |
| (email, faculty email, subject code, section) | `student_enrollments` | distinct rows; `faculty_subject_id` via faculty+subject+section; `UNIQUE(student_id, faculty_subject_id, "semesterId")` |

## 4. Dedup & Data-Quality Rules

- **Same email, multiple names:** most-common name wins. Known case: `c2784-25@...`
  claimed by `Joseph Lois Belaong` (10) and `Brigette Reblando` (9) → kept
  `Joseph Lois Belaong`; the 9 rows attach to that user (fix at source if distinct).
- **Blank student email:** row's user cannot be created → skipped, names reported in
  `05` (189 rows, 18 distinct names, e.g. Kian Rendel Limpiada ×19).
- **Blank faculty email / `#VALUE!` names:** rows collapse into the single placeholder
  faculty (902 rows) via `DUMMY_FACULTY_EMAIL` pattern from `lib/services/etlEvaluation.ts`.
- **One faculty per (subject, section):** verified zero collisions in 2026-1 against the
  schema UNIQUE constraint; the generator asserts and keeps first-sorted on violation.
- **Non-`lyceumalabang` emails:** included as-is (933 gmail student rows + ~40 typo'd
  domains); app activation/domain rules apply at use time, not at seed time.
- **Enrollment blank-faculty-email rows (896 distinct):** excluded from
  `student_enrollments` — no real `faculty_subject` mapping exists (mirrors
  `studentImport.ts` which requires a faculty assignment).

## 5. Invariants Preserved

- Idempotent: natural-key joins (`email`, `code`, `(name, program)`,
  `UNIQUE(subject_id, section_id, semesterId)`, `UNIQUE(student_id, faculty_subject_id, semesterId)`)
  + `ON CONFLICT DO NOTHING`; re-runs change nothing.
- Exactly one active semester after `01` (page-lock gate for the other admin tabs).
- Role rows via `userrole` (pipe-role convention) — no legacy `users.role` column.
- No change to app code, `proxy.ts`, auth, rubrics, or evaluations.

## 6. Verification (`08-verify.sql`)

Run last; each `actual` must equal `expected`:

| Check | Expected |
|---|---|
| `users_faculty` (email ends `@lyceumalabang.edu.ph` or placeholder) | 148 |
| `users_students` | 3302 |
| `faculty_subjects` for `2026-1` semester | 903 |
| `student_enrollments` for `2026-1` semester | 21989 |
| exactly one `isActive` semester | 1 |
| enrollments with NULL `semesterId` | 0 |

Generator additionally asserts these counts at emission time and fails loudly on mismatch.

## 7. Regeneration Runbook

```powershell
python scripts/generate-seed-2026-1.py `
  "C:\Users\ninal\Downloads\student-import-template (latest 2026-1).csv" `
  "C:\Users\ninal\Downloads\faculty-import-template (latest 2026-1).csv" `
  -o seed-2026-1
```

Then re-run `04`–`08` in the SQL Editor. The generator is deterministic (sorted
output), so identical CSVs produce identical files.

## 8. Known TODOs

- Replace department `name = code` placeholders with official names.
- `subject.name` falls back to code everywhere until real names are available.
- Fix source data for the 189 blank-email students and the `c2784-25` collision,
  then drop the skip/warning comments.
- `scripts/generate-seed-2026-1.py` expects the 2026-1 CSV headers; adjust the two
  header lines when the template changes.

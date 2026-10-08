---
skill: plan-fix
story: Generate SQL seed script from student + faculty CSVs to populate academic infra tables (AcademicInfrastructurePage) so manual front-end inserts are not needed; discover DB alignment first
repo: regie-worktree
calibration: {1: "A", 2: "B", 3: "A", 4: "D", 5: "B", 6: "Other — no code change; idempotent INSERT SQL dump for Supabase from ETL CSVs"}
workflow: "D"
decision: "option-1 single idempotent dump via generator — approved"
status: implementing
pending: "done"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | ETL SQL script from CSVs for academic infra tables | recorded 2026-10-08 |
| 1 | Output shape | A — Compact card |
| 2 | When you need to understand something | B — Short bullets |
| 3 | Agent explanations | A — 3-5 bullets maximum |
| 4 | Workflow | D — SCAN → PLAN → I REVIEW → BUILD |
| 5 | During implementation | B — Implementing..., then one visual summary |
| 6 | Teach or orient | Other — no code change; idempotent INSERT SQL dump for Supabase from ETL CSVs |
| scan-pick | SQL approach | 1 — one idempotent dump via generator |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes |
| who-implements | Who implements? | B — Code it (agent writes on Apply) |
| slice-1 | Slice 1/5 header+semester+depts+courses → supabase-seed-2026-1.sql | applied (Other: output in SQL file); npm test not runnable — node_modules missing in worktree (vitest not found), file is data-only so TS tests unaffected |
| slice-2 | Slice 2/5 subjects(315)+sections(142) appended (file now 576 lines, ends COMMIT) | applied; npm test same env result (vitest missing, data-only change) |
| slice-3a | Slice 3 faculty users (148 incl. placeholder) appended (file now 746 lines, ends COMMIT) | applied; students+roles still pending |
| restructure | User approved numbered files: seed-2026-1/01 (semester/depts/courses), 02 (315 subjects + 142 sections), 03-users-faculty (148) written; monolith supabase-seed-2026-1.sql to be removed once set is complete | done |
| slice-5 approach | B — keep transcribing literally (user chose grind over generator) |
| delivery-blocker | 100KB+ payload emits abort (3 attempts); staged data intact in temp (students 3,302 / roles / loadings 903 / enrollments 21,989); need re-decision |
| delivery | A — committed stdlib generator emitting 04–07 (+08 verify); user runs one command locally |
| slice-generator | scripts/generate-seed-2026-1.py written (04 students / 05 roles / 06 903 loadings / 07 21,989 enrollments batched / 08 verify + asserts) | applied |
| close-out | headers fixed in 01-03 (run order 01->08; 03 note points to 04/05 generator); monolith supabase-seed-2026-1.sql removed | done — 2026-10-08; set complete as seed-2026-1/ 01-08 + seed-2026-1.zip; specs/seed-2026-1-etl.md written |

## Pending

- who-implements (awaiting answer)

## Decisions

- repository.md read: Layering = Route Handler → Controller → Service → Repository → Supabase; tracker = user text only (using request text); proof command = npm test
- Gold paths read-first: supabase-schema.sql, features/admin-data/*.repository.ts, lib/services/etlEvaluation.ts + studentImport.ts, app/api/import/faculties|students route.ts
- No code change per 6-Other: deliverable is idempotent .sql dump for Supabase SQL Editor, not app code
- CSV profile (cp1252, skipinitialspace, TRIM): 28,096 rows/file; 903 distinct (subject, section, faculty) combos; 315 subjects (faculty subject-name col 100% blank → fallback name=code); 142 sections; 16 programs; 10 dept codes; 3,302 student emails; 147 faculty emails; 189 blank student emails; 902 blank faculty emails (name=#VALUE! → placeholder); dup-heavy (875/903 combos repeated, top combo 160 rows)
- Decision option-1: single idempotent .sql dump via local generator; preserves Supabase-via-repositories by honoring all uniques the repos rely on; preserves pipe-role convention via userrole rows (FACULTY/STUDENT); layering = Semester → Departments → Courses → Subjects → Sections → Users → FacultySubjects → Enrollments; gold paths re-read at build: supabase-schema.sql §§7/7b/13/17/19/21, faculty-subject/student-enrollment repositories, etlEvaluation.ts + studentImport.ts; proof = npm test (no app change, must stay green) + second-run no-op + row-count checks

## Scan

Path: CSVs → parseSectionIdentifier (etlEvaluation.ts:5 / FacultyLoadingTab.tsx:305 / csv-helpers.ts:32: split on '-' else ' ', TRIM) → department_courses lookup by program → subjects.upsertMany by code → sections.upsertMany by (name, program) → users.findManyByEmail + createMany + userrole → faculty_subjects (UNIQUE subject_id, section_id, semesterId) → student_enrollments (UNIQUE student_id, faculty_subject_id, semesterId; requires faculty_subject mapping first per studentImport.ts:172-191)
Proof: lib/__tests__/etlEvaluation.test.ts, csv-helpers.test.ts, import-preview.test.ts. Command: npm test
Teach: ETL order matters because enrollments FK to faculty_subjects; dedup in SQL via DISTINCT + ON CONFLICT mirrors upsertMany/replaceBySection; blank faculty → DUMMY_FACULTY_EMAIL placeholder pattern (etlEvaluation.ts:18); alternative is staging-table INSERT..SELECT instead of giant VALUES list
Lens:
- API routes stay thin: n/a (dump bypasses API; must replicate parse + validation the routes/services do)
- proxy.ts access-enforcement: n/a (direct SQL, run as service_role in SQL Editor; app auth untouched)
- Supabase via repositories/DI: applies — dump must respect same uniques/constraints repos rely on (departments.code, department_courses(departmentId,code), subjects.code, sections(name,program), users.email, faculty_subjects(subject,section,semester), student_enrollments(student,faculty_subject,semester))
- SubmitButton double-click guard: n/a (no UI change)
- Pipe-delimited role priority: applies — users need userrole rows (FACULTY for 147 + placeholder, STUDENT for 3,302) via lib/utils/roles.ts convention

## Plan

Slice order follows layering (one file, appended in order; each slice rerunnable alone):
1. Header + semester: BEGIN; ensure single-active `2026-1` semester (deactivate others); departments (10 codes) + courses (16 programs) with ON CONFLICT DO NOTHING.
2. Subjects (315, name=code fallback) + sections (142, TRIM + split '-' else ' ') with ON CONFLICT DO NOTHING.
3. Users (3,302 students + 147 faculty, lowercased emails) + userrole rows (STUDENT/FACULTY); 189 blank-email rows skipped to report comment.
4. Faculty_subjects (903 deduped combos incl. placeholder `placeholder@lyceumalabang.edu.ph` for 902 blank-faculty rows) with ON CONFLICT(subject,section,semester) DO NOTHING.
5. Student_enrollments via faculty_subject_id with ON CONFLICT(student,faculty_subject,semester) DO NOTHING; COMMIT; row-count checks + rerun no-op verification.
Proof: npm test (must stay green, no app change) + Supabase counts + second-run no-op. Out of scope: app code, auth/proxy, rubrics/evals, fixing source CSVs.
Open at build: semester title/single-active force; dept/course display names; password default (seed hash vs NULL+/activate); placeholder vs skip for 902.

# Faculty Import Stepper — General Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

---

# 1. Purpose

Decompose the faculty-subject CSV import into a **stepper wizard** so an admin can observe
and control each prerequisite-table phase individually, instead of one opaque chunked run.

Today the import runs six phases inside every chunk, so no phase is ever "complete" at a
well-defined point. This spec defines the phase-per-request architecture that makes each
phase a first-class, individually observable and stoppable unit.

---

# 2. Scope

| | |
|---|---|
| **In scope** | The faculty importer only — `POST /api/import/faculties`, `lib/services/etlEvaluation.ts`, `features/admin-data/components/FacultyLoadingTab.tsx` |
| **Out of scope** | The student importer (`studentImport.ts` / `BulkStudentImport.tsx`). Its step list is materially different — student users and enrollments, everything else lookup-only — and gets its own spec. |
| **Not a goal** | Durable server-side jobs, rollback/undo, or reordering steps. |

---

# 3. Step Registry

A single canonical registry drives the wizard, the route dispatch, and the status rendering.

| Step | ID | Applies to | Request shape | Requests (28,096-row file) | Distinct values | Depends on |
|---|---|---|---|---|---|---|
| 1 | `upload` | both | none (client-side preview) | 0 | — | — |
| 2 | `departments` | faculty | distinct-set | 1 | 10 | — |
| 3 | `courses` | faculty | distinct-set | 1 | 16 | departments |
| 4 | `sections` | faculty | distinct-set | 1 | 142 | courses |
| 5 | `subjects` | faculty | distinct-set | 1 | 315 | — |
| 6 | `faculty-users` | faculty | distinct-set | 1 | 148 | departments |
| 7 | `mappings` | faculty | distinct-set | 1 | 903 | sections, subjects, faculty-users |

**Total for the 2026-1 file: 6 requests.**

### Every faculty step is `O(distinct values)`, not `O(rows)`

Measured against `faculty-import-template (latest 2026-1).csv`:

```
departments 10    course codes (programs) 16    sections 142    subjects 315
faculty 148       mapping slots 903             rows 28,096 → 281 chunks at 100
```

The mapping slots are **903 distinct** `(subject, section, faculty)` triples — not 28,096
rows. The largest payload in the whole wizard is therefore ~903 items (~150 KB JSON), well
inside a single request. Row count affects only the client-side parse, not any server call.

**Contrast with the student importer**, where the enrollment step genuinely is `O(rows)` —
22,934 distinct `(student, section)` pairs from the same file — so *that* importer will need
chunking. The faculty importer does not.

**Fallback:** if a future file's distinct counts grow such that any payload exceeds ~1 MB,
that step may be split into paged requests using the existing `useChunkedImport` machinery.
The step contract does not change; only the number of requests does.

---

# 4. Contracts

## 4.1 `StepResult`

Returned by every step and rendered by the wizard. Two axes, deliberately separate.

```ts
interface StepResult {
  stepId: string

  // ── lifecycle ──────────────────────────────
  status: 'done' | 'pending' | 'not-reached'

  // ── per-item classification ─────────────────
  inserted: number     // created by this step during this run
  existing: number     // already loaded; skipped, no work performed
  invalid: InvalidItem[] // bad data; individually flagged
}

interface InvalidItem {
  key: string     // the department code, course code, section label, email, or slot key
  reason: string  // human-readable, matches existing service vocabulary
}
```

Every request returns `{ ...StepResult, fileId }`. The `chunkIndex` / `totalChunks` /
`isLast` fields remain in the response shape for compatibility with the legacy composed
path, and the client's `useChunkedImport` still uses them when a fallback page is needed.

### 4.2 Classification vocabulary (fixed)

| Term | Means | Maps to existing service |
|---|---|---|
| `inserted` | created by this step, this run | `createdSubjects` / `createdSections` counters |
| `existing` | already loaded — skipped, no work done | `skipped[]` — the array whose message is `"Already loaded — skipped"` |
| `invalid` | bad data — wrong email, Excel error, unknown code | `errors[]` — carries remarks like `Email domain not allowed` |

**"Skipped" is not a lifecycle state.** It means specifically *already loaded*. A step the
admin chooses not to run is `done` with `inserted: 0`, and its items classify as `existing`.
A step never reached because the admin stopped the wizard is `not-reached`.

## 4.3 Route contract

`POST /api/import/faculties` gains a `step` discriminator. **Omitting `step` keeps the
legacy composed run working** — that path is both the compatibility guarantee and the test
safety net.

```
Content-Type: application/json

// Legacy composed run (unchanged)
{ rows: [...], semesterId, chunkIndex, totalChunks, fileId, isLast }

// Distinct-set step (steps 2-5)
{ step: "departments", semesterId, fileId, items: [...] }

// Chunked step (steps 6-7)
{ step: "mappings", semesterId, fileId, chunkIndex, totalChunks, isLast, rows: [...] }
```

Response is `{ ...StepResult, fileId }` for distinct-set steps, and
`{ ...StepResult, chunkIndex, totalChunks, fileId, isLast }` for the legacy composed path —
matching the shape the client already receives today.

---

# 5. State Machine

```
        ┌──────────┐
        │  upload  │  client-side parse + preview flags
        └────┬─────┘
             ▼
   ┌─────────────────────────────────────────────────────┐
   │ departments ─► courses ─► sections ─► subjects      │  distinct-set, 1 request each
   │ faculty-users ─► mappings                           │  distinct-set, 1 request each
   └─────────────────────────────────────────────────────┘
```

Because every faculty step is a single request, the wizard's interaction model is
**run → observe → stop → resume**, with no per-chunk progress bar for prerequisite steps.
The existing `useChunkedImport` chunk/resume/retry machinery is retained for the student
importer's enrollment step and as the documented fallback if a payload grows past ~1 MB.

- Steps are strictly ordered by FK dependency. A step must not run before its dependency.
- Stopping at any boundary leaves the database in a **valid intermediate state**; every
  phase is idempotent (see §6).
- On resume, a completed step re-runs and reports `inserted: 0`, `existing: N` — never a
  false "new" claim.
- `not-reached` is honest: steps after the stop point are not marked done.

---

# 6. Idempotency and Resume

Every phase must be safe to run twice:

| Phase | Idempotency mechanism |
|---|---|
| departments | `findByCode` before `create`; catch `23505` and re-read |
| courses | `findByDepartmentAndCode` **by the `(departmentId, code)` pair** — code alone is not unique; catch `23505` and re-read |
| sections | `sectionRepository.upsertMany` |
| subjects | `subjectRepository.upsertMany` |
| faculty-users | `findManyByEmail` batch, `createMany` only for missing |
| mappings | `comboMap` dedup + `UNIQUE(subject_id, section_id)` conflict handling |

**Concurrency note:** if a step falls back to paged requests (§3), two pages racing a new
code hit Postgres `23505`. Every insert in the extracted phase functions must preserve the
re-read-on-`23505` behaviour the current inlined code has. With distinct-set requests this
is not reachable today, but the guard must survive the decomposition.

**Resume semantics:** a completed step re-run reports `inserted: 0`, `existing: N`. A step
never reached reports `not-reached`. No step may claim `inserted` for something that already
existed.

---

# 7. Requirement Came From

- Admin cannot see what the import inserted, found, or rejected — the modal shows only
  row/chunk progress, and `createdSubjects` / `createdSections` appear only after the run.
- `createdDepartments` and `createdCourses` were not reported at all until now (fields
  added, increments landed).
- Admin wants to stop at a boundary and review, rather than commit to a full run.

## Expected numbers on the 2026-1 file

With the 903/903 slot join from the earlier faculty upload already established:

```
Step 7  mappings   ✓ done    903 existing · 0 inserted · 0 invalid
         (the 5,162 duplicate rows present as existing, not as a generic "skipped")
```

---

# 8. Risks

| Risk | Mitigation |
|---|---|
| Two payload shapes on one route | Legacy (no `step`) path must stay byte-compatible; it is the test safety net |
| Ordering invariant broken | Steps assert their dependency maps are present before running |
| Regression in decomposition | The composed `importFacultySubjects` is unchanged in behaviour; 35 existing tests in `etlEvaluation.test.ts` must pass untouched |
| Concurrency `23505` | Re-read-on-conflict preserved in every extracted phase |
| Large `invalid[]` arrays | Rendering must cap/scroll; the 2026-1 file can produce long lists |
| Mid-wizard partial state | Safe by idempotency, surfaced honestly as `not-reached` |

---

# 9. Sub-Specs

| Step | Sub-spec |
|---|---|
| 2 | [step-02-departments.md](faculty-import-stepper/step-02-departments.md) |
| 3 | [step-03-courses.md](faculty-import-stepper/step-03-courses.md) |
| 4 | [step-04-sections.md](faculty-import-stepper/step-04-sections.md) |
| 5 | [step-05-subjects.md](faculty-import-stepper/step-05-subjects.md) |
| 6 | [step-06-faculty-users.md](faculty-import-stepper/step-06-faculty-users.md) |
| 7 | [step-07-mappings.md](faculty-import-stepper/step-07-mappings.md) |

---

# 10. Verification

Per sub-spec unit tests plus the composed-path regression suite. Overall gate:
`npx tsc --noEmit` → `npm run lint` → `npx vitest run` (baseline 225 tests / 18 files)
→ `npm run build`.

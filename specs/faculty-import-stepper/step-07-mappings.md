# Step 7 — Mappings

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [faculty-import-stepper.md](../faculty-import-stepper.md).

---

# Purpose

The terminal step. Build `faculty_subjects` rows from the resolved subject, section and
faculty ids, and insert them. This is the step that should report **903 existing · 0 inserted**
on a re-run of the 2026-1 file.

# Position

| | |
|---|---|
| Depends on | steps 4, 5, 6 (`sectionKeyToId`, `subjectCodeToId`, `facultyUserMap`) |
| Produces | nothing downstream |
| Distinct values (2026-1 file) | 903 mapping slots |

# Request

```ts
POST /api/import/faculties
{ step: "mappings", semesterId, fileId,
  items: { subjectCode: string; sectionName: string; sectionProgram: string; facultyEmail: string }[] }
```

# The constraint that makes this safe

`faculty_subjects` is **`UNIQUE(subject_id, section_id)`** (`supabase-schema.sql:713`) — and
`faculty_id` is **not** in the constraint. One subject+section pair can hold exactly one
faculty mapping, enforced by the database.

Two consequences:

1. `findBySubjectAndSection` can never return more than one row, so the `.single()` →
   `.maybeSingle()` hardening done earlier is defence-in-depth, not a live fix.
2. The 49 slots whose faculty email is blank will be owned by the **dummy** — and are
   *designed* to be replaced when a real teacher is assigned.

# Server work

```
for each slot:
  subjectId = subjectCodeToId.get(slot.subjectCode)  → if missing: INVALID "Subject X not found"
  sectionId = sectionKeyToId.get(`${slot.sectionName}|${slot.sectionProgram}`) → if missing: INVALID
  if slot.facultyEmail:
     facId = facultyUserMap.get(lowered email) → if missing: INVALID "Faculty X not found"
     existing = findBySubjectSectionAndFaculty(subjectId, sectionId, facId)
        → if missing: INVALID "X not assigned to SUBJ in SEC"
  else:
     existing = findBySubjectAndSection(subjectId, sectionId)   ← the blank-faculty fallback
        → if missing: INVALID "No faculty assigned to SUBJ in SEC"
  candidate = { faculty_id, subject_id, section_id, semesterId, rowNum, email }

// dedup within the payload, real faculty beats dummy
comboMap = new Map()
for each candidate:
  key = `${subject_id}|${section_id}|${semesterId ?? ""}`
  prev = comboMap.get(key)
  if !prev → set
  else if prev.faculty_id === dummyId && candidate.faculty_id !== dummyId → replace

for each unique candidate:
  try create
  catch 23505:
     existing = existingByCombo.get(key)
     if !existing → continue (someone else inserted it)
     if existing.faculty_id === candidate.faculty_id → SKIPPED "Already loaded — skipped"
     if existing.faculty_id === dummyId && candidate.faculty_id !== dummyId →
          update existing.id to candidate.faculty_id            ← real beats dummy
     else → ERROR "Already assigned — not overwritten"
```

# Classification rules

| Outcome | Counted as | Maps to existing vocabulary |
|---|---|---|
| Mapped, inserted this run | `inserted` | `result.matched` |
| Slot already held by the **same** faculty | `existing` | `result.skipped[]` — `"Already loaded — skipped"` |
| Slot held by the **dummy**, real faculty incoming | `inserted` (mapping reassigned) | the update branch — no count change needed beyond the reassignment |
| Slot held by a **different real** faculty | `invalid` — reason: `Already assigned — not overwritten (existing load kept)` | `result.errors[]` |
| Subject / section / faculty unresolved | `invalid` — respective reason | `result.errors[]` |
| Blank faculty, slot unresolvable | `invalid` — `No faculty assigned to X in Y` | `result.errors[]` |

**"Already assigned, not overwritten" must stay a hard error.** Silently reassigning a real
teacher's class would be a data-integrity bug with no audit trail.

# Idempotency

Re-running the 2026-1 file: 903 slots, all already held by the same faculty → **903 existing,
0 inserted**. The 5,162 duplicate rows in the file collapse through `comboMap` into these 903
slots and surface as `existing`, not as a generic "skipped" count.

# Data guarantee (verified)

903 distinct mapping slots across 903 distinct `(subject, section)` pairs — **every pair has
exactly one faculty**. This is why `findBySubjectAndSection` returning a single row is safe
for this file, and why the blank-faculty fallback resolves deterministically to the dummy for
exactly 49 slots.

# Edge cases

- **Duplicate slots within one payload** — `comboMap` dedups; a payload of 903 items from
  28,096 rows must not attempt 28,096 inserts.
- **`semesterId` in the key** — mappings are semester-scoped. `semesterId ?? ""` must remain
  in the combo key or mappings from different semesters would collide.
- **Dummy-only slot + real faculty** — the update branch. This is the mechanism that repairs
  a placeholder assignment once a real teacher is loaded.
- **Real faculty + different real faculty** — error, never overwrite.

# Tests required

| Test | Asserts |
|---|---|
| maps all 903 slots on a fresh DB | `inserted === 903` |
| re-run is fully idempotent | `inserted === 0`, `existing === 903` |
| duplicates collapse | 28,096 rows produce 903 combo entries |
| real beats dummy | slot held by dummy is updated to the real faculty |
| real vs real is refused | error, and the existing mapping's `faculty_id` is unchanged |
| blank-faculty fallback | `findBySubjectAndSection` called; resolves to the dummy slot |
| unresolved subject/section/faculty flagged | `invalid` carries the respective reason |
| composed path unchanged | existing `importFacultySubjects` assertions still pass |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

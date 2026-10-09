# Step 5 — Subjects

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [faculty-import-stepper.md](../faculty-import-stepper.md).

---

# Purpose

Resolve every subject code to an id, upserting any missing. Subjects are independent of the
rest of the chain — they have no FK dependency — so this step can run in any position, but
sits at 5 by convention.

# Position

| | |
|---|---|
| Depends on | nothing |
| Produces | `subjectCodeToId: Map<string, string>` consumed by step 7 |
| Distinct values (2026-1 file) | 315 codes |

# Request

```ts
POST /api/import/faculties
{ step: "subjects", semesterId, fileId, items: string[] }   // distinct codes, trimmed
```

# Server work

```
subjectItems = codes.map(code => {
  const row = rows.find(r => r.subjectCode === code)
  return { code, name: row?.subjectName || code }
})
{ data, created } = subjectRepository.upsertMany(subjectItems)
inserted = created
existing = subjectItems.length - created
```

`subjectRepository.upsertMany` (`subject.repository.ts:11`) already returns
`{ data, created }`, so `inserted` comes straight from the repository.

# The `name = code` fallback is already in effect

`name: row?.subjectName || code` is the existing line. **On the 2026-1 file this fires for
all 315 subjects** — the `subject name` column is blank in 28,096 of 28,096 rows. So after a
successful import, every subject created from this file has `name === code`. This is worth
knowing because it means subject names are currently uninformative and should be backfilled
from an authoritative source if one exists.

# Classification rules

| Outcome | Rule | Counted as |
|---|---|---|
| Row already existed | in `data`, not in `created` | `existing` |
| Row inserted | in `created` | `inserted` |
| Blank code | filtered before request | not applicable |
| Excel-error cell | flagged invalid at parse, never reaches this step | `invalid` |

# Idempotency

`upsertMany` is idempotent. Re-running reports `inserted: 0`, `existing: 315`.

# Edge cases

- **`code` is `NOT NULL UNIQUE`** (`supabase-schema.sql:694`) — a duplicate insert would
  raise `23505`, but `upsertMany` handles that internally.
- **Case sensitivity** — `subjects.code` is compared exactly in the current
  `findByCode`. Codes must be trimmed but **must not be case-folded**, or `cs101` and
  `CS101` would collide or diverge depending on the database collation.
- **Excel-error subject codes** — `#VALUE!`-style cells are rejected upstream by
  `isExcelErrorCell` and must never reach an insert.

# Tests required

| Test | Asserts |
|---|---|
| upserts all distinct subjects | `upsertMany` called with 315 items |
| name falls back to code when blank | all 315 items carry `name === code` |
| splits created from existing | `inserted === created`, `existing` derived correctly |
| composed path unchanged | existing `importFacultySubjects` assertions still pass |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

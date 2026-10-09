# Step 2 — Departments

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [faculty-import-stepper.md](../faculty-import-stepper.md).

---

# Purpose

Root of the dependency chain. Resolve every department code in the file to an id, creating
any that do not exist. **Never discard a row because its department is unknown** — the
previous behaviour filtered such rows out entirely, silently losing their subject, section
and mapping contribution.

# Position

| | |
|---|---|
| Depends on | nothing |
| Produces | `deptCodeToId: Map<string, string>` consumed by steps 3 and 6 |
| Distinct values (2026-1 file) | 10 |

# Request

```ts
POST /api/import/faculties
{ step: "departments", semesterId, fileId, items: string[] }   // items = distinct codes, uppercased
```

# Server work

```
for each code in items:
  existing = departmentRepository.findByCode(code)
  if existing  → classify EXISTING, map code → existing.id
  else:
    try   created = departmentRepository.create({ name: code, code }) → classify INSERTED
    catch 23505 → raced = findByCode(code); if raced → classify EXISTING else rethrow
```

The insert uses `name = code` because **neither CSV carries a department-name column**. This
is the same convention `etlEvaluation.ts` already applies to subjects (`name: subjectName || code`)
and to the faculty importer's own naming. Accepted trade-off: `name` is user-facing in
`deptPills` (`FacultyLoadingTab.tsx:585`), so departments display as `COE` until renamed.

`create` is currently a plain insert that throws on duplicate `code` (`department.repository.ts:24`),
which is why the `23505` re-read is required rather than optional.

# Classification rules

| Outcome | Rule | Counted as |
|---|---|---|
| Found by `findByCode` | code already in `departments` | `existing` |
| Created | `create` succeeded | `inserted` |
| Found after `23505` | a racing caller inserted the same code | `existing` |
| Blank code | `code.trim().length === 0` | `invalid` — reason: `Department code is required` |

Blank codes must be caught **here, not at the database**. The chunked JSON path bypasses
`parseFacultySubjectCsv`, which normally rejects blank codes at line 122 — so a blank can
reach this step and would otherwise violate `departments.code NOT NULL`.

# Idempotency

Two runs over the same file: run 1 reports `inserted: 10`; run 2 reports `inserted: 0`,
`existing: 10`. Safe to re-run at any point in the wizard.

# Edge cases

- **Case variance** — codes are uppercased on input (`route.ts:48`) and looked up
  case-insensitively by the map key. `coe` and `COE` must resolve to one department.
- **Racing pages** — only reachable under the paged fallback (§3 of the general spec);
  handled by the `23505` re-read.
- **`23505` on a code that does not re-read** — rethrow; a silent failure here would
  corrupt every downstream map.

# Tests required

| Test | Asserts |
|---|---|
| creates all missing departments | `inserted === 10`, `deptCodeToId.size === 10` |
| reuses existing departments | `inserted === 0`, `existing === 10`, `create` not called |
| blank code flagged, not inserted | `invalid` contains the blank key; no `create` with empty code |
| `23505` re-read yields existing | `existing` incremented, no throw |
| composed path unchanged | existing `importFacultySubjects` assertions still pass |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

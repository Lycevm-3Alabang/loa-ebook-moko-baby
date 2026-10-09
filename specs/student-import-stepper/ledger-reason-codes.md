# Ledger and Reason Codes

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of [student-import-stepper.md](../student-import-stepper.md).

---

# Purpose

Replace three downloads with different header sets and no shared vocabulary with **one CSV in
which every input row appears exactly once**, carrying a status, a machine-readable reason code
and a human remark.

# The problem this closes

| Download today | Headers | Gap |
|---|---|---|
| `import-successes.csv` | name, email, subject code, section, faculty email | no department, no status, no reason |
| `import-failures.csv` | + `remarks` | free text, 9 distinct phrasings, no department |
| `removed-rows.csv` | name, email, subject code, section, faculty email, department code | **no reason recorded at all** — `handleRemoveRow` (`BulkStudentImport.tsx:261-274`) captures the row, not why |

`parseErrors[]` is additionally dead on the JSON path the UI uses (populated only by the
`formData` branch, `app/api/import/students/route.ts:90`) and carries `{row, message}` with no
name or email, so it could not be a ledger row even if it fired.

Consequences today: an admin cannot answer *"which of my 22,000 rows actually persisted?"* without
cross-referencing three files with three schemas, and cannot tell a row that was **skipped as
already-loaded** from one that was **dropped by a person**.

# File contract

One file, `student-import-ledger.csv`:

```
row, status, reasonCode, remarks, name, email, "subject code", section, "faculty email", "department code"
```

| Column | Meaning |
|---|---|
| `row` | 1-based line in the source CSV — the same number the error messages use |
| `status` | `persisted` · `already-persisted` · `invalid` · `removed` |
| `reasonCode` | stable identifier, blank when `persisted` without a flag |
| `remarks` | human sentence, always populated when `status != persisted` |
| `department code` | the row's own column, uppercased — never the derived value |

> Include the **flags** of §4 on `persisted` rows too. A row that enrolled while its department
> code was unresolvable must be visible in the ledger, or decision (b) at general spec §3.4 becomes
> invisible exactly where it matters.

**Closure invariant.** `source rows == persisted + already-persisted + invalid + removed`, asserted
before the download is offered. The client already computes a weaker version of this check
(`:360-365`, "unaccounted for") — it becomes exact.

# Status vocabulary

| Status | Meaning | Enrollment written? |
|---|---|---|
| `persisted` | resolved and newly written | yes |
| `already-persisted` | resolved, enrollment already in the database | no — it was there |
| `invalid` | could not be resolved under any rule | no |
| `removed` | excluded by the admin in the preview UI | no |

`removed` is a person, not a rule. It is recorded with a reason so the file explains itself:
`removed` rows are re-uploadable verbatim.

> **`already-persisted` means already in the database, not already in this file.** The two are
> different statements. A duplicate spanning two chunks reads `persisted` in the first chunk and
> `already-persisted` in the second; a file re-uploaded after a successful run reads
> `already-persisted` throughout. Both are correct — conflating them is what makes an import look
> idempotent when it is not.

# Reason codes

Closed vocabulary. Every `status != persisted` row carries one.

## 2.1 Blocking — the row cannot be imported

| Code | Remarks | Source |
|---|---|---|
| `EMAIL_BLANK` | Email is required | client `:596` · server `studentImport.ts:194` |
| `EMAIL_DOMAIN_NOT_ALLOWED` | Email must end with `@lyceumalabang.edu.ph` or `@itmlyceumalabang.onmicrosoft.com` | client `:597` · server `:195` |
| `EXCEL_ERROR_CELL` | Invalid value in `{column}` (Excel error) | client `:595` · server `:192` |
| `STUDENT_NOT_FOUND` | Student not found | server `:198` |
| `SUBJECT_NOT_FOUND` | Subject `{code}` not found | server `:201` |
| `SECTION_NOT_FOUND` | Section `{section}` not found | server `:204` |
| `FACULTY_NOT_FOUND` | Faculty `{email}` not found | server `:211` |
| `FACULTY_NOT_ASSIGNED` | `{email}` not assigned to `{subject}` in `{section}` | server `:216` |
| `NO_FACULTY_ASSIGNED` | No faculty assigned to `{subject}` in `{section}` | server `:222` |
| `TRANSPORT_ERROR` | Chunk {n} failed after {k} attempts: {error} | client `:331-339` |
| `REMOVED_BY_ADMIN` | Removed in preview | client `:261-274` |
| `REMOVED_BLOCKED` | Removed with {n} other blocked rows | client `:276-283` |

## 2.2 Non-blocking — informational flags on a persisted row

| Code | Remarks | Why it is not blocking |
|---|---|---|
| `DEPARTMENT_UNRESOLVED` | Enrolled; no department attributed (code blank) | general spec §3.4 decision (b) — department is reporting metadata |
| `DEPARTMENT_UNRESOLVED` | Enrolled; no department attributed (code `{code}` not found) | as above |
| `DEPARTMENT_MISMATCH` | Enrolled; row says `{code}`, section belongs to `{sectionDept}` | the code is authoritative (general spec §3.2); the disagreement is worth seeing, not worth losing the row over |
| `DEPARTMENT_FROM_FIRST_ROW` | Enrolled; department `{code}` taken from the student's first row in the file | general spec §3.3 — makes the first-instance rule visible instead of silent |

> `DEPARTMENT_MISMATCH` is the row-level signal behind a whole-file problem. `department_courses` is
> `UNIQUE("departmentId", code)` (`supabase-schema.sql:388`), so `BSIT` can exist under two
> departments — a section's real owner is `sections.departmentCourseId`, never a code lookup. A grid
> footnote carrying the file-wide mismatch count makes a systematic error visible without blocking a
> single row.

# Vocabulary lives in one place

Codes and predicates go in **`lib/csv-utils.ts`**, shared by client and server:

```ts
export const IMPORT_REASON_CODES = { EMAIL_BLANK: "…", /* … */ } as const
export type ImportReasonCode = keyof typeof IMPORT_REASON_CODES
export const reasonRemarks = (code: ImportReasonCode, ctx?: Record<string, string>) => string
```

This is the pattern already used at `BulkStudentImport.tsx:7-10`:

> *"Domain rule is shared with the import service via lib/csv-utils — one list, one predicate, so
> the preview cannot disagree with the server."*

**D4 is precisely a preview/server disagreement** — the preview says amber rows are resolved
(`:504`, `:155-157`) while the server fails all five (`:201, 204, 211, 216, 222`). One shared
vocabulary makes that class of defect structurally impossible rather than fixed per-badge.

# Preview legend must match

The legend at `BulkStudentImport.tsx:502-505` currently reads *"Amber imports, or the server
resolves it."* It becomes:

- **Red** — cannot import; the ledger will show the reason.
- **Amber** — imports, but flagged (unresolved department, mismatch, first-row department).
- **Blocking failures** (unknown subject / section / faculty, unassigned faculty) are **red**, not
  amber. They are rejected by the server and reported; they are never resolved.

# Assembly

Built **client-side** from `previewRows` state plus per-chunk results — not from concatenated
server CSVs. The current `concatCsvBodies` (`:94-99`) strips the header from every subsequent chunk
and assumes all servers share one schema, which is why the three files drifted apart.

Order: source row ascending, so the ledger reads alongside the CSV in any viewer.

# Edge cases

- **≈22,000 rows.** Well within spreadsheet limits; generate once at completion, not per chunk.
- **A row removed, then re-added by an edit.** One ledger entry, keyed by the source row number.
- **Same email, different subject/section across rows.** Each is its own ledger row — the ledger is
  per **input row**, not per person. A student with 8 rows appears 8 times.
- **Re-run of the same file.** All `already-persisted` with `ALREADY_PERSISTED`. The admin can
  confirm idempotency by re-running and diffing.
- **A chunk that never ran.** Its rows are `invalid` / `TRANSPORT_ERROR`, so the closure invariant
  holds even for an aborted import.

# Tests required

| Test | Asserts |
|---|---|
| every input row appears exactly once | `ledger.length === sourceRows.length` |
| closure invariant | `persisted + already-persisted + invalid + removed === sourceRows` |
| every non-persisted row has a code and remark | no blank `reasonCode` or `remarks` |
| every code is in the vocabulary | no free-text reason escapes `IMPORT_REASON_CODES` |
| unresolvable department is non-blocking | row is `persisted` **and** carries `DEPARTMENT_UNRESOLVED` |
| mismatch is non-blocking | row is `persisted` and carries `DEPARTMENT_MISMATCH` |
| re-run reads as already-persisted | not `persisted`, not `invalid` |
| aborted import still closes | transport-failed chunks contribute `invalid` rows |
| client and server agree | a row the preview marks blocking is rejected with the same code |
| CSV escaping | names containing commas or quotes round-trip |

# Verification

`npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

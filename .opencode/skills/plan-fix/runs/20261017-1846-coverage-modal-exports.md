---
skill: plan-fix
story: coverage-modal-and-csv-zip-exports (coverage detail modal + coverage CSV export + per-department results ZIP export)
repo: e-consultation (regie-worktree)
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: D
decision: Option A (modal for coverage detail; client-side coverage CSV; server-side ZIP for results via pure-JS writer lib/zip.ts, no new dependency; dean scoped variant)
status: done
pending:
who-implements
---
# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| who-implements | Who implements | B (Code it) |
| slice-1 | Apply slice 1 (zip writer) | Applied — lib/zip.ts created |
| slice-2 | Apply slice 2 (zip tests) | Applied — lib/__tests__/zip.test.ts (6 tests) |
| slice-3 | Apply slice 3 (coverage modal) | Applied — CoverageDetailModal.tsx created; CoveragePage refactored |
| slice-4 | Apply slice 4 (coverage CSV export) | Applied — exportCsv + button added |
| slice-5 | Apply slice 5 (admin results export route) | Applied — app/api/admin/evaluation-results/export/route.ts created |
| slice-6 | Apply slice 6 (dean results export route) | Applied — app/api/dean/evaluation-results/export/route.ts created |
| slice-7 | Apply slice 7 (results page export buttons) | Applied — admin + dean results pages |
| slice-8 | Apply slice 8 (export route tests) | Applied — admin (4) + dean (4) tests |
## Pending
none

## Decisions

Option A (modal for coverage detail; client-side coverage CSV; server-side ZIP for results via pure-JS writer lib/zip.ts, no new dependency; dean scoped variant). Invariants: API routes stay thin (parse, call service, return) — app/api/; All Supabase access via repositories wired by DI — lib/repositories/factory.ts; proxy.ts access enforcement admin/dean/faculty; Role priority ADMIN > DEAN > FACULTY > STUDENT; SubmitButton double-click prevention. Layering: lib/zip.ts (pure) → service/repository → route (HTTP). Gold paths: app/api/, features/, proxy.ts, lib/repositories/factory.ts. Proof: npm test + tsc --noEmit. Out of scope: faculty views, scoring/aggregation, per-faculty PDF, enrollment edits. Privacy: server-side scoping (dean own dept). Performance: server-side ZIP avoids client memory; modal lazy fetch.

## Scan

Path (modal): features/evaluations/components/CoveragePage.tsx (expand toggle + inline panels) → to become modal trigger + scrollable modal. Existing modal component? none found in components/ui (grep Modal). Gold: components/ui/ (Skeleton, ErrorState, Paginator, SubmitButton). Export (coverage): client-side CSV via Blob + URL.createObjectURL (pattern in EvaluationReportContent.tsx:254-264 and BulkUserImport downloadBlob). Export (results ZIP): app/api/admin/evaluation-results/route.ts + departments/[departmentId]/route.ts → new server route returning application/zip; pure-JS ZIP writer in lib/zip.ts (no jszip in package.json).
Proof: npm test. No existing tests for zip or these exports. Command: npm test.
Teach: Modal needs a portal + focus trap + Esc/backdrop close + scroll lock. ZIP format is simple (local file header + data + central directory) and can be written with DataView/Uint8Array without a dependency. CSV export reuses the existing downloadBlob pattern.
Lens:
- API routes stay thin (parse, call service, return JSON) — app/api/ — applies; export route streams a buffer
- All Supabase access via repositories wired by DI — lib/repositories/factory.ts — applies
- proxy.ts access enforcement — applies; export endpoints admin/dean gated
- Double-click prevention via SubmitButton — applies to export buttons
- Role priority ADMIN > DEAN > FACULTY > STUDENT — applies
Gold paths: app/api/, features/, proxy.ts, lib/repositories/factory.ts

## Plan

- S1: Pure ZIP writer lib/zip.ts — createZip(entries: {name, data: Uint8Array}[]): Uint8Array implementing ZIP (local file header + data + central directory + EOCD) with CRC32. Pure, no deps.
- S2: ZIP writer tests lib/__tests__/zip.test.ts — round-trip, CRC32, empty zip, nested paths, unicode names.
- S3: Coverage modal features/evaluations/components/CoverageDetailModal.tsx — portal-based modal with focus trap, Esc/backdrop close, scroll lock, scrollable body rendering the 4 buckets. Refactor CoveragePage.tsx to open modal on "Details" instead of inline panels.
- S4: Coverage CSV export — add "Export coverage (CSV)" button to CoveragePage.tsx building CSV from loaded subjects via downloadBlob pattern. Filename coverage-<period>.csv.
- S5: Results export route (admin) app/api/admin/evaluation-results/export/route.ts — GET with evaluationPeriodId, streams application/zip. Per department: <deptCode>_results.csv (faculty, subject, code, respondents, avgRating, remarks, categories) + summary.csv. Guarded by requireAdmin.
- S6: Results export route (dean) app/api/dean/evaluation-results/export/route.ts — same, scoped to dean's department. Guarded by hasRole(DEAN).
- S7: Results page export button — add "Export all (ZIP)" to app/admin/evaluations/results/page.tsx and dean results page triggering download from export route.
- S8: Export route tests — admin route (400/403/headers/content-type) + dean route (403 cross-dept). Proof: npm test + tsc --noEmit.
Out of scope: faculty views, scoring/aggregation, per-faculty PDF, enrollment edits, recompute/invalidation. Privacy: server-side scoping (dean own dept). Performance: server-side ZIP avoids client memory; modal lazy fetch.

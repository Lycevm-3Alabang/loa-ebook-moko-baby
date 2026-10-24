# Evaluation coverage department drill-down handover

Updated: 2026-10-24

## Status

The completed coverage cache/manual-refresh work is tracked in
[evaluation-coverage-faculty-cache.md](../specs/evaluation-coverage-faculty-cache.md)
and the shared banner contract in
[cached-data-refresh-banner.md](../specs/cached-data-refresh-banner.md).
Owner-run validation remains pending.

The next requested work is documented in the draft
[department drill-down spec](../specs/evaluation-coverage-department-drilldown.md).
It covers the admin coverage `?dept={departmentId}` view: add the search,
faculty sorting, and expand/collapse controls from the Evaluation Results
department faculty-card pattern, but omit selection checkboxes and
Results-specific visibility controls. It also requires tracing and correcting
faculty/subject status counts that disagree with the live Details student
lists.

No application code was changed for this follow-up. The spec requires owner
review before implementation.

## Next

1. Review and approve the department drill-down spec.
2. Trace the status-count mismatch from repository/service through the
   coverage payload and compare it with the on-demand Details response.
3. Implement the approved scope and run the owner validation gate.

## Implementation update — 2026-10-24

The owner approved the draft, and the implementation is complete. The
department view now has faculty search, surname sorting, result counts, and
visible-card expand/collapse controls without Results selection or visibility
controls. Enrollment reads for both the cached status snapshot and live
Details are paged; snapshot and Details share status classification and the
same eligible student set. Missing faculty aggregates are surfaced instead of
being hidden or rendered as zero.

The durable behavior and count-grain contract are recorded in the
[department drill-down spec](../specs/evaluation-coverage-department-drilldown.md).
Focused tests were added for the controls, count buckets, paging, missing
aggregates, and live Details separation. VS Code diagnostics report no errors
in edited TypeScript files. The owner validation gate in `TODO.md` remains
pending; do not rerun or expand the investigation before that gate is run.

## Zero-row parity fix — 2026-10-24

The zero-row mismatch came from two leftovers: the snapshot's id-only bulk
read (`listStudentIdsByFacultySubjectIds`) and the versionless localStorage
key that kept serving its pre-fix snapshot. Both surfaces now use one roster
read (`listRosterByFacultySubjectIds`: `id, faculty_subject_id, student_id,
student:student_id(id, name, email)`, 100-id chunks, `order("id")` and
1,000-row pages, per-section dedupe) and one tally (`classifyRoster`). The
card's enrolled/bucket numbers are the lengths of the same lists the Details
modal renders. The coverage cache key carries `v2`, so a pre-fix snapshot is a
miss. `evaluation-status-parity.test.ts` asserts the two surfaces agree,
including a duplicate-roster/conflicting-rows case; the id-only shim is gone.

Gate (2026-10-24): `npx tsc --noEmit` and `npm run lint` pass; `npx vitest run`
reports 1 failed / 862 passed / 1 skipped. The failure is unrelated to this
fix: `lib/__tests__/department-page-export-button.test.tsx:145` expects the
button name `← Back to Evaluation Results`, while
`app/admin/evaluations/results/[departmentId]/[facultySubjectId]/page.tsx:174`
renders `← Back to {departmentName} Evaluation Results` — the intentional
label change recorded in `evaluation-results-cache-handover.md`. Fix the test
expectation to the department-specific name, rerun the gate, then commit. No
commit was made.

The “test adapters” note in `evaluation-results-cache-handover.md` is
superseded: the service tests now mock `listRosterByFacultySubjectIds`
directly.

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

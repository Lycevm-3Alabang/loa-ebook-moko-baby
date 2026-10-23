# Evaluation coverage faculty/cache handover

Updated: 2026-10-24

## Status

The requested behavior is specified but not implemented. Start with the draft
[evaluation coverage spec](../specs/evaluation-coverage-faculty-cache.md); owner review is
required before implementation.

The draft covers both admin and dean coverage routes through the shared
`features/evaluations/components/CoveragePage.tsx`. It proposes a faculty-only drill-down,
correctly joined faculty-card aggregates, and a period/scope local-storage snapshot refreshed
only by the manual **Refresh** action. Student Details remain live and on demand.

The next tracked work is in [TODO.md](../TODO.md). Do not begin implementation until the owner
approves the draft spec.

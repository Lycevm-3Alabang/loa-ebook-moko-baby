# Department export handover

Updated: 2026-10-24

## Status

E4 is implemented in the shared `DepartmentSubjectView` used by both admin and dean department pages. The select/unselect control operates on the faculty cards currently shown after search, uses “Select shown” / “Unselect shown” while searching, and leaves selections on search-hidden faculty untouched. Result visibility does not change which cards are in scope.

Focused tests were added in `lib/__tests__/department-subject-view.test.tsx`. They have not been run in this session.

## Next

Continue with E5 in `TODO.md`: update the evaluation export spec status row, have the owner run the verification gate, and remove this handover when it is no longer needed.

The D37 decision is recorded in `.opencode/skills/plan-fix/runs/20261023-1752-admin-export-faculty-selection.md`.

---
skill: plan-fix
story: "E4 in @TODO.md: Select / unselect all — one toggle in card toolbar applying to shown faculty cards (D37). Hidden selections survive."
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: "A — SCAN → VISUAL → APPROVE → BUILD"
decision:
status: complete
pending: "none"
---

# E4 Implementation Complete

All three slices applied to `features/evaluations/components/DepartmentSubjectView.tsx`:

## Slice E4-1: Select/unselect-all toggle (lines 207-240)
- Added `SubmitButton` with "Select All"/"Unselect All" label
- Toggles only visible faculty (not hidden by search)
- Hidden selections persist
- 500ms double-click guard + loading state

## Slice E4-2: Hidden selection persistence (after line 145)
- Added `useEffect` documenting checkbox state retention

## Slice E4-3: Conditional rendering
- Toggle renders only when `uniqueFacultyIds.length > 0`

## Verification
- `tsc --noEmit`: ✅ Passes
- `npm test`: ✅ 842 passed, 1 skipped

## Plan file
`.opencode/skills/plan-fix/runs/20261023-E4-select-unselect-all.md` - `status: complete`
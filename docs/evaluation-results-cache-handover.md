# Evaluation Results — Faculty Card Average handover

Updated: 2026-10-24

## Status

The owner reported that the Faculty Card's average (example: `4.43`) does not
match the arithmetic mean of its visible Subject–Section ratings (`4.65` and
`3.94`, mean `4.295`). The owner chose the unweighted Subject–Section mean
rather than the currently documented pooled response-level average.

The draft spec is
[evaluation-results-faculty-card-average.md](../specs/evaluation-results-faculty-card-average.md).
It requires owner review/approval before implementation because this changes
the prior aggregate contract. `TODO.md` tracks that review.

Implementation should update the Faculty Card average and its matching remark
while preserving department summary, export, and other unrelated pooled
figures. The shared UI is used by both admin and dean department results pages.

## Initial handover plan (superseded)

1. Review/approve the draft spec.
2. After approval, implement the unweighted mean from the faculty's rated
   Subject–Section rows in the selected department and period.
3. Add focused tests for the example, null/no-rating rows, unequal respondent
   counts, search-independent summary, and admin/dean consistency.

## Implementation update — 2026-10-24

The owner approved proceeding. The shared Faculty Card now uses the
unweighted mean of its displayed Subject–Section ratings, excludes null-rated
rows, rounds to cents with half-up behavior, and derives the remark from that
same mean. The calculation uses all of the faculty's department rows before
search filtering, so search does not alter the headline.

Focused component tests now cover the `4.65` and `3.94` example (`4.30`),
unequal respondent counts, null/no-rated rows, numeric zero, and search
independence. The implementation is in
[DepartmentSubjectView](../features/evaluations/components/DepartmentSubjectView.tsx);
the contract is in
[the Faculty Card average spec](../specs/evaluation-results-faculty-card-average.md).
VS Code diagnostics report no errors in the component or focused test.

## Next

Run the owner validation gate listed in `TODO.md`. No further implementation
is open in this slice.

## Expanded averaging work — 2026-10-24

The owner expanded the approved scope to all Evaluation Results summaries and
their workbook exports. The current contract is
[the consistent averages spec](../specs/evaluation-results-faculty-card-average.md);
its nearest-tenth rounding and fixed two-decimal display rule supersede the
earlier cents-rounding note above.

Step 2 is implemented: the shared Faculty Card and the department detail
service summaries use the unweighted mean of their rated Subject–Section
scores, and summary remarks follow that result. VS Code diagnostics report no
errors in the changed files; tests and build have not been run.

Next: align department-list figures and confirm department/faculty workbook
parity, then update `TODO.md` and give the owner the PowerShell validation
commands. The earlier statement that no implementation remained is superseded
by this expanded scope.

Step 3 is complete: cached department figures used by the department list and
dean route now average rated Subject–Section scores equally. A repository test
covers unequal response counts; VS Code diagnostics report no errors in the
repository, route, and test. Workbook parity and owner-run validation remain.

Step 4 is complete: the ZIP summary workbooks consume the updated service
averages, and both admin/dean summary CSVs now preserve two displayed decimal
places. The admin browser figures cache key was versioned to prevent an old
pooled value from persisting. Focused workbook/CSV tests were updated, but
tests and build have not been run. Implementation is complete; the owner-run
validation gate in `TODO.md` remains.

## Follow-up fixes — 2026-10-24

The owner shared a validation run with four failing tests. The admin and dean
CSV assertions now expect `csvEscape` to quote numeric fields, and the
department-summary widget test now expects the equal-weight `3.00` average
instead of the former pooled `3.50`. The coverage page's Collapse all action
now determines its toggle direction from the current expanded-faculty set.

The department summary workbook's custom two-decimal number format was
simplified to `0.00;[Red](0.00)`, with a writer regression assertion. This is
a compatibility fix prompted by Excel repair screenshots; the repair-log XML
was not provided, so the workbook repair cause remains unconfirmed. The
updated tests and workbook have not been run/opened in Excel. Owner validation
remains required.

## Attached workbook package finding — 2026-10-24

Inspection of the attached `Nino Francisco Alamo_summary.xlsx` confirmed the
Excel repair issue in the generated package: `[Content_Types].xml` declares
both `.rels` and `.xml` parts as `application/octet-stream`. The Open Packaging
Conventions require the relationship parts to use
`application/vnd.openxmlformats-package.relationships+xml`, and XML parts to
use `application/xml`. The writer now emits those standard content types,
with regression assertions in `xlsx-writer.test.ts`. The attached workbook
also contains the corrected `0.00;[Red](0.00)` number format; the content-type
declarations are the confirmed structural defect.

VS Code diagnostics report no errors in the writer, writer test, or styles.
The focused test has not been executed, and the fixed workbook has not yet
been generated/opened in Excel. Owner validation remains required.

## Summary precision correction — 2026-10-24

The attached faculty workbook showed row averages `3.45`, `3.90`, and `3.60`,
whose arithmetic mean is exactly `3.65`. Rounding this mean to tenths produced
the incorrect `3.70`. The shared summary helper now rounds only to the nearest
hundredth using half-up behavior, preserving `3.65`; this applies consistently
to faculty and department summaries, UI, and exports. The averaging spec and
focused helper/workbook tests now cover the corrected rule. VS Code diagnostics
report no errors in the edited files; tests have not been run.

## Coverage expand/collapse test fix — 2026-10-24

The CoveragePage test found the `Details` controls still present immediately
after clicking Collapse all. The handler now follows the action represented by
the current button state while updating only visible faculty groups. The test
waits for the resulting collapsed state and verifies the button returns to
Expand all. VS Code diagnostics report no errors in the component or test;
tests have not been run.

## Follow-up investigation — 2026-10-24

The owner's latest full test run still fails the Collapse all assertion.
`queryByRole("button", { name: "Details" })` is invoked inside `waitFor`, but
two matching Details buttons remain in the rendered output, so the assertion
continues to fail rather than observing a collapsed state. This confirms the
earlier wait-for adjustment did not fix the behavior. Lint passed and the
other 84 test files passed (one skipped); the act warnings in the department
export-button test are separate. No code change was made during this
investigation. The collapse transition needs further targeted diagnosis.

## Collapse all root cause and fix — 2026-10-24

The failure was caused by the shared `IosButton` 500ms rapid-click guard, not
the expanded-faculty state calculation. Expand all was immediately followed by
Collapse all in the test (and could likewise happen in the UI), so the second
click was suppressed. `IosButton` now accepts `allowRapidClick`; CoveragePage's
Expand/Collapse all toggle opts into it, while other buttons retain the guard.
VS Code diagnostics report no errors in the button, page, or focused test. The
test has not been rerun.

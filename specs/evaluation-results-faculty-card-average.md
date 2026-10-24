# Evaluation Results — Consistent Averages

**Version:** 1.2
**Status:** Owner-approved scope — implementation in progress
**Last Updated:** 2026-10-24
**Scope:** Overall average ratings in admin and dean Evaluation Results
summaries and their exports.

## 1. Problem

The Evaluation Results pages show an overall Avg Rating at several grains:
Subject–Section rows, Faculty Cards, department summaries, and the department
list. Faculty and department export summaries also report an Avg Rating.
Currently higher-level values can be pooled from underlying response/rubric
ratings rather than computed as the arithmetic mean of the displayed
Subject–Section scores. Consequently, a headline may not summarize the
figures directly below it.

Example: the rows show `4.65` and `3.94`, whose arithmetic mean is `4.295`
(displayed to two decimals as `4.30`), while the current Faculty Card shows
`4.43`.

The current pooled-response rule does not give each displayed Subject–Section
rating equal weight. Use the same clear averaging rule throughout the Results
summary hierarchy and its exported summaries.

## 2. Desired behavior

1. Keep the existing calculation and display of each Subject–Section
   `avgRating`. These row scores are the base values for all higher-level
   summaries.
2. Every faculty, department, and department-list overall Avg Rating is the
   **unweighted arithmetic mean of its included rated Subject–Section rows**.
   Each row has equal weight, regardless of its respondent count or the
   faculty's number of other rows:

   `summary average = sum(included subject-row averages) / number of rated rows`

3. For a faculty summary, include only that faculty's Subject–Section rows in
   the selected department and evaluation period.
4. For a department summary or department-list row, include all rated
   Subject–Section rows in that department and period. Do not average faculty
   averages, as that would give each faculty equal weight rather than each
   displayed Subject–Section row equal weight.
5. Include rows with non-null `avgRating`; exclude null-rated rows. Include a
   valid numeric score of zero.
6. Compute from the same row-rating values shown in the UI, then round the
   final mean once to the nearest hundredth using round-half-up. Always display
   summary averages with two decimal places. Thus
   `(4.65 + 3.94) / 2 = 4.295` rounds to `4.30`; and
   `(3.45 + 3.90 + 3.60) / 3 = 3.65` displays as `3.65`.
7. When a scope has no rated rows, use the existing empty score marker (`—`);
   do not show zero or fabricate an average.
8. Search only filters visible rows/cards. It must not change faculty or
   department summaries; calculations use all rated rows in the selected
   department/period, not only search matches.
9. Derive any associated remark/verdict from the same displayed summary
   average.
10. Keep UI and exported summary values consistent:
    - Faculty summary workbook uses the same average and remark as its Faculty
      Card.
    - Department summary workbook and CSV use the same average and remark as
      the department summary and department list.
    - Department list uses the same department average as that department's
      detail summary card.
    - Subject–Section workbook rows keep their existing row-level ratings.
11. Apply the same behavior to admin and dean Results pages and exports.

## 3. Scope and compatibility

Applies to the admin and dean Evaluation Results surfaces:

- department list (`/admin/evaluations/results` and dean equivalent)
- department summary and faculty cards (`.../results/[departmentId]`)
- department and faculty summary workbooks in the consolidated ZIP export
- department summary CSVs in the admin and dean exports

This supersedes the pooled-average portions of the existing
`evaluation-results-attribution.md` and
`evaluation-results-summary-card.md` contracts. Preserve existing response
counts, row-level subject ratings, rubric/category figures, sentiment,
attribution, visibility, and cache behavior unless a change is required to
make these overall averages consistent.

No schema, Supabase, or evaluation-coverage changes are in scope.

## 4. Acceptance checks

1. For two rated rows `4.65` and `3.94`, faculty and department summaries
   containing those rows display `4.30`, not `4.43`.
2. Respondent-count differences do not weight summaries; summary averages
   round to hundredths and display with two decimal places.
3. Department average is the mean of its rated Subject–Section rows, not a
   mean of faculty averages; faculty average is the mean of that faculty's
   rated rows.
4. Null rows are excluded; numeric zero is included; no-rated-row scope shows
   `—`.
5. Search does not change summary averages.
6. Admin/dean UI, department list, department summary, faculty summary, and
   corresponding workbook and CSV summary outputs agree at their applicable
   scope and row grain.
7. Remarks/verdicts match the corresponding displayed average.
8. Subject row ratings and unrelated Results behavior remain unchanged.

## 5. Verification

Add focused tests for the example, unequal respondent counts, null rows,
numeric zero, no-rated-row output, non-equal faculty row counts at department
grain, search-independent summaries, department-list/detail parity, and
faculty/department workbook parity. Preserve admin/dean route coverage.

Owner-run validation gate:

```powershell
npx tsc --noEmit
if ($?) { npm run lint }
if ($?) { npx vitest run }
if ($?) { npm run build }
```

## 6. Decision history

- **2026-10-24:** Owner selected an unweighted mean of Subject–Section ratings
  rather than retaining the pooled response-level Faculty Card average.
- **2026-10-24:** Owner expanded scope to all Results summaries and summary
  exports; the department list/detail and export outputs must share the same
  Subject–Section-row averaging rule.
- **2026-10-24:** Owner clarified that summary averages round to the nearest
  tenth but are always displayed with two decimal places; Subject–Section row
  precision remains unchanged.
- **2026-10-24:** Owner clarified that the summary mean must preserve hundredths
  (for example, `3.45`, `3.90`, and `3.60` average to `3.65`); this supersedes
  the earlier nearest-tenth rule.

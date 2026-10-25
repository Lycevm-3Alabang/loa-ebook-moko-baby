# Admin Evaluation Results — the overview dashboard — Spec

**Version:** 1.1 (Final)
**Status:** Final — owner-approved 2026-10-26
**Scope:** `/admin/evaluations/results` only. Not the department drill-down, not the dean's pages, not Coverage, not the exports.
**Related:** `specs/evaluation-results-attribution.md` (§3.14 the headcount, §3.22 the counts rule, §3.23 the attention rule), `specs/evaluation-results-cache.md` (the figures snapshot and the manual-only refresh), `specs/cached-data-refresh-banner.md` (the one staleness signal), `specs/evaluation-results-summary-card.md` (the drill-down's card — a sibling, not this surface).

> **v1.1 (2026-10-26):** the owner wants a **bar chart for quick comparison among departments** and prefers the visual. The remark-distribution panel is replaced by a **department rating bar chart** (§4.4); the three tiles and the weakest-criterion panel remain. The data path is unchanged.

> **The rule that shapes everything below:** the dashboard is a **projection of the data the list already has**. It adds no fetch, no endpoint, no repository or service, no database change, no browser-storage key, and no dependency. If a number is not in the list's merged rows or in the page's existing `attentionByDept`, the dashboard does not show it.

---

## 1. The problem

The page is a table of departments. It is good at per-department detail and bad at the aggregate:

- To answer "how did this period go overall?", the admin must read every **Avg Rating**, compare them in their head, and count the remarks.
- To **compare departments at a glance**, the admin must read the **Avg Rating** column row by row; the table offers no visual ranking.
- To answer "is anything critical?", the admin must scan the conditional **Needs Attention** column — which is only rendered when at least one department has a critical rubric.
- To answer "how much of the list is represented?", the admin must notice the rows printing "—".
- To answer "what is weak across departments?", the admin must compare each row's lowest rubric manually.

The page already holds everything needed for a summary: every department's published average, its weakest rubrics, and the same per-department figures the table prints. The dashboard is a read of that state, not a new data path.

---

## 2. Constraints and non-goals

### 2.1 Hard constraints

| Constraint | Why |
|---|---|
| **No change to the page's fetches** | The period list, the results snapshot, the per-department figures fetches, the cache keys, the retry/refresh flow, and `CachedDataRefreshBanner` stay as they are. The dashboard reads the existing state. |
| **No new endpoint, service, repository, or database change** | AGENTS.md **H4**. The data is already on the client. |
| **No new browser-storage key** | A second cache would be a second source of truth and could disagree with the table. The dashboard derives from the page's `rows` and `attentionByDept`. |
| **No new dependency** | No chart library. The data is a handful of department averages; CSS bars are sufficient. |
| **No response counts** | Contract §3.22: the results surfaces retired them; the Coverage page owns them. `totalRespondents` is in the figures payload but must not be visualized here. |
| **No sentiment** | `sentimentScore` is a placeholder (`AGENTS.md`, "Missing / Incomplete"); a gauge without a defined scale would mislead. |
| **No partial aggregates** | The dashboard appears as **one unit** once every row's figures have landed or failed. A mean that moves while rows fill is worse than one that appears a moment later — the same rule the table already applies to sorting. |
| **No change to the table** | Sorting, the conditional attention column, row skeletons, click-through, and Refresh behavior are untouched. The dashboard only sits above the table. |

### 2.2 Non-goals

- Not a replacement for the table; the table remains the page's primary content and navigation.
- Not interactive: no filters, no clickable bars, no sort control, no duplicate Refresh button. The table is the navigation.
- Not the drill-down's Department Summary card. That card is per-department (`specs/evaluation-results-summary-card.md`); this is cross-department.
- Not on the dean's pages. The dean lands on their own department, not a list.
- Not a school-wide pooled figure. See §5.1.

---

## 3. What the dashboard may use

The page's state after its existing effects have run:

| Field | Source | Notes |
|---|---|---|
| `departmentId`, `departmentName`, `departmentCode` | `/api/admin/evaluation-results` row | Stable while the page is open. |
| `facultyCount` | same row | **Not used.** The table's Faculty column owns the headcount (§3.14). |
| `avgRating`, `remarks`, `highestRubrics`, `lowestRubrics` | `/api/admin/evaluation-results/figures`, merged into `rows` | The list payload sets these to null/empty; the per-department figures fill them in. `avgRating === null` means "no rating", not zero. |
| `totalRespondents` | figures payload | **Not used.** §3.22. |
| `sentimentScore` | figures payload | **Not used.** Placeholder. |
| `attentionByDept` | the page's existing `useMemo` (`findAttentionRubrics` over `lowestRubrics`) | **Reused, not re-derived.** The tile must agree with the table's Needs Attention column by construction. |
| `figures` / `figuresFailed` | the page's existing state | Used only to decide whether the dashboard is settled and which rows are missing. The component never reads the cache. |

> **What is deliberately absent.** The dashboard cannot show a pooled school average, a response total, a participation rate, a sentiment gauge, or a faculty total. Each would need either data the page does not carry or a rule the owner retired from this surface.

---

## 4. The dashboard

### 4.1 The four questions

| # | Question | Element | Weight |
|---|---|---|---|
| 1 | **How did the period go overall?** | the mean of department averages, with its remark | the headline |
| 2 | **Is anything critical?** | the departments whose weakest rubric is "Unsatisfactory" or worse | the alarm |
| 3 | **How much of the list is represented?** | departments with a rating vs departments in the period | the context |
| 4 | **How do the departments compare, and what is weak?** | department rating bar chart + the most common weakest criterion | the comparison and the pattern |

The dashboard is a **summary, not an analytics workbench**: five elements, no filters, no drill-through. It answers the four questions in one screen and hands the detail back to the table.

### 4.2 Layout

```
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
│ MEAN OF DEPARTMENT AVERAGES  │ NEEDS ATTENTION              │ DEPARTMENTS WITH RESULTS     │
│ 4.12  [Very Satisfactory]    │ 2                            │ 7 of 10                      │
│ Across 7 of 10 departments   │ Physical Sciences, Arts      │ 3 with no rating             │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────────┘
┌───────────────────────────────────────────────────┬───────────────────────────────────────┐
│ AVERAGE RATING BY DEPARTMENT  7 rated · 3 no results │ MOST COMMON WEAKEST CRITERION      │
│ Computer Science   ██████████████████████ 4.50    │ Across 7 rated · ties counted         │
│ Arts and Sciences  ██████████████████ 4.12        │ Time Management         4 of 7        │
│ Education          No results                     │ Learning Materials      3 of 7        │
│ …                                                 │ Student Engagement      1 of 7        │
│ ● Outstanding ● Very Satisfactory ● Satisfactory  │                                       │
│ ● Unsatisfactory/Poor ● No results                │                                       │
└───────────────────────────────────────────────────┴───────────────────────────────────────┘
```

- **Position:** after the integrity warning and **before the table**. The period selector and `CachedDataRefreshBanner` stay above it, so the stale-data warning visibly covers the dashboard's numbers too.
- **Shape is stable:** three tiles, two panels. The attention tile is present even at zero; the chart keeps a row for every loaded department, including the no-rating rows. Only the values change with the data — the same lesson the Department Summary card records.
- **The chart is the comparison.** It is ranked by the department average and is independent of the table's current sort; the table keeps its own ordering.
- **No section title.** The page's `h1` is "Evaluation Results"; the tiles and panel headings label themselves. The section gets `aria-label="Results overview"`.

### 4.3 The three tiles

**Tile 1 — Mean of department averages**

- Eyebrow: `MEAN OF DEPARTMENT AVERAGES` (`text-[10px] font-semibold uppercase tracking-wider text-tertiary`).
- Value: the mean, two decimals (`text-4xl font-bold leading-none tabular-nums text-primary`). `—` when no department has a rating.
- Badge: `getRemark(mean)` in `getRemarkColor(...)` — the same badge the table and the drill-down print.
- Subtext: `Across N of M departments`, or `No department has a rating yet` when `N = 0`.
- The wording is deliberate. See §5.1: this is a mean of the table's published department averages, not a pooled response mean. Do not shorten it to "School average" or "Overall rating".

**Tile 2 — Needs attention**

- Eyebrow: `NEEDS ATTENTION`.
- Value: the count of **departments** the table flags (not rubrics).
- Subtext: the first three department labels joined by `, `, then `+N more` when there are more, truncated to one line; or `No critical rubric flagged` at zero.
- Source: the keys of the page's existing `attentionByDept`. Do not run `findAttentionRubrics` again in the dashboard: two derivations are two chances to disagree.
- A department with two critical rubrics counts once; the table row lists both.

**Tile 3 — Departments with results**

- Eyebrow: `DEPARTMENTS WITH RESULTS`.
- Value: `N` (`text-4xl`) followed by `of M` (`text-lg text-tertiary`).
- Subtext: `K with no rating`; when some figures are missing, `K with no rating · L not loaded`; when every loaded department has a rating, `Every department has a rating`.
- `N` = loaded rows with `avgRating !== null`; `M` = every department in the period. This is a count of **departments**, not responses.

### 4.4 Panel 1 — Average rating by department

- Heading: `Average rating by department`; subtext `Sorted highest to lowest · N rated of M departments` (append ` · K not loaded` when some figures are missing).
- One horizontal row per **loaded** department, including departments with no rating. This is the page's answer to "how do the departments compare?" — the table's Avg Rating column, ranked and drawn.
- Row anatomy, left to right: the department label (`departmentLabel(name, code)`, truncated with a `title` if long), a 0–5 track (`bg-surface-secondary`, `h-2.5 rounded-full`), the fill, and the value (`4.50` / `—`). A compact color legend sits under the heading: Outstanding, Very Satisfactory, Satisfactory, Unsatisfactory/Poor, No results.
- **Geometry:** the fill is `width: (avgRating / 5) * 100%` on a track that runs from **0 to 5**, not from the minimum or from 1. Starting at 0 is what makes the lengths comparable; starting at 1 would exaggerate the differences at the top of the scale. `avgRating === null` renders **no fill**, not a zero-length fill, plus the words `No results` in `text-tertiary`.
- **Order:** rated departments first, `avgRating` descending; ties by label ascending; no-rating departments last, by label ascending. The order is the chart's own; the table's sort is untouched.
- **Color:** the fill keys off the row's `remarks` — the same value the table prints — Outstanding `bg-success`, Very Satisfactory `bg-info`, Satisfactory `bg-warning`, Unsatisfactory and Poor both `bg-danger`, no rating no fill. It does not re-implement the thresholds. Both danger bands are the same color; the row's `aria-label` and `title` keep the exact remark (`Unsatisfactory` vs `Poor`).
- **The value is the primary encoding.** The bar length and color are redundant; the number is printed. A reader who cannot see the color can still compare the values and the lengths.
- **Accessibility:** the chart is a `role="list"`; each row is a `role="listitem"` with an `aria-label` like `Computer Science: 4.50, Outstanding` or `Education: no results`. The bar and track are `aria-hidden`. The legend is text, not color-only. The list's `aria-label` gives the count: `Average rating by department: 7 rated, 3 with no results`.
- **Empty state:** when every loaded department has no rating, every row prints `No results`; there is no separate empty message. When there are no loaded departments at all, the unavailable card (§6.3) replaces the dashboard.
- **No internal scroll.** Departments are a bounded set (the period's colleges). A row is compact (`h-6` plus gap); if the set ever grows beyond a screen, the follow-up is a cap and scroll, not a second chart.

### 4.5 Panel 2 — Most common weakest criterion

- Heading: `Most common weakest criterion`; subtext `Across N rated departments · ties counted`.
- Source: each loaded row's `lowestRubrics` (already the rubric's lowest per department, ties included).
- Rows: label left, `count of N` right, a thin proportional bar under (`h-1.5`, `bg-info`) that is `aria-hidden`. Show the top 3.
- **Frequency, not severity.** The panel deliberately does not print the scores: the number is "how often is this a department's weakest criterion", not "how low is this criterion school-wide". A criterion absent from the list is not necessarily strong; it is simply not any department's weakest.
- **Ties are counted.** A department whose two criteria tie for lowest contributes one to each. The counts can therefore sum to more than the population — the caption says so.
- The panel does not assume the eight known criteria. It groups by the `key` in the payload and displays the payload's label, so a rubric change flows through.
- Empty state: `No rubric data yet.` The panel stays in place, consistent with the stable-shape rule.

---

## 5. The computation rules

### 5.1 The grain — and why the headline is worded that way

The dashboard is one grain above the table:

```
response → criterion → response general rating → faculty / subject-section → department → dashboard mean
```

The table's **Avg Rating** is the department figure. The dashboard averages those figures. It is therefore a **mean of department averages**, not a mean over responses. Each bar in §4.4 is that same department figure; the chart does not pool responses either.

- `specs/evaluation-results-export.md` records that a parent figure is the **weighted** generalization of its children (D31) inside the department hierarchy. The dashboard cannot reproduce that: the weights (respondent or rating counts) are not in the list's rows, and response counts are retired from this surface by §3.22.
- A weighted school figure would need new data and a new rule. That is a different spec, not this one.
- The label makes the grain explicit: **Mean of department averages**. A reader who wants the pooled figure will not be misled into thinking this is it.

This is the honest maximum the existing data supports. Do not silently weight by `totalRespondents`; do not treat a null as zero.

### 5.2 The loaded set

The dashboard must distinguish three states:

| State | Test | Treatment |
|---|---|---|
| **Loaded** | `figures[departmentId]` is present (the figures object, even when its rating is null) | Counted in `loadedCount`; eligible for every metric. |
| **Missing** | no `figure` **and** `figuresFailed[departmentId] === true` | Excluded from the loaded set; `missingCount` names it in the warning. Never treated as "no rating" or zero. |
| **Pending** | no figure and no failure | The dashboard is not settled; show skeletons. |

A row with **stale but present** figures (a partial refresh that failed for other rows) is loaded: the table is displaying those figures and the banner is warning that they are stale. The dashboard must agree with the table.

### 5.3 The model

Create a pure builder:

```ts
buildResultsDashboard(
  rows: ResultsDashboardRow[],
  attentionByDept: Record<string, RubricScore[]>,
  missingDepartmentIds: readonly string[],
): ResultsDashboardModel
```

`ResultsDashboardRow` carries only what the dashboard reads:

```ts
{
  departmentId: string
  departmentName: string
  departmentCode: string
  avgRating: number | null
  remarks: string | null
  lowestRubrics: { key: string; label: string; score: number }[]
}
```

Rules:

1. **Loaded rows** = rows whose id is not in `missingDepartmentIds`.
2. **Rated rows** = loaded rows with `avgRating !== null`.
3. **Mean** = `averageDisplayedRatings(rated.map(r => r.avgRating))` — the existing helper, which filters nulls and rounds half-up to hundredths. Do not use an inline mean.
4. **Mean remark** = `getRemark(mean)`.
5. **Attention departments** = rows whose id is a key of `attentionByDept`, sorted by `avgRating` ascending (nulls last), ties by label ascending, labelled with `departmentLabel(name, code)`. Count departments, not rubric entries.
6. **Department bars** = every **loaded** row, rated first by `avgRating` descending, ties by label ascending, then no-rating rows by label ascending. Each bar carries `departmentId`, `label`, `avgRating`, and `remark` from the row's `remarks` (the same value the table prints). A no-rating bar carries `avgRating: null` and `remark: null`; it is not dropped. A missing row is not in the list.
7. **Weakest** = group loaded rows' `lowestRubrics` by `key`; count one per department–criterion pair (ties included). Sort by count descending, then label ascending; take the first three and expose them as `weakest`. `weaknessPopulation` = loaded rows with at least one lowest rubric.
8. **Counts** = `departmentCount` (all rows), `loadedCount`, `missingCount`, `ratedCount`, `unratedCount` (loaded, no rating).
9. **No other fields.** Do not pass `totalRespondents`, `sentimentScore`, or `facultyCount` into the model.

The helper is pure: no React, no storage, no fetch, no `Date`.

### 5.4 The mean's worked example

Three departments: 4.50, 3.50, null.

- The mean is `averageDisplayedRatings([4.5, 3.5])` = **4.00**; the remark is **Very Satisfactory**.
- It is **not** 2.67 (which is what treating null as zero would produce), and it is not weighted by anything.
- The chart draws 4.50 at 90% of the 0–5 track (Outstanding), 3.50 at 70% (Very Satisfactory), and a `No results` row for the third department. The coverage tile says **2 of 3**.

---

## 6. States

### 6.1 While figures are still arriving

- The dashboard renders a skeleton: three `Skeleton variant="metric" className="h-32"` tiles and two panel skeletons in the same grid (`lg:grid-cols-5`; the chart spans 3 and is `h-80`; the weakest panel spans 2 and matches its height).
- No numbers are rendered until the set is settled. The page already shows per-row skeletons in the table; the dashboard's skeleton is the aggregate's equivalent.
- A cached figures snapshot is applied by the page's existing effect, so a brief skeleton flash is possible on first paint. Do not change the page's cache initialization to remove it: the dashboard must read the same `figures` state as the table.

### 6.2 Partial failure

- If at least one row is loaded and some are missing, render the dashboard for the loaded rows and a single warning line under the tiles:
  `N department(s) could not be loaded and are excluded from the figures above. Use Refresh above to try again.`
- The coverage tile's subtext names the same missing count. The attention tile can still name a flagged row from the results snapshot; the mean, the chart, and the weakest panel use the loaded figures only.

### 6.3 Every figure missing

- If `departmentCount > 0` and `loadedCount === 0`, do **not** render zeros: a dashboard of zeros reads as data. Render one warning card in the dashboard's place:
  `Department figures could not be loaded. The dashboard is unavailable. Use Refresh above to try again.`
- The table still renders its rows with "—".

### 6.4 No results in the period

- Every department loaded, every `avgRating` null: mean `—` (no badge), coverage `0 of M`, attention `0` with `No critical rubric flagged`, the chart shows a `No results` row for every department, weakest `No rubric data yet.`
- This is a valid empty state, not an error.

### 6.5 No departments / results error / period change

- `departments.length === 0`: the dashboard is not rendered (the page already says "No departments found").
- Results error: the dashboard is not rendered; the page's `ErrorState` is the only error surface.
- Period change: `rows` is derived from `currentResults`, which is null while the new period loads. The dashboard disappears into the page's loading state and never shows the previous period's numbers.

### 6.6 Refresh

- The existing `Refresh` button remains the only refresh control. The dashboard has none.
- It recomputes from `rows` after the refresh lands. While `refreshing`, the page keeps the old figures visible; the dashboard keeps showing them. A failed refresh restores the previous cache and figures; the dashboard is unaffected.
- The dashboard adds no timestamp. `CachedDataRefreshBanner` remains the single staleness signal.

---

## 7. Files and contracts

| File | Change |
|---|---|
| `features/evaluation-results/results-dashboard.ts` | **new** — the pure `buildResultsDashboard` builder and its exported types |
| `features/evaluation-results/components/ResultsDashboard.tsx` | **new** — the presentational tiles and panels; no hooks, no fetch, no storage |
| `app/admin/evaluations/results/page.tsx` | import the component; derive `figuresSettled` and `missingDepartmentIds`; render the dashboard after the integrity warning and before the table. **No `useEffect`, `fetcher`, cache, or refresh change.** |
| `app/admin/evaluations/results/loading.tsx` | mirror the dashboard's shape: 3 metric skeletons + 2 panel skeletons |
| `lib/__tests__/results-dashboard.test.ts` | **new** — the builder's rules |
| `lib/__tests__/admin-evaluation-results-page.test.tsx` | extend the cached-data test: the dashboard renders from cache and `mockFetcher` is still not called |

Component props:

```ts
interface ResultsDashboardProps {
  rows: ResultsDashboardRow[]
  attentionByDept: Record<string, RubricScore[]>
  settled: boolean
  missingDepartmentIds: readonly string[]
}
```

The component:

1. Returns the skeleton when `settled` is false.
2. Builds the model with `buildResultsDashboard`.
3. Returns the unavailable card when there are rows but no loaded figures.
4. Otherwise renders the three tiles, the department bar chart, and the weakest-criterion panel.

It imports `getRemarkColor` (the mean badge), `Skeleton`, and the builder. The bar fill uses a small local `REMARK_BAR` class map keyed by the model's `remark` (no second thresholds). It does not import `useRouter`, `IosButton`, `fetcher`, or any page-local state.

Page wiring (the only new derived values):

```ts
const figuresSettled =
  rows.length > 0 &&
  rows.every((r) => !!figures[r.departmentId] || !!figuresFailed[r.departmentId])

const missingDepartmentIds = rows
  .filter((r) => !figures[r.departmentId] && figuresFailed[r.departmentId])
  .map((r) => r.departmentId)
```

`allLoaded` (which pauses sorting) stays exactly as it is. The dashboard's `figuresSettled` includes failures so a failed figure cannot leave the dashboard on skeletons forever; sorting keeps its existing stricter behavior.

---

## 8. Tests

### 8.1 The builder

- **Null exclusion:** 4.5, 3.5, null → mean 4.00, rated 2, unrated 1. Null is never zero.
- **Rounding:** 4.20 and 4.30 → 4.25; the helper's half-up rule is used.
- **Department bars:** every loaded row appears exactly once; rated rows sort by `avgRating` descending, ties by label ascending; no-rating rows come last by label; a missing row is absent. The no-rating bar carries `avgRating: null` and `remark: null`.
- **Exact remarks:** a row whose `remarks` is `Poor` and one whose `remarks` is `Unsatisfactory` both keep their exact string in the bar model, even though the fill will use the same danger token for both.
- **Attention authority:** a row with a low `lowestRubrics` but no entry in `attentionByDept` is **not** counted; a row in the map is. This proves the tile reuses the table's map.
- **Missing vs no result:** a row in `missingDepartmentIds` is excluded from the mean and bars and counted in `missingCount`; a loaded row with a null average is a `No results` bar and counted in `unratedCount`. They are not the same state.
- **Weakest ties:** a department whose two criteria tie for lowest contributes one to each; `weaknessPopulation` counts the department once; the counts may sum above the population.
- **Top three:** sorted by count descending, then label ascending; only three entries.
- **Empty input:** `departmentCount = 0`, mean null, empty bars/weakest; no throw.

### 8.2 The component

- `settled = false`: the tile labels are absent and the skeleton grid is present.
- `settled = true`: the mean, its badge, the attention count/names, the coverage fraction, one bar row per loaded department in the model's order (including the no-rating rows), and the weakest rows render.
- **Geometry:** a 4.50 row's fill is 90% wide and a 3.50 row's is 70%; a no-rating row has no fill and prints `No results`. The track starts at 0.
- **Color:** the fill class follows the remark (Outstanding success, Very Satisfactory info, Satisfactory warning, Unsatisfactory/Poor danger); the exact remark is in the row's `aria-label`.
- `missingDepartmentIds` non-empty: the warning line renders; the excluded row's rating does not move the mean and its bar is absent.
- All rows missing: the unavailable card renders, not zeros.
- No text matching `Total Respondents`, `Sentiment`, or `Faculty` appears in the dashboard.
- Each bar row has an `aria-label` containing the department, value, and remark; the bar fill and track are `aria-hidden`; the list's label gives the rated/no-results counts.
- The weakest rows' bars are `aria-hidden`; the counts are visible text.

### 8.3 The page

- With both local-storage caches present, the dashboard renders from them and `mockFetcher` is **not** called. The existing assertion is extended, not weakened.
- The dashboard's mean equals the mean of the cached rows' averages, and the chart has one row per cached department.
- No page-level fetch effect is added; the diff on `page.tsx` touches no `useEffect`, `fetcher`, cache function, or `refreshNow`.

---

## 9. Acceptance checks

1. With cached results and figures, the dashboard paints from cache with no request to either results endpoint.
2. The mean is the mean of the table's visible department averages, excluding nulls, rounded half-up, and labelled "Mean of department averages".
3. The attention count equals the number of rows the table flags in the Needs Attention column — same map, no second derivation.
4. A genuine no-result department is a "No results" row in the chart and is counted in the coverage tile's "with no rating". A department whose figures failed is excluded and named in the warning. The two are never conflated.
5. The chart has exactly one row per loaded department; its row count equals the loaded count. The bar length is `avgRating / 5` from a zero baseline.
6. Switching periods never shows the previous period's dashboard. A results error or an empty department list shows no dashboard.
7. The dashboard is one unit: no number appears before every row's figures have landed or failed.
8. No response count, sentiment, or faculty total appears anywhere in the dashboard.
9. The table's sorting, attention column, row skeletons, click-through, and Refresh behavior are unchanged.
10. Dark mode and mobile: tiles stack; the chart's labels truncate without hiding its bars; no new horizontal scroll; the semantic tokens follow the theme.
11. The owner's gate (AGENTS.md H1 — the owner runs it, not the agent):

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| **The mean is misread as the school-wide response average.** | The label is "Mean of department averages", the subtext says "Across N of M departments", and the chart shows the department grain. No response counts are shown. |
| **A department figure is already a mean; the dashboard adds another mean.** | The dashboard averages the figures the table prints and says so. It does not claim a pooled figure. A weighted figure would need new data and a new spec. |
| **The bar lengths look bigger than they are because the axis does not start at 0.** | The track is 0–5 and the fill is `avgRating / 5`; the value is printed beside it. |
| **The color alone carries the remark.** | The value is the primary encoding; the legend is text; each row's `aria-label` names the exact remark. |
| **A partial dashboard shows a number that then moves.** | The dashboard waits for every row to settle, like sorting. The skeleton is the loading state. |
| **A failed figure is mistaken for "no results".** | Missing rows are excluded, counted separately, and named in the warning. `No results` is only a loaded row with a null average. |
| **Ties inflate the weakest counts.** | The caption says "ties counted"; the population is departments, not entries. The table keeps the full per-department detail. |
| **The chart is tall and pushes the table down.** | One compact row per department; the set is bounded by the period's colleges. If it grows beyond a screen, a cap and scroll are a follow-up, not this change. |
| **A stale results snapshot from an older rule is aggregated.** | The loaded set is rows with current figures, not rows carrying only a stale results-snapshot average. The dashboard waits for figures; a failed load is named. |
| **A rubric change breaks the weakest panel.** | It groups by the payload's key and label; it does not hardcode eight criteria. |
| **Dark mode makes a bar or its track invisible.** | The fills use the semantic tokens; the track is `bg-surface-secondary`; the value and label are always text. Manual check in both themes. |

---

## 11. Alternatives considered

| Option | Verdict |
|---|---|
| **A — KPI tiles only** (mean, attention, coverage) | Cheaper, but it is a stat strip, not a dashboard: it does not show the department comparison or the cross-department weakness pattern. Not recommended. |
| **B — Tiles + department rating bar chart + weakest criterion** | **Recommended.** The owner asked for a bar chart for quick comparison among departments; this is the smallest addition that answers it, with no new dependency or fetch. |
| **C — Add a chart library (Recharts/Chart.js)** | Rejected. The data is a handful of department averages; a library adds bundle weight for no analytical gain, and the app has no chart dependency. |
| **D — Add a "Total responses" KPI from `totalRespondents`** | Rejected. Contract §3.22 retired response counts from the results surfaces; a bare count invites a ratio the page cannot answer. Coverage owns that question. |
| **E — Read the per-faculty figures to pool a school average** | Rejected. It adds fetches and heavier reads, and violates the "no fetch change" constraint. The dashboard cannot pool without weights it does not have. |
| **F — Make the attention names clickable** | Not included. The table already navigates; a second navigation surface duplicates it. Can be added later without changing the data path. |
| **G — Remark distribution (stacked bar)** | Superseded. It summarizes the remark bands but does not put departments side by side, which is the comparison the owner asked for. |
| **H — Vertical columns** | Not chosen. Horizontal bars keep long department labels readable and make the ranking the shape of the chart. |

---

## 12. Decisions to confirm

**Resolved 2026-10-26:** the owner wants a **bar chart for quick comparison among departments** and prefers the visual. The dashboard uses the **department rating bar chart** (§4.4); the remark-distribution panel is removed. The owner also confirmed the **Mean of department averages** headline and the **weakest-criterion panel**. The data path is unchanged. No open decisions.

---

## 13. Implementation slices

| Slice | Content | Proof |
|---|---|---|
| **S1 — the builder** | `features/evaluation-results/results-dashboard.ts` + `lib/__tests__/results-dashboard.test.ts` | The builder's rules (§8.1) |
| **S2 — the component** | `ResultsDashboard.tsx` + render tests | The component's states (§8.2) |
| **S3 — the page** | render the component; derive `figuresSettled`/`missingDepartmentIds`; update `loading.tsx`; extend the page test | No fetch change; cache test still green (§8.3) |
| **S4 — the manual pass** | cached reload, Refresh, period switch, partial failure, all-missing, chart order and no-results rows, dark mode, mobile | §9 checks 1–10 |

Approved 2026-10-26. Each slice is one file or one layer at a time, and the owner's gate runs after the slice.

---

## 14. Follow-ups (not this change)

- `docs/evaluation-surfaces-verification.md`: add a manual check for the dashboard's numbers, the chart's order and no-results rows, the missing-figures warning, and the period switch.
- `specs/README.md`: the index row was added on approval (2026-10-26).
- If the owner wants a pooled school figure later, it needs the weights and its own spec — not an extra calculation in this dashboard.

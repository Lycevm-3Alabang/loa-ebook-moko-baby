# The Excel export — the handover

**Date:** 2026-10-22
**Status:** ✅ **the workbook is generated from scratch and the three routes serve it.** The flip
is complete. ⭐ **What is left is the owner's Excel proof** — and the deferred items in §3.
**Scope:** the export's remaining work — the proof, then what §3 lists.

> ⭐ **One handover at a time.** This one replaces `docs/evaluation-results-handover.md`
> (**deleted**) — its durable content is in the specs. The **durable** knowledge lives in
> `specs/` and `TODO.md`; this file is the entry point, and it goes stale first.
>
> ⭐ **The contract is `specs/evaluation-results-export.md` (v4.0)** — the three sheets' shapes,
> the field contract, the arithmetic, the rules, the routes and the proofs. **This file does not
> repeat it.**

---

## 0. Where the export stands

| Piece | Where | State |
|---|---|---|
| the **style table** | `lib/xlsx/styles.ts` | ✅ 22 semantic tokens → the derived cell formats |
| the **writer** | `lib/xlsx/writer.ts` | ✅ the package builder; ⭐ **it authors the print setup** (portrait Letter, `fitToWidth=1`, `fitToHeight=0`; ⭐ **landscape** for the Overall sheet) |
| the **form model** | `lib/xlsx/form-model.ts` | ✅ the pure model; ⭐ the criterion's number is **computed** (`roman()`) |
| the **Individual renderer** | `lib/xlsx/individual.ts` | ✅ the letterhead at 50 mm, centred, at the image's own aspect |
| the **Comments sheet** | `lib/xlsx/comments.ts` + `lib/xlsx/rows.ts` | ✅ ⭐ **the text is in the merge's anchor** — the "it only shows the date" is fixed |
| the **Overall sheet** | `lib/xlsx/overall.ts` | ✅ ⭐ **one row per response**; the columns follow the **live rubric**, with the **live** values under them; **landscape** |
| the **workbook** | `lib/xlsx/workbook.ts` | ✅ the three sheets, in the legacy's tab order |
| the **letterhead** | `lib/xlsx/letterhead.ts` | ✅ the one server module; ⭐ a missing logo does **not** fail the export |
| the **three routes** | the three `…/export/route.ts` | ✅ they build from the generator; ⭐ **their guards did not move** |
| the **donor** | `lib/evaluation-form-xlsx.ts` | ✅ **deleted** (2026-10-22) — with its 12-case test |
| the **template** | `data/templates/eval-report.xlsx` | ⭐ **the reference only** — nothing reads it at runtime; it is no longer traced |
| the **cut script** | `scripts/cut-eval-template.mjs` | ⭐ **the reference tool** — it re-cuts the legacy when the legacy changes |
| the **legacy** | `docs/eval reports.xlsx` | the artifact the school circulates |

**The tests that own it:** `lib/__tests__/xlsx-{styles,writer,form-model,individual,comments,overall,workbook,letterhead}.test.ts`
· `lib/__tests__/evaluation-results-workbook-export-route.test.ts` (the three routes — ⭐ they had
**no** test at all) · `lib/__tests__/evaluation-results-subject-result-set.test.ts` (the read) ·
`lib/__tests__/evaluations-repository-order.test.ts` (the order).

---

## 1. What is left

⭐ **The Excel proof — the owner's, and the one no test can do.** A malformed part is invisible to
every assertion; **Excel is the judge**:

```bash
ACES_SAMPLE_PATH=/tmp/eval-sample.xlsx npx vitest run lib/__tests__/xlsx-workbook.test.ts
```

Open `/tmp/eval-sample.xlsx` and **print** it. What to look for: the three tabs in order (Individual
· Comments · Overall); the letterhead centred over the form; ⭐ **the comments' text visible** (not
just a date); ⭐ the **Overall sheet landscape**, one row per response, the rubric's criteria as
columns with values under them; the header rows repeating on every page.

⭐ **The hook builds from the app's own rubric** (8 criteria, 34 statements) — a one-criterion
sample would prove nothing about a rubric that changes between periods.

---

## 2. What changed for the school

| | the legacy | now |
|---|---|---|
| the Comments sheet | the **date only** (the text was swallowed by the merge) | ⭐ **the comment's text**, one per row, no date |
| the Overall sheet | **one row** (per faculty) | ⭐ **one row per student response** |
| the Overall's columns | the app's **eight fixed** columns | ⭐ **the live rubric's** columns — with the live values under them |
| the department | printed (column N) | ⭐ **not printed** (the program implies it) |
| the letterhead | the school's banner, stretched into the legacy's slot | ⭐ **our logo**, 50 mm, centred, at its own aspect |
| the print setup | the legacy's (and the re-save lost it) | ⭐ **authored** — one page wide, the header block repeating |

---

## 3. What is deferred

- ⭐ **the legend** ("Interpretation of Data") — the legacy's is a DrawingML **textbox**, and the
  cut had to correct its wording **by hand** because it disagreed with the app's `getRemark`. The
  new writer draws **pictures only**, so the legend becomes a **block of cells** — and to do it
  properly the rating ladder must stop being hard-coded inside `getRemark`
  (`lib/evaluation-utils.ts`) and become data that both the remark and the legend read.
  ⭐ The ladder is duplicated in **three** places (`evaluation-utils.ts`, `EvaluationDashboard.tsx`,
  `app/api/faculty/evaluation-results/route.ts`) — the legend is the chance to converge them.
- ⭐ **the preview script** — "nice to have, not a must have" (owner). When it comes it reads
  **live** data through the app's own repositories, not a sample.
- ⭐ **the subject-page routes onto the shared read** — the three subject-page routes still read
  the repositories themselves, so the page and the export agree **by convention, not by
  construction** (the spec's §7.3).
- **the HTML preview page** — it comes off the same model, when it comes.
- **the PDF** — out of scope; its four live defects are in the spec's §12.

---

## 4. What not to redo

- ⭐ **the decision to generate** (not to fill the template) — the template's purpose is served.
- ⭐ **the position map, the formula-reading and the rubric-drift guard** — all **gone**. The
  layout follows the rubric, so a rubric that gains a statement simply makes a longer form.
- **the theme part** — the colours are resolved to plain RGB; the workbook carries no theme.
- **the shared strings** — the cells carry inline strings.
- ⭐ **the page count** — the form's height follows the rubric, and the print setup lets it run to
  as many pages as it needs: one page **wide**, with the header block repeated.

---

## 5. The traps for the next reader

- ⭐ **The letterhead's tracing entry is load-bearing.** A file the server reads **by path** is in
  no import graph, so Next does not ship it: the export then works locally and loses its logo in
  production — and the code, the tests and the build all pass.
- ⭐ **The rubric is data.** Nothing may assume a criterion count; the columns, the numbering and
  the row heights all follow it.
- ⭐ **The order is total** — the read orders by (`createdAt`, `id`); `submittedAt` is nullable
  and left the nulls unordered. ⭐ **The order never changes a figure.**
- ⭐ **The export must never be a way around its read route's 403** — each route keeps its own
  guards, including the faculty's **visibility map**.
- ⭐ **The evaluation id is never printed** — the respondents stay anonymous; a row's identity is
  its position.
- ⭐ **The `evaluateeId` filter stays** on the response read: the admin's reassign invalidates the
  evaluation, but the CSV import reassigns a teacher with **no** invalidation, and the
  `findPending` cleanup only runs when a *student* opens their list.

---

## 6. The proofs and the gate

**Gate (the owner's run):**

```
npx tsc --noEmit  →  npm run lint  →  npx vitest run  →  npm run build
```

**The tracing proof** (after the build): `logo-blk.png` is in the bundle; `data/templates` is not.

```bash
echo "letterhead: $(grep -rl 'logo-blk.png' .next --include='*.nft.json' | wc -l) routes"
echo "template:   $(grep -rl 'data/templates' .next --include='*.nft.json' | wc -l) routes"
```

---

**The run file** (the plan this work came from): `.opencode/skills/plan-fix/runs/20261021-1800-open-gaps.md`
— the export's slices are its §"The export — B" and its **export slice 1–12** rows.

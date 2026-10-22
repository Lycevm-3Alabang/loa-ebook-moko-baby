# The Excel export — the handover

**Date:** 2026-10-22
**Status:** 🟡 **the generator is built; the Overall sheet and the route flip are left.** The
workbook is generated from scratch now — the template file is no longer read at runtime.
**Scope:** ⭐ **the export's remaining work** — the **Overall sheet** (next, and **on its own**),
then the workbook's three sheets together, then the route flip.

> ⭐ **One handover at a time.** This one replaces `docs/evaluation-results-handover.md`
> (**deleted**) — its durable content is in the specs. The **durable** knowledge lives in
> `specs/` and `TODO.md`; this file is the entry point, and it goes stale first.
>
> ⭐ **`specs/evaluation-results-export.md` (v3.0) is partly superseded.** Its **D8** — "the
> template is a style donor" — was the decision at 08:00; at 09:00 the owner chose **B**: the
> workbook is **generated from scratch** and the template file is the **reference** only. What
> survives from v3.0 is the arithmetic (§6) and the field contract (§5); the mechanics are here.

---

## 0. The sequence (owner, 2026-10-22)

⭐ **The Overall sheet is taken on alone, and only after the Comments sheet is done.**

| # | step | state |
|---|---|---|
| 1 | the **Comments sheet** | **done** — `lib/xlsx/comments.ts` (the model + the renderer) and `lib/xlsx/rows.ts` (the cell layouts the sheets share) |
| 2 | ⭐ **the Overall sheet**, on its own | **next** — §4 |
| 3 | the workbook's **three sheets together** (`buildEvaluationWorkbook`) | after that |
| 4 | the **route flip** | after that — §5 |
| 5 | ⭐ **the Excel proof** — open it and print it | after that — §6 |

⭐ **The read is ready for step 2:** it carries the **live per-response map**
(`categoryAverages` on each row), so the table's columns can follow the rubric **with values
under them** — §4.

---

## 1. Where the export stands

| piece | state |
|---|---|
| **the style table** (`lib/xlsx/styles.ts`) | **done** — 20 semantic tokens → the derived cell formats; the legacy's own fonts, fills, borders and number formats; the theme references resolved to plain RGB, so the workbook carries **no theme part** |
| **the writer** (`lib/xlsx/writer.ts`) | **done** — the package builder: the shell, the rels, the content types, the styles, the sheets, the drawings, the media. It **authors the print setup** |
| **the form model** (`lib/xlsx/form-model.ts`) | **done** — the pure model: what the form **is**, in form-terms |
| **the Individual renderer** (`lib/xlsx/individual.ts`) | **done** — the model drawn as the sheet: nine styled cells per row, the legacy's merges, its widths, the letterhead's anchor |
| **the workbook** (`lib/xlsx/workbook.ts`) | **done** — the glue: model → renderer → writer → bytes |
| **the letterhead** (`lib/xlsx/letterhead.ts`) | **done** — reads `public/logo-blk.png`; **traced** into the bundle |
| **the Comments sheet** | **done** — `lib/xlsx/comments.ts` (the model + the renderer) + `lib/xlsx/rows.ts` (the cell layouts the sheets share) |
| ⭐ **the Overall sheet** | **next, on its own** — §4 |
| **the read's live per-response map** | **done** — the row carries `categoryAverages` (one line; no second query) |
| **the workbook's three sheets together** | after the Overall sheet |
| **the route flip** | after that — §5 |
| **the Excel proof** | ⭐ **not yet possible** — no file exists until the route flips (§6) |
The **donor** is still the live path: `lib/evaluation-form-xlsx.ts` builds the workbook the export
returns today, by patching `data/templates/eval-report.xlsx`. The new generator is **beside** it,
not under it — nothing the school receives has changed yet.

## 2. The rules the export lives by

1. ⭐ **The workbook is generated, not edited.** The template file
   (`data/templates/eval-report.xlsx`) is the **reference** — it stays in the repo, and the cut
   script (`scripts/cut-eval-template.mjs`) stays the reference tool. **Nothing reads it at
   runtime.**
2. ⭐ **The rubric is data, and it changes between periods.** A period points at its own rubric
   group, so the export reads the **live** rubric
   (`rubricRepository.getCategoriesWithItems(period.rubricGroupId)`, ordered by `displayOrder`).
   The form's criteria, their statements and the Overall sheet's columns follow it — ⭐ **nothing
   may assume a criterion count.** The generator does not: the numbering is computed (`roman()`),
   the row heights follow the text, and a statement nobody rated is a **blank value**.
3. ⭐ **The form is a MODEL; the renderers are separate.** The model says what the form is; the
   renderer says how it looks. So the **HTML preview** (deferred) reads the same rows and cannot
   disagree with the export about the content.
4. ⭐ **The look is ours, in tokens.** A cell asks for a *token* (`criterion`, `statementRating`),
   never a style id; the ids are derived from the table's order, so a token cannot point at the
   wrong format.
5. ⭐ **The print setup is authored.** Portrait Letter, `fitToWidth=1` with `fitToHeight=0` (as
   many pages as the form needs), the print area `A:I`, and the header block repeating on every
   page. The donor inherited the legacy's `fitToHeight=1`, which the legacy never meant.
6. ⭐ **The letterhead is optional.** The numbers are the artifact; the letterhead is decoration.
   A missing logo must **not** 500 the export — the form is produced without it, and the caller
   says so in the log.

## 3. The Comments sheet — to do

**What it is:** one comment per row, and **nothing else** (the owner's words).

⭐ **The defect it fixes:** the donor writes the comment's **text** into `B` and the **date** into
`A` — and the legacy's comment rows are **merged `A:I`**, so `B` is swallowed by the merge and the
reader sees **only the date**. That is the *"it only shows the date"*.

**The spec:**
- one row per comment, **the text in the merge's anchor (`A`)**;
- **no date** — "comments, nothing more";
- the row's height follows the text (a long comment is a taller row);
- the comments come from the export's **own read** (`getSubjectResultSet` → `comments`), one per
  response, **uncapped** (the PDF truncates at 30; the workbook does not).

## 4. The Overall sheet — to do

**What it is:** ⭐ **one row per student response** — "the actual evaluation scores FOR EACH
student response" (the owner).

⭐ **The grain changed, so the header changes.** The legacy's Overall sheet is a **per-faculty**
table (`NO · NAME · <8 criteria> · GENERAL RATING · REMARKS · NO OF RES. · DEPARTMENT`). Three of
those columns are **constants** on this sheet — one faculty, one subject, one respondent count —
and would repeat on every row.

**The spec (settled — the owner delegated this to this file, 2026-10-22):**
- the header block: the **result title** (the legacy's own wording — *Faculty Performance
  Evaluation Result (Post-evaluation)*), the **term**, the **faculty's name** and the **subject**
  — the constants that used to be columns;
- the table's header: **`NO · DATE · <the rubric's criteria> · GENERAL RATING · REMARKS`**;
- one row per response, **in the response set's order**; the date is `YYYY-MM-DD`;
- ⭐ the criteria columns are **derived from the rubric**, so a new rubric set changes them;
- the comments are **not** repeated here — that is the Comments sheet's job;
- ⭐ the respondents stay **anonymous** — the app does not name them, and neither does the sheet;
- ⭐ the sheet is **landscape** (it is wide), the print area is its own columns, and its header
  rows repeat on every page.

⭐ **The finding that shapes the read.** The per-response rows carry the **app's eight fixed
columns** (`professionalManner` … `assessmentAndFeedback`), not the rubric's live criteria — so a
rubric with a ninth criterion would print a **ninth column with no value under it**, which is the
"silently wrong figure" this repo treats as a defect. ⭐ The read already computes the live map
(`computeCategoryAverages` over each response's ratings) and then **drops it** by mapping it to
the eight columns. So the read must **carry** that map (one line on the row) — then the table's
columns follow the rubric and the values under them are the live ones.

⭐ **No second query.** The map is computed from ratings the read already has; carrying it costs
nothing at read time.

## 5. The route flip — to do

| step | what |
|---|---|
| 1 | the **Comments** sheet and the **Overall** sheet join `buildEvaluationWorkbook` |
| 2 | the three export routes call it, with the **letterhead's bytes** (`loadLetterhead()`) and the model input from `getSubjectResultSet` |
| 3 | `lib/evaluation-form-xlsx.ts` (the donor) is **deleted**, with its tests; `lib/xlsx-template.ts` keeps only what the cut script uses |
| 4 | `next.config.ts`'s tracing loses the template (the letterhead's entry **stays**) |
| 5 | ⭐ **the Excel proof**: open the workbook in Excel and print it |

The **guards do not move**: each route keeps its own — `requireAdmin` + `isSubjectInDepartment`
(admin), the dean's own department + `assertPeriodIsActive` (dean), and the **visibility map** +
ownership (faculty). The export must not become a way around its read route's 403.

## 6. The proofs

- `npm test` — and the owner's gate (§9).
- ⭐ **the Excel proof** — the one no test can do: **open the workbook in Excel and print it.** A
  malformed part is invisible to every assertion; Excel is the judge.
- ⭐ **the tracing proof** (no deploy needed): after `npm run build`,
  `Get-ChildItem -Recurse .next -Filter *.nft.json | Select-String "logo-blk.png"`.

## 7. What is deferred

- ⭐ **the preview script** — "nice to have, not a must have" (owner, 2026-10-22). When it comes
  it reads **live** data through the app's own repositories (a real period, a real teacher), not a
  sample.
- ⭐ **the legend** ("Interpretation of Data") — the legacy's is a DrawingML **textbox**, and the
  cut had to correct its wording **by hand** because it disagreed with the app's `getRemark`. The
  new writer draws **pictures only**, so the legend becomes a **block of cells** — and to do it
  properly the rating ladder must stop being hard-coded inside `getRemark`
  (`lib/evaluation-utils.ts:57-64`) and become data that both the remark and the legend read.
- **the HTML preview page** — it comes off the same model, when it comes.
- **the PDF** — out of scope; its four live defects are in `specs/evaluation-results-export.md` §12.

## 8. What not to redo

- **the decision to generate** (not to fill the template) — the template's purpose is served.
- **the position map, the formula-reading and the rubric-drift guard** — all **gone**. The layout
  follows the rubric, so a rubric that gains a statement simply makes a longer form.
- **the theme part** — the colours are resolved to plain RGB; the workbook carries no theme.
- **the shared strings** — the cells carry inline strings.
- ⭐ **the page count** — the form's height follows the rubric, and the print setup lets it run to
  as many pages as it needs: one page **wide**, with the header block repeated.

## 9. The gate (the owner's run — AGENTS.md **H1**)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

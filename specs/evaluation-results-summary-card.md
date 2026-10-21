# Evaluation Results — the Department Summary card — Spec

**Status:** Final (approved 2026-10-21) — **Option A** (the headline and the read-out) was chosen by the owner, with a colour and size pass: the app's semantic tokens, a readable verdict, and **no faculty count** on the card (the cards below it are the faculty).
**Scope:** the header card of the department drill-down —
`/admin/evaluations/results/[departmentId]` and the dean's twin
`/dean/evaluations/results/[departmentId]`. The card is one component of the page, inlined
in both pages today (it is not a shared component — see §6).
**Related:** `specs/evaluation-results-attribution.md` (the attribution and scope contracts —
§3.14 the headcount, §3.15 the cards, §3.22 the counts rule, §3.23 the triage rule),
`specs/evaluation-results-cache.md` (what is cached and what stays live),
`docs/evaluation-surfaces-verification.md` (§4 the manual checks for these pages).

---

## 1. The problem

The card is the department's verdict, at the top of the page the reader opens. It is four
tiles in a four-column grid:

```
Department Summary                              [Per Subject | Per Faculty] [Download PDF]

  Subjects        Faculty         Department Average      Highest Rubric
  42              9               4.20                    Professional Manner: 4.60
                                  Very Satisfactory        Lowest Rubric
                                                           Time Management: 3.90
```

(As of v1.12 the card is **Faculty · Department Average · Top Rubric · Needs Attention
Rubric** — "Subjects" and "Total Responses" are gone, the response counts live on the
coverage page, and the weakest rubric appears only when it is critical. The sketch above is
the shape the card had before those changes; the analysis below applies to both.)

### 1.1 Six ways the layout fails

1. **No hierarchy.** Four equal tiles: the **average** — the one number a dean opens the
   page for — is the same size (`text-lg`) as the **faculty count**, which is context, and
   as the rubric cells, which are detail. The eye has no entry point.
2. **Four cells that are not four things.** A count; a score plus a badge; a name plus a
   score (and a *tie* makes it several lines); a name plus a score (and it is sometimes
   absent). A grid of unlike things is ragged by construction: with a tie, one cell is
   three lines tall and the others are one.
3. **The conditional cell breaks the grid.** With nothing to flag there are three cells in
   a four-column grid — an empty slot, or cells that stretch. **The card's shape changes
   with the data.**
4. **The verdict is the smallest thing on the card.** The remark — the human reading of the
   number, "Very Satisfactory" — is a 10px pill *under* the average, while the average
   itself is `text-lg`: the same size as the faculty count. The number and its meaning are
   separated, and both are small.
5. **The title row mixes two jobs.** "Department Summary" (a label) shares a row with the
   PDF's **mode switch** and download (document controls). The busiest control in the card
   sits at the top right, where the reader expects the department's verdict.
6. **"Department Summary" is redundant.** The page's `h1` is already the department's
   name. The card says it again.

## 2. The rule

⭐ **The card is a summary, not a dashboard.** It answers four questions, in this order,
each with its own weight — and **its shape does not change with the data**.

| # | the question | the cell | weight |
|---|---|---|---|
| 1 | **How did the department do?** | the average, big, with the **verdict** beside it | the headline |
| 2 | **Is anything wrong?** | the weakest criterion — **only when it is critical** (§3.23) | the alarm |
| 3 | **What is the strength?** | the top criterion | the strength |

⭐ **The faculty count is NOT on the card** (owner, 2026-10-21). The cards below it **are** the
department's faculty — every member, with or without results (§3.15) — so a count on the card
would only repeat what the reader can see. The headcount itself is unchanged and still printed
where it belongs: the **results list's** row, the **export's** `summary.csv` and the
**coverage page's** "Faculties" column (§3.14).

The counts are **not** on the card (§3.22 — the coverage page owns them). The document
controls (the PDF's mode switch and download) stay on the card, but they are **not** the
title row any more.

## 3. The options

### Option A — the headline and the read-out ⭐ *recommended*

One number at the top, the rest as a labelled read-out under a hairline.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  4.20  [Very Satisfactory]                     [Per Subject | Per Faculty]     │
│  Department average                              [Download PDF]                  │
│  ────────────────────────────────────────────────────────────────────────────  │
│  Needs attention        Time Management 2.10                                   │
│  Top rubric             Professional Manner 4.60                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

- The **average** is the headline (`text-4xl`), the **verdict** a real badge beside it
  (not a 10px pill underneath), and the eyebrow "Department average" names it.
- The **rubric read-out**: one full-width row per rubric — the label on the left, the
  value on the right. **Ties join on one line** ("Professional Manner 4.60, Student
  Engagement 4.60") — so a tie no longer makes a cell three lines tall.
- The **alarm row comes first** (needs attention, then top rubric): a summary's job is to
  surface what needs action.
- The **faculty count** is a small stat at the right of the headline, beside the document
  controls.
- The card has **no title** — the page's `h1` is the department's name.

Fixes all six failures. The grid's raggedness and the empty slot go with it, because there
is no grid: the rows are full-width.

### Option B — a hero tile and a rail

A twelve-column grid: the average in a five-column tile (big, with the verdict), the rubric
read-out in the seven-column tile beside it. The faculty count under the average.

```
┌───────────────────────────┬───────────────────────────────────────────────────┐
│  4.20  [Very Satisfactory] │  Needs attention    Time Management 2.10          │
│  Department average        │  Top rubric         Professional Manner 4.60       │
│  9 faculty                 │                                                    │
└───────────────────────────┴───────────────────────────────────────────────────┘
```

Same hierarchy as A, arranged side by side rather than stacked. Denser (the verdict and
the read-out share the eye's first pass), but the tile boundary adds a frame around a
two-line read-out that does not need one.

### Option C — keep the tiles, fix the weights

The minimal change: the average first and `text-3xl` with the verdict badge beside it; the
faculty count last; the two rubric cells each spanning two columns with the label inline;
the title replaced by the eyebrow.

```
┌───────────────┬───────────────┐
│ 4.20          │ 9 faculty     │
│ [Satisfactory]│               │
├───────────────┴───────────────┤
│ Top rubric      Professional Manner 4.60                                │
│ Needs attention Time Management 2.10                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

The least new markup, but the grid still has to answer "how many cells?" — and the answer
changes with the data (3 cells or 4).

### The decision

**Option A — the headline and the read-out** (owner, 2026-10-21). The smallest
structural change: it fixes every failure in §1.1, and it matches what the card is
for. B and C were not taken.

## 4. The layout in detail (Option A)

### 4.1 The tokens — the house's own

| part | the classes |
|---|---|
| the card | `card p-5` (unchanged) |
| the eyebrow | `text-xs text-tertiary` |
| the average | `text-4xl font-bold leading-none text-primary` |
| the verdict | `text-sm font-semibold px-2.5 py-1 rounded-full` + `getRemarkColor(remarks)` |
| the read-out's label | `text-xs text-tertiary` |
| the read-out's value | `text-sm font-semibold` + **`text-success-text`** (top) / **`text-danger-text`** (attention) |

⭐ **The colours are the app's own semantic tokens**, not Tailwind's palette: `text-success-text`
and `text-danger-text` are the same colours the badges use, and they follow the dark mode
through the variables (no `dark:` twin needed). The badge keeps the evaluation pages'
`getRemarkColor` shape — the same badge the list and the subject pages print, so the same
verdict looks the same everywhere.
| the hairline | `border-t border-default` |

### 4.2 The structure

```
card p-5
├─ the headline row      flex flex-wrap items-start justify-between gap-4
│  ├─ the verdict group flex items-baseline gap-3
│  │  ├─ the average     text-4xl font-bold leading-none text-primary
│  │  └─ the badge       the remark, in its own colour
│  │  └─ the eyebrow     "Department average", under the number
│  └─ the controls       the PDF mode switch + the download
└─ the read-out          space-y-1 border-t border-default pt-3
   ├─ the attention row  (only when there is one)
   └─ the top row        (only when there is one)
```

### 4.3 The rules the markup must honour

1. **The alarm before the strength** — "Needs attention" first, then "Top rubric".
2. **Ties join on one line** — `rubrics.map(r => `${r.label} ${r.score.toFixed(2)}`).join(", ")`.
   The same rule the flat table used for its first-only rendering, and the reason the
   read-out is rows and not tiles.
3. **A missing rubric means a missing row** — no ratings, no rows. The card is then the
   headline (the average "—" and no verdict) and the faculty count alone.
4. **The card's shape follows the data, but the grid does not** — rows appear and
   disappear; the columns never reflow.
5. **The document controls stay on the card** — the PDF's mode switch and download are
   about this department's document; they are not part of the summary, so they sit to the
   right of the headline, not in a title row.

## 5. The files

| file | change |
|---|---|
| `app/admin/evaluations/results/[departmentId]/page.tsx` | the card's markup (the layout) |
| `app/dean/evaluations/results/[departmentId]/page.tsx` | the same card |
| `lib/__tests__/department-summary-widget.test.tsx` | the card's parts: the average, the verdict, the read-out rows, the faculty count; the no-ratings case |
| `docs/evaluation-surfaces-verification.md` | check 4.4c — what the card shows and in what order |

⚠️ **The card is inlined in both pages** (it is not a shared component) — so the markup is
written twice. ⭐ That is a candidate for extraction, but it is **not** part of this change
(AGENTS.md: no adjacent refactoring) — it is recorded as a follow-up in `TODO.md`.

## 6. The proof

- **Automated:** `lib/__tests__/department-summary-widget.test.tsx` — the card's parts and
  their order; the read-out's rows appear only when there is a rubric; the ties join on one
  line; the no-ratings case.
- **Manual** (`docs/evaluation-surfaces-verification.md` §4): open a department with results
  and one without; the verdict is beside the number; the alarm is the first row; the ties are
  on one line; the faculty count is the headcount.
- **The gate** (the owner's run — AGENTS.md **H1**):
  `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.

## 7. The risks

- **The page's vertical rhythm changes** — the cards below move up by a row (the card is
  shorter) or down. Cosmetic, and it is the point of the change.
- **The verdict badge is bigger** — it is now the most colourful thing on the card. ⭐ That
  is intended: it is the verdict.
- **The rubric rows are full-width**, so on a very wide screen the value sits far from the
  label. ⭐ Bounded by the card's own width (`card p-5` inside the page's container) — the
  same width the tiles had.
- **Both pages carry the markup**, so a change to one without the other shows a
  difference. ⭐ The test covers the admin's page; the dean's twin is the same markup — it
  is checked by the manual pass.

---
skill: plan-fix
story: "Fix the committed-broken test file `lib/__tests__/xlsx-consolidated-workbook.test.ts` — parse error at 24:1 (`Expression expected`). `npm run lint`, `npx tsc --noEmit` and `npm test` all red on this one file; the other 92 suites (933 tests) pass. Introduced by the owner's hand commit e7dd0a4 `fixed excel` (working tree is clean — the break is committed, so CI on main is red)."
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "D", 4: "A", 5: "A", 6: "A"}
workflow: "A — SCAN → VISUAL → APPROVE → BUILD"
decision: "APPROVED (owner, 2026-10-27, Done+B on the visual) — one-file test repair of lib/__tests__/xlsx-consolidated-workbook.test.ts: (1) delete the dangling fragment inside averages(); (2) built() gains rubricCategories, mirroring the production inputs (consolidated-zip.ts:182, department-zip.ts:275) and the e7dd0a4-rewritten test-2 assertions; (3) the ACES_SAMPLE_PATH sample test gains the same block so the owner's Excel review file is production-shaped. No production file, spec, doc or other test touched. ~13 lines, one slice."
status: implementing
pending: "slice-1 — proposed, waiting for Apply this slice"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| – | Calibration | passed in request: A A D A A A — skipped re-asking |
| 1 | Approve the visual? | B — approve; the sample test (#5) also gets `rubricCategories` so the Excel review file is production-shaped |
| 2 | Is this plan done? | A — Done |
| 3 | Handoff to implement-fix? | A — Yes, loaded on this run file |
| 4 | Who implements? | B — agent; `Apply this slice` gates every write |
| 5 | Slice 1 applied? | yes — 2026-10-27: three edits written to `lib/__tests__/xlsx-consolidated-workbook.test.ts` and read back verified: dangling fragment deleted (`averages()` closes cleanly), `built()` carries `rubricCategories` (69–72), sample test carries it (202–205). Parse error site gone; proof = owner's gate (H1) |

## Pending

- the owner's proof run (H1): `npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` — the slice is written but nothing certifies until these go green; then `gate-and-commit` when the owner says so

## Decisions

- **Approved fix (owner, B — 2026-10-27):** one file, `lib/__tests__/xlsx-consolidated-workbook.test.ts`, three edits:
  1. delete the dangling 4 lines after `return out` in `averages()` (lines 20–23);
  2. add `rubricCategories: APP_RUBRIC.map((criterion) => ({ name: criterion.name, items: criterion.statements }))` to `built()` — after its `itemAverages` line, mirroring the rounding test's inline shape and the production inputs;
  3. the same `rubricCategories` block in the sample test (#5, `ACES_SAMPLE_PATH`) after its `itemAverages` line — **no assertion change** there (it only checks the three sheet parts exist); the workbook the owner opens for Excel review becomes production-shaped.
- **Preservations:** repository.md's five invariants all n/a (a test-file-only change — no route, proxy, DB, UI or role line touched); the operative rule is the repo's own test discipline — the suite is the proof, and it cannot run until the parse is repaired. **Layering order:** none crossed — one `.test.ts` slice, no layer before or after it. **Gold paths:** repository.md names app/api, features, proxy, auth, factory — none cover `lib/xlsx/`; the contract anchors read instead are `features/evaluation-results/consolidated-{workbook,zip}.ts`, `department-zip.ts`, `lib/xlsx/consolidated-workbook.ts`. **Proof:** the owner's gate — `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build` (repository.md Tests line: `npm test`); focused first: `npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts`. Only the owner can verify the reviewed Excel artifact (`ACES_SAMPLE_PATH`) shows the rubric blocks.
- **Root cause (pinned by git, not guessed):** e7dd0a4 `fixed excel` (the owner's hand edit after the Part III slices) inserted the tail of a `rubricCategories: APP_RUBRIC.map(...)` object literal *after* `return out` inside `averages()` (now lines 19–24 of `lib/__tests__/xlsx-consolidated-workbook.test.ts`). The same commit rewrote test 2's assertions suiting the real rendered XML: `"3.40"` → `"<v>3.4</v>"`, `"TOTAL RESPONDENTS:"`/`"FINAL RATING:"` → without colons, `"CATEGORY AVERAGE: 4.00" → "I. Professional Manner"`.
- **Production contract:** both feature callers always pass `rubricCategories` (`features/evaluation-results/consolidated-zip.ts:182`, `features/evaluation-results/department-zip.ts:275`). `lib/xlsx/consolidated-workbook.ts:58` builds `form.criteria` **only** from `rubricCategories`; `overall-summary.ts:191` carries `_rubricCategories` unused. So test 2's new assertions (`I. Professional Manner`, `AVERAGE`, `<v>4.25</v>`) render **only** when `built()` passes `rubricCategories` — which is what the dangling fragment was almost certainly meant to be.
- **Text assertions are sound:** `lib/xlsx/writer.ts:130` writes text cells `t="inlineStr"` (no sharedStrings), so `partText(parts, "xl/worksheets/sheet1.xml").toContain(...)` works for labels as well as `<v>` numbers.
- **The other bordering facts:** d085ab9 ("untested") left the file parse-clean at 36c8d63 and *added* the rounding test — the break arrived only in e7dd0a4. Resetting to an older version would resurrect `"3.40"`-style assertions the owner deliberately replaced — not a candidate.

## Scan

- Old `20261015-1200-session.md` checked for resume — different repo, no story, not a match. New run created.
- Path: gate (lint → tsc → vitest) → `lib/__tests__/xlsx-consolidated-workbook.test.ts` `averages()` body → dangling object-literal tail after `return out` (lines 19–24) → oxc/TS parse error at 24:1.
- Caller trace of the file's subject: routes → `features/evaluation-results/consolidated-{zip,workbook}.ts` → `lib/xlsx/consolidated-workbook.ts#buildConsolidatedFacultyWorkbook` (all three read; the feature assembly `features/evaluation-results/consolidated-workbook.ts` is the e7dd0a4-new 143-line file and imports the lib builder).
- Proof: the test file's 6 cases (parse-blocked now). Command: `npm test` (repository.md Tests line) — focused first: `npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts`; then the owner's gate: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`
- Teach: **what** — a partial hand edit left the tail of an object literal inside a function; **why** — TypeScript and oxc can't recover from a stray property with a `return real-multiline` above it and no enclosing object, so the whole file is unparseable and every tool that reads it red-boxes while nothing else moves; **when** — parse errors before type-check, so always fix the parse first and re-run; **alternative considered** — `git checkout` an older version (rejected: it resurrects assertions the owner replaced on purpose).
- Lens:
  - API routes stay thin — n/a (a `.test.ts` file only; no route touched)
  - proxy.ts is the access-enforcement point — n/a (not touched)
  - All Supabase access through repositories wired by DI — n/a (no data access — the test builds models from fixtures)
  - SubmitButton double-click prevention — n/a (no UI)
  - Role pipe-delimited priority — n/a (no auth in this file)
  - ⭐ none of repository.md's five invariants applies to a test-file syntax repair; the one that bites is the repo's test discipline itself: the suite is the proof, and right now the proof cannot run at all.
- Gold paths: repository.md names app/api, features, proxy, auth, factory — none cover `lib/xlsx/`; the contract anchors instead are the three feature files and the lib builder above.
- Blast radius (checked, all read-only):
  - `lib/__tests__/xlsx-consolidated-workbook.test.ts` — the only red thing; 6 tests, 0 runnable
  - production files it pins: `lib/xlsx/consolidated-workbook.ts`, `features/evaluation-results/consolidated-workbook.ts`, `consolidated-zip.ts`, `department-zip.ts` — untouched by the fix
  - sibling test `consolidated-zip.test.ts` mocks the lib builder (line 23) — not affected (features unchanged)
  - specs: `specs/evaluation-results-export.md` (§ line 940 — the consolidated builder row) and the Part III spec updates from the consolidated run — untouched
  - docs: `docs/evaluation-export-handover.md` names the open owner gate — this bug is that gate failing, through the owner's own post-slice commit
  - newest run `20261026-1446-consolidated-faculty-export.md` — status "built — owner gate + Excel proof pending"; its slices were parse-clean; the break arrived after them

## Plan

**One slice, one file — `lib/__tests__/xlsx-consolidated-workbook.test.ts`, three edits (~13 lines). Everything else untouched** (the 92 green suites stay green; no production file, spec, doc or other test changes).

### Edits

1. **`averages()` — delete the dangling fragment.** Remove the 4 lines currently at 20–23 (the object-literal tail after `return out`):
   ```ts
         rubricCategories: APP_RUBRIC.map((criterion) => ({
           name: criterion.name,
           items: criterion.statements,
         })),
   ```
   `return out` closes with a plain `}`. This alone clears the parse error (24:1), eslint's parsing error and tsc's TS1109 — the file becomes parseable again.
2. **`built()` — add `rubricCategories`** after its `itemAverages` line (~line 72), inline, mirroring the rounding test's shape and both production callers:
   ```ts
         rubricCategories: APP_RUBRIC.map((criterion) => ({
           name: criterion.name,
           items: criterion.statements,
         })),
   ```
   Needed because `lib/xlsx/consolidated-workbook.ts:58` builds `form.criteria` **only** from `rubricCategories` (`overall-summary.ts:191` ignores `_rubricCategories`), and test 2's e7dd0a4 assertions — `I. Professional Manner`, `AVERAGE`, `<v>4.25</v>` — render only through that path.
3. **Sample test (#5, `ACES_SAMPLE_PATH`) — add the same block** after its `itemAverages` line (~line 201). **No assertion change** there (it only checks the three sheet parts exist); the workbook the owner opens for Excel review becomes production-shaped.

### Why (the owner's B, 2026-10-27)

The dangling fragment is the tail of exactly this block — the owner's `e7dd0a4 fixed excel` hand edit inserted it at the wrong offset. Test 3 (the rounding test, from `d085ab9`) already carries the identical inline block, and the feature callers always pass it. This plan restores the intended state; resetting via git would resurrect `"3.40"`-style assertions the owner deliberately replaced.

### Proof (H1 — the owner runs it, bash)

```bash
npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

What each step catches: the focused file 0 → 6 green tests (was *suite failed: parse*); `tsc` catches any type slip in the new blocks; `lint` + `vitest` is the repo gate; `build` certifies the tree for CI (which is currently red on `main`). ⭐ Only the owner can verify the reviewed Excel artifact — with `ACES_SAMPLE_PATH` set, open the written workbook: the Individual tab must show the `I. Professional Manner` block with AVERAGE cells (`<v>` values 4.25 / 4).

### Out of scope

- No edit to `lib/xlsx/`, `features/evaluation-results/`, `app/`, `specs/`, `docs/` or any other test file.
- No invariant of `repository.md` crosses this slice; no layering order (one `.test.ts` layer only); repository.md's gold paths don't cover `lib/xlsx/` — the contract anchors (`features/evaluation-results/consolidated-{workbook,zip}.ts`, `department-zip.ts`, `lib/xlsx/consolidated-workbook.ts`) were read during the scan.
- Commit flow is the owner's afterwards — the `gate-and-commit` skill exists for verify-and-commit; the working tree was clean, so this repair lands as a fresh uncommitted change.

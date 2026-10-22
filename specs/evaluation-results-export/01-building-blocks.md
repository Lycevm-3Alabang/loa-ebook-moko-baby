# The building blocks — the DEFLATE zip, the shared builder, the consolidated file

**Version:** 1.0
**Status:** Draft (2026-10-22)
**Parent:** [evaluation-results-export.md](../evaluation-results-export.md) (Part II, v6.0)

The three pieces the department ZIP is made of. ⭐ **No user-visible surface ships here** — the
pieces are proven by their own tests and by the shipping routes' tests.

---

## 1. Problem

The ZIP is assembled from three things that do not exist yet, and each of them has a trap:

1. **the zip** — `lib/zip.ts` is a **store**-only writer (no compression). ⭐ The workbook
   inside is *also* store-only, so its XML is uncompressed: without compression the ZIP is
   roughly **twice** what it needs to be, and the response size is the binding constraint (§23).
2. **the workbook** — the subject route assembles it in ~30 lines (the rubric join → the
   criteria mapping → the form input → `buildEvaluationWorkbook`). ⭐ The department export
   needs the **same** file, N times. Duplicating the assembly would be a second implementation
   of a shipped artifact — the drift the repo already paid for once (the legacy's Section
   landing on the banner's row).
3. **the consolidated file** — the faculty summary (D25): a **new** artifact, but built on the
   **existing** writer and the **existing** style tokens. ⭐ Nothing new is needed from the
   writer.

## 2. The decisions

| # | Decision |
|---|---|
| B1 | ⭐ A **server-only** DEFLATE zip writer — `lib/zip-deflate.ts`. ⭐ **Not** a change to `lib/zip.ts` |
| B2 | ⭐ One **shared builder** — `lib/xlsx/subject-workbook.ts` — called by the three shipping routes and by the export |
| B3 | The consolidated file is a **one-sheet workbook** built by the existing writer — no new writer feature |

## 3. Pinned contracts

1. ⭐ **The three shipping subject-grain routes' output does not move.** Their bytes are what
   the school already receives. The extraction must be **byte-identical**, and their existing
   tests are the proof.
2. ⭐ **The subject route's input assertions migrate, they are not lost.** The route test
   asserts the input the route assembles; once the assembly moves into the builder, that
   assertion moves into the builder's test.
3. ⭐ **`lib/zip.ts` is untouched.** The client's `downloadBlob` imports it (`CoveragePage`), so
   a `zlib` import there would break the browser bundle. ⭐ The DEFLATE writer is a **separate
   module**, and only server code imports it.
4. ⭐ **`lib/xlsx/writer.ts`, `lib/xlsx/workbook.ts`, `lib/xlsx/form-model.ts` and
   `lib/xlsx/styles.ts` are untouched.** ⭐ No new writer feature — not a picture anchor, not a
   row break, not a style token.
5. ⭐ **`lib/` never imports `features/`.** The builder's input is a **structural** type — the
   service's `SubjectResultSet` satisfies it, but the module does not import it. ⭐ The layering
   stays `app → features → lib`.
6. ⭐ **No new dependency.** The DEFLATE writer uses Node's built-in `zlib`.
7. ⭐ **The rubric is data.** Nothing assumes a criterion count, and the consolidated file's
   columns and the form's blocks follow the live rubric (§3.2).

## 4. The DEFLATE zip (B1)

- **Where**: `lib/zip-deflate.ts` — ⭐ **new**, server-only.
- **What**: the same entry shape as `lib/zip.ts` (`{ name, data }`) and the same ZIP layout
  (the local headers, the central directory, the EOCD) — ⭐ **one difference**: the entry's
  bytes are **deflated** (`zlib.deflateRawSync`) and the local header's method field says so.
- ⭐ **Why the outer zip and not the workbook's own**: the workbook's bytes must not move (they
  ship), and the outer zip compresses the inner XML for free. ⭐ One module, one lever, and the
  school's individual workbook is untouched.
- **The test** (`lib/__tests__/zip-deflate.test.ts`): it **round-trips** (the entries come back
  byte-identical), it is **smaller** than the store zip for XML-heavy entries, and it **keeps**
  the store zip's layout rules (the entry names, the order).

## 5. The shared builder (B2)

- **Where**: `lib/xlsx/subject-workbook.ts` — ⭐ **new**.
- **What**: `buildSubjectWorkbook(input, rubricCategories, logo) → Uint8Array` — the subject
  route's assembly, extracted:
  1. the rubric's categories → the form's `criteria` (the name, the criterion's average, the
     statements' averages — by `itemId`);
  2. the form input (the semester, the period, the employee no, the name, the program, the
     section, the subject, the rating, the remark, the respondent count);
  3. `buildEvaluationWorkbook({ form, logo, comments, responses })` — ⭐ **unchanged**.
- ⭐ **The input is structural** — `{ faculty, subject, section, period, summary, itemAverages,
  comments, evaluations }` — so `lib/` never imports `features/`.
- **The migration**: the **three** shipping routes (admin · dean · faculty) replace their
  assembly with **one call**. ⭐ Their guards, their headers, their filenames and their bytes
  are untouched.
- **The test** (`lib/__tests__/xlsx-subject-workbook.test.ts`): ⭐ the subject route's **input
  assertions move here** (the criteria mapping, the form input), plus the cases the route never
  covered — ⭐ a rubric with **no items** and a rubric with **nine** categories (nothing assumes
  a criterion count).

## 6. The consolidated file (B3)

- **Where**: `lib/xlsx/overall-summary.ts` — ⭐ **new**.
- **What**: the model (the header block → the band → the table) and the renderer (the sheet),
  then the file (the existing `buildWorkbook`, **one** sheet).
- **The data**: the department read's rows + `facultyAggregates` + the members — ⭐ **no new
  read**; the file is assembled from what the page already has.
- **The shape**: §17.3 — the header block (the title, the term, the period, the department), the
  band (the name, the email, the pooled average + remark), the table `SUBJECT │ SECTION │ AVG
  RATING │ HIGHEST │ LOWEST`, landscape, one page wide, the row heights following the text.
- ⭐ **The order is total**: the member's rows by **subject code ascending**, then **section
  label ascending** (Lesson 7b's rule — two exports of the same data print the same rows).
- **The test** (`lib/__tests__/xlsx-overall-summary.test.ts`): the band's order · the row order ·
  the `—` for an unevaluated section (blank Highest/Lowest) · **every tie** comma-joined · a
  member with no counted responses (`—`, no remark) · a member with no subject-sections (the
  band alone).

## 7. The tests

| File | Covers |
|---|---|
| `lib/__tests__/zip-deflate.test.ts` 🆕 | the round-trip, the size, the layout |
| `lib/__tests__/xlsx-subject-workbook.test.ts` 🆕 | the criteria mapping, the form input, the edge rubrics — ⭐ **the shipping route's input assertions, moved** |
| `lib/__tests__/xlsx-overall-summary.test.ts` 🆕 | the consolidated file's shape and its edge cases |
| `lib/__tests__/evaluation-results-workbook-export-route.test.ts` (existing) | ⭐ **the three shipping routes' output — unchanged** |

## 8. Out of scope

- **The route** that assembles the ZIP — sub-spec 02.
- **The buttons** — sub-spec 03.
- **Any change to the workbook's bytes** — ⭐ the workbook is Part I's, untouched.
- **Re-encoding the letterhead** — ⭐ only if the spike says the logo is the binding cost
  (`00-spike.md` §5). It is a **product** change to the school's logo file.

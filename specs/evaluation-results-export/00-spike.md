# The spike — measure the department ZIP

**Version:** 1.0
**Status:** Draft (2026-10-22)
**Parent:** [evaluation-results-export.md](../evaluation-results-export.md) (Part II, v6.0)

The measurement that the export's **size guard** and its **scope** are written against. ⭐ It
ships **nothing** — it exists because two numbers in the contract are **estimates**, and both
change the work if they are wrong.

---

## 1. Problem

The department ZIP's size and duration are **not known**. What is known:

- the **letterhead PNG is 47 KB** (`public/logo-blk.png`, 340×156) and **every** workbook
  embeds it — so the logo is the floor per file;
- the workbook's own zip is **store-only** (`lib/zip.ts`), so the XML inside it is **not**
  compressed — but the **outer** zip can compress it (D28);
- the export costs **N + 1 reads** (§20) — one department read plus one subject read per
  subject-section.

The estimates say ≈ **57 KB per workbook** → a department (≈75 subjects) ≈ **4.3 MB** → all
departments (≈400–800) ≈ **23–45 MB**. ⚠️ Vercel's Serverless Function response limit is
**~4.5 MB**, so the estimates say **"all departments" cannot be one download** and a department
is **at the edge**.

⭐ An estimate that decides a **guard**, a **scope picker** and a **refusal message** should be
a measurement. A wrong estimate costs one spike; the same estimate baked into three slices
costs all three.

## 2. The question

**How big is one department's ZIP, and how long does it take?**

Specifically:

1. the **number of subject-sections** in the department (the unit count);
2. the **bytes** of one workbook — the minimum, the median and the maximum (the per-response
   rows and the comments move it);
3. the **ZIP's bytes** — the **store** zip (today's writer) against the **DEFLATE** zip (the
   lever D28);
4. the **wall time**, split: the department read · the subject reads · the workbook builds · the
   zip;
5. the **number of subject reads** (one per subject-section — a derived count, not an
   instrumented one);
6. the **failures** — how many subjects did not build, if any.

## 3. The method

- **One file**: `lib/__tests__/spike-department-zip.test.ts`.
- ⭐ **Gated**: the suite is `describe.skip` unless `ACES_SPIKE=1` is set — the repo's own
  `ACES_SAMPLE_PATH` hook convention (`lib/__tests__/xlsx-workbook.test.ts`). ⭐ **CI stays
  green**; the spike only runs when the owner asks for it.
- **The inputs** (env vars, so the owner picks the case): `ACES_SPIKE=1`,
  `ACES_SPIKE_PERIOD` (the evaluation period id — default: the active one),
  `ACES_SPIKE_DEPARTMENT` (the department id — default: the first with rows),
  `ACES_SPIKE_PATH` (where the ZIP is written — default `/tmp/aces-dept-zip.zip`).
- **It builds the real thing**: the department read → the rubric read (once) → per subject the
  subject read → the workbook → the entries → the zip. ⭐ Both zips (store and DEFLATE) are
  built, so the lever's effect is **measured**, not assumed.
- **It prints** the six numbers above, one per line, so they can be pasted into
  `02-department-zip.md`.
- **It writes** the ZIP to `ACES_SPIKE_PATH` so the owner can unzip it and look.

## 4. Pinned contracts

1. ⭐ **It ships nothing.** No app code changes — no route, no module, no page. The file is a
   test file, and it is skipped by default.
2. ⭐ **Read-only.** It performs **no write** to the database (AGENTS.md **H4**) — the reads
   are the export's own.
3. ⭐ **It writes only where it is told** — the path it is given, outside the repo by default.
   It touches nothing else on disk.
4. ⭐ **It is not a gate.** It never fails the suite: when it runs and finds something, it
   **reports**; it does not assert a size. ⭐ A measurement that can fail is a test, and a test
   that asserts a platform limit is a flaky gate.
5. ⭐ **The numbers are recorded, not assumed.** Whatever it prints is what
   `02-department-zip.md` says — the estimate above is replaced by the measurement.

## 5. What the numbers decide

| The number | Decides |
|---|---|
| the ZIP's bytes for one department | the **size guard's threshold** — the selection the route refuses, and the refusal's wording |
| the ZIP's bytes for all departments | ⭐ whether **"all departments" can exist at all** as one download |
| the bytes per workbook | ⭐ whether the **logo** is the binding cost — and therefore whether re-encoding it (47 KB → ~12 KB) is worth the change |
| the wall time | ⭐ whether one department fits `maxDuration = 60` — and, if not, whether the fallback is **one ZIP per faculty** |
| the subject read's share | the **concurrency bound** the route uses |

## 6. Out of scope

- **Any change to the export's code** — the blocks and the route are built after the numbers
  land.
- **Any change to the database** (H4) and **any change to the school data**.
- **The Excel proof** — that is sub-spec 03's owner run, on the real ZIP.

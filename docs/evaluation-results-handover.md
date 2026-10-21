# Evaluation results — the handover

**Date:** 2026-10-21
**Status:** 🟢 **the membership gate is closed.** The results surfaces agree with each other, the
drill-down is per-teacher, and the numbers are the results list's. What is left is **one spec**
(the export) and the deferred cleanups.
**Scope:** the evaluation results surfaces — `/admin/evaluations/results` (+ its department and
subject pages), `/dean/evaluations/results` (+ the twins), `/faculty/evaluations/results`, the
coverage page (a different surface, a different spec) and the export.

> ⭐ **One handover at a time.** The cache, endpoint and membership-gate handovers were folded
> into this one; this one is replaced (not appended to) when a session ends. The **durable**
> knowledge is in the specs and the TODO — this file is the entry point, and it goes stale first.

---

## 1. Where the surfaces stand

| surface | the response set | the figure |
|---|---|---|
| `/admin/evaluations/results` · `/dean/evaluations/results` — a row per **department** | the **period** only | the department's pooled rating, read **per department** and **cached 5 minutes** (`features/evaluation-results/figure-cache.ts`) |
| `/admin/evaluations/results/[departmentId]` · `/dean/…` — a **card per faculty** | the **period** only — the gate is gone | the same pooling, over the **shared set** |
| `/admin/evaluations/results/[departmentId]/[facultySubjectId]` — a row per **response** | the **period** only | the same ratings, per subject |
| `/faculty/evaluations/results/[facultySubjectId]` — a teacher's own | the **period** only | the same |
| both **export CSVs** | the department page's read | the same |

**No surface opens a direct connection.** The group-by that needed one cannot be expressed through
PostgREST (AGENTS.md **Lesson 7c**), so the rows cross the wire and the group-by happens in Node —
**per department** for the list and the exports, **per faculty** for the report, each cached five
minutes, and the read carries the **weights** (the per-category sum and count) so a department's
figure is the **pool** of its faculty's totals, not a mean of means. The drill-down stays **live,
on demand** (rule 3 of `specs/evaluation-results-cache.md`).

⚠️ `pg` and `DATABASE_URL=` stay in the repo — `scripts/apply-schema.mjs` (the owner's manual
schema runner) needs both. The **app** does not.

## 2. The rules that took the work — read the specs, not this file

| spec | what it carries |
|---|---|
| `specs/evaluation-results-attribution.md` (v1.14) | **the contract** — the period scopes the responses (§3.21) · the headcount (§3.14) · the cards are the members (§3.15) · the rows (§3.16) · the dean's guards (§3.17) · the parity rule (§3.18) · the scope rules in the repository (§3.19) · the weights (§3.20) · **the counts are the coverage page's** (§3.22) · **a tie is shown as a tie** (§3.23) |
| `specs/evaluation-results-cache.md` | what is cached (5 minutes) and what stays live |
| `specs/evaluation-results-summary-card.md` | the Department Summary card's design (the headline, the read-out, the triage rule) |
| `specs/coverage-faculty-grouping.md` · `specs/coverage-parity.md` | the **coverage** page — a different surface, a different set of rules |
| `docs/evaluation-surfaces-verification.md` | ⭐ the **manual checks** (and the home-less-teachers SQL) |
| `TODO.md` | the open items, and what is done |

## 3. What is open

1. ⭐ **The export's two views** — a spec to write (`specs/evaluation-results-export.md`): the
   **flat** rows (*the same as when all the faculty cards are expanded*) and a **high-level
   per-individual / faculty narrative**. The per-faculty figures are **already computed** — the
   service returns `facultyAggregates` and the export route simply does not destructure it.
2. ⭐ **The PDF's per-faculty average is a mean of means** (`lib/evaluation-pdf.ts:352`) — the page
   shows the **pooled** figure; the PDF computes the mean of a teacher's subject averages. Its own
   spec.
3. ⭐ **The dead code** — `listDepartmentAssignments`, `listSubmittedByPeriodAndEvaluatees`,
   `DepartmentAggregate.totalSubjects` / `uniqueFaculty`. ⚠️ the second one's tests are the **proof**
   of AGENTS.md Lesson 7, so the lessons need re-anchoring on a read that stays before it goes.
4. **D8** — the legacy NULL `evaluation_period_id` rows: a data condition, not a rule. Every
   surface drops them identically, so no surface disagrees; recovering them adds responses to
   **every** period's published figures.
5. **The student-import thread** (a different feature) — its VERIFY and PROOF items are in
   `TODO.md`; none of them need code.

## 4. What not to redo

The gate closed on 2026-10-21 in five steps (`db7644e` → `e820a5d` → `2473329` → `5bf03e4` →
`38ffcbf`), then the drill-down's redesign (`2eb0025`) and the ties (`7c25ba4`). The decisions are
recorded **in the specs**, not here — but three of them are worth knowing before touching these
surfaces:

- **The period scopes the responses; the term scopes the subject list only.** The assignment's
  `faculty_subjects.semesterId` is a stamp, never a filter.
- **The response set is decided in ONE read** (`listDepartmentResponseSet`) — the list's figure
  and the drill-down's rows read the same set, so they cannot drift.
- **The results surfaces show the ratings; the coverage page owns the counts.** A bare response
  count on a results surface invites "out of how many students?", and the results surfaces do not
  carry the denominator.

⚠️ **The release note for the gate:** the department page's average and **both export CSVs** moved
onto the results list's figure. The **capture was never taken** (the code landed first), so the
note says *"the drill-down now equals the results list"* rather than quantifying the movement.

## 5. The gate (the owner's run — AGENTS.md **H1**)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

62 files · 687 tests (2026-10-21).

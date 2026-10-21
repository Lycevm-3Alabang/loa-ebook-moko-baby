# Evaluation results — the membership gate

**Date:** 2026-10-21
**Status:** 🔴 **decided, not built.** **Three** surfaces answer *"whose evaluations count?"* and only one
filters differently. The home-department half of the answer is deliberate and pinned by a
contract; the **semester half is an accident**, and it has **no test**. ⚠️ A **third** gate —
`evaluations.evaluation_period_id`, the strict gate — is nullable and only partially backfilled
(§3b): a **symmetric** loss that this document's parity rule and its measurement query both
cannot see.
**Part of:** `.opencode/skills/plan-fix/runs/20261021-1800-open-gaps.md` (slice 3 of 7).
**Related:** `specs/evaluation-results-attribution.md` — **§1.10** (the three reads and how they
diverge), §3.15/§3.16 (the membership contract), §3.18 (the parity rule), **§3.21** (the period
is the strict gate) · `docs/evaluation-results-cache-handover.md` (the figures' cache).

> ⭐ **The spec is authoritative.** `specs/evaluation-results-attribution.md` carries the rule
> (§3.21), the measurement (**§6.1**) and the decision (**D7**) — **this file is the working
> note for one session**, and it defers to the spec wherever the two would differ.

> ⭐ **D7 is RESOLVED (2026-10-21) — option D′.** The owner's rule: *given a department is
> selected · when all faculties belonging to it are fetched · then it should only take into
> account evaluations that are accounted for the current evaluation period only.* So the **period
> scopes the responses**; the term's assignments scope only the **subject list**. **§6 below is
> kept for the record** — the options and their blast radii — but **D′ is the decision**, and the
> slice is `specs/evaluation-results-attribution.md` **S6.1**. The measurement (§5) now **sizes**
> the change and writes the release note; it no longer decides anything.

---

## 1. The problem in one paragraph

A response sits on an **assignment** (`faculty_subjects`), and an assignment carries a
`semesterId`. The dean's `/dean/evaluations/results/[departmentId]` page decides which responses belong to a department by asking
*"is the assignment in **this term's** assignments?"*. The **`/admin/evaluations/results` page** and the `/faculty/evaluations/subjects/[facultySubjectId]` page
ask *"is the response in **this period**, for **this teacher**, on **this subject**?"* — with no
term scope at all. An assignment whose semester is not the period's therefore **counts on the list
and on the faculty's page and is dropped by the `/admin/evaluations/results/[departmentId]` page**: the same teacher's own page shows a
response their department's page does not count, and the department's pooled average and the
teacher's own page disagree.

## 2. The three reads, in code

⭐ **2026-10-21 — this section was "the two questions"; it is three.** The **`/admin/evaluations/results` page** is
also a reader, and it is already period-scoped — so the divergence is the `/admin/evaluations/results/[departmentId]` page against
**two** surfaces, not one. The full table is `specs/evaluation-results-attribution.md` §1.10; the
contract it violates is §3.21.

**The `/admin/evaluations/results` page** — "which responses belong to *this department*?"

```
/api/admin/evaluation-results/figures → getCachedDepartmentFigures
  └─ listDepartmentFigures(deptId, periodId)         evaluation-results.repository.ts:449
     .eq("evaluation_period_id", …) .eq("status", "SUBMITTED") .eq("isDisabled", false)
     membership = the accounts HOMED in the department
     ← no semester scope, no term filter
```

⚠️ So the list **counts** the responses the `/admin/evaluations/results/[departmentId]` page drops — and it **warns** about them at the
same time (`offSemester`, `app/admin/evaluations/results/page.tsx:299`).

**The `/admin/evaluations/results/[departmentId]` page** — "which responses belong to *this department*?"

```
getDepartmentSubjectResults(deptId, periodId)        features/evaluation-results/evaluation-results.service.ts:174
 └─ getDepartmentMemberTeaching(deptId, periodId)     :147
     └─ listDepartmentTeachingAssignments(deptId, period.semesterId)   repository.ts:625
         └─ loadSemesterAssignments(semesterId) → .eq("semesterId", semesterId)   ← THE TERM SCOPE
 └─ listSubmittedByPeriodAndEvaluatees(periodId, facIds)         the period's evaluations
 └─ deptEvals  = evals.filter(e => memberIds.has(e.facultySubjectId))          :190
 └─ validEvals = … the assignment's faculty must equal the evaluatee            :200
```

**The faculty's own page** — "which responses did *I* get on *this subject*?"

```
app/api/faculty/evaluation-results/subjects/[facultySubjectId]/route.ts:63
 └─ listSubmittedByPeriodAndEvaluateeAndFS(periodId, userId, fsId)   evaluations.repository.ts:526
     .eq("evaluation_period_id", …) .eq("evaluateeId", …) .eq("facultySubjectId", …) .eq("status", "SUBMITTED")
     ← no semester scope
```

The other two readers of the `/admin/evaluations/results/[departmentId]` page's figures: the admin and dean department-page routes
(`/api/admin/evaluation-results/departments/[departmentId]`, `/api/dean/…`) and **both exports**
(`/api/admin/evaluation-results/export`, `/api/dean/evaluation-results/export`), which share the
department page's read. ⚠️ Two more read `getDepartmentMemberTeaching` **directly** — the dean's
**details** route and the dean's **visibility** route (the latter decides **whose results may be
shown**, so widening the member set is a **governance** change, not a display one).

## 3. Why the term scope is there at all

`listDepartmentTeachingAssignments` was built for the **membership** rule: a department's teaching
is the teaching of the faculty homed in it, over **one term** (contract §3.15/§3.16). The
home-department half is **deliberate** and asserted by
`lib/__tests__/evaluation-results-service.test.ts:149-167`.

The **semester** half came with it as a by-product of building the assignment list from a term, not as a
decision. Nothing in the contract asks for it.

⚠️ And it is not a small by-product: `faculty_subjects.semesterId` was **added by a migration**
(`supabase-schema.sql:1022`, nullable, `ON DELETE CASCADE`) — the base table (`:706-712`) has no
such column. **Every assignment created before that migration has `semesterId = NULL`**, and a
`NULL` semester is not the period's semester. So the gap is not a corner case: it is every
assignment the migration did not touch.

### 3b. The response's own two columns: `semesterId` and `evaluation_period_id`

The gate has **three** semester/period columns in play, and they are not interchangeable:

| column | lives on | nullability | written from |
|---|---|---|---|
| `faculty_subjects.semesterId` | the **assignment** | nullable (migration 24, `supabase-schema.sql:1022`) | the admin UI's active semester |
| `evaluations.semesterId` | the **response** | `NOT NULL` (`supabase-schema.sql:730`) | the **period's** semester, copied at insert (`features/evaluations/evaluations.repository.ts:288-297`) |
| `evaluations.evaluation_period_id` | the **response** | **nullable** (`supabase-schema.sql:1846`) | the period, at insert |

**The strict gate is `evaluation_period_id`** — it names the exact period a response belongs to.
`evaluations.semesterId` is the denormalized copy of that period's semester: an *easy lookup*, not
an independent fact. Every results read already filters on the period
(`.eq("evaluation_period_id", evaluationPeriodId)` — `evaluations.repository.ts:131, 247, 277,
375, 452, 488, 510, 530, 555, 588, 617`).

⭐ **So the long-term design is to gate the response set on `evaluation_period_id` alone** (§5b's
reframe). ⚠️ **But that column is nullable and only partially backfilled** — the same shape as the
`faculty_subjects.semesterId` NULL case in §3, one column over:

- it was added by migration 30b (`supabase-schema.sql:1846`) **without** `NOT NULL`, and nothing in
  the schema ever adds it (`SET NOT NULL` appears only for `subjects`, `faculty_subjects`,
  `student_enrollments`, `sections`);
- the backfill (migration 30c, `supabase-schema.sql:1880-1905`) runs only for semesters with eval
  dates or `isActive` (`:1883`) — a semester with **neither** leaves its evaluations with a
  **NULL** `evaluation_period_id`;
- the same block creates **one** period per semester (`:1884-1889`), so a semester with **several**
  periods has all of its evaluations pointed at that single new period — those rows are
  **misattributed**, and **no filter can detect it**.

⚠️ **And this loss is invisible to the rest of this document.** The gate in §3 is *asymmetric* — the
`/admin/evaluations/results/[departmentId]` page drops what the faculty page keeps, which is what this document is about. But a response
with a NULL `evaluation_period_id` is dropped by **both** surfaces (both filter
`.eq("evaluation_period_id", periodId)`), so the **parity rule** (§3.18) cannot see it, and the
**measurement query** in §5 cannot see it either: its
`join evaluation_periods ep on ep.id = e.evaluation_period_id` is an **inner** join, so NULL-period
rows are dropped before the `WHERE` runs. The careful `IS DISTINCT FROM` on `fs."semesterId"`
(`:111`) protects one NULL column and misses this one.

⭐ **Decision — for now, keep both.** The plan keeps **both** gates in place for this slice — the
period gate (`evaluation_period_id`) *and* the term gate (the assignment's `semesterId` term gate) —
and option **A** (§6) *surfaces* what the term gate drops rather than changing it. Narrowing to
`evaluation_period_id` alone is a later slice, and it must carry the NULL-period rows with it:

```
evaluations.semesterId = period.semesterId                        -- floor: NOT NULL, never drops
AND (evaluations.evaluation_period_id = periodId
     OR evaluations.evaluation_period_id IS NULL)                  -- legacy: no period recorded
```

⚠️ **Caveat on the floor:** if a semester ever has **several** periods with responses, a NULL-period
row's true period is unknown and the `IS NULL` arm would admit it to each of that semester's reads
— double-counting across periods. The **misattributed** rows are unrecoverable by any filter; they
need the owner's read-only audit.

## 4. The house pattern: the `/admin/evaluations/coverage` page already handles this class

The `/admin/evaluations/coverage` page (`features/evaluations/evaluation-status.service.ts:151`) builds its subject
list from the **same** term-scoped assignments — and the results list reports the off-term assignments
as an **integrity warning**:

```
classifyWarningAssignments(assignments, …)          lib/evaluation-utils.ts:486
  offSemester = assignments.filter(a => a.semesterId !== periodSemesterId)
```

which the results repository turns into `offSemester: { count, faculty }`
(`evaluation-results.repository.ts:341`, `:365`, `:379`) and the list shows as its warning surface.

So the house pattern is already: **scope the subject list to the term, and report what falls
outside it.** The `/admin/evaluations/results/[departmentId]` page breaks the pattern — it scopes but does not report. ⚠️ Note the
units differ: the warning counts **assignments**; the `/admin/evaluations/results/[departmentId]` page drops **evaluations** (one
assignment can be fifty responses).

## 5. Measure the gap before choosing

Nothing in the repo measures how big this is, and the two states are very different:

- **zero rows** → the gap is theoretical, and the slice is cheap insurance;
- **many rows** → the `/admin/evaluations/results/[departmentId]` page is quietly dropping real responses, and the faculty's page is the
  honest one.

This read-only query answers it (paste it into the Supabase SQL editor with the period's id —
it changes nothing, and it is the owner's to run, per AGENTS.md **H4**):

```sql
select fs.id as assignment, fs."semesterId" as assignment_semester,
       ep."semesterId" as period_semester, count(*) as responses
from evaluations e
join faculty_subjects fs on fs.id = e."facultySubjectId"
join evaluation_periods ep on ep.id = e.evaluation_period_id
where e.evaluation_period_id = '<period-id>'
  and e.status = 'SUBMITTED'
  and e."isDisabled" = false
  and fs."semesterId" is distinct from ep."semesterId"
group by fs.id, fs."semesterId", ep."semesterId"
order by responses desc;
```

⚠️ **`is distinct from` is load-bearing, not decoration.** With the ordinary `<>`, a row whose
`fs."semesterId"` is `NULL` compares to `NULL` → the comparison is `NULL`, not `TRUE` → the row is
filtered out → the query would return **zero rows** and you would conclude the gap does not exist.
`IS DISTINCT FROM` treats `NULL` as a value that *is* different ✓ — which is exactly the legacy
case the query is looking for.

⭐ **The app-side equivalent (and the better route).** Per **H4**, the app cannot add a function or
a view to get this number — but it does not need one: the count is a **repository method** over the
existing tables (the evaluations of a period whose assignment is not in the term's assignments), and
that is **exactly the number option A puts on the `/admin/evaluations/results/[departmentId]` page**. So the measurement and the feature
are the same work — land the count, read it off the page, and decide between **A** and **D′**
with the number in hand. No SQL, no Supabase change, no setup.

⚠️ **A companion query — the symmetric loss of §3b** (read-only, the owner's to run, same terms):

```sql
-- responses in the period's semester whose period was never recorded
select e.id, e."semesterId" as response_semester, e."evaluateeId", e."facultySubjectId"
from evaluations e
where e.status = 'SUBMITTED'
  and e."isDisabled" = false
  and e.evaluation_period_id is null
  and e."semesterId" = '<period-semester-id>'
order by e."semesterId";
```

This one is **not** reachable from the query above: that query's inner join on `evaluation_periods`
drops the NULL-period rows before its `WHERE` runs. ⚠️ And it counts only the **NULL** half — the
**misattributed** rows (a semester with several periods, §3b) are reachable by no filter at all.

## 5b. The reframe: a subject list is scoped by the term, a response by the period

The gate leaks because the `/admin/evaluations/results/[departmentId]` page **derives its response set from its subject list**:

```
deptEvals = evals.filter(e => memberIds.has(e.facultySubjectId))     evaluation-results.service.ts:190
```

The **subject list** ("the members' subjects **this term**", contract §3.16) is a question about the
*teaching*. The **response set** ("the responses in **this period**") is a question about the
*responses* — and the evaluation carries its own record of when it happened
(`evaluations.evaluation_period_id`). The faculty page has no subject list, so it has no term
scope, so it keeps the responses. **Same responses, two scopes.**

And this makes the defect exact rather than a difference of opinion:

> **An assignment that carries a response in this period is, by definition, being taught this
> term.** The students submitted it here, now, against that assignment.

So the `/admin/evaluations/results/[departmentId]` page drops **exactly the subjects that are demonstrably current** — the ones with this
period's responses — and keeps the ones the term's assignments name. The gate is not "is this
current?"; it is "is this current **and** dated the way the term expects?" The second half is the
accident.

### Option D′ — the period scopes the responses

| | The rule | What it costs |
|---|---|---|
| **D′** | the **response set** = the period's responses by the members, with no assignment-term filter; the **subject list** = the members' subjects this term **∪** the subjects that carry a period response | nothing is lost, and the teacher and the `/admin/evaluations/results/[departmentId]` page agree on every subject. ⚠️ But the subject list **must** widen, or a counted response would have no row (a figure over something the table cannot show — the shape of the `""` bucket). ⚠️ And the **`/admin/evaluations/coverage` page** builds its subject list from the same term-scoped list (`evaluation-status.service.ts:151`), so it would say "not evaluated" where the `/admin/evaluations/results/[departmentId]` page says "evaluated" — the change has to reach its subject list and the `offSemester` warning, or the two pages swap one inconsistency for another |

The widening of §3.16 ("the members' subjects, evaluated or not") is the contract change D′
implies.

## 5c. What the measurement must produce

Three numbers, and they decide between **A** and **D′**:

1. **the responses** on the assignments the `/admin/evaluations/results/[departmentId]` page drops — the size of the loss;
2. **the assignments** themselves — how many subjects the `/admin/evaluations/results/[departmentId]` page's tab is missing;
3. ⚠️ **the responses with no period recorded** (`evaluation_period_id IS NULL`, §3b) — the
   **symmetric** loss, invisible to the parity rule and to the query above.

⚠️ And the rows the query returns are **not** "old assignments": each one carries a response in
this period, so each one is **current teaching that is dated otherwise**. If some of them also
carry responses from an **earlier** period, they are older assignments that merely kept an
enrollment — the response's `evaluation_period_id` tells you which. ⚠️ Except when it is **NULL**
(§3b): then the response's period is *unrecorded*, and its `semesterId` is the only witness left.

## 6. The options — **D′ decided 2026-10-21**

⚠️ **Kept for the record.** D′ is the decision (see the header note); the options and their
blast radii are below because the *rejected* ones explain why the rule reads the way it does.

| | What it means in practice | Blast radius |
|---|---|---|
| **A (rejected)** | the `/admin/evaluations/results/[departmentId]` page **surfaces** what it dropped — "N responses sit on assignments outside this term's assignments" — next to the subject rows, and keeps them **out** of the department's average. The count reuses the existing rule (`classifyWarningAssignments`), so the `/admin/evaluations/results/[departmentId]` page and the results list would say the same thing | the results service (the payload) + the two department-page routes + the component + both exports (they share the read) + **a new test for the semester half** (it is untested today) |
| **D′** | the **period** scopes the response set (see §5b): nothing is dropped, and the subject list widens to cover what the responses bring | the subject list widens (contract §3.16) + the `/admin/evaluations/coverage` page's subject list and the `offSemester` warning must follow, or the pages disagree differently |
| B | the `/faculty/evaluations/subjects/[facultySubjectId]` page also scopes to the period's semester | the teacher's own page would **lose** responses a student actually submitted — and the department page would become right by making the teacher wrong |
| C | the `/admin/evaluations/results/[departmentId]` page stops scoping by semester and takes every term's assignments | the `/admin/evaluations/results/[departmentId]` page's subject list widens; the `/admin/evaluations/coverage` page's "off-term" warning then contradicts the `/admin/evaluations/results/[departmentId]` page's own subject list |

**A was the recommendation at the time**, on the grounds that the responses are real, they belong to
a teacher, and the number is knowable — while B hides a response from the student it belongs to and
C hides a term boundary from the department. **D′ was chosen instead** (2026-10-21): the rule is
the **period**, and A's version of it kept the drop.

⭐ **A was D′ minus the counting change** (§2, `specs/evaluation-results-attribution.md` §1.10).
The two options shared their mechanical work — the same warning rule, re-pointed at **the term's
assignments** instead of semester equality, and the same coverage-page subject list — and differed only in
the arithmetic:

| | the responses on an assignment outside the term | where the warning lives |
|---|---|---|
| **A** | reported, **not counted** | the `/admin/evaluations/results/[departmentId]` page says "N sit outside this term's assignments" |
| **D′** | **counted** | the list says "N sit outside this term's assignments" |

So the choice was not "which surfaces change?" — it was a **policy question: do we count them or
not?** — and it was answered **D′: count them**. ⭐ And D′ was never a new rule: **two of the three reads already implement it** (the list and
the faculty page), so D′ is *making the `/admin/evaluations/results/[departmentId]` page match the code that already exists twice*. What
D′ costs is **semantic**, not mechanical — it **republishes** the department average on the
`/admin/evaluations/results/[departmentId]` page and both exports, and it **widens** the dean's **visibility** scope (§2).

⚠️ **A decided one thing and left another open** — it said the responses are *reported but not
counted*, and the published average stayed as it was. **D′ resolves both**: the period scopes the
responses and nothing is lost. The decision about the published average was made **with the rule
in hand** (2026-10-21); the measurement in §5 now only says **how far** it moves.

⭐ **What replaces "keep both gates".** The period gate (`evaluation_period_id`) becomes the **only**
gate on the response set; the term's assignments keep scoping the **subject list** (§3.16), and
the subject list must **widen** to cover the assignments the responses point at — or a counted
response would have no row. The **NULL-period rows** (§3b) are **not** recovered by D′ and remain
**D8**.

## 7. Proof

- **The gate** (the owner's run — AGENTS.md **H1**):
  `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
- **A new test** for the semester half of the gate — today only the home-department half is
  asserted (`lib/__tests__/evaluation-results-service.test.ts:149-167`).
- **In the browser:** open `/admin/evaluations/results/[departmentId]` and a teacher's own page for the same subject
  and confirm they show the same responses — and that the `/admin/evaluations/results/[departmentId]` page's note appears when they do
  not.
- **The parity rule** (§3.18): the `/admin/evaluations/results/[departmentId]` page's Avg Rating and the faculty page's must be the same
  number for the same subject. Today they can differ for exactly this reason.

## 8. Out of scope

- The **`isDisabled` gap** (TODO item 1) — closed 2026-10-21; the state now goes with the flag.
- The **`""` bucket** and the **aliases** (items 6 and 7) — closed 2026-10-21; both states are
  unreachable under the current foreign keys.
- The **ties** (item 5) and the **dead code** (item 8) — their own slices.
- ⚠️ **The `evaluation_period_id` NULL / misattribution** (§3b) — **noted as a gap**, not this slice.
  Both surfaces drop those rows **symmetrically**, so no parity check can see them; recovering the
  **misattributed** half needs the owner's read-only audit, and neither half needs DDL.
- The **`/admin/evaluations/coverage` page's** own term scope: it is the house pattern, not a defect.
- Any **schema change**: nothing here needs DDL.

## 9. The files

| File | What it is |
|---|---|
| `features/evaluation-results/evaluation-results.service.ts` | `getDepartmentSubjectResults` (:174) and `getDepartmentMemberTeaching` (:147) — where the gate is applied |
| `features/evaluation-results/evaluation-results.repository.ts` | `listDepartmentTeachingAssignments` (:625) — the term-scoped assignments; the warnings (:341, :365, :379) |
| `features/evaluations/evaluations.repository.ts` | `listSubmittedByPeriodAndEvaluateeAndFS` (:526) — the `/faculty/evaluations/subjects/[facultySubjectId]` page's read, with no term scope |
| `lib/evaluation-utils.ts` | `classifyWarningAssignments` (:486) — the rule the warning already uses; `resolveSubjectDepartment` (:535) — the home-department rule |
| `features/evaluations/evaluation-status.service.ts` | the `/admin/evaluations/coverage` page's term-scoped subject list (:151) — the house pattern |
| `features/evaluations/components/DepartmentSubjectView.tsx` | where the `/admin/evaluations/results/[departmentId]` page's rows are rendered |
| `supabase-schema.sql` | the columns the gate turns on: `evaluations."semesterId"` (`:730`, `NOT NULL`), `faculty_subjects."semesterId"` (`:1022`, nullable), `evaluations.evaluation_period_id` (`:1846`, nullable), the 30c backfill (`:1880-1905`) — §3b |
| `specs/evaluation-results-attribution.md` | §1.10 (the three reads), §3.15/§3.16 (membership), §3.18 (parity), **§3.21** (the period is the strict gate) |

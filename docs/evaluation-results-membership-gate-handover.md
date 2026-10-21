# Evaluation results — the membership gate

**Date:** 2026-10-21
**Status:** 🟡 **open.** Two surfaces answer *"whose evaluations count?"* differently. The
home-department half of the answer is deliberate and pinned by a contract; the **semester half is
an accident**, and it has **no test**.
**Part of:** `.opencode/skills/plan-fix/runs/20261021-1800-open-gaps.md` (slice 3 of 7).
**Related:** `specs/evaluation-results-attribution.md` §3.15/§3.16 (the membership contract) and
§3.18 (the parity rule) · `docs/evaluation-results-cache-handover.md` (the figures' cache).

---

## 1. The problem in one paragraph

A response sits on an **assignment** (`faculty_subjects`), and an assignment carries a
`semesterId`. The dean's drill-down decides which responses belong to a department by asking
*"is the assignment in **this term's** roster?"*. The faculty's own page asks *"is the response in
**this period**, for **this teacher**, on **this subject**?"* — with no term scope at all. An
assignment whose semester is not the period's therefore **counts on the faculty's page and is
dropped by the drill-down**: the same teacher's own page shows a response their department's page
does not count, and the department's pooled average and the teacher's own page disagree.

## 2. The two questions, in code

**The drill-down** — "which responses belong to *this department*?"

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

The other two readers of the drill-down's figures: the admin and dean drill-down routes
(`/api/admin/evaluation-results/departments/[departmentId]`, `/api/dean/…`) and **both exports**
(`/api/admin/evaluation-results/export`, `/api/dean/evaluation-results/export`), which share the
drill-down's read.

## 3. Why the term scope is there at all

`listDepartmentTeachingAssignments` was built for the **membership** rule: a department's teaching
is the teaching of the faculty homed in it, over **one term** (contract §3.15/§3.16). The
home-department half is **deliberate** and asserted by
`lib/__tests__/evaluation-results-service.test.ts:149-167`.

The **semester** half came with it as a by-product of building the roster from a term, not as a
decision. Nothing in the contract asks for it.

⚠️ And it is not a small by-product: `faculty_subjects.semesterId` was **added by a migration**
(`supabase-schema.sql:1022`, nullable, `ON DELETE CASCADE`) — the base table (`:706-712`) has no
such column. **Every assignment created before that migration has `semesterId = NULL`**, and a
`NULL` semester is not the period's semester. So the gap is not a corner case: it is every
assignment the migration did not touch.

## 4. The house pattern: the coverage page already handles this class

The coverage page (`features/evaluations/evaluation-status.service.ts:151`) builds its subject
list from the **same** term-scoped roster — and the results list reports the off-term assignments
as an **integrity warning**:

```
classifyWarningAssignments(assignments, …)          lib/evaluation-utils.ts:486
  offSemester = assignments.filter(a => a.semesterId !== periodSemesterId)
```

which the results repository turns into `offSemester: { count, faculty }`
(`evaluation-results.repository.ts:341`, `:365`, `:379`) and the list shows as its warning surface.

So the house pattern is already: **scope the subject list to the term, and report what falls
outside it.** The drill-down breaks the pattern — it scopes but does not report. ⚠️ Note the
units differ: the warning counts **assignments**; the drill-down drops **evaluations** (one
assignment can be fifty responses).

## 5. Measure the gap before choosing

Nothing in the repo measures how big this is, and the two states are very different:

- **zero rows** → the gap is theoretical, and the slice is cheap insurance;
- **many rows** → the drill-down is quietly dropping real responses, and the faculty's page is the
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
existing tables (the evaluations of a period whose assignment is not in the term's roster), and
that is **exactly the number option A puts on the drill-down**. So the measurement and the feature
are the same work — land the count, read it off the page, and decide between **A** and **D′**
with the number in hand. No SQL, no Supabase change, no setup.

## 5b. The reframe: a subject list is scoped by the term, a response by the period

The gate leaks because the drill-down **derives its response set from its subject list**:

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

So the drill-down drops **exactly the subjects that are demonstrably current** — the ones with this
period's responses — and keeps the ones the term's roster names. The gate is not "is this
current?"; it is "is this current **and** dated the way the roster expects?" The second half is the
accident.

### Option D′ — the period scopes the responses

| | The rule | What it costs |
|---|---|---|
| **D′** | the **response set** = the period's responses by the members, with no assignment-term filter; the **subject list** = the members' subjects this term **∪** the subjects that carry a period response | nothing is lost, and the teacher and the drill-down agree on every subject. ⚠️ But the subject list **must** widen, or a counted response would have no row (a figure over something the table cannot show — the shape of the `""` bucket). ⚠️ And the **coverage page** builds its roster from the same term-scoped list (`evaluation-status.service.ts:151`), so it would say "not evaluated" where the drill-down says "evaluated" — the change has to reach its roster and the `offSemester` warning, or the two pages swap one inconsistency for another |

The widening of §3.16 ("the members' subjects, evaluated or not") is the contract change D′
implies.

## 5c. What the measurement must produce

Two numbers, and they decide between **A** and **D′**:

1. **the responses** on the assignments the drill-down drops — the size of the loss;
2. **the assignments** themselves — how many subjects the drill-down's tab is missing.

⚠️ And the rows the query returns are **not** "old assignments": each one carries a response in
this period, so each one is **current teaching that is dated otherwise**. If some of them also
carry responses from an **earlier** period, they are older assignments that merely kept an
enrollment — the response's `evaluation_period_id` tells you which.

## 6. The options

| | What it means in practice | Blast radius |
|---|---|---|
| **A (recommended)** | the drill-down **surfaces** what it dropped — "N responses sit on assignments outside this term's roster" — next to the subject rows, and keeps them **out** of the department's average. The count reuses the existing rule (`classifyWarningAssignments`), so the drill-down and the results list would say the same thing | the results service (the payload) + the two drill-down routes + the component + both exports (they share the read) + **a new test for the semester half** (it is untested today) |
| **D′** | the **period** scopes the response set (see §5b): nothing is dropped, and the subject list widens to cover what the responses bring | the subject list widens (contract §3.16) + the coverage page's roster and the `offSemester` warning must follow, or the pages disagree differently |
| B | the faculty's page also scopes to the period's semester | the teacher's own page would **lose** responses a student actually submitted — and the department's drill-down would become right by making the teacher wrong |
| C | the drill-down stops scoping by semester and takes every term's assignments | the drill-down's roster widens; the coverage page's "off-term" warning then contradicts the drill-down's own subject list |

**A is the recommendation**: the responses are real, they belong to a teacher, and the number is
knowable. B hides a response from the student it belongs to; C hides a term boundary from the
department. A says it out loud instead — and it is the only option that leaves the **parity rule**
(§3.18) intact rather than redefining which surface is right.

⚠️ **A decides one thing and leaves another open:** it says the responses are *reported but not
counted*. If the measurement in §5 comes back large, **D′** (§5b) is probably the better rule —
the period scopes the responses and nothing is lost — but that is a decision about the published
average, and it should be made with the number in hand, not before.

## 7. Proof

- **The gate** (the owner's run — AGENTS.md **H1**):
  `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
- **A new test** for the semester half of the gate — today only the home-department half is
  asserted (`lib/__tests__/evaluation-results-service.test.ts:149-167`).
- **In the browser:** open a department's drill-down and a teacher's own page for the same subject
  and confirm they show the same responses — and that the drill-down's note appears when they do
  not.
- **The parity rule** (§3.18): the drill-down's Avg Rating and the faculty page's must be the same
  number for the same subject. Today they can differ for exactly this reason.

## 8. Out of scope

- The **`isDisabled` gap** (TODO item 1) — closed 2026-10-21; the state now goes with the flag.
- The **`""` bucket** and the **aliases** (items 6 and 7) — closed 2026-10-21; both states are
  unreachable under the current foreign keys.
- The **ties** (item 5) and the **dead code** (item 8) — their own slices.
- The **coverage page's** own term scope: it is the house pattern, not a defect.
- Any **schema change**: nothing here needs DDL.

## 9. The files

| File | What it is |
|---|---|
| `features/evaluation-results/evaluation-results.service.ts` | `getDepartmentSubjectResults` (:174) and `getDepartmentMemberTeaching` (:147) — where the gate is applied |
| `features/evaluation-results/evaluation-results.repository.ts` | `listDepartmentTeachingAssignments` (:625) — the term-scoped roster; the warnings (:341, :365, :379) |
| `features/evaluations/evaluations.repository.ts` | `listSubmittedByPeriodAndEvaluateeAndFS` (:526) — the faculty page's read, with no term scope |
| `lib/evaluation-utils.ts` | `classifyWarningAssignments` (:486) — the rule the warning already uses; `resolveSubjectDepartment` (:535) — the home-department rule |
| `features/evaluations/evaluation-status.service.ts` | the coverage page's term-scoped roster (:151) — the house pattern |
| `features/evaluations/components/DepartmentSubjectView.tsx` | where the drill-down's rows are rendered |
| `specs/evaluation-results-attribution.md` | §3.15/§3.16 (membership), §3.18 (parity) |

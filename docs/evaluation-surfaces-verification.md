# Evaluation Surfaces — Manual Verification

The checks for the work specced in `specs/evaluation-results-attribution.md`,
`specs/coverage-parity.md` and `specs/coverage-faculty-grouping.md`. The
automated suite proves the **arithmetic and the rules**; these checks are for
the things only a human can see — whether a real page says the right thing
about a real teacher.

Run them on a real deployment with real data. Nothing here is a fix — it is
the record of what to look at and what "wrong" looks like.

---

## 1. Before you start

| | |
|---|---|
| **Accounts** | an ADMIN, a DEAN, and one FACULTY member of the dean's department, plus one teacher homed in a *different* department (the interesting case) |
| **Period** | an evaluation period that has results — the coverage and results pages are both period-scoped |
| **Viewport** | the desktop layout — the breadcrumb and the tab switch are `hidden lg:flex`; on a phone the breadcrumb bar is not rendered at all |
| **Known-bad first** | the dean's coverage page has **never rendered** (it answered 400 on the list and 403 on every subject). If it still fails, capture the Network tab's response for `/api/dean/evaluation-status` before changing anything |

---

## 2. The dean's coverage page — `/dean/evaluations/coverage`

The page must open **straight onto the dean's department** (no list of
departments, no "back" link).

| # | Check | What "wrong" looks like |
|---|---|---|
| 2.1 | The page loads with the department's name and its subject table | an error box, or the department list |
| 2.2 | The table lists **only that department's subjects** | a subject belonging to another department's section, with no marker |
| 2.3 | A subject whose section belongs to another department shows a **"CS section"** marker beside its section | a foreign subject with no marker — the coverage page is faculty-driven, so this is expected and must be legible |
| 2.4 | The "By Faculty" tab shows one card per teacher **homed in that department** | a teacher homed elsewhere, with no explanation |
| 2.5 | A card's student count is **distinct** — a teacher teaching three sections of one class shows that class's students once | three times the students (a summed `enrolled`) |
| 2.6 | Clicking **Details** opens the participation breakdown | an empty modal, or a 403 |
| 2.7 | A teacher of another department is refused by the API | a 200 with their students' names |
| 2.8 | A class with **no assigned teacher** (the "Unassigned Faculty" placeholder) is never offered to a student, cannot be opened, and cannot be rated | a student seeing "Professor: Unassigned Faculty", or a rating that lands in the department's average |

---

## 3. The admin's coverage page — `/admin/evaluations/coverage`

| # | Check | What "wrong" looks like |
|---|---|---|
| 3.1 | The department table lists every department, with **"Depts reporting"** and a **"Faculties"** column | a department missing, or a "Faculties" count that is not the department's headcount |
| 3.2 | Clicking a department opens the drill-down with the **two groupings** | only one tab, or a tab that does nothing |
| 3.3 | "By Subject & Section" shows the **Section** column | a section-less table (two rows for one teacher and subject in different sections are indistinguishable) |
| 3.4 | "By Faculty" cards expand to their subjects, each with the section and a **Details** action | a card that shows counts but no subjects |
| 3.5 | A teacher with **no** responses anywhere shows a subject in the **"Not part."** column, and the drill-down's per-subject status reads "Not started" | a silent teacher's subject missing from the department row |
| 3.6 | The "Unresolved" group reports the faculty it holds, not 0 | "0" next to a non-empty group |
| 3.7 | The integrity warning appears **only** when a period really has an unresolvable or off-semester evaluation | a permanent warning on a clean period |
| 3.8 | The **"Faculties"** KPI above the table equals the school-wide faculty headcount — the same number the Admin dashboard's "Faculty" card shows | a KPI larger than the dashboard's number (a teacher counted once per department they teach in) |
| 3.9 | The drill-down's **"By Faculty"** tab lists only the department's **own** faculty — a card for a teacher homed in another department is wrong | a card for a teacher who is not in this department's faculty list |
| 3.10 | The drill-down's **"By Subject & Section"** rows are the department's **own** teaching — a teacher homed elsewhere has no row here, and a teacher with **no home department** has no row in any department (their coverage is in the "Unresolved" group) | a row for a teacher who is not one of this department's faculty |

---

## 4. The results surfaces — `/admin/evaluations/results` and the department page

| # | Check | What "wrong" looks like |
|---|---|---|
| 4.1 | The **breadcrumb** reads `Admin / Evaluations / Results / Computer Science (BSCS) / Juan Dela Cruz — CS101 Intro` | a GUID in the trail, or a dead "Unassigned" link |
| 4.2 | The department list's **"Faculty"** count is the department's **headcount** — the same number the Admin > Faculty list shows for that department | a number that differs from the faculty list, or one that counts a teacher homed elsewhere |
| 4.2b | **Every** department is a row — a department with no responses in the period shows "—" for its rating, and its headcount | a department missing from the list |
| 4.3 | Clicking the department crumb on a detail page returns to that department **with the period intact** | an empty page, or "periodId is required" |
| 4.4 | The detail page's **faculty cards** list the department's **own** faculty — **every member, with or without results** (a member with no responses still has a card, with nothing on it) — and each card expands to that faculty's subjects. The card's **"Faculty"** number equals the number of cards below it AND the list's **"Faculty"** for the same department | a card for a teacher who is not in this department's faculty list; a member without results with no card; the card's Faculty differing from the list's |
| 4.4b | The detail page's card shows **no** subject count and **no** response count, and the cards show no "N responses" — the **coverage** page owns the counts (a bare count invites "out of how many?") | a count on a results surface |
| 4.4c | A **"Needs Attention Rubric"** appears on the card only when the weakest rubric is **"Unsatisfactory" or worse** (below 2.5) — a weakest criterion of 3.0 shows no such cell | a "needs attention" badge on a satisfactory criterion; a weak criterion with no badge |
| 4.5 | A teacher homed elsewhere who teaches a section here appears **in their own department** on every surface — the coverage page and the results pages agree | a subject filed under the section's department on either page |
| 4.6 | The list has **no** "No responses" or "Responses" column — those numbers live on the coverage page | a column that is back on the results list |
| 4.7 | The **"Export"** button (download glyph) produces a ZIP whose per-department CSVs hold the **results** (a member's subject with no responses is not a row in the CSV), and whose `summary.csv` "Faculty Count" is the same headcount | an empty folder, a 500 toast, a summary count that differs from the page, or an empty row in a CSV |
| 4.8 | The department page's **Avg Rating**, **Highest Rubric** and **Lowest Rubric** for a subject are **the same numbers** the faculty sees on their own page for that subject (`/faculty/evaluations/results/<facultySubjectId>`) | a different average, a different winning rubric, or a "—" for a subject that has responses — a truncated read is a *wrong* figure, not a missing one |

---

## 5. The dean's results surfaces — `/dean/evaluations/results`

| # | Check | What "wrong" looks like |
|---|---|---|
| 5.1 | The page opens on the dean's own department | the department list, or another department's data |
| 5.2 | The dean's **"Faculty"** count and their results page agree with the admin's view of the same department | the two differ |
| 5.3 | The dean can open a subject in their department | 403 |
| 5.4 | The dean **cannot** open a subject in another department (change the id in the URL) | a 200 with another department's data |
| 5.4b | The dean **cannot** open another department's subject under **their own** department's id — the subject's teacher is homed elsewhere, and the route says so | a 200 with another department's responses, under the dean's own department's name |
| 5.5 | The dean's show/hide-results toggle works for their own teachers, and refuses another department's | a 403 on their own teacher, or a 200 for another department's |

---

## 6. The one number no test can give you

Two checks are left to you, because no test can read your data.

**The headcount (2026-10-20).** A department's faculty count is the number
of faculty accounts homed in it (`users.departmentId`), soft-deleted
excluded, counted once — the same number on the results list, the coverage
page's "Faculties" column and KPI, the export `summary.csv`, the report page
and the Department Health report. Check it once: pick a department, read its
"Faculty" on the results list, and compare it with the same department's
faculty in **Admin > Faculty**. They must be the same number, and the
coverage KPI must equal the Admin dashboard's school-wide "Faculty" card.

**The home-less teachers (§7 of this note's companion, below)** are the only
rows the attribution rule moves. A teacher homed in a real department owns
their subjects there, whoever owns the section; a teacher with **no home
department** owns none, so their subjects are unattributed and surface in the
coverage page's "Unresolved" group and the results list's integrity warning.
Run the check once per period you care about; it is the only way to know
whether the rule changed anything real.

---

## 7. The home-less teachers

Run it in the Supabase SQL editor, per evaluation period.

```sql
select
  coalesce(hd.name, '(no home dept)') as home_dept,
  count(distinct fs.id) as subject_rows,
  count(distinct fs.faculty_id) as teachers,
  count(distinct e.id) as evaluations
from faculty_subjects fs
join users u on u.id = fs.faculty_id
left join departments hd on hd.id = u."departmentId"
left join evaluations e
  on e."facultySubjectId" = fs.id
 and e.evaluation_period_id = '<periodId>'
 and e.status = 'SUBMITTED' and e."isDisabled" = false
where fs."semesterId" = '<semesterId>'
group by 1
order by 2 desc;
```

**How to read it**

| Row | Meaning |
|---|---|
| home = a real department | the ordinary case — the teacher owns their subjects, whoever owns the section. Nothing moves. |
| home = a placeholder bucket ("Unassigned", "Admin") | the teacher is a member of that bucket, so their subjects are counted there — the bucket holds its own members' teaching and nobody else's. |
| home = '(no home dept)' | **the only rows that move.** These teachers have no department, so their subjects are unattributed: the coverage page's "Unresolved" group and the results list's integrity warning name them, and no department's row counts them. |

**The number that matters** is the `subject_rows` (and `evaluations`) in the
"(no home dept)" row: it is how much coverage leaves the departments. If it is
zero, the rule was a no-op on your data and you can stop worrying about it.
If it is not, compare one period before and after with the check lists above,
and expect the *departments* to look different while the *totals* stay the
same.

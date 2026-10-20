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
| 3.1 | The department table lists every department, with **"Depts reporting"** and the "No responses" column | a department missing, or "No responses" reading 0 for a department with a silent teacher |
| 3.2 | Clicking a department opens the drill-down with the **two groupings** | only one tab, or a tab that does nothing |
| 3.3 | "By Subject & Section" shows the **Section** column | a section-less table (two rows for one teacher and subject in different sections are indistinguishable) |
| 3.4 | "By Faculty" cards expand to their subjects, each with the section and a **Details** action | a card that shows counts but no subjects |
| 3.5 | A teacher with **no** responses anywhere shows up in the **"No responses"** count | a silent teacher missing from the count |
| 3.6 | The "Unresolved" group reports the faculty it holds, not 0 | "0" next to a non-empty group |
| 3.7 | The integrity warning appears **only** when a period really has an unresolvable or off-semester evaluation | a permanent warning on a clean period |

---

## 4. The results surfaces — `/admin/evaluations/results` and the department page

| # | Check | What "wrong" looks like |
|---|---|---|
| 4.1 | The **breadcrumb** reads `Admin / Evaluations / Results / Computer Science (BSCS) / Juan Dela Cruz — CS101 Intro` | a GUID in the trail, or a dead "Unassigned" link |
| 4.2 | The department list's **"Faculty"** count matches the distinct faculty on that department's detail page | the two numbers differ |
| 4.3 | Clicking the department crumb on a detail page returns to that department **with the period intact** | an empty page, or "periodId is required" |
| 4.4 | The detail page's **"By Faculty"** cards and **"By Subject & Section"** rows list the same people | a teacher on one view and not the other |
| 4.5 | A teacher homed elsewhere who teaches a section here appears **in their own department** on every surface — the coverage page and the results pages agree | a subject filed under the section's department on either page |
| 4.6 | The **"No responses"** count lists the teachers who received nothing | a name that does not belong to the department |
| 4.7 | The **"Export"** button (download glyph) produces a ZIP whose per-department CSVs match the pages | an empty folder, or a 500 toast |

---

## 5. The dean's results surfaces — `/dean/evaluations/results`

| # | Check | What "wrong" looks like |
|---|---|---|
| 5.1 | The page opens on the dean's own department | the department list, or another department's data |
| 5.2 | The dean's **"Faculty"** count and their results page agree with the admin's view of the same department | the two differ |
| 5.3 | The dean can open a subject in their department | 403 |
| 5.4 | The dean **cannot** open a subject in another department (change the id in the URL) | a 200 with another department's data |
| 5.5 | The dean's show/hide-results toggle works for their own teachers, and refuses another department's | a 403 on their own teacher, or a 200 for another department's |

---

## 6. The one number no test can give you

The **home → section matrix** (§7 of this note's companion, below) says how
many rows the faculty-driven attribution actually moved on your data. Run it
once per period you care about; it is the only way to know whether the rule
changed anything real.

---

## 7. The home → section matrix

Run it in the Supabase SQL editor, per evaluation period.

```sql
with ev as (
  select distinct fs.id as fs_id, fs.faculty_id, fs.section_id
  from evaluations e
  join faculty_subjects fs on fs.id = e."facultySubjectId"
  where e."evaluation_period_id" = '<periodId>'
    and e.status = 'SUBMITTED' and e."isDisabled" = false
)
select
  coalesce(hd.name, '(no home dept)') as home_dept,
  coalesce(sd.name, '(no section dept)') as section_dept,
  count(*) as subject_rows,
  count(distinct ev.faculty_id) as teachers
from ev
join users u on u.id = ev.faculty_id
left join departments hd on hd.id = u."departmentId"
left join sections s on s.id = ev.section_id
left join department_courses dc on dc.id = s."departmentCourseId"
left join departments sd on sd.id = dc."departmentId"
group by 1, 2
order by 1, 2;
```

**How to read it**

| Row | Meaning |
|---|---|
| home = section | the ordinary case — the teacher teaches in their own department. Nothing moves. |
| home ≠ section, both real | the teacher's home is a different academic department. On **every** surface the subject belongs to the **teacher's** department; the section's department is only the fallback for a teacher who cannot own coverage. Expect a small number of these — a teacher genuinely teaching outside their department. |
| home = a placeholder bucket ("Unassigned", "Admin") | the CSV could not place the teacher. Their coverage now falls back to the section's department, so those buckets stop accumulating everyone's coverage. |
| home = '(no home dept)' | the dummy account and CSV rows with no department — the same fallback applies. |
| section = '(no section dept)' | a section with no department course — a data defect; the row lands in the "Unresolved" group and the integrity warning names it. |

**The number that matters** is the sum of the `subject_rows` in the
"home ≠ section" rows: it is how many subject rows the attribution moved
between departments. If it is zero, the attribution change was a no-op on
your data and you can stop worrying about it. If it is large, compare one
period before and after with the check lists above, and expect the
*departments* to look different while the *totals* stay the same.

import { query } from "@/lib/db/postgres"

/**
 * The rating aggregates, computed in Postgres.
 *
 * These are plain parameterised queries over the direct connection
 * (`lib/db/postgres.ts`): the group-by happens in the database and the rows
 * come back already grouped. **Nothing is created in the database** — no
 * function to install, no schema cache to refresh, no migration to run.
 *
 * The queries carry the app's own rules and nothing else — the period, the
 * SUBMITTED and enabled evaluations, the live-eval rule, and the teacher's
 * home department. **No display rule lives here**: the category names come
 * back raw and TypeScript maps them to their columns.
 */

/**
 * One row per assignment: how many responses it has, and the sum and the
 * count of its ratings per rubric category.
 *
 * The category totals come back as JSONB — one row per assignment instead of
 * one row per (assignment, category), because the respondent count and the
 * category totals are different grains and a single result set has one.
 */
export const DEPARTMENT_TOTALS_SQL = `
  with scoped as (
    select e.id,
           e."facultySubjectId" as fs_id,
           fs.faculty_id,
           u."departmentId"    as department_id
    from evaluations e
    join faculty_subjects fs on fs.id = e."facultySubjectId"
    join users u             on u.id  = fs.faculty_id
    where e.evaluation_period_id = $1
      and e.status = 'SUBMITTED'
      and e."isDisabled" = false
      and e."facultySubjectId" is not null
      and fs.faculty_id = e."evaluateeId"
  ),
  totals as (
    select sc.fs_id,
           rc.name as category_name,
           sum(r.rating)::double precision as rating_sum,
           -- The count goes into a JSONB object, so it stays a JSON number.
           count(*)::int as rating_count
    from scoped sc
    join evaluation_ratings r  on r."evaluationId" = sc.id
    join rubric_items ri       on ri.id = r."itemId"
    join rubric_categories rc  on rc.id = ri."categoryId"
    group by sc.fs_id, rc.name
  )
  select s.department_id,
         s.fs_id as faculty_subject_id,
         s.faculty_id,
         -- int, not bigint: node-postgres hands a bigint back as a string.
         count(distinct s.id)::int as respondent_count,
         coalesce(
           jsonb_object_agg(
             t.category_name,
             jsonb_build_object('sum', t.rating_sum, 'count', t.rating_count)
           ) filter (where t.category_name is not null),
           '{}'::jsonb
         ) as category_totals
  from scoped s
  left join totals t on t.fs_id = s.fs_id
  group by s.department_id, s.fs_id, s.faculty_id
`

/**
 * One row per (department, teacher): the sum and the count of the comment
 * sentiment scores. The pool is the teacher's responses across the period —
 * the same population the results list reads today.
 */
export const DEPARTMENT_SENTIMENT_SQL = `
  with scoped as (
    select e.id,
           fs.faculty_id,
           u."departmentId" as department_id
    from evaluations e
    join faculty_subjects fs on fs.id = e."facultySubjectId"
    join users u             on u.id  = fs.faculty_id
    where e.evaluation_period_id = $1
      and e.status = 'SUBMITTED'
      and e."isDisabled" = false
      and e."facultySubjectId" is not null
      and fs.faculty_id = e."evaluateeId"
  ),
  roster as (
    select distinct department_id, faculty_id from scoped
  ),
  scored as (
    select r.faculty_id,
           c."sentimentScore" as score
    from roster r
    join evaluations e
      on e."evaluateeId" = r.faculty_id
     and e.evaluation_period_id = $1
     and e.status = 'SUBMITTED'
     and e."isDisabled" = false
     and e."facultySubjectId" is not null
    join evaluation_comments c on c."evaluationId" = e.id
    where c."sentimentScore" is not null
  )
  select r.department_id,
         s.faculty_id,
         sum(s.score)::double precision as sentiment_sum,
         -- int, not bigint: node-postgres hands a bigint back as a string.
         count(*)::int as sentiment_count
  from scored s
  join roster r on r.faculty_id = s.faculty_id
  group by r.department_id, s.faculty_id
`

/**
 * One row per assignment that has an evaluation in the period: the teacher, the
 * teacher's home department (null when they have none) and the assignment's
 * semester. These are the facts the attribution warnings are classified from —
 * the classification itself stays in TypeScript.
 */
export const ATTRIBUTION_WARNINGS_SQL = `
  select distinct fs.id as faculty_subject_id, fs.faculty_id, u."departmentId" as department_id, fs."semesterId" as semester_id
  from evaluations e
  join faculty_subjects fs on fs.id = e."facultySubjectId"
  join users u             on u.id  = fs.faculty_id
  where e.evaluation_period_id = $1
    and e.status = 'SUBMITTED'
    and e."isDisabled" = false
    and e."facultySubjectId" is not null
`

/** One assignment's category totals: the raw category name -> sum and count. */
export type CategoryTotals = Record<string, { sum: number; count: number }>

export interface DepartmentTotalRow {
  department_id: string | null
  faculty_subject_id: string
  faculty_id: string
  respondent_count: number
  category_totals: CategoryTotals | null
}

export interface DepartmentSentimentRow {
  department_id: string | null
  faculty_id: string
  sentiment_sum: number
  sentiment_count: number
}

/** One assignment with an evaluation in the period, and where it counts. */
export interface AttributionWarningRow {
  faculty_subject_id: string
  faculty_id: string
  department_id: string | null
  semester_id: string | null
}

/** The rating totals for a period: one row per assignment. */
export function fetchDepartmentTotals(evaluationPeriodId: string): Promise<DepartmentTotalRow[]> {
  return query<DepartmentTotalRow>(DEPARTMENT_TOTALS_SQL, [evaluationPeriodId])
}

/** The sentiment totals for a period: one row per (department, teacher). */
export function fetchDepartmentSentiment(evaluationPeriodId: string): Promise<DepartmentSentimentRow[]> {
  return query<DepartmentSentimentRow>(DEPARTMENT_SENTIMENT_SQL, [evaluationPeriodId])
}

/** The assignments with an evaluation in the period, and where they count. */
export function fetchAttributionWarnings(evaluationPeriodId: string): Promise<AttributionWarningRow[]> {
  return query<AttributionWarningRow>(ATTRIBUTION_WARNINGS_SQL, [evaluationPeriodId])
}

import { buildEvaluationWorkbook } from "./workbook"
import type { OverallResponse } from "./overall"

/**
 * The subject's WORKBOOK — the shared builder.
 *
 * ⭐ One place where a subject-section's workbook is assembled: the three
 * shipping export routes call it, and the department ZIP calls it once per
 * subject-section. ⭐ Before this module the assembly lived in the route —
 * copying it into the export would have been a **second implementation of a
 * shipped artifact**, and the drift it invites is invisible until a school
 * opens the file.
 *
 * ⭐ The input is **structural**: it does not import the service's types, so
 * `lib/` never depends on `features/` (the layering stays app → features → lib).
 */

/** The rubric's categories, with their statements. */
export interface RubricCategoryInput {
  /** the criterion's name — the rubric's own */
  name: string
  /** the criterion's statements */
  items?: { id: string; text: string }[]
}

/** What the builder needs — the subject's own result set, in shape. */
export interface SubjectWorkbookInput {
  /** the teacher */
  faculty: { name: string; employeeNo: string | null } | null
  /** the subject */
  subject: { code: string; name: string } | null
  /** the section */
  section: { program: string | null; name: string | null }
  /** the period */
  period: { name: string | null; semesterTitle: string | null }
  /** the figures */
  summary: {
    totalRespondents: number
    avgRating: number | null
    remarks: string | null
    /** the criterion averages, keyed by the rubric's category name */
    categoryAverages: Record<string, number>
  }
  /** the per-statement averages */
  itemAverages: { itemId: string; avg: number }[]
  /** the comments */
  comments: { comment: string }[]
  /** the per-response rows */
  evaluations: OverallResponse[]
}

/**
 * The workbook — the form, the Comments sheet and the Overall sheet.
 *
 * ⭐ The rubric is the source of truth for the LAYOUT: the form's criteria are
 * the rubric's categories, and each statement's value is that statement's own
 * average. ⭐ Nothing assumes a criterion count — a rubric with nine
 * categories makes a nine-criterion form.
 */
export function buildSubjectWorkbook(
  input: SubjectWorkbookInput,
  rubricCategories: RubricCategoryInput[],
  logo: Uint8Array | null,
): Uint8Array {
  const itemByStatement = new Map(input.itemAverages.map((item) => [item.itemId, item]))
  const criteria = rubricCategories.map((category) => ({
    name: category.name,
    average: input.summary.categoryAverages[category.name] ?? null,
    statements: (category.items ?? []).map((item) => ({
      text: item.text,
      avg: itemByStatement.get(item.id)?.avg ?? null,
    })),
  }))

  return buildEvaluationWorkbook({
    form: {
      semesterTitle: input.period.semesterTitle,
      evaluationPeriodName: input.period.name,
      employeeNo: input.faculty?.employeeNo ?? null,
      facultyName: input.faculty?.name ?? "Unknown",
      program: input.section.program,
      sectionName: input.section.name,
      subject: input.subject ? { code: input.subject.code, name: input.subject.name } : null,
      avgRating: input.summary.avgRating,
      remarks: input.summary.remarks,
      totalRespondents: input.summary.totalRespondents,
      criteria,
    },
    // ⭐ the letterhead is decoration — a missing logo must not fail the export
    logo,
    // the Comments sheet: the texts only (no date, by the owner's decision)
    comments: input.comments.map((comment) => comment.comment),
    // ⭐ the rows carry the LIVE per-response map, so the Overall sheet's
    // columns follow the rubric with the values under them — no second query
    responses: input.evaluations,
  })
}

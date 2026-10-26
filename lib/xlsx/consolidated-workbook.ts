import { renderCommentsSheet } from "./comments"
import { buildFormModel, type FormInput, type FormRow } from "./form-model"
import { renderIndividualSheet } from "./individual"
import { renderOverallSheet, type OverallModel } from "./overall"
import { type SummaryRubricCategory, type FacultySummaryModel } from "./overall-summary"
import { buildWorkbook } from "./writer"

/**
 * The CONSOLIDATED faculty workbook — one faculty's whole term in one file.
 *
 * ⭐ The Individual sheet keeps the legacy form layout and only changes the
 * scope: it is one faculty-level workbook, not a subject-section form. The
 * Comments and Overall sheets are the same shipping models, in the same tab
 * order, and the Overall sheet remains exactly as it already was.
 */

export interface ConsolidatedFacultyWorkbookInput {
  individual: FacultySummaryModel
  comments: FormRow[]
  overall: OverallModel
  itemAverages?: Record<string, number>
  rubricCategories?: SummaryRubricCategory[]
  form?: FormInput
}

function mean(values: Array<number | null | undefined>): number | null {
  const scores = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

/** The consolidated workbook, as bytes. */
export function buildConsolidatedFacultyWorkbook(
  input: ConsolidatedFacultyWorkbookInput,
): Uint8Array {
  const form = input.form ?? {
    semesterTitle: input.individual.header[1]?.text.replace("Semester: ", "") || null,
    evaluationPeriodName: input.individual.header[2]?.text.replace("Evaluation Period: ", "") || null,
    employeeNo: null,
    facultyName: input.individual.band[0]?.kind === "label" ? input.individual.band[0].text : null,
    avgRating: input.individual.band[2]?.kind === "text"
      ? Number(input.individual.band[2].text.replace("Average: ", "").split(" — ")[0]) || null
      : null,
    remarks: input.individual.band[2]?.kind === "text"
      ? input.individual.band[2].text.includes("—")
        ? input.individual.band[2].text.split(" — ")[1] || null
        : null
      : null,
    program: null,
    sectionName: null,
    subject: null,
    totalRespondents: input.individual.rows.reduce((sum, row) => sum + (typeof row.cells[2] === "number" ? row.cells[2] : 0), 0),
    criteria: (input.rubricCategories ?? []).map((category) => {
      const index = input.overall.columns.findIndex(
        (column) => column.kind === "criterion" && column.heading === category.name,
      )
      return {
        name: category.name,
        average: mean(input.overall.rows.map((row) => row.values[index] ?? null)),
        statements: category.items.map((item) => ({
          text: item.text,
          avg: input.itemAverages?.[item.id] ?? null,
        })),
      }
    }),
  }

  const rows = buildFormModel(form)
  const titleRow = rows.find((row) => row.kind === "title")
  if (titleRow && titleRow.kind === "title") {
    titleRow.text = "FACULTY PERFORMANCE EVALUATION RESULT (POST-EVALUATION)"
  }

  return buildWorkbook({
    sheets: [
      renderIndividualSheet({ rows }),
      renderCommentsSheet(input.comments),
      renderOverallSheet(input.overall),
    ],
  })
}

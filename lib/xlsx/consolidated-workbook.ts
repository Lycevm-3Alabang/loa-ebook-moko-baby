import { renderCommentsSheet } from "./comments"
import type { FormRow } from "./form-model"
import { renderOverallSheet, type OverallModel } from "./overall"
import {
  renderFacultySummarySheet,
  type SummaryRubricCategory,
  type FacultySummaryModel,
} from "./overall-summary"
import { APP_RUBRIC } from "@/lib/__tests__/fixtures/eval-rubric"
import { buildWorkbook } from "./writer"

/**
 * The CONSOLIDATED faculty workbook — one faculty's whole term in one file.
 *
 * ⭐ It is a COMPOSITION, not a fourth form renderer: the three sheets are the
 * shipping models, drawn by their shipping renderers, in the legacy's tab
 * order (Individual, Comments, Overall). That is what keeps the school's
 * artifact from drifting — there is still one renderer per sheet.
 *
 * ⭐ The faculty grain changes the SCOPE of a sheet, never its kind:
 * - the Individual is the shipping faculty summary, renamed;
 * - the Comments are the shipping model with a group banner per subject-section;
 * - the Overall is the shipping model with SUBJECT and SECTION columns.
 *
 * ⭐ No letterhead: the consolidated file is data, not the signed form. The
 * writer carries no media, so no drawing part is written at all.
 */

/** What the consolidated workbook is built from — three finished models. */
export interface ConsolidatedFacultyWorkbookInput {
  /** the Individual tab — the faculty summary's model */
  individual: FacultySummaryModel
  /** the Comments tab — the identity block, the banner and the groups */
  comments: FormRow[]
  /** the Overall tab — one row per response across the faculty */
  overall: OverallModel
  /** per-item arithmetic means across the faculty's valid responses */
  itemAverages?: Record<string, number>
  /** the evaluation period's rubric, in display order */
  rubricCategories?: SummaryRubricCategory[]
}

/** The consolidated workbook, as bytes. */
export function buildConsolidatedFacultyWorkbook(
  input: ConsolidatedFacultyWorkbookInput,
): Uint8Array {
  // ⭐ NEW — compute overall category averages from all responses,
  // so the Individual sheet's rubric blocks display the mean score
  // across ALL subject-sections (not per-section). This matches the
  // requirement: "it averages ALL regardless of subject-section".
  // Each OverallDataRow.values[i] holds the per-criterion average for that response.
  const criteria = input.overall.columns.filter((column) => column.kind === "criterion")
  const categoryAverages: Record<string, number> = {}
  for (const [index, criterion] of criteria.entries()) {
    const scores = input.overall.rows
      .map((row) => row.values[index])
      .filter((v): v is number => typeof v === "number")
    if (scores.length > 0) {
      categoryAverages[criterion.heading] = scores.reduce(
        (sum, s) => sum + s,
        0,
      ) / scores.length
    }
  }

  return buildWorkbook({
    sheets: [
      renderFacultySummarySheet(
        input.individual,
        "Individual",
        categoryAverages,
        input.itemAverages,
        input.rubricCategories,
      ),
      renderCommentsSheet(input.comments),
      renderOverallSheet(input.overall),
    ],
  })
}

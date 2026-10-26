import { renderCommentsSheet } from "./comments"
import type { FormRow } from "./form-model"
import { renderOverallSheet, type OverallModel } from "./overall"
import {
  renderFacultySummarySheet,
  type FacultySummaryModel,
} from "./overall-summary"
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
}

/** The consolidated workbook, as bytes. */
export function buildConsolidatedFacultyWorkbook(
  input: ConsolidatedFacultyWorkbookInput,
): Uint8Array {
  return buildWorkbook({
    sheets: [
      renderFacultySummarySheet(input.individual, "Individual"),
      renderCommentsSheet(input.comments),
      renderOverallSheet(input.overall),
    ],
  })
}

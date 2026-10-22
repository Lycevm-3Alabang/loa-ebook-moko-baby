import { buildCommentsModel, renderCommentsSheet } from "./comments"
import { buildFormModel, type FormInput } from "./form-model"
import { renderIndividualSheet } from "./individual"
import { buildOverallModel, renderOverallSheet, type OverallResponse } from "./overall"
import { pngAspect } from "./png"
import { buildWorkbook } from "./writer"

/**
 * The export's WORKBOOK — the model, the renderer and the writer, together.
 *
 * Each of the three is pure: the model says what the form IS, the renderer
 * says how it is drawn, and the writer turns a sheet into a package. This
 * module is the glue, and it is still pure: the letterhead's BYTES come in as
 * an input, so nothing here reads the filesystem.
 *
 * ⭐ The three sheets are the legacy's three sheets, in the legacy's tab order
 * (Individual, Comments, Overall) — the school opens the workbook and expects
 * that order.
 */

/** What the workbook is built from. */
export interface EvaluationWorkbookInput {
  /** the Individual form's content */
  form: FormInput
  /** the letterhead's bytes — null when the file could not be read */
  logo: Uint8Array | null
  /** the Comments sheet's rows — one comment's text each */
  comments: string[]
  /** the Overall sheet's rows — one per response */
  responses: OverallResponse[]
}

/** The media entry the letterhead lives in. */
export const LETTERHEAD_MEDIA = "image1.png"

/** The export's workbook, as bytes. */
export function buildEvaluationWorkbook(input: EvaluationWorkbookInput): Uint8Array {
  const { form, logo, comments, responses } = input

  const individual = renderIndividualSheet({
    rows: buildFormModel(form),
    logoMedia: logo ? LETTERHEAD_MEDIA : undefined,
    logoAspect: logo ? pngAspect(logo) : undefined,
  })

  const commentsSheet = renderCommentsSheet(buildCommentsModel(form, comments))

  const overallSheet = renderOverallSheet(
    buildOverallModel({
      semesterTitle: form.semesterTitle,
      facultyName: form.facultyName,
      subject: form.subject,
      // ⭐ THE SAME RUBRIC — the form's criterion names ARE the rubric's names,
      // so the Individual's headings and the Overall's columns cannot disagree
      criteria: form.criteria.map((criterion) => ({ name: criterion.name })),
      responses,
    }),
  )

  return buildWorkbook({
    sheets: [individual, commentsSheet, overallSheet],
    media: logo ? [{ name: LETTERHEAD_MEDIA, bytes: logo }] : [],
  })
}

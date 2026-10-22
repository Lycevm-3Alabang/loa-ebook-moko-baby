import { buildFormModel, type FormInput } from "./form-model"
import { renderIndividualSheet } from "./individual"
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
 * ⭐ The Comments and the Overall sheets join here, as the next two models and
 * renderers land — the workbook's name is already the export's, not the
 * Individual sheet's.
 */

/** What the workbook is built from. */
export interface EvaluationWorkbookInput {
  /** the Individual form's content */
  form: FormInput
  /** the letterhead's bytes — null when the file could not be read */
  logo: Uint8Array | null
}

/** The media entry the letterhead lives in. */
export const LETTERHEAD_MEDIA = "image1.png"

/** The export's workbook, as bytes. */
export function buildEvaluationWorkbook(input: EvaluationWorkbookInput): Uint8Array {
  const rows = buildFormModel(input.form)
  const logo = input.logo

  const sheet = renderIndividualSheet({
    rows,
    logoMedia: logo ? LETTERHEAD_MEDIA : undefined,
    logoAspect: logo ? pngAspect(logo) : undefined,
  })

  return buildWorkbook({
    sheets: [sheet],
    media: logo ? [{ name: LETTERHEAD_MEDIA, bytes: logo }] : [],
  })
}

import type { CellSpec } from "./writer"
import type { FormRow } from "./form-model"

/**
 * The form's cell layouts, shared by the sheets.
 *
 * Two renderers drawing the same row is how the legacy drifted: the cut added
 * the Program and the Section to the Comments sheet, and the Section landed on
 * the banner's row, whose merge swallowed it. So the layouts live here, once.
 */

/** The form's nine columns. */
export const COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]

/** A cell. */
export function cell(
  row: number,
  col: string,
  style: CellSpec["style"],
  value?: string | number | null,
): CellSpec {
  return { ref: `${col}${row}`, style, value: value ?? null }
}

/** A row of cells in one style; the value goes in the first of them. */
export function spread(
  row: number,
  style: CellSpec["style"],
  value: string | number | null,
  columns: string[] = COLUMNS,
): CellSpec[] {
  return columns.map((col, i) => cell(row, col, style, i === 0 ? value : null))
}

/**
 * A field row — the label in A, its value merged across B:F, and the right
 * half's label in G with its value merged across H:I.
 */
export function fieldCells(
  row: number,
  model: Extract<FormRow, { kind: "field" | "fieldPair" }>,
): CellSpec[] {
  const left = model.kind === "field" ? model : model.left
  const right = model.kind === "fieldPair" ? model.right : null
  // a number prints with the rating's two-decimal format; a text does not
  const rightStyle = right && typeof right.value === "number" ? "ratingValue" : "remarksValue"
  return [
    cell(row, "A", "fieldLabel", left.label),
    cell(row, "B", "fieldValue", left.value),
    cell(row, "C", "fieldValue"),
    cell(row, "D", "fieldValue"),
    cell(row, "E", "fieldValue"),
    cell(row, "F", "fieldValue"),
    cell(row, "G", "fieldValueRight", right ? right.label : null),
    cell(row, "H", right ? rightStyle : "fieldValue", right ? right.value : null),
    cell(row, "I", right ? rightStyle : "fieldValue"),
  ]
}

/** The merges a field row declares. */
export function fieldMerges(
  row: number,
  model: Extract<FormRow, { kind: "field" | "fieldPair" }>,
): string[] {
  const merges = [`B${row}:F${row}`]
  if (model.kind === "fieldPair") merges.push(`H${row}:I${row}`)
  return merges
}

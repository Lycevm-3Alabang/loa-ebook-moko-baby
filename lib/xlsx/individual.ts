import { EMU_PER_MM, type PictureSpec, type RowSpec, type SheetSpec } from "./writer"
import { ROW_ONE_LINE, type FormRow } from "./form-model"
import type { StyleToken } from "./styles"
import { COLUMNS, cell, fieldCells, fieldMerges, spread } from "./rows"

/**
 * The Individual sheet's RENDERER — the model drawn as the sheet.
 *
 * The model says what the form IS; this says how it is drawn: which cells
 * carry which style, which ranges are merged, how wide the columns are and
 * where the letterhead hangs.
 *
 * ⭐ A MERGE IS NOT DECORATION — it is the cell's extent. "AVERAGE" is not a
 * cell; it is `A15:H15`, one cell spanning eight columns, so the text has room
 * and the box has one border. So every row is written as NINE styled cells
 * and then the merges are declared: a merged range's borders and fills come
 * from the cells themselves, which is why an empty cell in a styled row still
 * carries the row's style.
 */

/** The columns' widths — the legacy's own. */
const COLUMN_SPECS = [
  { from: "A", to: "A", width: 16.14 },
  { from: "B", to: "H", width: 9.14 },
  { from: "I", to: "I", width: 9.71 },
]

/** The same widths, per column — the anchor's arithmetic needs them. */
const COLUMN_WIDTHS = [16.14, 9.14, 9.14, 9.14, 9.14, 9.14, 9.14, 9.14, 9.71]

const EMU_PER_PX = 9525
const EMU_PER_PT = 12700
const MDW = 7 // the max digit width of Calibri 11 - excel's column unit
const LOGO_WIDTH_MM = 50 // the same width the PDF's letterhead uses

const widthToPx = (width: number) => Math.round(width * MDW + 5)

/** The left edge of every column, in EMU from the sheet's left edge. */
function columnEdges(widths: number[]): number[] {
  const edges = [0]
  let x = 0
  for (const width of widths) {
    x += widthToPx(width) * EMU_PER_PX
    edges.push(x)
  }
  return edges
}

/** The column an EMU offset falls in, and the offset into it. */
function locateColumn(edges: number[], emu: number): { col: number; colOff: number } {
  for (let i = 0; i < edges.length - 1; i++) {
    if (emu < edges[i + 1]) return { col: i, colOff: emu - edges[i] }
  }
  const last = edges.length - 2
  return { col: last, colOff: edges[edges.length - 1] - edges[last] }
}

/**
 * The letterhead's anchor — centred over the form, at the image's own aspect.
 *
 * A drawing's anchor is a COLUMN INDEX plus an offset into that column, in
 * EMU. An offset wider than its own column is how a picture lands in the
 * wrong place, so it is checked here.
 */
function letterheadPicture(media: string, aspect: number, bandHeightPoints: number): PictureSpec {
  const bandHeight = bandHeightPoints * EMU_PER_PT
  const edges = columnEdges(COLUMN_WIDTHS)
  const blockWidth = edges[edges.length - 1]
  const cx = LOGO_WIDTH_MM * EMU_PER_MM
  const cy = Math.round(cx / aspect)
  if (cy > bandHeight) throw new Error("the letterhead does not fit in the band")
  const left = Math.round((blockWidth - cx) / 2)
  const top = Math.round((bandHeight - cy) / 2)
  const at = locateColumn(edges, left)
  if (at.colOff >= edges[at.col + 1] - edges[at.col]) {
    throw new Error("the letterhead's column offset is wider than its column")
  }
  return {
    media,
    from: { col: at.col, colOff: at.colOff, row: 0, rowOff: top },
    ext: { cx, cy },
  }
}

/** What the renderer needs to draw the sheet. */
export interface IndividualSheetInput {
  /** the model's rows */
  rows: FormRow[]
  /** the media entry the letterhead lives in — omit it and the sheet carries no picture */
  logoMedia?: string
  /** the letterhead's aspect — its width over its height */
  logoAspect?: number
}

/** The Individual sheet, drawn from the model. */
export function renderIndividualSheet(input: IndividualSheetInput): SheetSpec {
  const rows: RowSpec[] = []
  const merges: string[] = []

  input.rows.forEach((model, index) => {
    const row = index + 1

    switch (model.kind) {
      case "band":
        rows.push({ row, height: model.height, cells: spread(row, "band", null) })
        merges.push(`A${row}:I${row}`)
        break

      case "title":
        rows.push({ row, height: ROW_ONE_LINE, cells: spread(row, "title", model.text) })
        merges.push(`A${row}:I${row}`)
        break

      case "subtitle":
        rows.push({ row, height: ROW_ONE_LINE, cells: spread(row, "subtitle", model.text) })
        merges.push(`A${row}:I${row}`)
        break

      case "field":
      case "fieldPair":
        rows.push({ row, height: ROW_ONE_LINE, cells: fieldCells(row, model) })
        merges.push(...fieldMerges(row, model))
        break

      case "criterion":
        rows.push({
          row,
          height: ROW_ONE_LINE,
          cells: [
            ...spread(row, "criterion", model.heading, COLUMNS.slice(0, 8)),
            cell(row, "I", "criterionRating", "RATING"),
          ],
        })
        merges.push(`A${row}:H${row}`)
        break

      case "statement": {
        const style: StyleToken = model.first ? "statementFirst" : "statement"
        rows.push({
          row,
          height: model.height,
          cells: [
            ...spread(row, style, model.text, COLUMNS.slice(0, 8)),
            cell(row, "I", "statementRating", model.value),
          ],
        })
        merges.push(`A${row}:H${row}`)
        break
      }

      case "average":
        rows.push({
          row,
          height: ROW_ONE_LINE,
          cells: [
            ...spread(row, "averageLabel", model.label, COLUMNS.slice(0, 8)),
            cell(row, "I", "averageValue", model.value),
          ],
        })
        merges.push(`A${row}:H${row}`)
        break

      case "spacer":
        rows.push({ row, height: ROW_ONE_LINE, cells: spread(row, "spacer", null) })
        break

      case "total":
        rows.push({
          row,
          height: ROW_ONE_LINE,
          cells: [
            ...spread(row, "totalLabel", null, COLUMNS.slice(0, 7)),
            cell(row, "H", "totalLabel", model.label),
            cell(row, "I", "totalValue", model.value),
          ],
        })
        break

      case "final":
        rows.push({
          row,
          height: ROW_ONE_LINE,
          cells: [
            ...spread(row, "finalLabel", null, COLUMNS.slice(0, 6)),
            cell(row, "G", "finalLabel", model.label),
            cell(row, "H", "finalLabel"),
            cell(row, "I", "finalValue", model.value),
          ],
        })
        merges.push(`G${row}:H${row}`)
        break

      default:
        throw new Error(`the Individual sheet has no "${model.kind}" row`)
    }
  })

  // ── the header block's length — the rows that repeat on every page ────────
  const firstCriterion = input.rows.findIndex((r) => r.kind === "criterion")
  const headerRows = firstCriterion === -1 ? input.rows.length : firstCriterion

  // ── the letterhead ────────────────────────────────────────────────────────
  const band = input.rows.find((r) => r.kind === "band")
  const bandHeight = band && band.kind === "band" ? band.height : 0
  const picture =
    input.logoMedia && input.logoAspect
      ? letterheadPicture(input.logoMedia, input.logoAspect, bandHeight)
      : undefined

  return {
    name: "Individual",
    columns: COLUMN_SPECS,
    rows,
    merges,
    picture,
    printArea: "$A:$I",
    printTitles: `$1:$${headerRows}`,
  }
}

import type { RowSpec, SheetSpec } from "./writer"
import { identityRows, type FormRow, type Identity } from "./form-model"
import { fieldCells, fieldMerges, spread } from "./rows"

/**
 * The Comments sheet — its rows, and the sheet they are drawn as.
 *
 * One comment per row and nothing else (the owner's words): the TEXT in the
 * merge's anchor, no date, and the row's height follows the text.
 *
 * ⭐ The donor wrote the text into B and the date into A, and the legacy's
 * comment rows are merged A:I — so B was swallowed by the merge and the reader
 * saw only the date. That is the "it only shows the date".
 */

/** The banner the comments sit under — the legacy's own wording. */
export const COMMENTS_BANNER = "COMMENTS AND SUGGESTIONS"

/** A comment's text per line — the cell is 8pt. */
export const COMMENT_WRAP = 100

/** The legacy's comment row height — the floor a comment row never shrinks below. */
const COMMENT_ROW_FLOOR = 40.5
const ROW_HEIGHT = 13.5

/** A comment's row height — its text decides how many lines it takes. */
export function commentHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / COMMENT_WRAP))
  return Math.max(COMMENT_ROW_FLOOR, ROW_HEIGHT * lines)
}

/** The Comments sheet's rows: the identity block, the banner, then the comments. */
export function buildCommentsModel(identity: Identity, comments: string[]): FormRow[] {
  return [
    ...identityRows(identity),
    { kind: "spacer" },
    { kind: "banner", text: COMMENTS_BANNER },
    ...comments.map((text) => ({ kind: "comment" as const, text, height: commentHeight(text) })),
  ]
}

/** The Comments sheet, drawn from its rows. */
export function renderCommentsSheet(rows: FormRow[]): SheetSpec {
  const sheetRows: RowSpec[] = []
  const merges: string[] = []

  rows.forEach((model, index) => {
    const row = index + 1
    switch (model.kind) {
      case "title":
        sheetRows.push({ row, height: 13.5, cells: spread(row, "title", model.text) })
        merges.push(`A${row}:I${row}`)
        break

      case "subtitle":
        sheetRows.push({ row, height: 13.5, cells: spread(row, "subtitle", model.text) })
        merges.push(`A${row}:I${row}`)
        break

      case "field":
      case "fieldPair":
        sheetRows.push({ row, height: 13.5, cells: fieldCells(row, model) })
        merges.push(...fieldMerges(row, model))
        break

      case "spacer":
        sheetRows.push({ row, height: 13.5, cells: spread(row, "spacer", null) })
        break

      case "banner":
        sheetRows.push({ row, height: 13.5, cells: spread(row, "banner", model.text) })
        merges.push(`A${row}:I${row}`)
        break

      case "comment":
        // ⭐ the TEXT in the anchor — the merge's top-left cell; every other
        // cell in the range is a ghost Excel discards
        sheetRows.push({ row, height: model.height, cells: spread(row, "comment", model.text) })
        merges.push(`A${row}:I${row}`)
        break

      default:
        throw new Error(`the Comments sheet has no "${model.kind}" row`)
    }
  })

  // the rows that repeat on every printed page: the identity block and the banner
  const firstComment = rows.findIndex((r) => r.kind === "comment")
  const headerRows = firstComment === -1 ? rows.length : firstComment

  return {
    name: "Comments",
    columns: [
      { from: "A", to: "A", width: 16.14 },
      { from: "B", to: "H", width: 9.14 },
      { from: "I", to: "I", width: 9.71 },
    ],
    rows: sheetRows,
    merges,
    printArea: "$A:$I",
    printTitles: `$1:$${headerRows}`,
  }
}

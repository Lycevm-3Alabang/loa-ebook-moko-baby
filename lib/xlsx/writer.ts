import { createZip } from "../zip"
import { buildStylesXml, styleId, type StyleToken } from "./styles"

/**
 * The workbook WRITER — a package builder, not a spreadsheet editor.
 *
 * An .xlsx is a package: a zip whose parts are XML documents wired together
 * by relationships. `_rels/.rels` points at `xl/workbook.xml`; the workbook's
 * rels point at the sheets, the styles and the drawings; a sheet's rels point
 * at its drawing. `[Content_Types].xml` declares what each part is.
 *
 * So a workbook is BUILT, never edited — and this module is that build. It
 * reads nothing: the declaration comes in, the bytes go out. The letterhead's
 * bytes are an INPUT (who supplies them is the form's business), and the
 * template file is not read at all.
 */

/** A cell of a sheet. */
export interface CellSpec {
  /** the cell's reference, e.g. "A11" */
  ref: string
  /** the cell's style token */
  style: StyleToken
  /** the value — a number, a string, or nothing (a styled but empty cell) */
  value?: string | number | null
}

/** A row of a sheet. */
export interface RowSpec {
  /** the row's number */
  row: number
  /** the row's height, in points */
  height?: number
  /** whether the row is hidden */
  hidden?: boolean
  /** the row's cells */
  cells: CellSpec[]
}

/** A span of columns and the width they share. */
export interface ColumnSpec {
  /** the first column of the span */
  from: string
  /** the last column of the span */
  to: string
  /** the width, in the units Excel shows */
  width: number
}

/** A picture on a sheet. */
export interface PictureSpec {
  /** the media entry it shows — it must be in the workbook's media */
  media: string
  /** where it is anchored: the cell it hangs from, and the offset into it */
  from: { col: number; colOff: number; row: number; rowOff: number }
  /** its size, in EMU (1 mm = 36 000 EMU) */
  ext: { cx: number; cy: number }
}

/** A sheet of the workbook. */
export interface SheetSpec {
  /** the tab's name */
  name: string
  /** the column widths */
  columns?: ColumnSpec[]
  /** the rows, in order */
  rows: RowSpec[]
  /** the merged ranges, e.g. "A1:I1" */
  merges?: string[]
  /** the picture on the sheet */
  picture?: PictureSpec
  /** the printed area, e.g. "$A:$I" */
  printArea?: string
  /** the rows that repeat at the top of every printed page, e.g. "$1:$10" */
  printTitles?: string
  /** the page's orientation — "portrait" (the default) or "landscape" */
  orientation?: "portrait" | "landscape"
}

/** The workbook. */
export interface WorkbookSpec {
  /** the sheets, in tab order */
  sheets: SheetSpec[]
  /** the images the workbook carries */
  media?: { name: string; bytes: Uint8Array }[]
}

// ── the small things ────────────────────────────────────────────────────────

/** 1 mm, in EMU — the unit a picture's size is written in. */
export const EMU_PER_MM = 36000

/** The column a letter names — "A" is 0. */
export function colIndex(letters: string): number {
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/** The letter a column number names — 0 is "A". */
export function colName(index: number): string {
  let name = ""
  let n = index + 1
  while (n > 0) {
    const rest = (n - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/** A cell reference, split into its column and its row. */
function parseRef(ref: string): { col: number; row: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/)
  if (!m) throw new Error(`"${ref}" is not a cell reference`)
  return { col: colIndex(m[1]), row: Number(m[2]) }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ── the sheet's parts ──────────────────────────────────────────────────────

function cellXml(cell: CellSpec): string {
  const attrs = ` r="${cell.ref}" s="${styleId(cell.style)}"`
  const value = cell.value
  if (value === undefined || value === null || value === "") return `<c${attrs}/>`
  if (typeof value === "number") return `<c${attrs}><v>${value}</v></c>`
  return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function rowXml(row: RowSpec): string {
  const attrs = [`r="${row.row}"`]
  if (row.height !== undefined) attrs.push(`ht="${row.height}"`, 'customHeight="1"')
  if (row.hidden) attrs.push('hidden="1"')
  return `<row ${attrs.join(" ")}>${row.cells.map(cellXml).join("")}</row>`
}

function columnsXml(columns: ColumnSpec[] | undefined): string {
  if (!columns || columns.length === 0) return ""
  const cols = columns
    .map((c) => `<col min="${colIndex(c.from) + 1}" max="${colIndex(c.to) + 1}" width="${c.width}" customWidth="1"/>`)
    .join("")
  return `<cols>${cols}</cols>`
}

/** The sheet's used range — the dimension Excel shows. */
function dimensionOf(sheet: SheetSpec): string {
  let minCol = Infinity
  let maxCol = -Infinity
  let minRow = Infinity
  let maxRow = -Infinity
  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      const { col, row: r } = parseRef(cell.ref)
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
      minRow = Math.min(minRow, r)
      maxRow = Math.max(maxRow, r)
    }
  }
  if (!Number.isFinite(minCol)) return "A1"
  return `${colName(minCol)}${minRow}:${colName(maxCol)}${maxRow}`
}

function mergesXml(merges: string[] | undefined): string {
  if (!merges || merges.length === 0) return ""
  return `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
}

/**
 * The sheet's picture — the letterhead.
 *
 * A ONE-CELL anchor: the picture hangs from a cell and keeps its own size, so
 * a column width changing cannot squash it. The offsets are checked here,
 * because a negative offset — or one wider than the column it sits in — is how
 * a drawing silently lands in the wrong place.
 */
function drawingXml(picture: PictureSpec): string {
  const { from, ext } = picture
  if (from.col < 0 || from.row < 0) throw new Error("the picture's anchor is outside the sheet")
  if (from.colOff < 0 || from.rowOff < 0) throw new Error("the picture's anchor has a negative offset")
  if (ext.cx <= 0 || ext.cy <= 0) throw new Error("the picture has no size")
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<xdr:oneCellAnchor>" +
    `<xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>${from.colOff}</xdr:colOff>` +
    `<xdr:row>${from.row}</xdr:row><xdr:rowOff>${from.rowOff}</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${ext.cx}" cy="${ext.cy}"/>` +
    "<xdr:pic>" +
    '<xdr:nvPicPr><xdr:cNvPr id="1" name="Picture 1"/><xdr:cNvPicPr/></xdr:nvPicPr>' +
    '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${ext.cx}" cy="${ext.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
    "</xdr:pic>" +
    "<xdr:clientData/>" +
    "</xdr:oneCellAnchor>" +
    "</xdr:wsDr>"
  )
}

function sheetXml(sheet: SheetSpec, drawingRelId: string | null): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="${dimensionOf(sheet)}"/>` +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="13.5"/>' +
    columnsXml(sheet.columns) +
    `<sheetData>${sheet.rows.map(rowXml).join("")}</sheetData>` +
    mergesXml(sheet.merges) +
    '<printOptions headings="0" gridLines="0"/>' +
    '<pageMargins left="0.63" right="0.35" top="0.51" bottom="0.71" header="0.51" footer="0.39"/>' +
    `<pageSetup paperSize="1" orientation="${sheet.orientation ?? "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
    (drawingRelId ? `<drawing r:id="${drawingRelId}"/>` : "") +
    "</worksheet>"
  )
}

// ── the package ────────────────────────────────────────────────────────────

function workbookXml(sheets: SheetSpec[]): string {
  const sheetElements = sheets
    .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")
  const definedNames = sheets
    .flatMap((s, i) => {
      const names: string[] = []
      if (s.printArea) {
        names.push(`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${escapeXml(s.name)}'!${s.printArea}</definedName>`)
      }
      if (s.printTitles) {
        names.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${escapeXml(s.name)}'!${s.printTitles}</definedName>`)
      }
      return names
    })
    .join("")
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheetElements}</sheets>` +
    (definedNames ? `<definedNames>${definedNames}</definedNames>` : "") +
    "</workbook>"
  )
}

const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
}

/** The workbook, as bytes. */
export function buildWorkbook(spec: WorkbookSpec): Uint8Array {
  const encoder = new TextEncoder()
  const parts: { name: string; data: Uint8Array }[] = []
  const add = (name: string, text: string) => parts.push({ name, data: encoder.encode(text) })

  const media = spec.media ?? []
  const sheets = spec.sheets

  // the sheets that carry a picture each get their own drawing
  const drawingOf = new Map<number, number>()
  let drawings = 0
  sheets.forEach((sheet, i) => {
    if (sheet.picture) {
      drawings += 1
      drawingOf.set(i, drawings)
    }
  })

  // ── the sheets ────────────────────────────────────────────────────────────
  sheets.forEach((sheet, i) => {
    const drawing = drawingOf.get(i)
    add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet, drawing ? "rId1" : null))
    if (drawing) {
      add(
        `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"' +
          ` Target="../drawings/drawing${drawing}.xml"/>` +
          "</Relationships>",
      )
      add(`xl/drawings/drawing${drawing}.xml`, drawingXml(sheet.picture!))
      add(
        `xl/drawings/_rels/drawing${drawing}.xml.rels`,
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"' +
          ` Target="../media/${sheet.picture!.media}"/>` +
          "</Relationships>",
      )
    }
  })

  // ── the workbook and its styles ───────────────────────────────────────────
  add("xl/workbook.xml", workbookXml(sheets))
  add("xl/styles.xml", buildStylesXml())

  // ── the workbook's relationships ──────────────────────────────────────────
  const workbookRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")
  add(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      workbookRels +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>",
  )

  // ── the media ─────────────────────────────────────────────────────────────
  for (const item of media) parts.push({ name: `xl/media/${item.name}`, data: item.bytes })

  // ── the package's own two parts ───────────────────────────────────────────
  const extensions = new Set<string>(["rels", "xml"])
  for (const item of media) {
    const extension = item.name.split(".").pop()?.toLowerCase() ?? ""
    if (extension) extensions.add(extension)
  }
  const defaults = [...extensions]
    .map((extension) => `<Default Extension="${extension}" ContentType="${MEDIA_TYPES[extension] ?? "application/octet-stream"}"/>`)
    .join("")
  const overrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")
  const drawingOverrides = [...drawingOf.values()]
    .map((n) => `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`)
    .join("")
  add(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      defaults +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      overrides +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      drawingOverrides +
      "</Types>",
  )
  add(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
  )

  return createZip(parts)
}

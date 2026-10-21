import { readFileSync } from "fs"
import { join } from "path"
import { inflateRawSync } from "zlib"

/**
 * The mechanics of the export's Excel workbook.
 *
 * The export FILLS the template rather than generating a workbook, so this
 * module is the low-level half: reading the template's parts, editing a sheet's
 * cells, and working out WHERE the numbers go.
 *
 * It is a SERVER module (it reads the filesystem and inflates), so only the
 * export route may import it. The cut script imports it too - the script and
 * the export then share ONE implementation of the cell rules, so a cut and a
 * fill cannot disagree.
 */

/** A workbook's parts, keyed by their path inside the zip. */
export type WorkbookParts = Map<string, Uint8Array>

export const TEMPLATE_RELATIVE_PATH = "data/templates/eval-report.xlsx"
export const SHEET_INDIVIDUAL = "xl/worksheets/sheet1.xml"
export const SHEET_COMMENTS = "xl/worksheets/sheet2.xml"
export const SHEET_OVERALL = "xl/worksheets/sheet3.xml"
export const SHARED_STRINGS = "xl/sharedStrings.xml"

// ── the zip ─────────────────────────────────────────────────────────────────

/** Read a zip's parts. Both methods are handled: 0 is stored, 8 is deflated. */
export function readZip(bytes: Uint8Array): WorkbookParts {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record")
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  const parts: WorkbookParts = new Map()
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory entry")
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString("utf-8", p + 46, p + 46 + nameLen)

    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compressedSize)
    parts.set(name, method === 0 ? new Uint8Array(raw) : new Uint8Array(inflateRawSync(raw)))

    p += 46 + nameLen + extraLen + commentLen
  }
  return parts
}

export function partText(parts: WorkbookParts, name: string): string {
  const part = parts.get(name)
  if (!part) throw new Error(`the workbook has no part ${name}`)
  return Buffer.from(part).toString("utf-8")
}

export function setPartText(parts: WorkbookParts, name: string, text: string): void {
  parts.set(name, new Uint8Array(Buffer.from(text, "utf-8")))
}

/** The export's template, read from disk. */
export function loadEvalTemplate(): WorkbookParts {
  return readZip(readFileSync(join(process.cwd(), ...TEMPLATE_RELATIVE_PATH.split("/"))))
}

// ── the shared strings ─────────────────────────────────────────────────────

/** The workbook's strings, and the text each holds. */
export function readSharedStrings(parts: WorkbookParts): string[] {
  const xml = partText(parts, SHARED_STRINGS)
  return (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) =>
    si
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  )
}

/**
 * Add a string, or find the one that is already there, and return its index.
 * The index is where the string will ACTUALLY sit in the workbook.
 */
export function internString(parts: WorkbookParts, text: string): number {
  const xml = partText(parts, SHARED_STRINGS)
  const si: string[] = xml.match(/<si>[\s\S]*?<\/si>/g) || []
  const existing = si.findIndex(
    (x) =>
      x
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">") === text,
  )
  if (existing >= 0) return existing
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const entry = `<si><t>${esc}</t></si>`
  si.push(entry)
  setPartText(parts, SHARED_STRINGS, xml.replace(/<si>[\s\S]*<\/si>/, si.join("")))
  return si.length - 1
}

// ── a sheet's cells ────────────────────────────────────────────────────────
//
// Two dialects are in play: the one Excel writes (`hidden="1"`) and the one
// other spreadsheet apps write (`hidden="true"`, plus their own attributes).
// Both are valid; the helpers below understand both.

const rowRe = (n: number) => new RegExp(`<row r="${n}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/row>)`)
const cellRe = (ref: string) => new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`)

export interface CellInfo {
  style: string | null
  value: string | null
  isString: boolean
  formula: string | null
}

export function readCell(xml: string, ref: string): CellInfo | null {
  const m = xml.match(cellRe(ref))
  if (!m) return null
  const inner = m[2] || ""
  const v = inner.match(/<v>([^<]*)<\/v>/)
  const f = inner.match(/<f[^>]*>([^<]*)<\/f>/)
  // an INLINE string carries its text in <is><t>, not in <v> - and the export
  // writes the names and the statements as inline strings
  const inline = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)
  const shared = /\st="s"/.test(m[1])
  return {
    style: (m[1].match(/\ss="(\d+)"/) || [])[1] ?? null,
    value: inline ? inline[1] : v ? v[1] : null,
    isString: shared || !!inline,
    formula: f ? f[1] : null,
  }
}

/** The text a cell shows, read out of the sheet and its shared strings. */
export function readCellText(xml: string, ref: string, strings: string[]): string | null {
  const cell = readCell(xml, ref)
  if (!cell || cell.value === null) return null
  if (!cell.isString) return cell.value
  // a shared string is an INDEX into the table; an inline string is the text
  const index = Number(cell.value)
  return Number.isNaN(index) || strings[index] === undefined ? cell.value : strings[index]
}

export interface RowInfo {
  open: string
  hidden: boolean
}

/** A row's opening tag and whether it is hidden (in either dialect). */
export function readRow(xml: string, n: number): RowInfo | null {
  const m = xml.match(rowRe(n))
  if (!m) return null
  const open = m[0].match(/^<row[^>]*>/)?.[0] ?? ""
  return { open, hidden: /\shidden="(?:1|true)"/.test(open) }
}

/** Replace a cell's text with a shared string, keeping its style. */
export function setCellSharedString(xml: string, ref: string, index: number): string {
  const m = xml.match(cellRe(ref))
  if (!m) throw new Error(`cell ${ref} not found`)
  const attrs = m[1].replace(/\s+t="[^"]*"/, "")
  return xml.replace(cellRe(ref), `<c r="${ref}"${attrs} t="s"><v>${index}</v></c>`)
}

/** Replace a cell's text with a literal string (an inline string). */
export function setCellText(xml: string, ref: string, text: string): string {
  const m = xml.match(cellRe(ref))
  if (!m) throw new Error(`cell ${ref} not found`)
  const attrs = m[1].replace(/\s+t="[^"]*"/, "")
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return xml.replace(cellRe(ref), `<c r="${ref}"${attrs} t="inlineStr"><is><t>${esc}</t></is></c>`)
}

/** Replace a cell's value with a number, keeping its style. A null clears it. */
export function setCellNumber(xml: string, ref: string, value: number | null): string {
  const m = xml.match(cellRe(ref))
  if (!m) throw new Error(`cell ${ref} not found`)
  const attrs = m[1].replace(/\s+t="[^"]*"/, "")
  if (value === null) return xml.replace(cellRe(ref), `<c r="${ref}"${attrs}/>`)
  return xml.replace(cellRe(ref), `<c r="${ref}"${attrs}><v>${value}</v></c>`)
}

/** Drop a cell's text, keeping its style. */
export function blankCell(xml: string, ref: string): string {
  const m = xml.match(cellRe(ref))
  if (!m) throw new Error(`cell ${ref} not found`)
  const style = (m[1].match(/\ss="(\d+)"/) || [])[1]
  return xml.replace(cellRe(ref), `<c r="${ref}"${style ? ` s="${style}"` : ""}/>`)
}

/** Un-hide a row, in either dialect. */
export function unhideRow(xml: string, n: number): string {
  const row = readRow(xml, n)
  if (!row) throw new Error(`row ${n} not found`)
  if (!row.hidden) return xml
  return xml.replace(rowRe(n), (m) => m.replace(/\shidden="(?:1|true)"/, ` hidden="false"`))
}

/** Replace a row wholesale, keeping its opening tag but making it visible. */
export function replaceRow(xml: string, n: number, cells: string): string {
  const row = readRow(xml, n)
  if (!row) throw new Error(`row ${n} not found`)
  const open = row.open.replace(/\shidden="(?:1|true)"/, ` hidden="false"`).replace(/\/>$/, ">")
  return xml.replace(rowRe(n), `${open}${cells}</row>`)
}

/** Remove every row from `firstRow` down. The sheet's data starts again. */
export function clearRowsFrom(xml: string, firstRow: number): string {
  return xml.replace(/<row r="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g, (m, n) =>
    Number(n) >= firstRow ? "" : m,
  )
}

/** The row a cell is in. */
export function rowOf(ref: string): number {
  const m = ref.match(/(\d+)$/)
  if (!m) throw new Error(`${ref} is not a cell reference`)
  return Number(m[1])
}

/** The column a cell is in. */
export function colOf(ref: string): string {
  const m = ref.match(/^([A-Z]+)/)
  if (!m) throw new Error(`${ref} is not a cell reference`)
  return m[1]
}

/** The cell at a column and a row. */
export function cellAt(col: string, row: number): string {
  return `${col}${row}`
}

// ── where the numbers go ───────────────────────────────────────────────────

/**
 * The position map, DERIVED from the template's own formulas.
 *
 * The workbook's AVERAGE cells say exactly which cells they average:
 * `I15 = AVERAGE(I12:I14)` is the first criterion's average over its three
 * statements, and `I78 = AVERAGE(I15,I24,...)` is the final rating over the
 * eight criterion averages. So the map is not a list of cell references typed
 * into the code - it is read out of the template, and a re-cut template is
 * followed automatically.
 */
export interface FormPositions {
  /** the criterion average cell of each criterion, in order (I15, I24, …) */
  criterionAverageCells: string[]
  /** the statement rating cell of each statement, grouped by criterion */
  statementCells: string[][]
  /** the statement TEXT cell of each statement, grouped by criterion */
  statementTextCells: string[][]
  /** the criterion header cell of each criterion (A11, A17, …) */
  criterionHeaderCells: string[]
  /** the final rating cell (I78) */
  finalRatingCell: string
}

export function deriveFormPositions(sheetXml: string): FormPositions {
  // every cell that averages a RANGE is a criterion average over its statements
  const criteria: { average: string; statements: string[] }[] = []
  for (const m of sheetXml.matchAll(/<c r="([A-Z]+\d+)"[^>]*>(?:<f[^>]*>AVERAGE\(([^<]*)\)<\/f>)/g)) {
    const [, cell, formula] = m
    if (!formula.includes(":")) continue
    const [from, to] = formula.split(":")
    const statements: string[] = []
    for (let r = rowOf(from); r <= rowOf(to); r++) statements.push(cellAt(colOf(from), r))
    criteria.push({ average: cell, statements })
  }
  if (criteria.length === 0) throw new Error("the template has no criterion averages - it is not the form")
  criteria.sort((a, b) => rowOf(a.average) - rowOf(b.average))

  // the cell that averages a LIST is the final rating, and its list is the
  // criteria in order
  let finalRatingCell = ""
  for (const m of sheetXml.matchAll(/<c r="([A-Z]+\d+)"[^>]*>(?:<f[^>]*>AVERAGE\(([^<]*)\)<\/f>)/g)) {
    const [, cell, formula] = m
    if (formula.includes(":")) continue
    finalRatingCell = cell
    const listed = formula.split(",").map((s) => s.trim())
    if (listed.length !== criteria.length) {
      throw new Error("the template's final rating does not average every criterion")
    }
  }
  if (!finalRatingCell) throw new Error("the template has no final rating - it is not the form")

  return {
    criterionAverageCells: criteria.map((c) => c.average),
    statementCells: criteria.map((c) => c.statements),
    statementTextCells: criteria.map((c) => c.statements.map((s) => cellAt("A", rowOf(s)))),
    criterionHeaderCells: criteria.map((c) => cellAt("A", rowOf(c.statements[0]) - 1)),
    finalRatingCell,
  }
}

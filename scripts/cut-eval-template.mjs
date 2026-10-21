// Cut the export's Excel template from the legacy workbook.
//
// The school produces its evaluation results as a spreadsheet, and that workbook
// (docs/eval reports.xlsx) is the artifact they circulate. The export fills this
// template rather than generating a workbook, so the template has to be a REAL
// workbook: the same merged cells, the same styles, the same print setup.
//
// This script cuts it ONCE, from the legacy workbook, with the changes the
// export's contract needs (specs/evaluation-results-export.md §3.2, §3.3):
//
//   1. A9 "Program" and A10 "Section"      - the fields the legacy lacks
//   2. r4 the semester, r5 the evaluation period - one read, never typed
//   3. the letterhead is the repo's own public/logo-blk.png, centred and at its
//      OWN aspect ratio (the legacy's slot is 6.14:1 and the logo is 2.18:1, so
//      the bytes must not be dropped into the old slot - it would stretch)
//   4. the "Interpretation of Data" legend's bands are corrected to the app's
//      remark ladder (getRemark, lib/evaluation-utils.ts) - the legacy says
//      "Fair" and "Needs improvement", the app says "Unsatisfactory" and "Poor"
//
// The script is idempotent: it always starts from the legacy workbook, so it can
// be re-run whenever the legacy changes. It never edits docs/eval reports.xlsx.
//
// It also READS BACK what it wrote and checks it, so a cut that lands in the
// wrong place fails the script instead of shipping a wrong template.
//
// Usage:  node scripts/cut-eval-template.mjs

import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { inflateRawSync, deflateRawSync } from "zlib"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const SOURCE = join(root, "docs", "eval reports.xlsx")
const LOGO = join(root, "public", "logo-blk.png")
const TARGET = join(root, "data", "templates", "eval-report.xlsx")

// ── a minimal zip reader (the workbook is a zip of xml parts) ───────────────

function readZip(path) {
  const buf = readFileSync(path)
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record")
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  const parts = new Map()
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
    parts.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw))

    p += 46 + nameLen + extraLen + commentLen
  }
  return parts
}

// ── a minimal zip writer ───────────────────────────────────────────────────
//
// The TEMPLATE is compressed: it is a committed asset. (The app's OUTPUT is
// store-only - that is lib/zip.ts's writer, and the export's reader handles
// both methods.)

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function writeZip(parts, path) {
  const locals = []
  const central = []
  let offset = 0
  for (const [name, data] of parts) {
    const nameBuf = Buffer.from(name, "utf-8")
    const crc = crc32(data)
    const deflated = deflateRawSync(data, { level: 9 })
    const useDeflate = deflated.length < data.length
    const payload = useDeflate ? deflated : data
    const method = useDeflate ? 8 : 0

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 6)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)
    locals.push(local, payload)

    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(payload.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt32LE(offset, 42)
    nameBuf.copy(cd, 46)
    central.push(cd)
    offset += local.length + payload.length
  }
  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(parts.length, 8)
  eocd.writeUInt16LE(parts.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.concat([...locals, centralBuf, eocd]))
}

// ── the sheet's geometry ───────────────────────────────────────────────────

const EMU_PER_PX = 9525
const EMU_PER_MM = 36000
const EMU_PER_PT = 12700
const MDW = 7                     // the max digit width of Calibri 11 - excel's unit
const LOGO_WIDTH_MM = 50          // the same width the PDF's letterhead uses

const widthToPx = (w) => Math.round(w * MDW + 5)

/**
 * The left edge of every column, in EMU from the sheet's left edge.
 *
 * The <col> elements span RANGES (A, B:H, I, J+), so the edges have to be
 * expanded per column: an anchor's `col` is a column INDEX, and its `colOff`
 * must be smaller than THAT column's width.
 */
function columnEdges(cols, lastColumn) {
  const edges = []
  let x = 0
  for (let col = 1; col <= lastColumn; col++) {
    edges.push(x)
    const c = cols.find((k) => col >= k.min && col <= k.max)
    if (!c) throw new Error(`column ${col} has no width`)
    x += widthToPx(c.width) * EMU_PER_PX
  }
  edges.push(x)
  return edges
}

function locateColumn(edges, emu) {
  for (let i = 0; i < edges.length - 1; i++) {
    if (emu < edges[i + 1]) return { col: i, colOff: emu - edges[i] }
  }
  const last = edges.length - 2
  return { col: last, colOff: edges[edges.length - 1] - edges[last] }
}

// ── the sheet's xml, in whatever dialect the legacy uses ───────────────────
//
// Two dialects are in play: the one Excel writes (`hidden="1"`) and the one
// other spreadsheet apps write (`hidden="true"`, plus their own attributes).
// Both are valid; the helpers below understand both.

const rowRe = (n) => new RegExp(`<row r="${n}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/row>)`)
const cellRe = (ref) => new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`)

/** A row's opening tag, its cells, and whether it is hidden. */
function readRow(xml, n) {
  const m = xml.match(rowRe(n))
  if (!m) return null
  const open = m[0].match(/^<row[^>]*>/)[0]
  return {
    open,
    hidden: /\shidden="(?:1|true)"/.test(open),
    style: (open.match(/\ss="(\d+)"/) || [])[1],
  }
}

/** A cell's text, and its style id. */
function readCell(xml, ref) {
  const m = xml.match(cellRe(ref))
  if (!m) return null
  const v = (m[2] || "").match(/<v>([^<]*)<\/v>/)
  return { style: (m[1].match(/\ss="(\d+)"/) || [])[1], value: v ? v[1] : null, isString: /\st="s"/.test(m[1]) }
}

/** Replace a cell's text with a shared string, keeping its style. */
function setSharedString(xml, ref, text, index) {
  const m = xml.match(cellRe(ref))
  if (!m) throw new Error(`cell ${ref} not found`)
  const attrs = m[1].replace(/\s+t="[^"]*"/, "")
  return xml.replace(cellRe(ref), `<c r="${ref}"${attrs} t="s"><v>${index}</v></c>`)
}

/** Drop a cell's text, keeping its style. */
function blankCell(xml, ref) {
  const m = xml.match(cellRe(ref))
  if (!m) throw new Error(`cell ${ref} not found`)
  const style = (m[1].match(/\ss="(\d+)"/) || [])[1]
  return xml.replace(cellRe(ref), `<c r="${ref}"${style ? ` s="${style}"` : ""}/>`)
}

/** Un-hide a row, in either dialect. */
function unhideRow(xml, n) {
  const row = readRow(xml, n)
  if (!row) throw new Error(`row ${n} not found`)
  if (!row.hidden) return xml
  return xml.replace(rowRe(n), (m) => m.replace(/\shidden="(?:1|true)"/, ` hidden="false"`))
}

/** Replace a row wholesale, keeping its opening tag but making it visible. */
function replaceRow(xml, n, cells) {
  const row = readRow(xml, n)
  if (!row) throw new Error(`row ${n} not found`)
  const open = row.open.replace(/\shidden="(?:1|true)"/, ` hidden="false"`).replace(/\/>$/, ">")
  return xml.replace(rowRe(n), `${open}${cells}</row>`)
}

// ── the cut ────────────────────────────────────────────────────────────────

const parts = readZip(SOURCE)
const sheetName = "xl/worksheets/sheet1.xml"
const drawingName = "xl/drawings/drawing1.xml"
let sheet = parts.get(sheetName).toString("utf-8")
let drawing = parts.get(drawingName).toString("utf-8")
let strings = parts.get("xl/sharedStrings.xml").toString("utf-8")

// the shared strings, and the text they hold
const si = strings.match(/<si>[\s\S]*?<\/si>/g) || []
const textOf = (x) => x.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
const stringTexts = si.map(textOf)

/** The text a cell shows, read out of the sheet. */
function cellText(xml, ref) {
  const c = readCell(xml, ref)
  if (!c || c.value === null) return null
  return c.isString ? stringTexts[Number(c.value)] : c.value
}

// 0. the source's shape is asserted, not assumed ---------------------------
//
// The legacy workbook is hand-made and has been re-saved by more than one
// application, so its style ids have already moved once. The guard therefore
// asserts what the workbook SAYS - the cells, their text, the hidden rows, the
// merges - and not the style ids, which are an implementation detail of
// whichever app wrote it. A cut that silently lands in the wrong place is worse
// than no cut: the export would write a number against the wrong statement.
const EXPECTED = [
  ["A1", (t) => t && t.includes("FACULTY PERFORMANCE EVALUATION")],
  ["A3", (t) => t === "Faculty Performance Evaluation"],
  ["A4", (t) => typeof t === "string" && t.length > 0],
  ["A7", (t) => t === "Employee No"],
  ["G7", (t) => t === "Rating"],
  ["A8", (t) => t === "Employee Name"],
  ["G8", (t) => t === "Remarks"],
  ["A9", (t) => t === null || t === ""],
  ["A10", (t) => t === null || t === ""],
  ["A11", (t) => typeof t === "string" && t.includes("PROFESSIONAL MANNER")],
  ["I11", (t) => t === "RATING"],
]
for (const [ref, ok] of EXPECTED) {
  const t = cellText(sheet, ref)
  if (!ok(t)) {
    throw new Error(`cell ${ref} is ${JSON.stringify(t)} - the legacy workbook moved`)
  }
}
for (const n of [3, 4, 5, 10]) {
  const row = readRow(sheet, n)
  if (!row) throw new Error(`row ${n} is missing - the legacy workbook moved`)
  if (n === 10) continue
  if (!row.hidden) throw new Error(`row ${n} is not hidden - the legacy workbook moved`)
}
for (const merge of ["A10:H10", "B7:F7", "H7:I7", "B8:F8", "H8:I8", "A1:I1", "A3:I3", "A4:I4"]) {
  if (!sheet.includes(`<mergeCell ref="${merge}"/>`)) {
    throw new Error(`the merge ${merge} is missing - the legacy workbook moved`)
  }
}
if (!/<xdr:pic>/.test(drawing)) {
  throw new Error("the legacy workbook has no picture - the legacy workbook moved")
}

// 1. the shared strings we need ---------------------------------------------

const NEW_STRINGS = [
  "FACULTY PERFORMANCE EVALUATION — STUDENTS POST-EVALUATION",
  "Semester: <semester>",
  "Evaluation Period: <evaluation period>",
  "Program",
  "Section",
]

// The workbook's own <si> list, taken ONCE. The new strings are appended after
// it, and their indexes are the position they will actually occupy.
const newIndexes = {}
const newSi = []
for (const text of NEW_STRINGS) {
  const existing = stringTexts.indexOf(text)
  if (existing >= 0) {
    newIndexes[text] = existing
    continue
  }
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  newSi.push(`<si><t>${esc}</t></si>`)
  newIndexes[text] = si.length + newSi.length - 1
}
strings = strings.replace(/<si>[\s\S]*<\/si>/, si.join("") + newSi.join(""))

// 2. the sheet's cells -------------------------------------------------------

// the banner cell's text is the title AND a term the legacy typed by hand -
// the title moves to r3 and the term to r4, so the cell keeps only its style.
sheet = blankCell(sheet, "A1")

// the title block: r3 the title, r4 the semester, r5 the evaluation period.
// all three were hidden (the banner image carried their text) and are now the
// block the reader sees.
sheet = unhideRow(sheet, 3)
sheet = setSharedString(sheet, "A3", NEW_STRINGS[0], newIndexes[NEW_STRINGS[0]])
sheet = unhideRow(sheet, 4)
sheet = setSharedString(sheet, "A4", NEW_STRINGS[1], newIndexes[NEW_STRINGS[1]])

// r5 is a new row: it carries the evaluation period, styled like r4.
const r4Style = readCell(sheet, "A4").style
const r5Cells =
  `<c r="A5" s="${r4Style}" t="s"><v>${newIndexes[NEW_STRINGS[2]]}</v></c>` +
  ["B", "C", "D", "E", "F", "G", "H", "I"].map((c) => `<c r="${c}5" s="${r4Style}"/>`).join("")
sheet = replaceRow(sheet, 5, r5Cells)

// the identity block gains Program and Section. r9 and r10 are re-styled to
// r7 and r8's shape - the styles are READ from those rows, not hard-coded,
// because a spreadsheet app renumbers them whenever it re-saves.
const labelStyle = readCell(sheet, "A7").style
const valueStyle = readCell(sheet, "B7").style
const rightLabelStyle = readCell(sheet, "G7").style
const rightValueStyle = readCell(sheet, "H7").style

for (const [row, label] of [[9, NEW_STRINGS[3]], [10, NEW_STRINGS[4]]]) {
  const cells =
    `<c r="A${row}" s="${labelStyle}" t="s"><v>${newIndexes[label]}</v></c>` +
    ["B", "C", "D", "E", "F"].map((c) => `<c r="${c}${row}" s="${valueStyle}"/>`).join("") +
    `<c r="G${row}" s="${rightLabelStyle}"/>` +
    `<c r="H${row}" s="${rightValueStyle}"/><c r="I${row}" s="${rightValueStyle}"/>`
  sheet = replaceRow(sheet, row, cells)
}

// 3. the merges -------------------------------------------------------------

const merges = sheet.match(/<mergeCell ref="[^"]*"\/>/g) || []
const kept = merges.filter((m) => m !== '<mergeCell ref="A10:H10"/>')
const added = ["A5:I5", "B9:F9", "H9:I9", "B10:F10", "H10:I10"].map(
  (ref) => `<mergeCell ref="${ref}"/>`,
)
const allMerges = [...kept, ...added]
sheet = sheet.replace(/<mergeCells count="\d+">[\s\S]*?<\/mergeCells>/,
  `<mergeCells count="${allMerges.length}">${allMerges.join("")}</mergeCells>`)

// 4. the letterhead ---------------------------------------------------------

const logo = readFileSync(LOGO)
const logoW = logo.readUInt32BE(16)
const logoH = logo.readUInt32BE(20)

const cols = (sheet.match(/<cols>[\s\S]*?<\/cols>/)[0].match(/<col [^>]*\/>/g) || []).map(
  (c) => ({
    min: Number(c.match(/min="(\d+)"/)[1]),
    max: Number(c.match(/max="(\d+)"/)[1]),
    width: Number(c.match(/width="([\d.]+)"/)[1]),
  }),
)
// the sheet's printable block is columns A..I (nine columns)
const edges = columnEdges(cols, 9)
const blockWidth = edges[edges.length - 1]

const logoCx = LOGO_WIDTH_MM * EMU_PER_MM
const logoCy = Math.round((logoCx * logoH) / logoW)
// the height of row 1 - read from the row's own tag, because a greedy match
// would find `ht="1"` inside `customHeight="1"`.
const row1Tag = (sheet.match(/<row r="1"[^>]*>/) || [""])[0]
const row1Height = Number((row1Tag.match(/\sht="([\d.]+)"/) || [, 15])[1]) * EMU_PER_PT
if (logoCy > row1Height) {
  throw new Error(`the logo (${logoCy} EMU) does not fit in row 1 (${row1Height} EMU)`)
}
const left = Math.round((blockWidth - logoCx) / 2)
const top = Math.round((row1Height - logoCy) / 2)
const at = locateColumn(edges, left)
if (at.colOff >= edges[at.col + 1] - edges[at.col]) {
  throw new Error("the logo's column offset is wider than its column")
}

const anchor =
  "<xdr:oneCellAnchor>" +
  `<xdr:from><xdr:col>${at.col}</xdr:col><xdr:colOff>${at.colOff}</xdr:colOff>` +
  `<xdr:row>0</xdr:row><xdr:rowOff>${top}</xdr:rowOff></xdr:from>` +
  `<xdr:ext cx="${logoCx}" cy="${logoCy}"/>` +
  "<xdr:pic><xdr:nvPicPr>" +
  '<xdr:cNvPr id="3" name="Picture 2" descr="Lyceum of Alabang"/>' +
  '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
  '<xdr:blipFill rotWithShape="1">' +
  '<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1" cstate="print"/>' +
  "<a:stretch/></xdr:blipFill>" +
  `<xdr:spPr><a:xfrm><a:off x="${left}" y="${top}"/><a:ext cx="${logoCx}" cy="${logoCy}"/></a:xfrm>` +
  '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>' +
  "<xdr:clientData/></xdr:oneCellAnchor>"

// the PICTURE's anchor is replaced - not the first anchor, which is the legend's
// textbox. The anchors are matched ONE AT A TIME (a lazy match that has to
// contain a <xdr:pic> would otherwise span from the textbox's anchor all the way
// to the picture's, and replacing that would DELETE the legend), and the one
// that carries the picture is the one that goes.
const anchors = drawing.match(/<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/g) || []
const pictureIndex = anchors.findIndex((a) => a.includes("<xdr:pic>"))
if (pictureIndex < 0) throw new Error("the legacy workbook's picture anchor is not found")
const pictureAnchor = anchors[pictureIndex]
if (anchors.length < 2) throw new Error("the legacy workbook's legend textbox is missing")
drawing = drawing.replace(pictureAnchor, anchor)

// 5. the legend's bands - the app's ladder (getRemark) is the truth
//
// The bands live in text runs, and a spreadsheet app may leave trailing spaces
// in them, so the match allows for that.
const LEGEND = [
  ["2.5 - 1.51 = Fair", "2.5 - 1.51 = Unsatisfactory"],
  ["1.5 - 1.00 = Needs improvement", "1.5 - 1.00 = Poor"],
]
for (const [from, to] of LEGEND) {
  if (new RegExp(`<a:t>${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</a:t>`).test(drawing)) {
    continue // already corrected
  }
  const re = new RegExp(`<a:t>${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</a:t>`)
  if (!re.test(drawing)) {
    throw new Error(`the legend's band ${JSON.stringify(from)} is not found - the legacy moved`)
  }
  drawing = drawing.replace(re, `<a:t>${to}</a:t>`)
}

// 6. the string counts are advisory, but they are cheap to get right ---------
let stringCells = 0
for (const name of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]) {
  const text = name === sheetName ? sheet : parts.get(name).toString("utf-8")
  stringCells += (text.match(/t="s"/g) || []).length
}
strings = strings.replace(/count="\d+"/, `count="${stringCells}"`)
strings = strings.replace(/uniqueCount="\d+"/, `uniqueCount="${si.length + newSi.length}"`)

// ── write it ───────────────────────────────────────────────────────────────

parts.set(sheetName, Buffer.from(sheet, "utf-8"))
parts.set(drawingName, Buffer.from(drawing, "utf-8"))
parts.set("xl/sharedStrings.xml", Buffer.from(strings, "utf-8"))
// the media slot the picture's relationship points at
parts.set("xl/media/image1.png", logo)

// [Content_Types].xml first - the OPC convention, and what the app's zip writer does.
const ordered = [...parts.entries()].sort(([a], [b]) =>
  a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : a < b ? -1 : 1,
)
writeZip(ordered, TARGET)

console.log(`template written: ${TARGET}`)
console.log(`  letterhead   ${logoW}x${logoH} px -> ${LOGO_WIDTH_MM}mm wide (${logoCx} x ${logoCy} EMU), centred at x=${left} in a ${blockWidth} EMU block`)
console.log(`  title block  r3 title, r4 semester, r5 evaluation period (un-hidden)`)
console.log(`  identity     r9 Program, r10 Section (styled from r7/r8, not hard-coded)`)
console.log(`  merges       ${allMerges.length} (A10:H10 removed, A5:I5 + B9:F9 + H9:I9 + B10:F10 + H10:I10 added)`)
console.log(`  legend       the two bands that disagreed with getRemark() corrected`)
console.log(`  strings      ${si.length + newSi.length} unique, ${stringCells} references`)

// ── verify what was written ────────────────────────────────────────────────
// A cut that lands in the wrong place is worse than no cut: the export would
// write a number against the wrong statement. So the file is read BACK and
// every cell the export writes is checked.

const written = readZip(TARGET)
const writtenSheet = written.get(sheetName).toString("utf-8")
const writtenStrings = written.get("xl/sharedStrings.xml").toString("utf-8")
const writtenTexts = (writtenStrings.match(/<si>[\s\S]*?<\/si>/g) || []).map(textOf)

function readBack(ref) {
  const m = writtenSheet.match(cellRe(ref))
  if (!m) return null
  const v = (m[2] || "").match(/<v>([^<]*)<\/v>/)
  if (!v) return null
  return /\st="s"/.test(m[1]) ? writtenTexts[Number(v[1])] : v[1]
}

const EXPECTED_OUT = [
  ["A1", null],
  ["A3", NEW_STRINGS[0]],
  ["A4", NEW_STRINGS[1]],
  ["A5", NEW_STRINGS[2]],
  ["A7", "Employee No"], ["G7", "Rating"],
  ["A8", "Employee Name"], ["G8", "Remarks"],
  ["A9", "Program"],
  ["A10", "Section"],
  ["A11", "I. PROFESSIONAL MANNER"], ["I11", "RATING"],
]
const problems = []
for (const [ref, expected] of EXPECTED_OUT) {
  const actual = readBack(ref)
  if (actual !== expected) problems.push(`${ref} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}
for (const row of [3, 4, 5, 10]) {
  if (/\shidden="(?:1|true)"/.test((writtenSheet.match(rowRe(row)) || [""])[0])) {
    problems.push(`row ${row} is still hidden`)
  }
}
for (const merge of ["A5:I5", "B9:F9", "H9:I9", "B10:F10", "H10:I10"]) {
  if (!writtenSheet.includes(`<mergeCell ref="${merge}"/>`)) problems.push(`the merge ${merge} is missing`)
}
if (writtenSheet.includes('<mergeCell ref="A10:H10"/>')) problems.push("A10:H10 is still merged")
if (!written.get("xl/media/image1.png").equals(readFileSync(LOGO))) {
  problems.push("the media is not public/logo-blk.png")
}
const writtenDrawing = written.get(drawingName).toString("utf-8")
if (writtenDrawing.includes("<a:srcRect")) problems.push("the logo is still cropped")
if (!writtenDrawing.includes("Unsatisfactory") || !writtenDrawing.includes("1.5 - 1.00 = Poor")) {
  problems.push("the legend was not corrected")
}
if (!writtenDrawing.includes("<xdr:txBody>")) problems.push("the legend's textbox was lost")
// the anchor to check is the PICTURE's - the legend's textbox anchor comes
// first in the file and has a <xdr:from> of its own.
const writtenAnchors = writtenDrawing.match(/<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/g) || []
const writtenPicture = writtenAnchors.find((a) => a.includes("<xdr:pic>"))
if (!writtenPicture) {
  problems.push("the letterhead has no anchor")
} else {
  const writtenAnchor = writtenPicture.match(/<xdr:from>[\s\S]*?<\/xdr:from>/)
  const col = Number(writtenAnchor[0].match(/<xdr:col>(\d+)<\/xdr:col>/)[1])
  const colOff = Number(writtenAnchor[0].match(/<xdr:colOff>(-?\d+)<\/xdr:colOff>/)[1])
  const rowOff = Number(writtenAnchor[0].match(/<xdr:rowOff>(-?\d+)<\/xdr:rowOff>/)[1])
  if (rowOff < 0) problems.push(`the letterhead's row offset is negative (${rowOff})`)
  if (colOff < 0) problems.push(`the letterhead's column offset is negative (${colOff})`)
  if (colOff >= edges[col + 1] - edges[col]) {
    problems.push(`the letterhead's column offset (${colOff}) is wider than column ${col}`)
  }
  if (col !== at.col || colOff !== at.colOff || rowOff !== top) {
    problems.push("the letterhead is not where the geometry says it should be")
  }
}
if (problems.length > 0) {
  console.error("\nTHE TEMPLATE DID NOT COME OUT RIGHT:")
  for (const p of problems) console.error("  - " + p)
  process.exit(1)
}
console.log("  verified      every cell the export writes was read back and checked")

// Cut the export's Excel template from the legacy workbook.
//
// The school produces its evaluation results as a spreadsheet, and that workbook
// (docs/eval reports.xlsx) is the artifact they circulate. The export fills this
// template rather than generating a workbook, so the template has to be a REAL
// workbook: the same merged cells, the same styles, the same print setup.
//
// This script cuts it ONCE, from the legacy workbook, with the four changes the
// export's contract needs (specs/evaluation-results-export.md §3.2, §3.3):
//
//   1. A9 "Program" and A10 "Section"      - the fields the legacy lacks
//   2. r4 the semester, r5 the evaluation period - one read, never typed
//   3. the banner image is REPLACED by the repo's own public/logo-blk.png,
//      centred and at its OWN aspect ratio (the legacy's slot is 6.14:1 and the
//      logo is 2.18:1, so swapping the bytes into the old slot would stretch it)
//   4. the "Interpretation of Data" legend's bands are corrected to the app's
//      remark ladder (getRemark, lib/evaluation-utils.ts) - the legacy says
//      "Fair" and "Needs improvement", the app says "Unsatisfactory" and "Poor"
//
// The script is idempotent: it always starts from the legacy workbook, so it can
// be re-run whenever the legacy changes. It never edits docs/eval reports.xlsx.
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
  // the end-of-central-directory record
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

    // the local header holds the real name/extra lengths
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
// The TEMPLATE is compressed: it is a committed asset, and the legacy
// workbook's 10,609 near-empty rows on the Overall sheet make it big without
// it. (The app's OUTPUT is store-only - that is lib/zip.ts's writer, and the
// export's reader handles both methods.)

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
    // store it uncompressed if compression made it bigger
    const useDeflate = deflated.length < data.length
    const payload = useDeflate ? deflated : data
    const method = useDeflate ? 8 : 0

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(method, 6)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)
    locals.push(local, payload)

    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)            // version made by
    cd.writeUInt16LE(20, 6)            // version needed
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

// ── the workbook's geometry ────────────────────────────────────────────────

const EMU_PER_PX = 9525          // 96 dpi
const EMU_PER_MM = 36000
const EMU_PER_PT = 12700
const MDW = 7                     // the max digit width of Calibri 11 - excel's unit
const LOGO_WIDTH_MM = 50          // the same width the PDF's letterhead uses

/** A column's width in excel units -> pixels. */
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

/** The EMU offset of a horizontal position -> the column it lands in. */
function locateColumn(edges, emu) {
  for (let i = 0; i < edges.length - 1; i++) {
    if (emu < edges[i + 1]) return { col: i, colOff: emu - edges[i] }
  }
  const last = edges.length - 2
  return { col: last, colOff: edges[edges.length - 1] - edges[last] }
}

// ── the cut ────────────────────────────────────────────────────────────────

const parts = readZip(SOURCE)
const sheetName = "xl/worksheets/sheet1.xml"
let sheet = parts.get(sheetName).toString("utf-8")
let drawing = parts.get("xl/drawings/drawing1.xml").toString("utf-8")
let strings = parts.get("xl/sharedStrings.xml").toString("utf-8")

// 0. the source's shape is asserted, not assumed ---------------------------
//
// The legacy workbook is hand-made, and a cut that silently lands in the wrong
// place is worse than no cut: the export would write a number against the wrong
// statement. So every cell this script touches is checked first, and the cut
// REFUSES to run if the source has moved.
const EXPECTED_CELLS = [
  ["A1", 67], ["A3", 60], ["A4", 59],
  ["A7", 4], ["G7", 7], ["A8", 4], ["G8", 7],
  ["A9", 4], ["A10", 77],
]
for (const [ref, style] of EXPECTED_CELLS) {
  const m = sheet.match(new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>)`))
  if (!m) throw new Error(`the source has no cell ${ref} - the legacy workbook moved`)
  const actual = (m[1].match(/\ss="(\d+)"/) || [])[1]
  if (actual !== String(style)) {
    throw new Error(`cell ${ref} has style ${actual}, expected ${style} - the legacy workbook moved`)
  }
}
for (const row of [3, 4, 5]) {
  if (!new RegExp(`<row r="${row}"[^>]*hidden="1"`).test(sheet)) {
    throw new Error(`row ${row} is not hidden - the legacy workbook moved`)
  }
}
if (!sheet.includes('<mergeCell ref="A10:H10"/>')) {
  throw new Error("the source does not merge A10:H10 - the legacy workbook moved")
}
if (!drawing.includes("<a:srcRect")) {
  throw new Error("the source's picture is not cropped - the legacy workbook moved")
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
const si = strings.match(/<si>[\s\S]*?<\/si>/g) || []
const indexOfString = (text) => si.findIndex((x) => x.replace(/<[^>]+>/g, "") === text)

const newIndexes = {}
const newSi = []
for (const text of NEW_STRINGS) {
  const existing = indexOfString(text)
  if (existing >= 0) {
    newIndexes[text] = existing
    continue
  }
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  newSi.push(`<si><t>${esc}</t></si>`)
  newIndexes[text] = si.length + newSi.length - 1
}
// replace the existing block (greedy: the first <si> to the last </si>)
strings = strings.replace(/<si>[\s\S]*<\/si>/, si.join("") + newSi.join(""))

// 2. the sheet's cells -------------------------------------------------------

/** Replace a cell's text with a shared string, keeping its style. */
function setSharedString(xml, ref, text) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`)
  const m = xml.match(re)
  if (!m) throw new Error(`cell ${ref} not found`)
  const attrs = m[1].replace(/\s+t="[^"]*"/, "")
  return xml.replace(re, `<c r="${ref}"${attrs} t="s"><v>${newIndexes[text]}</v></c>`)
}

/** Replace a cell's style. */
function setStyle(xml, ref, style) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`)
  const m = xml.match(re)
  if (!m) throw new Error(`cell ${ref} not found`)
  const attrs = m[1].replace(/\s+s="[^"]*"/, "").replace(/\s+t="[^"]*"/, "")
  const inner = m[2] ? m[2] : ""
  return xml.replace(re, `<c r="${ref}"${attrs} s="${style}">${inner}</c>`)
}

/** Drop a cell's text, keeping its style. */
function blankCell(xml, ref) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`)
  const m = xml.match(re)
  if (!m) throw new Error(`cell ${ref} not found`)
  const attrs = m[1].replace(/\s+t="[^"]*"/, "").replace(/\s+[^=]*="[^"]*"(?=[^>]*$)/g, (s) => s)
  const style = (m[1].match(/\ss="(\d+)"/) || [])[1]
  return xml.replace(re, `<c r="${ref}"${style ? ` s="${style}"` : ""}/>`)
}

/** Un-hide a row. A row that is already visible is left alone. */
function unhideRow(xml, row) {
  const exists = new RegExp(`<row r="${row}"[\\s/>]`).test(xml)
  if (!exists) throw new Error(`row ${row} not found`)
  return xml.replace(new RegExp(`(<row r="${row}"[^>]*?)\\s+hidden="1"`), "$1")
}

// the banner cell's text is the title AND a term the legacy typed by hand -
// the title moves to r3 and the term to r4, so the cell keeps only its style.
sheet = blankCell(sheet, "A1")

// the title block: r3 the title, r4 the semester, r5 the evaluation period.
// all three were hidden (the banner image carried their text) and are now the
// block the reader sees.
sheet = unhideRow(sheet, 3)
sheet = setSharedString(sheet, "A3", NEW_STRINGS[0])
sheet = unhideRow(sheet, 4)
sheet = setSharedString(sheet, "A4", NEW_STRINGS[1])
sheet = unhideRow(sheet, 5)
sheet = sheet.replace(
  /<row r="5"[^>]*\/>/,
  '<row r="5" spans="1:9" x14ac:dyDescent="0.25">' +
    `<c r="A5" s="59" t="s"><v>${newIndexes[NEW_STRINGS[2]]}</v></c>` +
    '<c r="B5" s="59"/><c r="C5" s="59"/><c r="D5" s="59"/><c r="E5" s="59"/>' +
    '<c r="F5" s="59"/><c r="G5" s="59"/><c r="H5" s="59"/><c r="I5" s="59"/>' +
    "</row>",
)

// the identity block gains Program and Section. r9 and r10 are re-styled to
// r7 and r8's shape exactly, so the four rows read as one table.
for (const [row, label] of [[9, NEW_STRINGS[3]], [10, NEW_STRINGS[4]]]) {
  sheet = unhideRow(sheet, row)
  sheet = setStyle(sheet, `A${row}`, 4)
  sheet = setSharedString(sheet, `A${row}`, label)
  for (const col of ["B", "C", "D", "E", "F"]) sheet = setStyle(sheet, `${col}${row}`, 69)
  sheet = setStyle(sheet, `G${row}`, 7)
  sheet = setStyle(sheet, `H${row}`, 70)
  sheet = setStyle(sheet, `I${row}`, 70)
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

// the picture is replaced wholesale; the legend's textbox is kept and corrected.
const picture = drawing.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/)[0]
drawing = drawing.replace(picture, anchor)

// 5. the legend's bands - the app's ladder (getRemark) is the truth
const LEGEND = [
  ["2.5 - 1.51 = Fair", "2.5 - 1.51 = Unsatisfactory"],
  ["1.5 - 1.00 = Needs improvement", "1.5 - 1.00 = Poor"],
]
for (const [from, to] of LEGEND) {
  if (!drawing.includes(`<a:t>${from}</a:t>`)) throw new Error(`legend text not found: ${from}`)
  drawing = drawing.replace(`<a:t>${from}</a:t>`, `<a:t>${to}</a:t>`)
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
parts.set("xl/drawings/drawing1.xml", Buffer.from(drawing, "utf-8"))
parts.set("xl/sharedStrings.xml", Buffer.from(strings, "utf-8"))
parts.set("xl/media/image1.png", logo)

// [Content_Types].xml first - the OPC convention, and what the app's zip writer does.
const ordered = [...parts.entries()].sort(([a], [b]) =>
  a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : a < b ? -1 : 1,
)
writeZip(ordered, TARGET)

console.log(`template written: ${TARGET}`)
console.log(`  letterhead   ${logoW}x${logoH} px -> ${LOGO_WIDTH_MM}mm wide (${logoCx} x ${logoCy} EMU), centred at x=${left} in a ${blockWidth} EMU block`)
console.log(`  title block  r3 title, r4 semester, r5 evaluation period (un-hidden)`)
console.log(`  identity     r9 Program, r10 Section (both re-styled to r7/r8)`)
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
const writtenSi = writtenStrings.match(/<si>[\s\S]*?<\/si>/g) || []

/** The text a cell shows, read back out of the written file. */
function readCell(ref) {
  const m = writtenSheet.match(new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`))
  if (!m) return null
  const t = (m[1].match(/\st="([^"]*)"/) || [])[1]
  const v = (m[2] || "").match(/<v>([^<]*)<\/v>/)
  if (!v) return null
  if (t === "s") {
    const siText = writtenSi[Number(v[1])].replace(/<[^>]+>/g, "")
    return siText.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  }
  return v[1]
}

const EXPECTED_CELLS_OUT = [
  ["A1", null],                                   // the banner's text is gone
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
for (const [ref, expected] of EXPECTED_CELLS_OUT) {
  const actual = readCell(ref)
  if (actual !== expected) problems.push(`${ref} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}
for (const row of [3, 4, 5, 10]) {
  if (new RegExp(`<row r="${row}"[^>]*hidden="1"`).test(writtenSheet)) {
    problems.push(`row ${row} is still hidden`)
  }
}
for (const merge of ["A5:I5", "B9:F9", "H9:I9", "B10:F10", "H10:I10"]) {
  if (!writtenSheet.includes(`<mergeCell ref="${merge}"/>`)) problems.push(`the merge ${merge} is missing`)
}
if (writtenSheet.includes('<mergeCell ref="A10:H10"/>')) problems.push("A10:H10 is still merged")
if (written.get("xl/media/image1.png").compare(readFileSync(LOGO)) !== 0) {
  problems.push("the media is not public/logo-blk.png")
}
const writtenDrawing = written.get("xl/drawings/drawing1.xml").toString("utf-8")
if (writtenDrawing.includes("<a:srcRect")) problems.push("the logo is still cropped")
if (!writtenDrawing.includes("Unsatisfactory") || !writtenDrawing.includes("1.5 - 1.00 = Poor")) {
  problems.push("the legend was not corrected")
}
// the anchor must be a VALID one: a negative offset, or an offset wider than
// its own column, is how a drawing silently lands in the wrong place.
const writtenAnchor = writtenDrawing.match(/<xdr:from>[\s\S]*?<\/xdr:from>/)
if (!writtenAnchor) {
  problems.push("the letterhead has no anchor")
} else {
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

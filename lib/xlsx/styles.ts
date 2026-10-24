/**
 * The export's style table — the workbook's LOOK, authored by us.
 *
 * An .xlsx is a zip of XML parts, and a sheet holds only cell references and
 * values: every cell's appearance is an INDEX into `xl/styles.xml`'s
 * `cellXfs` — a font, a fill, a border, a number format and an alignment. The
 * design of a workbook is therefore a small, ORDERED table, and the sheet says
 * "A11 uses xf 18".
 *
 * That is why the legacy carries 76 cell formats (spreadsheet history) and we
 * carry one per TOKEN — a semantic name ("criterion", "statementRating") the
 * sheet writer asks for. The table is built from a declaration, so the ids are
 * DERIVED from the declaration's order: a token cannot point at the wrong
 * format, and adding a token cannot renumber the others by accident.
 *
 * The colours are ours, stated here. The legacy's fonts said
 * `<color theme="1"/>` and its band said `<fgColor theme="0" tint="-0.15"/>` —
 * the colours lived in `xl/theme/theme1.xml`, and a workbook with no theme
 * part cannot use theme references. We resolve them to plain RGB:
 *
 *   the text            theme 1 (dk1)             -> FF000000
 *   the criterion band  theme 0 (lt1) tint -0.15  -> FFD9D9D9
 */

/** A font — the face, the size and the weight. */
interface FontSpec {
  name: string
  size: number
  bold?: boolean
  italic?: boolean
}

/** A border — which sides carry a hairline. */
interface BorderSpec {
  left?: boolean
  right?: boolean
  top?: boolean
  bottom?: boolean
}

/** The alignment of a cell's text. */
interface AlignSpec {
  horizontal?: "left" | "center" | "right"
  vertical?: "top" | "center" | "bottom"
  wrap?: boolean
  indent?: number
  shrink?: boolean
}

/** How a number is written. */
type NumberFormat = "general" | "accounting" | "plain2dp"

/** One cell format: the five things OOXML lets a cell say about itself. */
interface FormatSpec {
  font: FontSpec
  fill?: string
  border?: BorderSpec
  align?: AlignSpec
  numFmt?: NumberFormat
}

/** A style token — the semantic name a cell carries. */
export type StyleToken =
  | "band"
  | "title"
  | "subtitle"
  | "fieldLabel"
  | "fieldValue"
  | "fieldValueRight"
  | "ratingValue"
  | "remarksValue"
  | "criterion"
  | "criterionRating"
  | "statementFirst"
  | "statement"
  | "statementRating"
  | "averageLabel"
  | "averageValue"
  | "spacer"
  | "totalLabel"
  | "totalValue"
  | "finalLabel"
  | "finalValue"
  | "banner"
  | "comment"
  | "tableHeader"
  | "tableCell"
  | "tableNumber"
  | "tableText"

const GOTHIC = "Century Gothic"
const TEXT = "FF000000"
const BAND = "FFD9D9D9"
const BOX = { left: true, right: true, top: true, bottom: true }
const TOP_RULE = { top: true }

/**
 * The formats themselves. The values are the legacy's own — read out of the
 * reference workbook's `cellXfs` — so the generated form looks like the
 * school's.
 */
const FORMATS: Record<StyleToken, FormatSpec> = {
  band:            { font: { name: GOTHIC, size: 12, bold: true }, align: { horizontal: "right", vertical: "center", wrap: true, indent: 1 } },
  title:           { font: { name: GOTHIC, size: 10, bold: true }, align: { horizontal: "center" } },
  subtitle:        { font: { name: GOTHIC, size: 10, italic: true }, align: { horizontal: "center" } },
  fieldLabel:      { font: { name: GOTHIC, size: 10, bold: true }, align: { horizontal: "left" } },
  fieldValue:      { font: { name: GOTHIC, size: 10 }, align: { horizontal: "left" } },
  fieldValueRight: { font: { name: GOTHIC, size: 10, bold: true }, align: { horizontal: "right" } },
  ratingValue:     { font: { name: GOTHIC, size: 10 }, align: { horizontal: "center", shrink: true }, numFmt: "plain2dp" },
  remarksValue:    { font: { name: GOTHIC, size: 10 }, align: { horizontal: "center", shrink: true } },
  criterion:       { font: { name: GOTHIC, size: 9, bold: true }, fill: BAND, border: BOX, align: { horizontal: "left" } },
  criterionRating: { font: { name: GOTHIC, size: 9, bold: true }, fill: BAND, border: BOX, align: { horizontal: "center", vertical: "center" }, numFmt: "accounting" },
  statementFirst:  { font: { name: GOTHIC, size: 9 }, border: TOP_RULE, align: { horizontal: "left", vertical: "top", wrap: true, indent: 3 } },
  statement:       { font: { name: GOTHIC, size: 9 }, align: { horizontal: "left", vertical: "top", wrap: true, indent: 3 } },
  statementRating: { font: { name: GOTHIC, size: 9, bold: true }, align: { horizontal: "center", vertical: "center" }, numFmt: "accounting" },
  averageLabel:    { font: { name: GOTHIC, size: 9, bold: true }, align: { horizontal: "right" } },
  averageValue:    { font: { name: GOTHIC, size: 9, bold: true }, border: BOX, align: { horizontal: "center", vertical: "center" }, numFmt: "accounting" },
  spacer:          { font: { name: GOTHIC, size: 9, bold: true }, align: { horizontal: "right" } },
  totalLabel:      { font: { name: GOTHIC, size: 11, bold: true }, align: { horizontal: "right" } },
  totalValue:      { font: { name: GOTHIC, size: 11, bold: true }, align: { horizontal: "center", vertical: "center" }, numFmt: "accounting" },
  finalLabel:      { font: { name: GOTHIC, size: 11, bold: true }, border: { right: true }, align: { horizontal: "right", vertical: "center" } },
  finalValue:      { font: { name: GOTHIC, size: 12, bold: true }, border: BOX, align: { horizontal: "center", vertical: "center" }, numFmt: "accounting" },
  banner:          { font: { name: GOTHIC, size: 9, bold: true }, border: { top: true }, align: { horizontal: "center" } },
  comment:         { font: { name: GOTHIC, size: 8 }, align: { horizontal: "left", vertical: "center", wrap: true } },
  // the Overall sheet's table - a header band and the cells under it
  tableHeader:     { font: { name: GOTHIC, size: 9, bold: true }, fill: BAND, border: BOX, align: { horizontal: "center", vertical: "center", wrap: true } },
  tableCell:       { font: { name: GOTHIC, size: 9 }, border: BOX, align: { horizontal: "center", vertical: "center" } },
  tableNumber:     { font: { name: GOTHIC, size: 9 }, border: BOX, align: { horizontal: "center", vertical: "center" }, numFmt: "plain2dp" },
  // a table cell that carries TEXT: left, and it wraps — a subject's name and
  // a rubric's list are both longer than their column
  tableText:       { font: { name: GOTHIC, size: 9 }, border: BOX, align: { horizontal: "left", vertical: "center", wrap: true } },
}

/** The tokens, in the order their cell formats appear in styles.xml. */
export const STYLE_TOKENS = Object.keys(FORMATS) as StyleToken[]

/** The cell format id of a token — its index in the table. */
export function styleId(token: StyleToken): number {
  return STYLE_TOKENS.indexOf(token)
}

/** The number formats. `general` is the built-in 0 and needs no declaration. */
const NUMBER_FORMATS: Record<Exclude<NumberFormat, "general">, { id: number; code: string }> = {
  accounting: { id: 165, code: "_(* #,##0.00_);_(* \\(#,##0.00\\);_(* \\-??_);_(@_)" },
  plain2dp: { id: 166, code: "0.00;[Red](0.00)" },
}

function fontXml(font: FontSpec): string {
  return (
    "<font>" +
    (font.bold ? "<b/>" : "") +
    (font.italic ? "<i/>" : "") +
    `<sz val="${font.size}"/>` +
    `<color rgb="${TEXT}"/>` +
    `<name val="${font.name}"/>` +
    '<family val="2"/>' +
    "</font>"
  )
}

function fillXml(rgb: string): string {
  return `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
}

function borderXml(border: BorderSpec): string {
  const side = (name: string, on?: boolean) => (on ? `<${name} style="thin"/>` : `<${name}/>`)
  return (
    "<border>" +
    side("left", border.left) +
    side("right", border.right) +
    side("top", border.top) +
    side("bottom", border.bottom) +
    "<diagonal/></border>"
  )
}

function alignXml(align: AlignSpec): string {
  const attrs = [
    align.horizontal ? `horizontal="${align.horizontal}"` : "",
    align.vertical ? `vertical="${align.vertical}"` : "",
    `wrapText="${align.wrap ? "true" : "false"}"`,
    align.indent ? `indent="${align.indent}"` : "",
    `shrinkToFit="${align.shrink ? "true" : "false"}"`,
  ].filter(Boolean)
  return `<alignment ${attrs.join(" ")}/>`
}

/** Add an xml fragment to a list, reusing the entry it already has. */
function intern(table: Map<string, number>, key: string, xml: string, list: string[]): number {
  const existing = table.get(key)
  if (existing !== undefined) return existing
  table.set(key, list.length)
  list.push(xml)
  return list.length - 1
}

/** The workbook's style part — the look, in one piece. */
export function buildStylesXml(): string {
  const fonts: string[] = []
  const fills: string[] = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ]
  const borders: string[] = ["<border><left/><right/><top/><bottom/><diagonal/></border>"]
  const fontIds = new Map<string, number>()
  const fillIds = new Map<string, number>()
  const borderIds = new Map<string, number>()
  const xfs: string[] = []

  for (const token of STYLE_TOKENS) {
    const spec = FORMATS[token]
    const fontId = intern(fontIds, JSON.stringify(spec.font), fontXml(spec.font), fonts)
    const fillId = spec.fill ? intern(fillIds, spec.fill, fillXml(spec.fill), fills) : 0
    const borderId = spec.border ? intern(borderIds, JSON.stringify(spec.border), borderXml(spec.border), borders) : 0
    const numFmtId = spec.numFmt && spec.numFmt !== "general" ? NUMBER_FORMATS[spec.numFmt].id : 0
    xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
        ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
        alignXml(spec.align ?? {}) +
        "</xf>",
    )
  }

  const numFmts = Object.values(NUMBER_FORMATS)
    .map((f) => `<numFmt numFmtId="${f.id}" formatCode="${f.code}"/>`)
    .join("")

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${Object.keys(NUMBER_FORMATS).length}">${numFmts}</numFmts>` +
    `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
    `<fills count="${fills.length}">${fills.join("")}</fills>` +
    `<borders count="${borders.length}">${borders.join("")}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/>' +
    "</styleSheet>"
  )
}

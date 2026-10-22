import { inflateRawSync } from "zlib"

/**
 * The workbook's MECHANICS — the zip reader and the cell/row rules.
 *
 * ⭐ This module used to be the export's template half: the export FILLED
 * `data/templates/eval-report.xlsx` and read and rewrote its cells here. The
 * export now GENERATES the workbook (`lib/xlsx/`), so what is left is the
 * reader the **cut script** shares with the writer's tests — the cell and row
 * rules, so a cut and a test cannot disagree about how a cell is edited.
 *
 * It is a NODE module (it inflates), so only the cut script and the tests may
 * import it.
 */

/** A workbook's parts, keyed by their path inside the zip. */
export type WorkbookParts = Map<string, Uint8Array>

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
  // an INLINE string carries its text in <is><t>, not in <v>
  const inline = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)
  const shared = /\st="s"/.test(m[1])
  return {
    style: (m[1].match(/\ss="(\d+)"/) || [])[1] ?? null,
    value: inline ? inline[1] : v ? v[1] : null,
    isString: shared || !!inline,
    formula: f ? f[1] : null,
  }
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

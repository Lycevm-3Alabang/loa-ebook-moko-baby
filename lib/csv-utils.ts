/**
 * Strip leading/trailing whitespace and escape characters from a CSV cell value.
 * Handles Excel's "'" prefix that prevents auto-formatting (e.g. `'41E1` → `41E1`).
 */
export function cleanCell(s: string): string {
  return s.trim().replace(/^['"]+|['"]+$/g, "")
}

/**
 * Parse a raw CSV text into rows of string arrays.
 * Properly handles RFC 4180 quoted fields including those with
 * embedded newlines, commas, and escaped double-quotes ("").
 * Removes empty lines and returns each row as an array of cleaned cell values.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        currentField += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else if (char === '\r') {
        // skip CR inside quoted field; LF is the row boundary
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField)
        currentField = ""
      } else if (char === '\n') {
        currentRow.push(currentField)
        currentField = ""
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
      } else if (char === '\r') {
        // skip CR, LF follows
      } else {
        currentField += char
      }
    }
  }

  // flush last row if file ends without trailing newline
  currentRow.push(currentField)
  if (currentRow.some((f) => f.length > 0)) {
    rows.push(currentRow)
  }

  return rows
}

/**
 * Normalize a subject-code cell: trims whitespace, strips surrounding
 * single/double quotes and one or more layers of surrounding parentheses.
 * `(1810-IE003)`, `'(1810-IE003)'`, and `"(1810-IE003)"` all become
 * `1810-IE003`. Only a balanced outer pair is stripped, so unbalanced
 * content is left untouched.
 */
export function cleanSubjectCode(cell: string): string {
  let v = cleanCell(cell || "")
  for (let i = 0; i < 3; i++) {
    const len = v.length
    v = v.replace(/^['"]+|['"]+$/g, "").trim()
    if (v.length >= 2 && v.startsWith("(") && v.endsWith(")")) {
      v = v.slice(1, -1).trim()
    }
    v = v.replace(/^['"]+|['"]+$/g, "").trim()
    if (v.length === len) break
  }
  return v
}

/**
 * Excel formula-error tokens exported as literal cell text (e.g. a VLOOKUP
 * failure saves as `#VALUE!`). Such cells are never valid names, emails,
 * codes, or sections — callers must flag the row as invalid/blocked.
 */
const EXCEL_ERROR_EXACT = new Set([
  "#DIV/0!",
  "#N/A",
  "#NAME?",
  "#NULL!",
  "#NUM!",
  "#REF!",
  "#VALUE!",
  "#CALC!",
  "#SPILL!",
  "#FIELD!",
  "#BLOCKED!",
])

const EXCEL_ERROR_PREFIX = /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|CALC!|SPILL!|FIELD!|BLOCKED!)/i

export function isExcelErrorCell(cell: string): boolean {
  const v = (cell || "").trim().toUpperCase()
  if (v.length === 0) return false
  if (EXCEL_ERROR_EXACT.has(v)) return true
  return EXCEL_ERROR_PREFIX.test(v)
}

/**
 * Parse a raw CSV text into headers and data rows.
 * Removes empty lines and returns cleaned cell values.
 */
export function parseCsvLines(text: string): { headers: string[]; rows: string[][] } {
  const allRows = parseCsvRows(text)
  if (allRows.length < 2) return { headers: [], rows: [] }

  const headers = allRows[0].map((h) => cleanCell(h).toLowerCase())
  const rows = allRows.slice(1).map((row) => row.map((c) => cleanCell(c)))

  return { headers, rows }
}

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

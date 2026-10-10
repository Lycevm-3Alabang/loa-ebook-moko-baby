/**
 * Domains accepted for student email addresses. Shared by the import service
 * (server) and the client preview so both enforce exactly one rule — the list
 * previously lived in both places joined only by a comment, and drifted apart
 * in meaning (client hard-blocked on a blank email, server rejected it per row).
 */
export const STUDENT_ALLOWED_DOMAINS = ["@lyceumalabang.edu.ph", "@itmlyceumalabang.onmicrosoft.com"]

/** True only for a non-empty email ending in an allowed student domain. */
export function isAllowedStudentEmail(email: string): boolean {
  const normalized = (email || "").trim().toLowerCase()
  if (normalized.length === 0) return false
  return STUDENT_ALLOWED_DOMAINS.some((d) => normalized.endsWith(d))
}

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

// ── Import reason codes (D3 ledger) ─────────────────────────
// Closed vocabulary shared by the student-import service (server) and the
// preview/ledger UI (client), so both sides name every outcome identically.
// Same pattern as STUDENT_ALLOWED_DOMAINS above: one list, one predicate.
// Remarks preserve the server's current phrasings; the CODES are the contract.
export const IMPORT_REASON_CODES = {
  EMAIL_BLANK: "Email is required",
  EMAIL_DOMAIN_NOT_ALLOWED: "Email must end with @lyceumalabang.edu.ph or @itmlyceumalabang.onmicrosoft.com",
  EXCEL_ERROR_CELL: "Invalid value in {column} (Excel error)",
  STUDENT_NOT_FOUND: "Student not found",
  SUBJECT_NOT_FOUND: 'Subject "{code}" not found',
  SECTION_NOT_FOUND: 'Section "{section}" not found',
  FACULTY_NOT_FOUND: 'Faculty "{email}" not found',
  FACULTY_NOT_ASSIGNED: "{email} not assigned to {subject} in {section}",
  NO_FACULTY_ASSIGNED: "No faculty assigned to {subject} in {section}",
  TRANSPORT_ERROR: "Chunk {n} failed after {k} attempts: {error}",
  REMOVED_BY_ADMIN: "Removed in preview",
  REMOVED_BLOCKED: "Removed with {n} other blocked rows",
  DEPARTMENT_UNRESOLVED: "Enrolled; no department attributed ({detail})",
  DEPARTMENT_MISMATCH: 'Enrolled; row says "{code}", section belongs to "{sectionDept}"',
  DEPARTMENT_FROM_FIRST_ROW: 'Enrolled; department "{code}" taken from the student\'s first row in the file',
  DUPLICATE_IN_FILE: "Duplicate of row {row} in this file",
  ALREADY_PERSISTED: "Already persisted — enrollment already in the database",
} as const

export type ImportReasonCode = keyof typeof IMPORT_REASON_CODES

/** Fill `{placeholders}` from ctx; unknown tokens are left verbatim. */
export function reasonRemarks(code: ImportReasonCode, ctx: Record<string, string> = {}): string {
  return IMPORT_REASON_CODES[code].replace(/\{(\w+)\}/g, (_, key: string) => ctx[key] ?? `{${key}}`)
}

/**
 * Quote a single CSV cell (RFC 4180): quote only when the value contains a
 * comma, quote, or newline, doubling embedded quotes. Shared by the import
 * service and the ledger UI so every download escapes identically.
 */
export function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

import { escapeCsvCell, isAllowedStudentEmail, reasonRemarks, type ImportReasonCode } from "@/lib/csv-utils"

/** Minimum a row must expose to appear in the blocked-rows download. */
export interface BlockedRowLike {
  row: number
  name: string
  email: string
  subjectCode: string
  section: string
  facultyEmail: string
  departmentCode: string
}

export const BLOCKED_CSV_FILENAME = "student-blocked-rows.csv"

const BLOCKED_HEADER = "row,name,email,subject code,section,faculty email,department code,reason"

/** Same cause mapping the badges use — one definition, tested here. */
export function blockedReasonCode(row: Pick<BlockedRowLike, "email">): ImportReasonCode {
  if (row.email.trim().length === 0) return "EMAIL_BLANK"
  if (!isAllowedStudentEmail(row.email)) return "EMAIL_DOMAIN_NOT_ALLOWED"
  return "EXCEL_ERROR_CELL"
}

/**
 * CSV of blocked rows for fixing outside the page (re-upload the corrected
 * file, or fix inline). Speaks ledger language: reason codes + remarks are
 * the same vocabulary D3 stamps server-side.
 */
export function buildBlockedCsv(rows: BlockedRowLike[]): string {
  const lines = rows.map((r) => {
    const code = blockedReasonCode(r)
    return [
      String(r.row),
      r.name,
      r.email,
      r.subjectCode,
      r.section,
      r.facultyEmail,
      r.departmentCode,
      reasonRemarks(code),
    ].map(escapeCsvCell).join(",")
  })
  return [BLOCKED_HEADER, ...lines].join("\n")
}

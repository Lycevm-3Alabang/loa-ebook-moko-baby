import { isAllowedStudentEmail } from "@/lib/csv-utils"

/** Single-select issue filter for the preview table (table-first slice 6). */
export const ISSUE_KEYS = [
  "invalid-email",
  "no-teacher",
  "unknown-subject",
  "unknown-section",
  "unknown-faculty",
  "dept-unknown",
  "has-issues",
  "no-issues",
] as const

export type IssueKey = (typeof ISSUE_KEYS)[number]

export const ISSUE_LABELS: Record<IssueKey, string> = {
  "invalid-email": "Invalid email",
  "no-teacher": "No teacher",
  "unknown-subject": "Unknown subject",
  "unknown-section": "Unknown section",
  "unknown-faculty": "Unknown faculty",
  "dept-unknown": "Dept unknown",
  "has-issues": "Has issues",
  "no-issues": "No issues",
}

/** Minimum a row must expose to be issue-filtered. */
export interface IssueRowLike {
  email: string
  isNewStudent: boolean
  isNewSubject: boolean
  isNewSection: boolean
  isNewFaculty: boolean
  facultyNotAssigned: boolean
  isInvalidDepartment: boolean
  isInvalidValue: boolean
}

const emailMissing = (v: string) => v.trim().length === 0
const emailOffDomain = (v: string) => v.trim().length > 0 && !isAllowedStudentEmail(v)

/**
 * Whether a row has ANY issue — the union of every granular key plus the
 * invalid-value catch-all (an Excel error in a non-email cell matches no
 * granular key but is still an issue). `no-issues` is its exact negation, so
 * the Ready badge and the dropdown can never disagree.
 *
 * New students are deliberately absent from this vocabulary: registration is
 * Step 1's business, and a newcomer is never a Step 2 issue.
 */
export function hasIssue(row: IssueRowLike): boolean {
  return (
    row.isInvalidValue ||
    emailMissing(row.email) ||
    emailOffDomain(row.email) ||
    row.isNewSubject ||
    row.isNewSection ||
    row.isNewFaculty ||
    row.facultyNotAssigned ||
    row.isInvalidDepartment
  )
}

export function matchesIssue(row: IssueRowLike, issue: IssueKey): boolean {
  switch (issue) {
    case "invalid-email":
      return emailMissing(row.email) || emailOffDomain(row.email)
    case "no-teacher":
      return row.facultyNotAssigned || row.isNewFaculty
    case "unknown-subject":
      return row.isNewSubject
    case "unknown-section":
      return row.isNewSection
    case "unknown-faculty":
      return row.isNewFaculty
    case "dept-unknown":
      return row.isInvalidDepartment
    case "has-issues":
      return hasIssue(row)
    case "no-issues":
      return !hasIssue(row)
  }
}

import { isAllowedStudentEmail } from "@/lib/csv-utils"

/** Single-select issue filter for the preview table (table-first slice 6). */
export const ISSUE_KEYS = [
  "invalid-email",
  "no-teacher",
  "new-student",
  "unknown-subject",
  "unknown-section",
  "unknown-faculty",
  "dept-unknown",
] as const

export type IssueKey = (typeof ISSUE_KEYS)[number]

export const ISSUE_LABELS: Record<IssueKey, string> = {
  "invalid-email": "Invalid email",
  "no-teacher": "No teacher",
  "new-student": "New student",
  "unknown-subject": "Unknown subject",
  "unknown-section": "Unknown section",
  "unknown-faculty": "Unknown faculty",
  "dept-unknown": "Dept unknown",
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

export function matchesIssue(row: IssueRowLike, issue: IssueKey): boolean {
  switch (issue) {
    case "invalid-email":
      return emailMissing(row.email) || emailOffDomain(row.email)
    case "no-teacher":
      return row.facultyNotAssigned || row.isNewFaculty
    case "new-student":
      return row.isNewStudent
    case "unknown-subject":
      return row.isNewSubject
    case "unknown-section":
      return row.isNewSection
    case "unknown-faculty":
      return row.isNewFaculty
    case "dept-unknown":
      return row.isInvalidDepartment
  }
}

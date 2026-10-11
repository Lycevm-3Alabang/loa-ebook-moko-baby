import { describe, expect, it } from "vitest"
import { ISSUE_KEYS, ISSUE_LABELS, matchesIssue, type IssueRowLike } from "@/features/users/components/bulk-import/issue-filter"

const clean: IssueRowLike = {
  email: "a@itmlyceumalabang.onmicrosoft.com",
  isNewStudent: false,
  isNewSubject: false,
  isNewSection: false,
  isNewFaculty: false,
  facultyNotAssigned: false,
  isInvalidDepartment: false,
  isInvalidValue: false,
}

describe("matchesIssue", () => {
  it("flags missing and off-domain emails only", () => {
    expect(matchesIssue({ ...clean, email: "" }, "invalid-email")).toBe(true)
    expect(matchesIssue({ ...clean, email: "a@gmail.com" }, "invalid-email")).toBe(true)
    expect(matchesIssue(clean, "invalid-email")).toBe(false)
  })

  it("treats unassigned and unknown faculty both as no-teacher", () => {
    expect(matchesIssue({ ...clean, facultyNotAssigned: true }, "no-teacher")).toBe(true)
    expect(matchesIssue({ ...clean, isNewFaculty: true }, "no-teacher")).toBe(true)
    expect(matchesIssue(clean, "no-teacher")).toBe(false)
  })

  it("matches the remaining flags one to one", () => {
    expect(matchesIssue({ ...clean, isNewStudent: true }, "new-student")).toBe(true)
    expect(matchesIssue({ ...clean, isNewSubject: true }, "unknown-subject")).toBe(true)
    expect(matchesIssue({ ...clean, isNewSection: true }, "unknown-section")).toBe(true)
    expect(matchesIssue({ ...clean, isNewFaculty: true }, "unknown-faculty")).toBe(true)
    expect(matchesIssue({ ...clean, isInvalidDepartment: true }, "dept-unknown")).toBe(true)
    expect(matchesIssue(clean, "new-student")).toBe(false)
  })

  it("covers every key with a label", () => {
    expect(ISSUE_KEYS).toHaveLength(7)
    for (const key of ISSUE_KEYS) expect(ISSUE_LABELS[key].length).toBeGreaterThan(0)
  })
})

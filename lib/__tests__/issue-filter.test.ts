import { describe, expect, it } from "vitest"
import { hasIssue, ISSUE_KEYS, ISSUE_LABELS, matchesIssue, type IssueRowLike } from "@/features/users/components/bulk-import/issue-filter"

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
    expect(ISSUE_KEYS).toHaveLength(9)
    for (const key of ISSUE_KEYS) expect(ISSUE_LABELS[key].length).toBeGreaterThan(0)
  })

  it("treats has-issues as the exact union, no-issues as its negation", () => {
    expect(matchesIssue(clean, "has-issues")).toBe(false)
    expect(matchesIssue(clean, "no-issues")).toBe(true)
    expect(matchesIssue({ ...clean, isNewSubject: true }, "has-issues")).toBe(true)
    expect(matchesIssue({ ...clean, isNewSubject: true }, "no-issues")).toBe(false)
  })

  it("does not count a new student as an issue (insert candidate, not a problem)", () => {
    const newcomer: IssueRowLike = { ...clean, isNewStudent: true }
    expect(hasIssue(newcomer)).toBe(false)
    expect(matchesIssue(newcomer, "no-issues")).toBe(true)
    expect(matchesIssue(newcomer, "has-issues")).toBe(false)
    // ...yet the informational key still finds them
    expect(matchesIssue(newcomer, "new-student")).toBe(true)
  })

  it("counts an invalid-value-only row as an issue (the precision case)", () => {
    const excelElsewhere: IssueRowLike = { ...clean, isInvalidValue: true }
    expect(hasIssue(excelElsewhere)).toBe(true)
    expect(matchesIssue(excelElsewhere, "has-issues")).toBe(true)
    expect(matchesIssue(excelElsewhere, "no-issues")).toBe(false)
    // ...and no granular key claims it
    expect(matchesIssue(excelElsewhere, "invalid-email")).toBe(false)
  })
})

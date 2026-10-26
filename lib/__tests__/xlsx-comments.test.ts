import { describe, it, expect } from "vitest"
import {
  buildCommentsModel,
  buildGroupedCommentsModel,
  renderCommentsSheet,
  commentHeight,
  COMMENTS_BANNER,
} from "@/lib/xlsx/comments"
import type { Identity } from "@/lib/xlsx/form-model"

const IDENTITY: Identity = {
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  employeeNo: "2024-0017",
  facultyName: "Dela Cruz",
  avgRating: 4.2,
  remarks: "Very Satisfactory",
}

describe("the Comments sheet", () => {
  it("carries the identity block and the banner", () => {
    const rows = buildCommentsModel(IDENTITY, ["A comment."])
    expect(rows[0]).toMatchObject({ kind: "title" })
    expect(rows.find((r) => r.kind === "banner")).toEqual({ kind: "banner", text: COMMENTS_BANNER })
    // and no band - the legacy's comments sheet has no image band
    expect(rows.some((r) => r.kind === "band")).toBe(false)
  })

  it("puts the comment's TEXT in the merge's anchor", () => {
    const sheet = renderCommentsSheet(buildCommentsModel(IDENTITY, ["Great explanations."]))
    const comment = sheet.rows.find((r) => r.cells[0].value === "Great explanations.")
    // the identity block (5 rows) + the gap + the banner = the comment is row 8
    expect(comment?.cells[0]).toMatchObject({ ref: "A8", style: "comment", value: "Great explanations." })
    // the row is merged across the sheet, so the text is the one cell that survives
    expect(sheet.merges).toContain("A8:I8")
    // and no date anywhere - "comments, nothing more"
    expect(sheet.rows.some((r) => r.cells.some((c) => typeof c.value === "string" && /\d{4}-\d{2}-\d{2}/.test(c.value)))).toBe(false)
  })

  it("gives a comment row the legacy's floor, and grows it with the text", () => {
    // the floor is the legacy's 40.5 pt — three lines' worth — so a short
    // comment keeps it and a long one grows past it
    expect(commentHeight("Short.")).toBe(40.5)
    expect(commentHeight("x".repeat(250))).toBe(40.5)
    expect(commentHeight("x".repeat(400))).toBeGreaterThan(40.5)
  })

  it("repeats the identity block and the banner on every page", () => {
    const sheet = renderCommentsSheet(buildCommentsModel(IDENTITY, ["One.", "Two."]))
    expect(sheet.printArea).toBe("$A:$I")
    expect(sheet.printTitles).toBe("$1:$7")
  })

  it("refuses a row it does not have", () => {
    expect(() => renderCommentsSheet([{ kind: "criterion", heading: "I. X" }])).toThrow(/no "criterion" row/)
  })
})

describe("the Comments sheet at the faculty grain", () => {
  const GROUPS = [
    {
      label: "1815-ITELEC009 Introduction to Computing — BSIT-31E1",
      comments: ["Great explanations.", "Clear."],
    },
    {
      label: "1815-ITELEC010 Data Structures — BSIT-31E2",
      comments: ["More examples."],
    },
  ]

  it("prints a group banner over each subject-section's comments", () => {
    const sheet = renderCommentsSheet(buildGroupedCommentsModel(IDENTITY, GROUPS))
    // the identity block (5) + the gap + the sheet's banner = the group is row 8
    const group = sheet.rows.find(
      (row) => row.cells[0].value === "1815-ITELEC009 Introduction to Computing — BSIT-31E1",
    )
    expect(group?.cells[0]).toMatchObject({ ref: "A8", style: "banner" })
    expect(sheet.merges).toContain("A8:I8")
    // and the first comment sits under it, in the comment style
    const comment = sheet.rows.find((row) => row.cells[0].value === "Great explanations.")
    expect(comment?.cells[0]).toMatchObject({ ref: "A9", style: "comment" })
    expect(sheet.merges).toContain("A9:I9")
  })

  it("gives a subject-section with no comments NO group", () => {
    const rows = buildGroupedCommentsModel(IDENTITY, [
      { label: "1815-ITELEC008 — BSIT-31E1", comments: [] },
      { label: "1815-ITELEC009 — BSIT-31E1", comments: ["One."] },
    ])
    expect(rows.some((row) => row.kind === "group" && row.text.startsWith("1815-ITELEC008"))).toBe(false)
    expect(rows.some((row) => row.kind === "group" && row.text.startsWith("1815-ITELEC009"))).toBe(true)
  })

  it("stops the print titles before the first group — the identity and banner repeat", () => {
    const sheet = renderCommentsSheet(buildGroupedCommentsModel(IDENTITY, GROUPS))
    expect(sheet.printArea).toBe("$A:$I")
    expect(sheet.printTitles).toBe("$1:$7")
  })

  it("still prints no date anywhere", () => {
    const sheet = renderCommentsSheet(buildGroupedCommentsModel(IDENTITY, GROUPS))
    expect(
      sheet.rows.some((row) =>
        row.cells.some((c) => typeof c.value === "string" && /\d{4}-\d{2}-\d{2}/.test(c.value)),
      ),
    ).toBe(false)
  })

  it("has no groups when the faculty has no comments", () => {
    const rows = buildGroupedCommentsModel(IDENTITY, [])
    expect(rows.some((row) => row.kind === "group" || row.kind === "comment")).toBe(false)
    const sheet = renderCommentsSheet(rows)
    // only the identity block and the banner — nothing to create a body row
    expect(sheet.printTitles).toBe("$1:$7")
  })
})

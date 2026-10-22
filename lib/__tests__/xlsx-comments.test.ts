import { describe, it, expect } from "vitest"
import {
  buildCommentsModel,
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

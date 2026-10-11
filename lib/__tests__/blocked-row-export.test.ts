import { describe, expect, it } from "vitest"
import { blockedReasonCode, buildBlockedCsv, type BlockedRowLike } from "@/features/users/components/bulk-import/blocked-row-export"

const blocked = (over: Partial<BlockedRowLike> = {}): BlockedRowLike => ({
  row: 1214,
  name: "Maria Santos",
  email: "maria@gmail.com",
  subjectCode: "MATH201",
  section: "BSCS-21B",
  facultyEmail: "f@lyceumalabang.edu.ph",
  departmentCode: "CCS",
  ...over,
})

describe("buildBlockedCsv", () => {
  it("emits the header plus one reasoned line per row", () => {
    const csv = buildBlockedCsv([blocked(), blocked({ row: 1215, email: "" })])
    const [header, ...lines] = csv.split("\n")
    expect(header).toBe("row,name,email,subject code,section,faculty email,department code,reason")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("1214")
    expect(lines[1]).toContain("1215")
  })

  it("codes all three causes", () => {
    expect(blockedReasonCode(blocked({ email: "" }))).toBe("EMAIL_BLANK")
    expect(blockedReasonCode(blocked({ email: "a@gmail.com" }))).toBe("EMAIL_DOMAIN_NOT_ALLOWED")
    expect(blockedReasonCode(blocked({ email: "a@itmlyceumalabang.onmicrosoft.com", name: "#DIV/0!" }))).toBe("EXCEL_ERROR_CELL")
  })

  it("escapes commas and quotes", () => {
    const csv = buildBlockedCsv([blocked({ name: 'Santos, "Maria"' })])
    expect(csv).toContain('"Santos, ""Maria"""')
  })

  it("yields header-only for no rows", () => {
    expect(buildBlockedCsv([]).split("\n")).toHaveLength(1)
  })
})

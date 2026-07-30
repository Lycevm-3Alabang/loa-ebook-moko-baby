import { describe, it, expect } from "vitest"
import { cleanCell, parseCsvRows, parseCsvLines } from "@/lib/csv-utils"

// ── cleanCell ─────────────────────────────────────────────

describe("cleanCell", () => {
  it("trims whitespace", () => {
    expect(cleanCell("  hello  ")).toBe("hello")
  })

  it("strips leading single quotes (Excel prefix)", () => {
    expect(cleanCell("'CS101")).toBe("CS101")
  })

  it("strips trailing double quotes", () => {
    expect(cleanCell("CS101\"")).toBe("CS101")
  })

  it("strips both leading and trailing quotes", () => {
    expect(cleanCell("'CS101'")).toBe("CS101")
  })

  it("strips leading double quotes", () => {
    expect(cleanCell("\"CS101")).toBe("CS101")
  })

  it("returns empty string for blank input", () => {
    expect(cleanCell("   ")).toBe("")
  })

  it("returns plain text unchanged", () => {
    expect(cleanCell("Introduction to CS")).toBe("Introduction to CS")
  })

  it("handles mixed whitespace and quotes", () => {
    expect(cleanCell("  ' CS101 '  ")).toBe(" CS101 ")
  })
})

// ── parseCsvLines ─────────────────────────────────────────

// ── parseCsvRows ──────────────────────────────────────────

describe("parseCsvRows", () => {
  it("parses basic CSV", () => {
    const rows = parseCsvRows("a,b,c\n1,2,3\n4,5,6")
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(["a", "b", "c"])
    expect(rows[1]).toEqual(["1", "2", "3"])
    expect(rows[2]).toEqual(["4", "5", "6"])
  })

  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsvRows('name,email\n"Reynaldo, Jr. Lagrada",r.lagrada@test.com')
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe("Reynaldo, Jr. Lagrada")
    expect(rows[1][1]).toBe("r.lagrada@test.com")
  })

  it("handles quoted fields with embedded newlines (your exact use case)", () => {
    const text = "name,email,role,dept_code,program_code,employee_no\nRakel Abapo,r.abapo@test.ph,\"Faculty\n\",CREM,,"
    const rows = parseCsvRows(text)
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe("Rakel Abapo")
    expect(rows[1][2].trim()).toBe("Faculty")
    expect(rows[1][3]).toBe("CREM")
  })

  it("handles escaped double-quotes inside quoted fields", () => {
    const rows = parseCsvRows('note\n"He said ""Hello"" to me"')
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe('He said "Hello" to me')
  })

  it("handles Windows CRLF line endings", () => {
    const rows = parseCsvRows("a,b\r\n1,2\r\n3,4")
    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual(["1", "2"])
  })

  it("skips empty rows", () => {
    const rows = parseCsvRows("a,b\n1,2\n\n3,4\n")
    expect(rows).toHaveLength(3)
    expect(rows[2]).toEqual(["3", "4"])
  })

  it("returns single row for header-only content", () => {
    const rows = parseCsvRows("a,b")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(["a", "b"])
  })

  it("returns empty array for empty string", () => {
    expect(parseCsvRows("")).toEqual([])
  })
})

// ── parseCsvLines ─────────────────────────────────────────

describe("parseCsvLines", () => {
  it("parses valid CSV", () => {
    const text = "code, name\nCS101, Intro to CS\nMATH201, Calculus II"
    const { headers, rows } = parseCsvLines(text)
    expect(headers).toEqual(["code", "name"])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(["CS101", "Intro to CS"])
    expect(rows[1]).toEqual(["MATH201", "Calculus II"])
  })

  it("lowercases headers", () => {
    const { headers } = parseCsvLines("Code, Name\nCS101, Intro")
    expect(headers).toEqual(["code", "name"])
  })

  it("trims whitespace and strips quotes from cells", () => {
    const { headers, rows } = parseCsvLines("  Code  ,  Name  \n  'CS101'  ,  'Intro'  ")
    expect(headers).toEqual(["code", "name"])
    expect(rows[0]).toEqual(["CS101", "Intro"])
  })

  it("skips empty lines", () => {
    const text = "code, name\nCS101, Intro\n\nMATH201, Calc II\n"
    const { rows } = parseCsvLines(text)
    expect(rows).toHaveLength(2)
  })

  it("returns empty for header-only CSV", () => {
    const { headers, rows } = parseCsvLines("code, name")
    expect(headers).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })

  it("returns empty for empty string", () => {
    const { headers, rows } = parseCsvLines("")
    expect(headers).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })

  it("handles Windows-style line endings", () => {
    const text = "code, name\r\nCS101, Intro\r\nMATH201, Calc II"
    const { rows } = parseCsvLines(text)
    expect(rows).toHaveLength(2)
  })
})

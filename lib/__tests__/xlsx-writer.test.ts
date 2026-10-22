import { describe, it, expect } from "vitest"
import { buildWorkbook, colIndex, colName, type SheetSpec } from "@/lib/xlsx/writer"
import { styleId } from "@/lib/xlsx/styles"
import { readZip, partText } from "@/lib/xlsx-template"

const SHEET: SheetSpec = {
  name: "Individual",
  columns: [{ from: "A", to: "A", width: 16.14 }, { from: "B", to: "H", width: 9.14 }],
  rows: [
    { row: 1, height: 82.5, cells: [{ ref: "A1", style: "band", value: "FACULTY PERFORMANCE EVALUATION" }] },
    {
      row: 2,
      height: 13.5,
      cells: [
        { ref: "A2", style: "statement", value: "A statement" },
        { ref: "I2", style: "statementRating", value: 4.2 },
      ],
    },
  ],
  merges: ["A1:I1", "A2:H2"],
  printArea: "$A:$I",
  printTitles: "$1:$10",
}

function built() {
  const parts = readZip(
    buildWorkbook({
      sheets: [SHEET],
      media: [{ name: "image1.png", bytes: new Uint8Array([137, 80, 78, 71]) }],
    }),
  )
  return {
    parts,
    sheet: partText(parts, "xl/worksheets/sheet1.xml"),
    workbook: partText(parts, "xl/workbook.xml"),
  }
}

describe("the workbook writer", () => {
  it("writes the package's parts", () => {
    const { parts } = built()
    for (const name of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(parts.has(name)).toBe(true)
    }
  })

  it("writes the cells, the merges and the widths", () => {
    const { sheet } = built()
    // the sheet's style ids come from the style table's tokens
    expect(sheet).toContain(`<c r="A2" s="${styleId("statement")}"`)
    expect(sheet).toContain('<t xml:space="preserve">A statement</t>')
    expect(sheet).toContain("<v>4.2</v>")
    expect(sheet).toContain('<mergeCell ref="A1:I1"/>')
    expect(sheet).toContain('<col min="1" max="1" width="16.14" customWidth="1"/>')
    expect(sheet).toContain('<row r="1" ht="82.5" customHeight="1">')
    expect(sheet).toContain('<dimension ref="A1:I2"/>')
  })

  it("writes the print setup we author", () => {
    const { sheet, workbook } = built()
    expect(sheet).toContain('<pageSetup paperSize="1" orientation="portrait" fitToWidth="1" fitToHeight="0"/>')
    expect(workbook).toContain('name="_xlnm.Print_Area"')
    expect(workbook).toContain('name="_xlnm.Print_Titles"')
  })

  it("writes a landscape sheet's own orientation", () => {
    const parts = readZip(buildWorkbook({ sheets: [{ ...SHEET, orientation: "landscape" }] }))
    expect(partText(parts, "xl/worksheets/sheet1.xml")).toContain(
      '<pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"/>',
    )
  })

  it("refuses a picture whose anchor is broken", () => {
    expect(() =>
      buildWorkbook({
        sheets: [
          {
            ...SHEET,
            picture: { media: "image1.png", from: { col: 0, colOff: -1, row: 0, rowOff: 0 }, ext: { cx: 100, cy: 100 } },
          },
        ],
      }),
    ).toThrow(/negative offset/)
  })

  it("names the columns the way Excel does", () => {
    expect(colName(0)).toBe("A")
    expect(colName(25)).toBe("Z")
    expect(colName(26)).toBe("AA")
    expect(colIndex("AA")).toBe(26)
  })
})

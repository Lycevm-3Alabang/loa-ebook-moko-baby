import { describe, it, expect } from "vitest"
import { readZip } from "@/lib/xlsx-template"
import { createZip } from "@/lib/zip"
import { createDeflatedZip } from "@/lib/zip-deflate"

const TEXT = "Faculty Performance Evaluation — the same bytes, compressed. ".repeat(50)
const bytes = (text: string) => new TextEncoder().encode(text)

const ENTRIES = [
  {
    name: "CCS/Alamo, Nino Francisco/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
    data: bytes(TEXT),
  },
  {
    name: "CCS/Alamo, Nino Francisco/Alamo_Nino_Francisco_summary.xlsx",
    data: bytes(TEXT),
  },
  {
    name: "CCS/Dela Cruz, Juan/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
    data: bytes(TEXT),
  },
]

describe("the DEFLATE zip", () => {
  it("round-trips the entries through the repo's own reader", () => {
    const parts = readZip(createDeflatedZip(ENTRIES))
    expect(parts.size).toBe(3)
    expect(new TextDecoder().decode(parts.get(ENTRIES[0].name)!)).toBe(TEXT)
  })

  it("is smaller than the store zip", () => {
    expect(createDeflatedZip(ENTRIES).length).toBeLessThan(createZip(ENTRIES).length)
  })

  it("carries the same names, in the same order, as the store zip", () => {
    // ⭐ the two writers must agree on the LAYOUT — the export's ZIP and the
    // workbook's package are read by the same readers
    expect([...readZip(createDeflatedZip(ENTRIES)).keys()]).toEqual([
      ...readZip(createZip(ENTRIES)).keys(),
    ])
  })

  it("handles an empty entry and an empty archive", () => {
    const parts = readZip(createDeflatedZip([{ name: "empty.bin", data: new Uint8Array(0) }]))
    expect(parts.get("empty.bin")!.length).toBe(0)
    expect(readZip(createDeflatedZip([])).size).toBe(0)
  })
})

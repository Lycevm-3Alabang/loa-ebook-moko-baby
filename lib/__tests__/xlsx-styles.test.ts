import { describe, it, expect } from "vitest"
import { STYLE_TOKENS, styleId, buildStylesXml } from "@/lib/xlsx/styles"

describe("the export's style table", () => {
  it("gives every token its own cell format", () => {
    expect(STYLE_TOKENS.map(styleId)).toEqual(STYLE_TOKENS.map((_, i) => i))
  })

  it("counts what it declares", () => {
    const xml = buildStylesXml()
    expect(xml).toContain(`<cellXfs count="${STYLE_TOKENS.length}">`)
    expect(Number(xml.match(/<fonts count="(\d+)">/)?.[1])).toBeGreaterThan(0)
    // none + gray125 are Excel's own two reserved fills
    expect(Number(xml.match(/<fills count="(\d+)">/)?.[1])).toBeGreaterThanOrEqual(2)
    expect(Number(xml.match(/<borders count="(\d+)">/)?.[1])).toBeGreaterThanOrEqual(1)
  })

  it("carries the school's look", () => {
    const xml = buildStylesXml()
    expect(xml).toContain('<name val="Century Gothic"/>')
    expect(xml).toContain('<fgColor rgb="FFD9D9D9"/>')
    expect(xml).toContain('numFmtId="165"')
    expect(xml).toContain('numFmtId="166"')
  })
})

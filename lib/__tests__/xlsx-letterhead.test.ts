import { describe, it, expect } from "vitest"
import nextConfig from "@/next.config"
import { loadLetterhead, LETTERHEAD_PATH } from "@/lib/xlsx/letterhead"
import { pngSize } from "@/lib/xlsx/png"

describe("the letterhead", () => {
  it("reads the logo from the public folder", () => {
    const bytes = loadLetterhead()
    expect(bytes).not.toBeNull()
    // the logo we designed the anchor for - if the owner swaps it, this says
    // so instead of the export quietly stretching it
    expect(pngSize(bytes!)).toEqual({ width: 340, height: 156 })
  })

  it("is traced into the serverless bundle", () => {
    // ⭐ a file the server reads BY PATH is invisible to Next's tracing
    const includes = nextConfig.outputFileTracingIncludes?.["/api/**/*"] ?? []
    // and the trace and the loader must name the SAME file
    expect(includes).toContain(`./${LETTERHEAD_PATH}`)
  })
})

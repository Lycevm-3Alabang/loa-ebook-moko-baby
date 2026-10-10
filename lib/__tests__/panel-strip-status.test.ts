import { describe, expect, it } from "vitest"
import { panelStripStatus } from "@/features/users/components/bulk-import/panel-strip-status"

describe("panelStripStatus", () => {
  const base = { blockedCount: 0, isRunning: false, hasResult: false, failedCount: 0, error: "" }

  it("is not-run for a fresh clean panel", () => {
    expect(panelStripStatus(base)).toBe("not-run")
  })

  it("is blocked-gated when blocked rows hold the gate", () => {
    expect(panelStripStatus({ ...base, blockedCount: 86 })).toBe("blocked-gated")
  })

  it("is running while its panel owns the run", () => {
    expect(panelStripStatus({ ...base, blockedCount: 3, isRunning: true })).toBe("running")
  })

  it("is done for a clean completed run", () => {
    expect(panelStripStatus({ ...base, hasResult: true })).toBe("done")
  })

  it("is failed on ledger-derived failed rows even with no error", () => {
    expect(panelStripStatus({ ...base, hasResult: true, failedCount: 5 })).toBe("failed")
  })

  it("ranks error above a clean result", () => {
    expect(panelStripStatus({ ...base, hasResult: true, error: "Import cancelled after 2 chunks" })).toBe(
      "failed",
    )
  })
})

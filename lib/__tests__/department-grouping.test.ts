import { describe, it, expect } from "vitest"
import { computeDepartmentGrouping } from "@/features/users/components/bulk-import/department-grouping"

const row = (row: number, email: string, dept: string | null) => ({ row, email, resolvedDepartmentId: dept })

describe("computeDepartmentGrouping — first instance in file order (spec §3.3)", () => {
  it("takes the first row's department for a student with several codes", () => {
    const map = computeDepartmentGrouping([row(1, "a@x", "CAS"), row(2, "a@x", "CBA")])
    expect(map.get("a@x")).toBe("CAS")
  })

  it("never lets a later row override the first", () => {
    const map = computeDepartmentGrouping([
      row(1, "a@x", "CCS"),
      row(2, "a@x", "COE"),
      row(3, "a@x", "CBA"),
    ])
    expect(map.get("a@x")).toBe("CCS")
  })

  it("honours a null first instance — the student reads Unassigned, even when a later row resolves", () => {
    // Strict §3.3: first row wins. §3.4's Unassigned panel exists for exactly
    // this, and enrollment proceeds regardless.
    const map = computeDepartmentGrouping([row(1, "a@x", null), row(2, "a@x", "CBA")])
    expect(map.has("a@x")).toBe(true)
    expect(map.get("a@x")).toBeNull()
  })

  it("keeps students independent when their rows interleave", () => {
    const map = computeDepartmentGrouping([
      row(1, "a@x", "CAS"),
      row(2, "b@x", "CBA"),
      row(3, "a@x", "CCS"),
      row(4, "b@x", "COE"),
    ])
    expect(map.get("a@x")).toBe("CAS")
    expect(map.get("b@x")).toBe("CBA")
  })

  it("keys case-insensitively and trims", () => {
    const map = computeDepartmentGrouping([
      row(1, "A@X.edu ", "CAS"),
      row(2, "a@x.edu", "CBA"),
    ])
    expect(map.get("a@x.edu")).toBe("CAS")
    expect(map.size).toBe(1)
  })

  it("returns an empty map for no rows", () => {
    expect(computeDepartmentGrouping([]).size).toBe(0)
  })
})

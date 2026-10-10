import { describe, it, expect } from "vitest"
import {
  buildDepartmentPanels,
  UNASSIGNED_PANEL_ID,
} from "@/features/users/components/bulk-import/department-panels"

// departmentCode defaults to the dept the row resolved to, so a RESOLVED row is
// never blank and an UNRESOLVED row is blank unless told otherwise. Pass the 5th
// argument to contradict that deliberately.
const row = (row: number, dept: string | null, isBlocked = false, isProblem = false, departmentCode = dept ?? "") => ({
  row,
  email: `s${row}@x.edu`,
  resolvedDepartmentId: dept,
  departmentCode,
  isBlocked,
  isProblem,
})

// Deliberately not in code order — `departments` arrives in database order.
const DEPTS = [
  { id: "d-ccs", code: "CCS" },
  { id: "d-cthm", code: "CTHM" },
  { id: "d-cas", code: "CAS" },
]

describe("buildDepartmentPanels — rows bucketed by their own department (spec §3.2)", () => {
  it("buckets by the row's own code, not by its section", () => {
    const panels = buildDepartmentPanels([row(1, "d-cas"), row(2, "d-cas"), row(3, "d-ccs")], DEPTS)
    expect(panels.map((p) => p.code)).toEqual(["CAS", "CCS"])
    expect(panels[0].rows.map((r) => r.row)).toEqual([1, 2])
    expect(panels[1].rows.map((r) => r.row)).toEqual([3])
  })

  it("places one student's two-code rows in BOTH panels", () => {
    // Panels group ROWS (§3.2); computeDepartmentGrouping groups STUDENTS
    // (§3.3). 176 of 3,303 students in the 2026-1 file behave this way, and
    // §3.3 makes the written users.departmentId identical from either panel.
    const shared = { ...row(1, "d-ccs"), email: "a@x" }
    const panels = buildDepartmentPanels([shared, { ...row(2, "d-cthm"), email: "a@x" }], DEPTS)
    expect(panels.map((p) => p.code)).toEqual(["CCS", "CTHM"])
    expect(panels[0].rows[0].email).toBe("a@x")
    expect(panels[1].rows[0].email).toBe("a@x")
  })

  it("keeps file order inside a panel — the run slices and the ledger maps offsets against it", () => {
    const panels = buildDepartmentPanels([row(7, "d-ccs"), row(3, "d-ccs"), row(5, "d-ccs")], DEPTS)
    expect(panels[0].rows.map((r) => r.row)).toEqual([7, 3, 5])
  })

  it("routes a null department to the Unassigned panel, with departmentId null", () => {
    const panels = buildDepartmentPanels([row(1, null), row(2, "d-ccs")], DEPTS)
    const unassigned = panels.find((p) => p.id === UNASSIGNED_PANEL_ID)
    expect(unassigned).toBeDefined()
    expect(unassigned?.departmentId).toBeNull()
    expect(unassigned?.rows.map((r) => r.row)).toEqual([1])
  })

  it("sorts Unassigned last even when its bucket is created first", () => {
    const panels = buildDepartmentPanels([row(1, null), row(2, "d-cas")], DEPTS)
    expect(panels.map((p) => p.departmentId)).toEqual(["d-cas", null])
  })

  it("sorts by code ascending rather than by bucket creation order", () => {
    const panels = buildDepartmentPanels([row(1, "d-cthm"), row(2, "d-cas")], DEPTS)
    expect(panels.map((p) => p.code)).toEqual(["CAS", "CTHM"])
  })

  it("omits departments that hold no rows", () => {
    const panels = buildDepartmentPanels([row(1, "d-ccs")], DEPTS)
    expect(panels).toHaveLength(1)
    expect(panels[0].code).toBe("CCS")
  })

  it("labels a panel with its code and the Unassigned panel with Unassigned", () => {
    // The reference route returns { id, code } only — a department NAME is not
    // available client-side, so the code is the label.
    const panels = buildDepartmentPanels([row(1, "d-ccs"), row(2, null)], DEPTS)
    expect(panels.map((p) => p.label)).toEqual(["CCS", "Unassigned"])
  })

  it("tallies blocked and problem rows per panel", () => {
    const panels = buildDepartmentPanels(
      [row(1, "d-ccs", true), row(2, "d-ccs", false, true), row(3, "d-ccs")],
      DEPTS,
    )
    expect(panels[0].blockedCount).toBe(1)
    expect(panels[0].problemCount).toBe(1)
    expect(panels[0].rows).toHaveLength(3)
  })

  it("returns no panels for no rows", () => {
    expect(buildDepartmentPanels([], DEPTS)).toEqual([])
  })

  it("renders no Unassigned panel when every row resolves", () => {
    // §3.4's "lazily created" contract, pinned: the panel is not a fixed slot in
    // the grid — it materialises only because some row demanded one.
    const panels = buildDepartmentPanels([row(1, "d-ccs"), row(2, "d-cas")], DEPTS)
    expect(panels.map((p) => p.id)).not.toContain(UNASSIGNED_PANEL_ID)
  })

  it("tallies unresolved rows, and the blank subset, on the Unassigned panel", () => {
    const panels = buildDepartmentPanels(
      [row(1, null, false, false, "ZZZ"), row(2, null, false, false, ""), row(3, "d-ccs")],
      DEPTS,
    )
    const unassigned = panels.find((p) => p.id === UNASSIGNED_PANEL_ID)
    expect(unassigned?.unresolvedCount).toBe(2)
    // blank ⊆ unresolved — a blank code can never resolve to a department
    expect(unassigned?.blankDeptCount).toBe(1)
  })

  it("counts a whitespace-only code as blank", () => {
    const panels = buildDepartmentPanels([row(1, null, false, false, "   ")], DEPTS)
    expect(panels[0].unresolvedCount).toBe(1)
    expect(panels[0].blankDeptCount).toBe(1)
  })

  it("reports zero unresolved on a resolved department's panel", () => {
    // Structural, not defensive: the builder routes every null id to Unassigned,
    // so a resolved panel cannot carry one even if a fixture tried.
    const panels = buildDepartmentPanels([row(1, "d-ccs"), row(2, "d-ccs")], DEPTS)
    expect(panels[0].unresolvedCount).toBe(0)
    expect(panels[0].blankDeptCount).toBe(0)
  })
})
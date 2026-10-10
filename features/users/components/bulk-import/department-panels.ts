/**
 * C3 S2 — the department grid: preview rows bucketed into one panel per
 * department, so an admin observes and controls each department independently
 * (student-import-stepper.md §3).
 *
 * Two groupings live in this importer and must not be confused:
 *
 * - `computeDepartmentGrouping` (department-grouping.ts, C3 S1) maps
 *   email → departmentId. That is §3.3: `users.departmentId` is ONE value per
 *   student, so the FIRST row in file order wins.
 * - THIS module buckets ROWS by the row's own `resolvedDepartmentId` (§3.2).
 *   The section does not determine department; the row's `department code`
 *   column does — so a student whose rows carry two codes legitimately appears
 *   in two panels. §3.3 already made the written department order-independent,
 *   so writing that student from two panels writes the same value twice.
 *
 * Pure: no React, no fetch. Derived, so editing a row or removing one re-groups
 * with nothing to re-stamp — the same property S1 bought.
 */

/** Panel id for rows whose `department code` is blank or does not resolve (§3.4). */
export const UNASSIGNED_PANEL_ID = "__unassigned__"

export const UNASSIGNED_PANEL_LABEL = "Unassigned"

/** The minimum a row must expose to be placed in a panel. */
export interface PanelRowLike {
  /** Source CSV row number — the ledger's identity, and the run's row order. */
  row: number
  /** §3.2 — THIS ROW's own department, from its `department code`. Null when unresolved. */
  resolvedDepartmentId: string | null
  /** Cannot import under any resolution (mirrors isBlockedPreviewRow). */
  isBlocked: boolean
  /** Imports, but carries a flag. */
  isProblem: boolean
}

export interface DepartmentPanel<TRow extends PanelRowLike> {
  /**
   * Stable React key and per-panel state key. Equals `departmentId` for a real
   * panel and `UNASSIGNED_PANEL_ID` for §3.4 — so every use site is a plain
   * `panel.id` instead of a `?? UNASSIGNED_PANEL_ID` ternary repeated.
   */
  id: string
  /** Null only for the Unassigned panel. Never sent to the server as a departmentId. */
  departmentId: string | null
  code: string
  label: string
  /** Rows in FILE order — the order the run and the ledger payload rely on. */
  rows: TRow[]
  blockedCount: number
  problemCount: number
}

export function buildDepartmentPanels<TRow extends PanelRowLike>(
  rows: TRow[],
  departments: { id: string; code: string }[],
): DepartmentPanel<TRow>[] {
  const codeById = new Map(departments.map((d) => [d.id, d.code]))
  const buckets = new Map<string, TRow[]>()
  for (const r of rows) {
    const id = r.resolvedDepartmentId ?? UNASSIGNED_PANEL_ID
    const bucket = buckets.get(id)
    if (bucket) bucket.push(r)
    else buckets.set(id, [r])
  }
  const panels: DepartmentPanel<TRow>[] = []
  for (const [id, bucket] of buckets) {
    const unassigned = id === UNASSIGNED_PANEL_ID
    const code = unassigned ? "" : codeById.get(id) ?? ""
    panels.push({
      id,
      departmentId: unassigned ? null : id,
      code,
      label: unassigned ? UNASSIGNED_PANEL_LABEL : code,
      rows: bucket,
      blockedCount: bucket.filter((r) => r.isBlocked).length,
      problemCount: bucket.filter((r) => r.isProblem).length,
    })
  }
  // Deterministic: code ascending, Unassigned last. `departments` arrives in
  // database order, which is not guaranteed, and a grid that reshuffles between
  // renders makes an admin hunt for the panel they were watching.
  panels.sort((a, b) => {
    if (a.departmentId === null) return 1
    if (b.departmentId === null) return -1
    return a.code.localeCompare(b.code)
  })
  return panels
}
/**
 * C3 S1 — a student's department is the FIRST row in CSV file order
 * (student-import-stepper.md §3.3). `users.departmentId` is a single value while
 * a student's rows may carry several codes, so first-instance-wins decides it —
 * client-side, once, instead of server-side per chunk-arrival.
 *
 * The caller passes the preview rows, whose order IS file order (rows the admin
 * removed are already gone), so the first occurrence in this list is the first
 * instance in the file. A null first instance is honoured: the student reads
 * Unassigned (§3.3 strict, §3.4) rather than borrowing a later row's code.
 */
export interface DepartmentGroupRow {
  row: number
  email: string
  resolvedDepartmentId: string | null
}

export function computeDepartmentGrouping(rows: DepartmentGroupRow[]): Map<string, string | null> {
  const byEmail = new Map<string, string | null>()
  for (const r of rows) {
    const key = r.email.toLowerCase().trim()
    if (byEmail.has(key)) continue
    byEmail.set(key, r.resolvedDepartmentId)
  }
  return byEmail
}

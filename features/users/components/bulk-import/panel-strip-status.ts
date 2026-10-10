/**
 * Table-first slice 1 — one status dot per strip row, derived from four
 * primitives so this never churns with `DepartmentPanel` / `ImportResult`.
 *
 * Precedence is the spec: a live run owns the row; any failure signal
 * (explicit error or ledger-derived failed rows) outranks a clean result;
 * a result outranks the blocked gate; anything else is not-run.
 */
export type StripStatus = "not-run" | "blocked-gated" | "running" | "done" | "failed"

export function panelStripStatus(input: {
  blockedCount: number
  isRunning: boolean
  hasResult: boolean
  failedCount: number
  error: string
}): StripStatus {
  if (input.isRunning) return "running"
  if (input.error.trim().length > 0 || input.failedCount > 0) return "failed"
  if (input.hasResult) return "done"
  if (input.blockedCount > 0) return "blocked-gated"
  return "not-run"
}

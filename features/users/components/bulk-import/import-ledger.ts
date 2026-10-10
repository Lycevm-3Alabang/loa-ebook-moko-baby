import { escapeCsvCell, reasonRemarks, type ImportReasonCode } from "@/lib/csv-utils"

export type LedgerStatus = "persisted" | "already-persisted" | "invalid" | "removed"

export interface LedgerRow {
  row: number
  status: LedgerStatus
  reasonCode: ImportReasonCode | ""
  remarks: string
  name: string
  email: string
  subjectCode: string
  section: string
  facultyEmail: string
  departmentCode: string
}

export const LEDGER_HEADERS = [
  "row",
  "status",
  "reasonCode",
  "remarks",
  "name",
  "email",
  "subject code",
  "section",
  "faculty email",
  "department code",
] as const

/** What the builder needs from a source CSV row (PreviewRow satisfies it). */
export interface LedgerSourceRow {
  row: number
  name: string
  email: string
  subjectCode: string
  section: string
  facultyEmail: string
  departmentCode: string
  resolvedDepartmentId: string | null
  isInvalidDepartment: boolean
}

export interface LedgerChunkMeta {
  rowOffset: number
  chunkIndex: number
}

interface RejectLike {
  row: number
  reasonCode: ImportReasonCode
  remark: string
}
interface DupLike {
  row: number
  reasonCode: ImportReasonCode
  remark: string
}
interface AlreadyLike {
  row: number
  reasonCode: ImportReasonCode
}

/**
 * Assemble the D3 import ledger: one entry per INPUT row, keyed by the source
 * CSV row number, in source order. Every server-side `row` field is
 * chunk-relative, so the offset conversion happens exactly once here and
 * everything downstream keys on the source number.
 */
export function buildImportLedger(input: {
  payload: LedgerSourceRow[]
  removed: Array<LedgerSourceRow & { reason?: ImportReasonCode }>
  chunkResults: Array<{
    meta: LedgerChunkMeta
    result: { failed: RejectLike[]; duplicateRows: DupLike[]; alreadyPersisted: AlreadyLike[] }
  }>
  deadChunks: Array<{ meta: LedgerChunkMeta; error: string; attempts: number }>
  sectionDeptCode?: (section: string) => string | null
}): LedgerRow[] {
  const { payload, removed, chunkResults, deadChunks, sectionDeptCode } = input
  const entries = new Map<number, LedgerRow>()

  // Chunk windows come from real offsets, never a size constant — the driver may
  // have halved mid-run, so a dead chunk's end is the NEXT known chunk start.
  const offsets = [...chunkResults.map((c) => c.meta.rowOffset), ...deadChunks.map((c) => c.meta.rowOffset)].sort(
    (a, b) => a - b,
  )
  const endOf = (offset: number) => offsets.find((o) => o > offset) ?? payload.length

  const base = (r: LedgerSourceRow) => ({
    row: r.row,
    name: r.name,
    email: r.email,
    subjectCode: r.subjectCode,
    section: r.section,
    facultyEmail: r.facultyEmail,
    departmentCode: r.departmentCode,
  })

  for (const { meta, result } of chunkResults) {
    const at = (chunkRow: number) => payload[meta.rowOffset + chunkRow - 1]
    for (const f of result.failed) {
      const src = at(f.row)
      if (src) entries.set(src.row, { ...base(src), status: "invalid", reasonCode: f.reasonCode, remarks: f.remark })
    }
    for (const d of result.duplicateRows) {
      const src = at(d.row)
      if (src) {
        entries.set(src.row, {
          ...base(src),
          status: "already-persisted",
          reasonCode: "DUPLICATE_IN_FILE",
          remarks: d.remark,
        })
      }
    }
    for (const a of result.alreadyPersisted) {
      const src = at(a.row)
      if (src) {
        entries.set(src.row, {
          ...base(src),
          status: "already-persisted",
          reasonCode: "ALREADY_PERSISTED",
          remarks: reasonRemarks("ALREADY_PERSISTED"),
        })
      }
    }
  }

  // A chunk that never ran: every row in its window is invalid, so an aborted
  // import still closes.
  for (const dc of deadChunks) {
    const remarks = reasonRemarks("TRANSPORT_ERROR", {
      n: String(dc.meta.chunkIndex + 1),
      k: String(dc.attempts),
      error: dc.error,
    })
    for (let k = dc.meta.rowOffset; k < endOf(dc.meta.rowOffset); k++) {
      const src = payload[k]
      if (src && !entries.has(src.row)) {
        entries.set(src.row, { ...base(src), status: "invalid", reasonCode: "TRANSPORT_ERROR", remarks })
      }
    }
  }

  for (const r of removed) {
    const code = r.reason ?? "REMOVED_BY_ADMIN"
    entries.set(r.row, { ...base(r), status: "removed", reasonCode: code, remarks: reasonRemarks(code) })
  }

  // Everything left was enrolled — carrying the non-blocking department flag.
  const flag = (src: LedgerSourceRow): { reasonCode: ImportReasonCode | ""; remarks: string } => {
    const code = src.departmentCode.toUpperCase().trim()
    if (code === "" || src.isInvalidDepartment || !src.resolvedDepartmentId) {
      const detail = code === "" ? "code blank" : `code "${code}" not found`
      return { reasonCode: "DEPARTMENT_UNRESOLVED", remarks: reasonRemarks("DEPARTMENT_UNRESOLVED", { detail }) }
    }
    const own = sectionDeptCode?.(src.section) ?? null
    if (own && own !== code) {
      return { reasonCode: "DEPARTMENT_MISMATCH", remarks: reasonRemarks("DEPARTMENT_MISMATCH", { code, sectionDept: own }) }
    }
    return { reasonCode: "", remarks: "" }
  }
  for (const src of payload) {
    if (entries.has(src.row)) continue
    const f = flag(src)
    entries.set(src.row, { ...base(src), status: "persisted", ...f })
  }

  return [...entries.values()].sort((a, b) => a.row - b.row)
}

/** Closure invariant: every source row exactly once, statuses exhaustive. */
export function assertLedgerClosure(rows: LedgerRow[], sourceRowCount: number): void {
  const counts: Record<LedgerStatus, number> = { persisted: 0, "already-persisted": 0, invalid: 0, removed: 0 }
  for (const r of rows) counts[r.status] += 1
  const total = counts.persisted + counts["already-persisted"] + counts.invalid + counts.removed
  if (rows.length !== sourceRowCount || total !== sourceRowCount) {
    throw new Error(
      `Ledger closure failed: ${rows.length} rows (${total} classified) against ${sourceRowCount} source rows`,
    )
  }
  if (new Set(rows.map((r) => r.row)).size !== rows.length) {
    throw new Error("Ledger has duplicate source rows")
  }
}

export function ledgerToCsv(rows: LedgerRow[]): string {
  const header = LEDGER_HEADERS.map(escapeCsvCell).join(",")
  const lines = rows.map((r) =>
    [r.row, r.status, r.reasonCode, r.remarks, r.name, r.email, r.subjectCode, r.section, r.facultyEmail, r.departmentCode]
      .map((c) => escapeCsvCell(String(c)))
      .join(","),
  )
  return [header, ...lines].join("\n")
}

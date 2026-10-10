import { describe, it, expect } from "vitest"
import {
  buildImportLedger,
  assertLedgerClosure,
  ledgerToCsv,
  LEDGER_HEADERS,
  type LedgerChunkMeta,
  type LedgerSourceRow,
} from "@/features/users/components/bulk-import/import-ledger"
import { reasonRemarks } from "@/lib/csv-utils"

const src = (over: Partial<LedgerSourceRow> = {}): LedgerSourceRow => ({
  row: 1,
  name: "Alice Student",
  email: "alice@itmlyceumalabang.onmicrosoft.com",
  subjectCode: "CS101",
  section: "BSIE-41M2",
  facultyEmail: "juan@lyceumalabang.edu.ph",
  departmentCode: "BSIE",
  resolvedDepartmentId: "dept-1",
  isInvalidDepartment: false,
  ...over,
})

type ChunkResultEntry = Parameters<typeof buildImportLedger>[0]["chunkResults"][number]

const okChunk = (meta: LedgerChunkMeta, extras: Partial<ChunkResultEntry["result"]> = {}): ChunkResultEntry => ({
  meta,
  result: { failed: [], duplicateRows: [], alreadyPersisted: [], ...extras },
})

describe("buildImportLedger — one entry per input row", () => {
  it("emits every source row exactly once, in source order", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 3 }), src({ row: 1 }), src({ row: 2 })],
      removed: [],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [],
    })

    expect(rows.map((r) => r.row)).toEqual([1, 2, 3])
    assertLedgerClosure(rows, 3)
  })

  it("counts rows a person removed from preview without losing the count", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1 }), src({ row: 2 })],
      removed: [src({ row: 9 })],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [],
    })

    const removed = rows.find((r) => r.row === 9)
    expect(removed?.status).toBe("removed")
    expect(removed?.reasonCode).toBe("REMOVED_BY_ADMIN")
    expect(removed?.remarks).toBe(reasonRemarks("REMOVED_BY_ADMIN"))
    assertLedgerClosure(rows, 3)
  })

  it("records a blocked removal with its own code", () => {
    const rows = buildImportLedger({
      payload: [],
      removed: [{ ...src({ row: 4 }), reason: "REMOVED_BLOCKED" }],
      chunkResults: [],
      deadChunks: [],
    })

    expect(rows[0].reasonCode).toBe("REMOVED_BLOCKED")
    expect(rows[0].status).toBe("removed")
  })
})

describe("buildImportLedger — server outcomes", () => {
  it("converts chunk-relative rows to source rows via the chunk offset", () => {
    // 4 rows, chunks of 2: the reject is row 2 of chunk 2 → source row 4.
    const rows = buildImportLedger({
      payload: [src({ row: 1 }), src({ row: 2 }), src({ row: 3 }), src({ row: 4 })],
      removed: [],
      chunkResults: [
        okChunk({ rowOffset: 0, chunkIndex: 0 }),
        okChunk({ rowOffset: 2, chunkIndex: 1 }, {
          failed: [{ row: 2, reasonCode: "SUBJECT_NOT_FOUND", remark: reasonRemarks("SUBJECT_NOT_FOUND", { code: "MATH201" }) }],
        }),
      ],
      deadChunks: [],
    })

    const r4 = rows.find((r) => r.row === 4)
    expect(r4?.status).toBe("invalid")
    expect(r4?.reasonCode).toBe("SUBJECT_NOT_FOUND")
    expect(r4?.remarks).toBe('Subject "MATH201" not found')
    assertLedgerClosure(rows, 4)
  })

  it("marks an in-file repeat already-persisted, naming the first row", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1 }), src({ row: 2 })],
      removed: [],
      chunkResults: [
        okChunk({ rowOffset: 0, chunkIndex: 0 }, {
          duplicateRows: [{ row: 2, reasonCode: "DUPLICATE_IN_FILE", remark: reasonRemarks("DUPLICATE_IN_FILE", { row: "1" }) }],
        }),
      ],
      deadChunks: [],
    })

    const r2 = rows.find((r) => r.row === 2)
    expect(r2?.status).toBe("already-persisted")
    expect(r2?.reasonCode).toBe("DUPLICATE_IN_FILE")
    expect(r2?.remarks).toBe("Duplicate of row 1 in this file")
  })

  it("reads a re-run as already-persisted, never persisted", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1 }), src({ row: 2 })],
      removed: [],
      chunkResults: [
        okChunk({ rowOffset: 0, chunkIndex: 0 }, {
          alreadyPersisted: [
            { row: 1, reasonCode: "ALREADY_PERSISTED" },
            { row: 2, reasonCode: "ALREADY_PERSISTED" },
          ],
        }),
      ],
      deadChunks: [],
    })

    expect(rows.every((r) => r.status === "already-persisted")).toBe(true)
    expect(rows.every((r) => r.reasonCode === "ALREADY_PERSISTED")).toBe(true)
    expect(rows[0].remarks).toBe(reasonRemarks("ALREADY_PERSISTED"))
    assertLedgerClosure(rows, 2)
  })

  it("closes an aborted run — a dead chunk's rows read TRANSPORT_ERROR", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1 }), src({ row: 2 }), src({ row: 3 })],
      removed: [],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [{ meta: { rowOffset: 1, chunkIndex: 1 }, error: "Could not reach the server", attempts: 1 }],
    })

    expect(rows.map((r) => r.row)).toEqual([1, 2, 3])
    expect(rows[0].status).toBe("persisted")
    for (const r of rows.slice(1)) {
      expect(r.status).toBe("invalid")
      expect(r.reasonCode).toBe("TRANSPORT_ERROR")
      expect(r.remarks).toContain("Could not reach the server")
    }
    assertLedgerClosure(rows, 3)
  })
})

describe("buildImportLedger — department flags are non-blocking", () => {
  it("persists a row with an unresolvable department, flagged not dropped", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1, departmentCode: "ZZZ", resolvedDepartmentId: null, isInvalidDepartment: true })],
      removed: [],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [],
    })

    expect(rows[0].status).toBe("persisted")
    expect(rows[0].reasonCode).toBe("DEPARTMENT_UNRESOLVED")
    expect(rows[0].remarks).toContain('code "ZZZ" not found')
  })

  it("persists a blank department code flagged DEPARTMENT_UNRESOLVED", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1, departmentCode: "  ", resolvedDepartmentId: null })],
      removed: [],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [],
    })

    expect(rows[0].status).toBe("persisted")
    expect(rows[0].reasonCode).toBe("DEPARTMENT_UNRESOLVED")
    expect(rows[0].remarks).toContain("code blank")
  })

  it("persists a mismatching department, naming both codes", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1, departmentCode: "BSIE" })],
      removed: [],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [],
      sectionDeptCode: () => "CBA",
    })

    expect(rows[0].status).toBe("persisted")
    expect(rows[0].reasonCode).toBe("DEPARTMENT_MISMATCH")
    expect(rows[0].remarks).toContain("BSIE")
    expect(rows[0].remarks).toContain("CBA")
  })
})

describe("assertLedgerClosure + ledgerToCsv", () => {
  it("throws when a source row is missing", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1 }), src({ row: 2 })],
      removed: [],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [],
    })
    expect(() => assertLedgerClosure(rows, 3)).toThrow(/closure failed/i)
  })

  it("round-trips commas and quotes through the CSV", () => {
    const rows = buildImportLedger({
      payload: [src({ row: 1, name: 'Doe, "JD" Jr.' })],
      removed: [],
      chunkResults: [okChunk({ rowOffset: 0, chunkIndex: 0 })],
      deadChunks: [],
    })

    const csv = ledgerToCsv(rows)
    const [header, body] = [csv.split("\n")[0], csv.split("\n")[1]]
    expect(header).toBe(LEDGER_HEADERS.join(","))
    expect(body).toContain('"Doe, ""JD"" Jr."')
    expect(body.startsWith("1,persisted,")).toBe(true)
  })
})

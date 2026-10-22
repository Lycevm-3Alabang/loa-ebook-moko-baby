import { describe, it, expect } from "vitest"
import { writeFileSync } from "fs"
import { deflateRawSync } from "zlib"
import { readZip } from "@/lib/xlsx-template"
import { createZip } from "@/lib/zip"
import { sectionLabel } from "@/lib/evaluation-utils"

/**
 * The SPIKE — the department ZIP's **bytes** and **time**, measured.
 *
 * ⭐ It ships nothing: it runs the export's real reads and the real builders
 * against the live data, prints the numbers, and writes the ZIP so the owner
 * can unzip it. The numbers are what
 * `specs/evaluation-results-export/02-department-zip.md` writes the size
 * guard from — ⭐ not an estimate.
 *
 * ⭐ It is skipped unless the owner asks for it:
 *
 *   ACES_SPIKE=1 npx vitest run lib/__tests__/spike-department-zip.test.ts
 *
 * (with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment).
 *
 * ⭐ It never ASSERTS a size: a measurement that can fail is a test, and a
 * test that asserts a platform limit is a flaky gate.
 */
const ENABLED = process.env.ACES_SPIKE === "1"
const PERIOD_ID = process.env.ACES_SPIKE_PERIOD ?? ""
const DEPARTMENT_ID = process.env.ACES_SPIKE_DEPARTMENT ?? ""
const OUT_PATH = process.env.ACES_SPIKE_PATH ?? "/tmp/aces-dept-zip.zip"

/** A name a ZIP entry can carry. */
function entryName(value: string): string {
  return value.replace(/[^a-zA-Z0-9 ._()-]/g, "_").trim() || "unnamed"
}

/** The smallest, the middle and the largest of a set of sizes. */
function spread(values: number[]): { min: number; median: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  }
}

const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0)

describe("the spike — the department ZIP", () => {
  it.skipIf(!ENABLED)(
    "measures one department's ZIP: the bytes, the time, the count",
    async () => {
      // ⭐ The imports are DYNAMIC: `lib/supabase.ts` throws at import time when
      // the env vars are missing, and a module-scope import would fail the whole
      // suite even though this test is skipped.
      const { getDepartmentSubjectResults, getSubjectResultSet } = await import(
        "@/features/evaluation-results/evaluation-results.service"
      )
      const { evaluationPeriodRepository, departmentRepository, rubricRepository } = await import(
        "@/lib/repositories/factory"
      )
      const { buildSubjectWorkbook } = await import("@/lib/xlsx/subject-workbook")
      const { loadLetterhead } = await import("@/lib/xlsx/letterhead")

      // ── the period ───────────────────────────────────────────────────────
      const period = PERIOD_ID
        ? await evaluationPeriodRepository.findById(PERIOD_ID)
        : await evaluationPeriodRepository.findActive()
      if (!period) throw new Error("no evaluation period — set ACES_SPIKE_PERIOD")
      const periodId = period.id

      // ── the department ───────────────────────────────────────────────────
      const departments = await departmentRepository.listAll()
      const department =
        departments.find((candidate) => candidate.id === DEPARTMENT_ID) ?? departments[0]
      if (!department) throw new Error("no department — set ACES_SPIKE_DEPARTMENT")

      // ── the department read (the page's own) ─────────────────────────────
      const readStarted = Date.now()
      const results = await getDepartmentSubjectResults(periodId, department.id)
      const departmentReadMs = Date.now() - readStarted
      const rows = results.subjects
      console.log(
        `[spike] department ${department.name} (${department.code}) — ${rows.length} subject-sections`,
      )
      if (rows.length === 0) {
        console.log("[spike] no rows in this department — nothing to measure")
        return
      }

      // ── the rubric and the letterhead: ONCE for the whole export ─────────
      const rubricCategories = period.rubricGroupId
        ? await rubricRepository.getCategoriesWithItems(period.rubricGroupId)
        : []
      const logo = loadLetterhead()

      // ── one workbook per subject-section ─────────────────────────────────
      const entries: { name: string; data: Uint8Array }[] = []
      const workbookBytes: number[] = []
      const readMs: number[] = []
      const buildMs: number[] = []
      const failures: string[] = []

      for (const row of rows) {
        const readStartedAt = Date.now()
        const resultSet = await getSubjectResultSet(row.facultySubjectId, periodId)
        const readAt = Date.now()
        if (!resultSet) {
          failures.push(`${row.subjectCode} ${row.sectionName ?? ""} — no result set`)
          continue
        }

        // ⭐ the SHARED builder — the same assembly the three routes use, so
        // the bytes measured are the bytes that ship
        const bytes = buildSubjectWorkbook(resultSet, rubricCategories, logo)
        const builtAt = Date.now()

        readMs.push(readAt - readStartedAt)
        buildMs.push(builtAt - readAt)
        workbookBytes.push(bytes.length)
        entries.push({
          name:
            `${entryName(department.code ?? department.id)}/` +
            `${entryName(row.facultyName)}/` +
            `${entryName(row.subjectCode)}_${entryName(sectionLabel(row.sectionProgram, row.sectionName))}_evaluation.xlsx`,
          data: bytes,
        })
      }

      // ── the store zip (real) and the DEFLATE effect ──────────────────────
      const zipStarted = Date.now()
      const storeZip = createZip(entries)
      const zipMs = Date.now() - zipStarted
      const storedBytes = entries.reduce((sum, entry) => sum + entry.data.length, 0)
      const deflatedBytes = entries.reduce(
        (sum, entry) => sum + deflateRawSync(entry.data).length,
        0,
      )
      const overhead = storeZip.length - storedBytes
      const deflateEstimate = deflatedBytes + overhead

      const sizes = spread(workbookBytes)
      console.log(
        [
          `[spike] subject-sections: ${rows.length} · workbooks: ${entries.length}`,
          `[spike] workbook bytes: min ${sizes.min} · median ${sizes.median} · max ${sizes.max}`,
          `[spike] store zip: ${storeZip.length} bytes (${(storeZip.length / 1024 / 1024).toFixed(2)} MB)`,
          `[spike] deflate estimate: ${deflateEstimate} bytes (${Math.round((deflateEstimate / storeZip.length) * 100)}% of the store zip)`,
          `[spike] time: department read ${departmentReadMs} ms · subject reads ${total(readMs)} ms · builds ${total(buildMs)} ms · zip ${zipMs} ms`,
          `[spike] failures: ${failures.length}${failures.length ? ` — ${failures.join("; ")}` : ""}`,
        ].join("\n"),
      )

      writeFileSync(OUT_PATH, storeZip)
      console.log(`[spike] wrote ${OUT_PATH}`)

      // ⭐ The only assertion: the ZIP reads back. ⭐ No size is asserted.
      expect(readZip(storeZip).size).toBe(entries.length)
    },
    600_000,
  )
})

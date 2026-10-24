import { getDepartmentSubjectResults, getSubjectResultSet } from "./evaluation-results.service"
import {
  departmentRepository,
  evaluationPeriodRepository,
  rubricRepository,
} from "@/lib/repositories/factory"
import { buildSubjectWorkbook, type RubricCategoryInput } from "@/lib/xlsx/subject-workbook"
import { buildDepartmentSummaryWorkbook } from "@/lib/xlsx/department-summary"
import { buildFacultySummaryWorkbook } from "@/lib/xlsx/overall-summary"
import { loadLetterhead } from "@/lib/xlsx/letterhead"
import { createDeflatedZip } from "@/lib/zip-deflate"
import { sectionLabel } from "@/lib/evaluation-utils"

/**
 * The department ZIP — the assembly.
 *
 * ⭐ The rules live here, not in the route: the **pool** (the reads are the
 * cost), the **guard** (one response cannot carry a whole school) and the
 * **failure list** (a subject that cannot be built is named, never dropped).
 */

/** What one workbook costs in the ZIP — MEASURED (the spike, 2026-10-22). */
export const BYTES_PER_WORKBOOK = 41_400

/** What one response may carry — a margin under the platform's ≈4.5 MB. */
export const ZIP_LIMIT_BYTES = 4_000_000

/** The subject-sections one download may carry. */
export const MAX_SUBJECT_SECTIONS = Math.floor(ZIP_LIMIT_BYTES / BYTES_PER_WORKBOOK)

/** How many subject reads run at once. */
export const SUBJECT_READ_CONCURRENCY = 8

/** What the export is asked for. */
export interface DepartmentZipOptions {
  /** the evaluation period */
  evaluationPeriodId: string
  /** the departments to export */
  departmentIds: string[]
  /** the selected members; absent or empty = the whole department */
  facultyIds?: string[]
}

/** What the export produced. */
export type DepartmentZipResult =
  | { ok: true; bytes: Uint8Array; failures: string[]; count: number }
  | { ok: false; reason: "too-large"; count: number; estimateBytes: number; limitBytes: number }
  | { ok: false; reason: "unknown-department"; departmentId: string }
  | { ok: false; reason: "unknown-faculty"; facultyId: string; departmentId: string }
  | { ok: false; reason: "nothing-to-export"; count: number }

/** A name a ZIP entry can carry. */
function entryName(value: string): string {
  return value.replace(/[^a-zA-Z0-9 ._(),-]/g, "_").trim() || "unnamed"
}

/**
 * Run a worker over the items, a few at a time.
 *
 * ⭐ The subject reads are the export's cost (≈1.7 s each), so they run in a
 * bounded pool — sequentially a department of 90 would cost 157 s, past the
 * route's budget. ⭐ A failure is COLLECTED, never thrown: one subject that
 * cannot be built must not lose the rest.
 */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<{ value: R | null; error: string | null; item: T }[]> {
  const results: { value: R | null; error: string | null; item: T }[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      const item = items[index]
      try {
        results[index] = { item, value: await worker(item), error: null }
      } catch (e) {
        results[index] = { item, value: null, error: (e as Error).message }
      }
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * The ZIP.
 *
 * ⭐ Two passes: the department reads first (they carry the rows, the bands and
 * the COUNT), then the guard, then the work — so a refused export costs one
 * read and not two hundred.
 */
export async function buildDepartmentZip(
  options: DepartmentZipOptions,
): Promise<DepartmentZipResult> {
  const period = await evaluationPeriodRepository.findById(options.evaluationPeriodId)
  if (!period) return { ok: false, reason: "nothing-to-export", count: 0 }

  const departments = []
  for (const departmentId of options.departmentIds) {
    const department = await departmentRepository.findById(departmentId)
    if (!department) return { ok: false, reason: "unknown-department", departmentId }
    departments.push(department)
  }

  // ── pass 1 · the department reads ─────────────────────────────────────────
  const loaded = []
  for (const department of departments) {
    const results = await getDepartmentSubjectResults(period.id, department.id)
    loaded.push({ department, results })
  }

  // ⭐ one Set for the membership check, the count and the filters below.
  const selected = new Set(options.facultyIds ?? [])
  const isFiltered = selected.size > 0

  // ⭐ a faculty that is not a member of the scope is REFUSED, not skipped —
  // an empty ZIP would be a quiet wrong artifact (the same rule as the unknown
  // department). ⭐ The members come from the read above, so the check costs
  // no round trip.
  if (isFiltered) {
    for (const { department, results } of loaded) {
      for (const facultyId of selected) {
        if (!results.members.some((member) => member.id === facultyId)) {
          return { ok: false, reason: "unknown-faculty", facultyId, departmentId: department.id }
        }
      }
    }
  }

  const count = loaded.reduce((sum, entry) => {
    if (!isFiltered) return sum + entry.results.subjects.length
    return sum + entry.results.subjects.filter((row) => selected.has(row.facultyId)).length
  }, 0)

  // ── the guard ─────────────────────────────────────────────────────────────
  const estimateBytes = count * BYTES_PER_WORKBOOK
  if (estimateBytes > ZIP_LIMIT_BYTES) {
    return { ok: false, reason: "too-large", count, estimateBytes, limitBytes: ZIP_LIMIT_BYTES }
  }

  // ── pass 2 · the workbooks and the consolidated files ─────────────────────
  const rubricCategories: RubricCategoryInput[] = period.rubricGroupId
    ? await rubricRepository.getCategoriesWithItems(period.rubricGroupId)
    : []
  const logo = loadLetterhead()

  const entries: { name: string; data: Uint8Array }[] = []
  const failures: string[] = []

  for (const { department, results } of loaded) {
    const folder = entryName(department.code ?? department.id)

    // ⭐ D30: the DEPARTMENT summary sits at the folder's root, first in the
    // tree. ⭐ It is the department summary — the members' count and the
    // unweighted average of rated Subject–Section rows, not a mean of faculty
    // averages.
    // ⭐ D34: a per-faculty export omits it — that ZIP's details are one
    // faculty's, so a whole-department row would read as the scope's figure.
    if (!isFiltered) {
      const aggregate = results.departmentAggregate
      entries.push({
        name: `${folder}/${folder}_summary.xlsx`,
        data: buildDepartmentSummaryWorkbook({
          semesterTitle: period.semesterTitle ?? null,
          evaluationPeriodName: period.name ?? null,
          department: { name: department.name ?? "", code: department.code ?? "" },
          // ⭐ the headcount is the members — not `aggregate.uniqueFaculty`
          facultyCount: results.members.length,
          totalRespondents: aggregate?.totalResponses ?? 0,
          avgRating: aggregate?.avgRating ?? null,
          remarks: aggregate?.remarks ?? null,
        }),
      })
    }

    const members = isFiltered
      ? results.members.filter((member) => selected.has(member.id))
      : results.members
    const rowsOf = (facultyId: string) =>
      results.subjects.filter((row) => row.facultyId === facultyId)

    const subjects = isFiltered
      ? results.subjects.filter((row) => selected.has(row.facultyId))
      : results.subjects

    const built = await mapPool(subjects, SUBJECT_READ_CONCURRENCY, async (row) => {
      const resultSet = await getSubjectResultSet(row.facultySubjectId, period.id)
      if (!resultSet) throw new Error("no result set")
      return buildSubjectWorkbook(resultSet, rubricCategories, logo)
    })

    for (const outcome of built) {
      if (!outcome.value) {
        failures.push(
          `${outcome.item.subjectCode} ${sectionLabel(outcome.item.sectionProgram, outcome.item.sectionName)} — ${outcome.error}`,
        )
        continue
      }
      entries.push({
        name:
          `${folder}/${entryName(outcome.item.facultyName)}/` +
          `${entryName(outcome.item.subjectCode)}_${entryName(sectionLabel(outcome.item.sectionProgram, outcome.item.sectionName))}_evaluation.xlsx`,
        data: outcome.value,
      })
    }

    // ⭐ the member's consolidated file — the card's figure, the card's rows
    for (const member of members) {
      const band = results.facultyAggregates[member.id]
      entries.push({
        name: `${folder}/${entryName(member.name)}/${entryName(member.name)}_summary.xlsx`,
        data: buildFacultySummaryWorkbook({
          semesterTitle: period.semesterTitle ?? null,
          evaluationPeriodName: period.name ?? null,
          department: { name: department.name ?? "", code: department.code ?? "" },
          faculty: {
            name: member.name,
            email: member.email,
            avgRating: band?.avgRating ?? null,
            remarks: band?.remarks ?? null,
          },
          rows: rowsOf(member.id).map((row) => ({
            subject: { code: row.subjectCode, name: row.subjectName },
            section: { program: row.sectionProgram, name: row.sectionName },
            totalRespondents: row.totalRespondents,
            avgRating: row.avgRating,
            highest: row.highestRubrics,
            lowest: row.lowestRubrics,
          })),
        }),
      })
    }
  }

  // ⭐ a partial ZIP is never silent — the file names what is missing
  if (failures.length > 0) {
    const lines = [
      "This export is INCOMPLETE.",
      "",
      "These subject-sections could not be built:",
      ...failures.map((failure) => `- ${failure}`),
      "",
    ]
    entries.push({ name: "_INCOMPLETE.txt", data: new TextEncoder().encode(lines.join("\n")) })
  }

  return { ok: true, bytes: createDeflatedZip(entries), failures, count }
}

/**
 * ⭐ The verdict — what the route should answer.
 *
 * ⭐ The feature decides WHAT (the status, the message); the route decides HOW
 * (the NextResponse). ⭐ The two routes cannot disagree about a refusal,
 * because there is only one verdict.
 */
export type DepartmentZipVerdict =
  | { kind: "zip"; bytes: Uint8Array }
  | { kind: "refusal"; status: number; error: string }

/**
 * How a byte count reads to a human — rounded UP, so an estimate never reads
 * smaller than it is.
 */
function megabytes(bytes: number): string {
  return `${(Math.ceil(bytes / 100_000) / 10).toFixed(1)} MB`
}

/**
 * The verdict for a result.
 *
 * ⭐ A refusal is LOUD: it names the count, the estimate and the way out.
 * ⭐ A silent refusal is a wrong artifact — the school would read a smaller
 * download as the whole truth (Lesson 7b).
 */
export function verdictForDepartmentZip(result: DepartmentZipResult): DepartmentZipVerdict {
  if (result.ok) return { kind: "zip", bytes: result.bytes }

  switch (result.reason) {
    case "too-large":
      return {
        kind: "refusal",
        status: 400,
        error:
          `This export is too large — ${result.count} subject-sections ≈ ` +
          `${megabytes(result.estimateBytes)} (the limit is ${megabytes(result.limitBytes)}). ` +
          "Export one department at a time, or one faculty.",
      }
    case "unknown-department":
      return {
        kind: "refusal",
        status: 400,
        error: `Unknown department: ${result.departmentId} — nothing was exported.`,
      }
    case "unknown-faculty":
      return {
        kind: "refusal",
        status: 400,
        error:
          `Unknown faculty: ${result.facultyId} is not a member of ${result.departmentId} — ` +
          "nothing was exported.",
      }
    case "nothing-to-export":
      return { kind: "refusal", status: 404, error: "Evaluation period not found" }
  }
}

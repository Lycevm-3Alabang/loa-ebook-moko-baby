import { getDepartmentSubjectResults, getSubjectResultSet } from "./evaluation-results.service"
import {
  departmentRepository,
  evaluationPeriodRepository,
  rubricRepository,
} from "@/lib/repositories/factory"
import { buildConsolidatedFacultyWorkbook } from "@/lib/xlsx/consolidated-workbook"
import { buildFacultySummaryModel } from "@/lib/xlsx/overall-summary"
import { buildCommentsModel } from "@/lib/xlsx/comments"
import { buildOverallModel, type OverallResponse } from "@/lib/xlsx/overall"
import { createDeflatedZip } from "@/lib/zip-deflate"
import { getRemark, sectionLabel } from "@/lib/evaluation-utils"
import {
  BYTES_PER_WORKBOOK,
  SUBJECT_READ_CONCURRENCY,
  ZIP_LIMIT_BYTES,
  entryName,
  mapPool,
  type DepartmentZipOptions,
  type DepartmentZipResult,
} from "./department-zip"
import type {
  DepartmentSubjectResult,
  SubjectResultSet,
} from "./evaluation-results.service"

/**
 * The consolidated faculty ZIP — one workbook per faculty, in a ZIP.
 *
 * ⭐ The unit is the FACULTY, not the subject-section: every one of a member's
 * subject-sections goes into one file (Individual, Comments, Overall). ⭐ It is
 * an ADD-ON — the department ZIP and its tree do not move.
 *
 * ⭐ The rules live here, not in the route: the scope check, Part II's guard,
 * the bounded read pool and the failure list. A faculty whose read fails SKIPS
 * the whole workbook — a partial workbook is never silently shipped.
 */

/** The subject's label — the code and the name, as the Individual sheet prints it. */
function subjectLabel(row: DepartmentSubjectResult): string {
  return `${row.subjectCode} ${row.subjectName}`.trim()
}

/** The section's label — the program and the name. */
function sectionOf(row: DepartmentSubjectResult): string {
  return sectionLabel(row.sectionProgram, row.sectionName)
}

/** The label the sheets print — a missing subject or section is the dash. */
function displayedSubject(row: DepartmentSubjectResult): string {
  return subjectLabel(row) || "—"
}

function displayedSection(row: DepartmentSubjectResult): string {
  return sectionOf(row) || "—"
}

/** Arithmetic mean across response-level scores; missing scores stay missing. */
function responseMean(values: (number | null | undefined)[]): number | null {
  const scores = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

/**
 * The subject-section order — the Individual's own: the subject, then the
 * section. ⭐ The comments' groups and the Overall's rows follow it, so the
 * three sheets cannot disagree about the order.
 */
function bySubjectThenSection(a: DepartmentSubjectResult, b: DepartmentSubjectResult): number {
  const bySubject = subjectLabel(a).localeCompare(subjectLabel(b))
  if (bySubject !== 0) return bySubject
  return sectionOf(a).localeCompare(sectionOf(b))
}

/** One subject-section's successful read. */
interface BuiltSubject {
  row: DepartmentSubjectResult
  resultSet: SubjectResultSet
}

/**
 * The ZIP.
 *
 * ⭐ Two passes, like Part II: the department reads first (they carry the
 * members, the rows, the card's average and the COUNT), then the guard, then
 * the subject reads.
 */
export async function buildConsolidatedFacultyZip(
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

  const selected = new Set(options.facultyIds ?? [])
  const isFiltered = selected.size > 0

  // ⭐ a faculty that is not a member of the scope is REFUSED, not skipped —
  // the same rule as Part II, and the check costs no round trip.
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

  // ── the guard — Part II's bound, a conservative upper bound ───────────────
  const estimateBytes = count * BYTES_PER_WORKBOOK
  if (estimateBytes > ZIP_LIMIT_BYTES) {
    return { ok: false, reason: "too-large", count, estimateBytes, limitBytes: ZIP_LIMIT_BYTES }
  }

  // ── pass 2 · one workbook per member ──────────────────────────────────────
  const rubricCategories = period.rubricGroupId
    ? await rubricRepository.getCategoriesWithItems(period.rubricGroupId)
    : []
  const criteria = rubricCategories.map((category) => ({ name: category.name }))
  const rubric = rubricCategories.map((category) => ({
    name: category.name,
    items: category.items.map((item) => ({ id: item.id, text: item.text })),
  }))

  const entries: { name: string; data: Uint8Array }[] = []
  const failures: string[] = []

  for (const { department, results } of loaded) {
    const folder = entryName(department.code ?? department.id)
    const departmentInfo = { name: department.name ?? "", code: department.code ?? "" }
    const members = isFiltered
      ? results.members.filter((member) => selected.has(member.id))
      : results.members

    for (const member of members) {
      const rows = results.subjects
        .filter((row) => row.facultyId === member.id)
        .sort(bySubjectThenSection)

      // ⭐ a failure COLLECTED, never thrown; the whole workbook is skipped
      const built = await mapPool(rows, SUBJECT_READ_CONCURRENCY, async (row) => {
        const resultSet = await getSubjectResultSet(row.facultySubjectId, period.id)
        if (!resultSet) throw new Error("no result set")
        return { row, resultSet }
      })

      const failed = built.filter((outcome) => !outcome.value)
      if (failed.length > 0) {
        for (const outcome of failed) {
          failures.push(
            `${member.name} — ${displayedSubject(outcome.item)} ${displayedSection(outcome.item)}: ${outcome.error}`,
          )
        }
        // ⭐ never a partial workbook — the school would read it as the whole
        continue
      }

      const subjects = built
        .map((outcome) => outcome.value)
        .filter((value): value is BuiltSubject => value !== null)

      // ⭐ the employee number comes from the first successful subject read
      const employeeNo =
        subjects.find((subject) => subject.resultSet.faculty?.employeeNo)?.resultSet.faculty
          ?.employeeNo ?? null

      const responses: OverallResponse[] = subjects.flatMap((subject) =>
        subject.resultSet.evaluations.map((evaluation) => ({
          submittedAt: evaluation.submittedAt,
          generalRating: evaluation.generalRating,
          categoryAverages: evaluation.categoryAverages,
        })),
      )
      const averageRating = responseMean(responses.map((response) => response.generalRating))
      const averageCategories: Record<string, number> = {}
      for (const criterion of criteria) {
        const average = responseMean(
          responses.map((response) => response.categoryAverages[criterion.name]),
        )
        if (average !== null) averageCategories[criterion.name] = average
      }

      const itemScores: Record<string, number[]> = {}
      for (const subject of subjects) {
        for (const evaluation of subject.resultSet.evaluations) {
          for (const item of evaluation.itemAverages ?? []) {
            if (!itemScores[item.itemId]) itemScores[item.itemId] = []
            itemScores[item.itemId].push(item.avg)
          }
        }
      }
      const itemAverages = Object.fromEntries(
        Object.entries(itemScores).flatMap(([itemId, scores]) => {
          const average = responseMean(scores)
          return average === null ? [] : [[itemId, average]]
        }),
      )
      const responsesForOverall: OverallResponse[] = subjects.flatMap((subject) =>
        subject.resultSet.evaluations.map((evaluation) => ({
          submittedAt: evaluation.submittedAt,
          generalRating: evaluation.generalRating,
          categoryAverages: evaluation.categoryAverages,
          subject: `${subject.resultSet.subject?.code ?? ""} ${subject.resultSet.subject?.name ?? ""}`.trim(),
          section: sectionLabel(subject.resultSet.section.program, subject.resultSet.section.name),
        })),
      )
      const comments = subjects.flatMap((subject) =>
        subject.resultSet.comments.map((comment) => comment.comment),
      )

      entries.push({
        name: `${folder}/${entryName(member.name)}/${entryName(member.name)}_consolidated.xlsx`,
        data: buildConsolidatedFacultyWorkbook({
          individual: buildFacultySummaryModel({
            semesterTitle: period.semesterTitle ?? null,
            evaluationPeriodName: period.name ?? null,
            department: departmentInfo,
            faculty: {
              name: member.name,
              email: member.email,
              avgRating: averageRating,
              remarks: getRemark(averageRating),
            },
            rows: [{
              subject: null,
              section: { program: null, name: null },
              totalRespondents: responses.length,
              avgRating: averageRating,
              highest: [],
              lowest: [],
            }],
          }),
          form: {
            semesterTitle: period.semesterTitle ?? null,
            evaluationPeriodName: period.name ?? null,
            employeeNo: employeeNo ?? null,
            facultyName: member.name,
            avgRating: averageRating,
            remarks: getRemark(averageRating),
            program: null,
            sectionName: null,
            subject: null,
            totalRespondents: responses.length,
            criteria: rubric.map((category) => ({
              name: category.name,
              average: averageCategories[category.name] ?? null,
              statements: category.items.map((item) => ({
                text: item.text,
                avg: itemAverages[item.id] ?? null,
              })),
            })),
          },
          comments: buildCommentsModel(
            {
              semesterTitle: period.semesterTitle ?? null,
              evaluationPeriodName: period.name ?? null,
              employeeNo,
              facultyName: member.name,
              avgRating: averageRating,
              remarks: getRemark(averageRating),
            },
            comments,
          ),
          overall: buildOverallModel({
            semesterTitle: period.semesterTitle ?? null,
            facultyName: member.name,
            department: departmentInfo,
            subject: null,
            showDateColumn: true,
            showSubjectHeader: false,
            showSubjectSectionColumn: true,
            criteria,
            responses: responsesForOverall,
          }),
          itemAverages,
          rubricCategories: rubric,
        }),
      })
    }
  }

  // ⭐ a partial ZIP is never silent — the file names what is missing
  if (failures.length > 0) {
    const lines = [
      "This export is INCOMPLETE.",
      "",
      "These faculty workbooks could not be built:",
      ...failures.map((failure) => `- ${failure}`),
      "",
    ]
    entries.push({ name: "_INCOMPLETE.txt", data: new TextEncoder().encode(lines.join("\n")) })
  }

  return { ok: true, bytes: createDeflatedZip(entries), failures, count }
}

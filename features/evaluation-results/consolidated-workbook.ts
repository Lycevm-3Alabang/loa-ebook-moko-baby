import type { SubjectResultSet } from "./evaluation-results.service"
import { buildConsolidatedFacultyWorkbook as buildWorkbook } from "@/lib/xlsx/consolidated-workbook"
import { buildCommentsModel } from "@/lib/xlsx/comments"
import { buildOverallModel, type OverallResponse } from "@/lib/xlsx/overall"
import { buildFacultySummaryModel, type SummaryRubricCategory } from "@/lib/xlsx/overall-summary"
import { getRemark, sectionLabel } from "@/lib/evaluation-utils"

interface ConsolidatedFacultyWorkbookOptions {
  semesterTitle: string | null
  evaluationPeriodName: string | null
  department: { name: string; code: string }
  faculty: { name: string; email: string }
  avgRating: number | null
  remarks: string | null
  resultSets: SubjectResultSet[]
  rubricCategories: SummaryRubricCategory[]
}

function mean(values: (number | null | undefined)[]): number | null {
  const scores = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

function round2(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(2))
}

export function buildConsolidatedFacultyWorkbook(options: ConsolidatedFacultyWorkbookOptions): Uint8Array {
  const responses: OverallResponse[] = options.resultSets.flatMap((resultSet) =>
    resultSet.evaluations.map((evaluation) => ({
      submittedAt: evaluation.submittedAt,
      generalRating: evaluation.generalRating,
      categoryAverages: evaluation.categoryAverages,
    })),
  )
  const categoryAverages: Record<string, number> = {}
  for (const category of options.rubricCategories) {
    const average = mean(responses.map((response) => response.categoryAverages[category.name]))
    if (average !== null) categoryAverages[category.name] = average
  }

  const itemScores: Record<string, number[]> = {}
  for (const resultSet of options.resultSets) {
    for (const evaluation of resultSet.evaluations) {
      for (const item of evaluation.itemAverages ?? []) {
        const scores = itemScores[item.itemId] ?? []
        scores.push(item.avg)
        itemScores[item.itemId] = scores
      }
    }
  }
  const itemAverages = Object.fromEntries(
    Object.entries(itemScores).flatMap(([itemId, scores]) => {
      const average = mean(scores)
      return average === null ? [] : [[itemId, average]]
    }),
  )

  const firstFaculty = options.resultSets.find((resultSet) => resultSet.faculty?.employeeNo)
  const employeeNo = firstFaculty?.faculty?.employeeNo ?? null
  const comments = options.resultSets.flatMap((resultSet) =>
    resultSet.comments.map((comment) => comment.comment),
  )
  const criteria = options.rubricCategories.map((category) => ({ name: category.name }))
  const rubric = options.rubricCategories.map((category) => ({
    name: category.name,
    items: category.items.map((item) => ({ id: item.id, text: item.text })),
  }))
  const overallResponses: OverallResponse[] = options.resultSets.flatMap((resultSet) =>
    resultSet.evaluations.map((evaluation) => ({
      submittedAt: evaluation.submittedAt,
      generalRating: evaluation.generalRating,
      categoryAverages: evaluation.categoryAverages,
      subject: `${resultSet.subject?.code ?? ""} ${resultSet.subject?.name ?? ""}`.trim(),
      section: sectionLabel(resultSet.section.program, resultSet.section.name),
    })),
  )

  return buildWorkbook({
    individual: buildFacultySummaryModel({
      semesterTitle: options.semesterTitle,
      evaluationPeriodName: options.evaluationPeriodName,
      department: options.department,
      faculty: {
        ...options.faculty,
        avgRating: options.avgRating,
        remarks: options.remarks,
      },
      rows: [{
        subject: null,
        section: { program: null, name: null },
        totalRespondents: responses.length,
        avgRating: options.avgRating,
        highest: [],
        lowest: [],
      }],
    }),
    form: {
      semesterTitle: options.semesterTitle,
      evaluationPeriodName: options.evaluationPeriodName,
      employeeNo,
      facultyName: options.faculty.name,
      avgRating: options.avgRating,
      remarks: options.remarks ?? getRemark(options.avgRating),
      program: null,
      sectionName: null,
      subject: null,
      totalRespondents: responses.length,
      criteria: options.rubricCategories.map((category) => ({
        name: category.name,
        average: round2(categoryAverages[category.name] ?? null),
        statements: category.items.map((item) => ({
          text: item.text,
          avg: round2(itemAverages[item.id] ?? null),
        })),
      })),
    },
    comments: buildCommentsModel({
      semesterTitle: options.semesterTitle,
      evaluationPeriodName: options.evaluationPeriodName,
      employeeNo,
      facultyName: options.faculty.name,
      avgRating: options.avgRating,
      remarks: options.remarks ?? getRemark(options.avgRating),
    }, comments),
    overall: buildOverallModel({
      semesterTitle: options.semesterTitle,
      facultyName: options.faculty.name,
      department: options.department,
      subject: null,
      showDateColumn: true,
      showSubjectHeader: false,
      showSubjectSectionColumn: true,
      criteria,
      responses: overallResponses,
    }),
    itemAverages,
    rubricCategories: rubric,
  })
}
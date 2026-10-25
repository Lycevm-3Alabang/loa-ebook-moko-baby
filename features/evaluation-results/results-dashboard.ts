import {
  averageDisplayedRatings,
  departmentLabel,
  getRemark,
} from "@/lib/evaluation-utils"

/** A rubric reading carried by a department row. */
export interface ResultsDashboardRubric {
  key: string
  label: string
  score: number
}

/** The subset of a department row the dashboard reads. */
export interface ResultsDashboardRow {
  departmentId: string
  departmentName: string
  departmentCode: string
  avgRating: number | null
  remarks: string | null
  lowestRubrics: ResultsDashboardRubric[]
}

/** One bar: a department's published average and the remark the table prints. */
export interface ResultsDashboardBar {
  departmentId: string
  label: string
  avgRating: number | null
  remark: string | null
}

/** A department the page's attention map flags. */
export interface ResultsDashboardAttentionDepartment {
  departmentId: string
  label: string
}

/** One rubric that is a department's weakest, with how many departments it is. */
export interface ResultsDashboardWeakCriterion {
  key: string
  label: string
  count: number
}

export interface ResultsDashboardCounts {
  departmentCount: number
  loadedCount: number
  missingCount: number
  ratedCount: number
  unratedCount: number
}

interface WeakestResult {
  /** Loaded departments with at least one lowest rubric. */
  population: number
  rows: ResultsDashboardWeakCriterion[]
}

export interface ResultsDashboardModel {
  mean: number | null
  meanRemark: string | null
  departmentBars: ResultsDashboardBar[]
  attentionDepartments: ResultsDashboardAttentionDepartment[]
  /** The top three weakest criteria, with ties counted per department. */
  weakest: ResultsDashboardWeakCriterion[]
  /** Loaded departments with at least one lowest rubric. */
  weaknessPopulation: number
  counts: ResultsDashboardCounts
}

function labelFor(row: ResultsDashboardRow): string {
  return departmentLabel(row.departmentName, row.departmentCode)
}

/** Rated bars descend; no-rating bars sit at the bottom; ties are alphabetical. */
function compareBars(a: ResultsDashboardBar, b: ResultsDashboardBar): number {
  if (a.avgRating === null && b.avgRating === null) {
    return a.label.localeCompare(b.label)
  }
  if (a.avgRating === null) return 1
  if (b.avgRating === null) return -1
  return b.avgRating - a.avgRating || a.label.localeCompare(b.label)
}

/** Attention names ascend by average (the worst first); no-rating rows sit last. */
function compareAttention(
  a: ResultsDashboardRow,
  b: ResultsDashboardRow,
): number {
  if (a.avgRating === null && b.avgRating === null) {
    return labelFor(a).localeCompare(labelFor(b))
  }
  if (a.avgRating === null) return 1
  if (b.avgRating === null) return -1
  return a.avgRating - b.avgRating || labelFor(a).localeCompare(labelFor(b))
}

function buildWeakest(
  loadedRows: ResultsDashboardRow[],
): WeakestResult {
  const counts = new Map<string, { label: string; count: number }>()
  let population = 0

  for (const row of loadedRows) {
    if (row.lowestRubrics.length === 0) continue
    population += 1

    // Ties are counted: two criteria at the same lowest score each get one.
    // A repeated key inside one row still counts once for that department.
    const seen = new Set<string>()
    for (const rubric of row.lowestRubrics) {
      if (seen.has(rubric.key)) continue
      seen.add(rubric.key)

      const existing = counts.get(rubric.key)
      if (existing) existing.count += 1
      else counts.set(rubric.key, { label: rubric.label, count: 1 })
    }
  }

  const rows = [...counts.entries()]
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3)

  return { population, rows }
}

/**
 * Project the page's existing rows into the dashboard's model.
 *
 * Pure: no React, no storage, no fetch, no Date. The mean is the mean of the
 * table's displayed department averages — nulls are excluded, never zeroed.
 * Missing figures are excluded and counted separately; a loaded no-result row
 * is a real bar with `avgRating: null`.
 */
export function buildResultsDashboard(
  rows: ResultsDashboardRow[],
  attentionByDept: Record<string, ResultsDashboardRubric[]>,
  missingDepartmentIds: readonly string[],
): ResultsDashboardModel {
  const missing = new Set(missingDepartmentIds)
  const loadedRows = rows.filter((row) => !missing.has(row.departmentId))
  const ratedRows = loadedRows.filter((row) => row.avgRating !== null)
  const mean = averageDisplayedRatings(ratedRows.map((row) => row.avgRating))
  const meanRemark = getRemark(mean)

  const departmentBars = loadedRows
    .map((row) => ({
      departmentId: row.departmentId,
      label: labelFor(row),
      avgRating: row.avgRating,
      remark: row.avgRating === null ? null : row.remarks,
    }))
    .sort(compareBars)

  const attentionDepartments = rows
    .filter((row) => {
      const attention = attentionByDept[row.departmentId]
      return attention !== undefined && attention.length > 0
    })
    .sort(compareAttention)
    .map((row) => ({ departmentId: row.departmentId, label: labelFor(row) }))

  const missingCount = rows.filter((row) => missing.has(row.departmentId)).length
  const loadedCount = loadedRows.length
  const ratedCount = ratedRows.length
  const weakest = buildWeakest(loadedRows)

  return {
    mean,
    meanRemark,
    departmentBars,
    attentionDepartments,
    weakest: weakest.rows,
    weaknessPopulation: weakest.population,
    counts: {
      departmentCount: rows.length,
      loadedCount,
      missingCount,
      ratedCount,
      unratedCount: loadedCount - ratedCount,
    },
  }
}

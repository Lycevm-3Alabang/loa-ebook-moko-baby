import type { LiveDeptAverage } from "@/lib/types"

export const CATEGORY_NAMES: Record<string, string> = {
  "Professional Manner": "professionalManner",
  "Communication with Students": "communicationWithStudent",
  "Student Engagement": "studentEngagement",
  "Learning Materials": "learningMaterials",
  "Time Management": "timeManagement",
  "Experiential Learning Provided to Students": "experientialLearning",
  "Experiential Learning": "experientialLearning",
  "Respect the Uniqueness of the Students": "respectUniqueness",
  "Respect for Uniqueness": "respectUniqueness",
  "Assessment and Feedback": "assessmentAndFeedback",
}

export const CATEGORY_KEYS = [
  "professionalManner",
  "communicationWithStudent",
  "studentEngagement",
  "learningMaterials",
  "timeManagement",
  "experientialLearning",
  "respectUniqueness",
  "assessmentAndFeedback",
] as const

export type RubricKey = (typeof CATEGORY_KEYS)[number]

export const CATEGORY_LABELS: Record<RubricKey, string> = {
  professionalManner: "Professional Manner",
  communicationWithStudent: "Communication w/ Students",
  studentEngagement: "Student Engagement",
  learningMaterials: "Learning Materials",
  timeManagement: "Time Management",
  experientialLearning: "Experiential Learning",
  respectUniqueness: "Respect for Uniqueness",
  assessmentAndFeedback: "Assessment & Feedback",
}

export function getRemark(general: number | null): string | null {
  if (general === null) return null
  if (general >= 4.5) return "Outstanding"
  if (general >= 3.5) return "Very Satisfactory"
  if (general >= 2.5) return "Satisfactory"
  if (general >= 1.5) return "Unsatisfactory"
  return "Poor"
}

export interface RatingRow {
  rating: number
  rubric_items: { categoryId: string; rubric_categories: { name: string } }
}

export interface CategoryAverages {
  [categoryName: string]: number
}

export function computeCategoryAverages(ratings: RatingRow[]): CategoryAverages {
  const catRatings: Record<string, number[]> = {}
  for (const r of ratings) {
    const catName = r.rubric_items.rubric_categories.name
    if (!catRatings[catName]) catRatings[catName] = []
    catRatings[catName].push(r.rating)
  }
  const catAverages: CategoryAverages = {}
  for (const [cat, vals] of Object.entries(catRatings)) {
    catAverages[cat] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  return catAverages
}

export function computeGeneralRating(catAverages: CategoryAverages): number | null {
  const keys = Object.keys(catAverages)
  if (keys.length === 0) return null
  return Math.round(keys.reduce((sum, k) => sum + catAverages[k], 0) / keys.length * 100) / 100
}

export function mapCategoryAveragesToColumns(catAverages: CategoryAverages): Record<string, number | null> {
  const row: Record<string, number | null> = {
    professionalManner: null,
    communicationWithStudent: null,
    studentEngagement: null,
    learningMaterials: null,
    timeManagement: null,
    experientialLearning: null,
    respectUniqueness: null,
    assessmentAndFeedback: null,
  }
  for (const [catName, avg] of Object.entries(catAverages)) {
    const col = CATEGORY_NAMES[catName]
    if (col) row[col] = Math.round(avg * 100) / 100
  }
  return row
}

export function findHighestLowestRubrics(catAverages: Record<string, number | null>): {
  highest: { key: string; label: string; score: number }[]
  lowest: { key: string; label: string; score: number }[]
} {
  const entries = Object.entries(catAverages)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => ({ key: k, label: CATEGORY_LABELS[k as RubricKey] || k, score: v as number }))
  if (entries.length === 0) return { highest: [], lowest: [] }
  const maxScore = Math.max(...entries.map((e) => e.score))
  const minScore = Math.min(...entries.map((e) => e.score))
  return {
    highest: entries.filter((e) => e.score === maxScore),
    lowest: entries.filter((e) => e.score === minScore),
  }
}

export function computeSentimentScore(comments: { sentimentScore: number | null }[]): number | null {
  const scored = comments.filter((c) => c.sentimentScore !== null).map((c) => c.sentimentScore as number)
  if (scored.length === 0) return null
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length * 100) / 100
}

export function getRemarkColor(remarks: string | null): string {
  switch (remarks) {
    case "Outstanding": return "bg-success-bg text-success-text"
    case "Very Satisfactory": return "bg-info-bg text-info-text"
    case "Satisfactory": return "bg-warning-bg text-warning-text"
    case "Unsatisfactory": return "bg-danger-bg text-danger-text"
    case "Poor": return "bg-danger-bg text-danger-text"
    default: return "bg-surface-tertiary text-tertiary"
  }
}

export function formatPeriodLabel(period: { name?: string; title?: string; semesterTitle?: string; id: string }): string {
  const base = period.name || period.title || period.id
  return period.semesterTitle ? `${base} — ${period.semesterTitle}` : base
}

export interface FlatSnapshotRow {
  id: string
  evaluation_period_id: string
  rubric_group_id: string
  rubric_group_name: string
  category_name: string
  category_display_order: number
  category_id: string | null
  item_text: string
  item_display_order: number
  item_weight: number
  item_id: string | null
}

export interface NestedRubricCategory {
  id: string
  name: string
  displayOrder: number
  items: { id: string; text: string; displayOrder: number; weight: number }[]
}

export function groupSnapshotRows(rows: FlatSnapshotRow[]): NestedRubricCategory[] {
  const catMap = new Map<string, NestedRubricCategory>()
  for (const row of rows) {
    const key = row.category_name
    if (!catMap.has(key)) {
      catMap.set(key, {
        id: row.category_id || `snap_${row.rubric_group_id}_${row.category_display_order}`,
        name: row.category_name,
        displayOrder: row.category_display_order,
        items: [],
      })
    }
    catMap.get(key)!.items.push({
      id: row.item_id || `snap_item_${row.rubric_group_id}_${row.category_display_order}_${row.item_display_order}`,
      text: row.item_text,
      displayOrder: row.item_display_order,
      weight: row.item_weight,
    })
  }
  return Array.from(catMap.values()).sort((a, b) => a.displayOrder - b.displayOrder)
}

// --- Aggregation helpers (extracted for testability) -----------------------

export interface FacultySummary {
  catAverages: Record<string, number>
  general: number | null
  catColumns: Record<string, number | null>
  rubrics: { highest: { key: string; label: string; score: number }[]; lowest: { key: string; label: string; score: number }[] }
  sentiment: number | null
}

export function buildFacultySummary(
  ratings: RatingRow[],
  comments: { sentimentScore: number | null }[] = [],
): FacultySummary {
  const catAverages = computeCategoryAverages(ratings)
  const general = computeGeneralRating(catAverages)
  const catColumns = mapCategoryAveragesToColumns(catAverages)
  const rubrics = findHighestLowestRubrics(catColumns)
  const sentiment = computeSentimentScore(comments)
  return { catAverages, general, catColumns, rubrics, sentiment }
}

export interface FacultyDeptInput {
  facultyId: string
  deptId: string
  evalCount: number
  ratings: RatingRow[]
}

export interface DeptResolutionContext {
  userDept: Map<string, string | null>
  facultySubjects: { faculty_id: string; section_id: string | null; semesterId: string | null }[]
  sections: Map<string, string | null>
  departmentCourses: Map<string, string | null>
  semesterId: string | null
}

export function resolveFacultyDepartment(facultyId: string, ctx: DeptResolutionContext): string | null {
  const direct = ctx.userDept.get(facultyId)
  if (direct) return direct
  if (!ctx.semesterId) return null
  const fs = ctx.facultySubjects.find((f) => f.faculty_id === facultyId && f.semesterId === ctx.semesterId)
  if (!fs || !fs.section_id) return null
  const dcId = ctx.sections.get(fs.section_id)
  if (!dcId) return null
  return ctx.departmentCourses.get(dcId) ?? null
}

export function buildLiveDeptAverages(inputs: FacultyDeptInput[]): LiveDeptAverage[] {
  const groups = new Map<string, {
    facultyIds: Set<string>
    respondents: number
    generals: number[]
    cats: Record<string, number[]>
  }>()
  for (const inp of inputs) {
    const { general, catColumns } = buildFacultySummary(inp.ratings)
    if (general === null) continue
    let g = groups.get(inp.deptId)
    if (!g) {
      g = {
        facultyIds: new Set(),
        respondents: 0,
        generals: [],
        cats: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, [] as number[]])),
      }
      groups.set(inp.deptId, g)
    }
    g.facultyIds.add(inp.facultyId)
    g.respondents += inp.evalCount
    g.generals.push(Math.round(general * 100) / 100)
    for (const key of CATEGORY_KEYS) {
      const v = catColumns[key]
      if (v !== null) g.cats[key].push(v)
    }
  }
  return [...groups.entries()].map(([departmentId, g]) => {
    const avgRating = g.generals.length > 0
      ? Math.round(g.generals.reduce((a, b) => a + b, 0) / g.generals.length * 100) / 100
      : null
    const catAverages: Record<string, number | null> = {}
    for (const key of CATEGORY_KEYS) {
      const vals = g.cats[key]
      catAverages[key] = vals.length > 0
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100
        : null
    }
    const rubrics = findHighestLowestRubrics(catAverages)
    return {
      departmentId,
      facultyIds: [...g.facultyIds],
      totalRespondents: g.respondents,
      avgRating,
      remarks: getRemark(avgRating),
      catAverages,
      highestRubrics: rubrics.highest,
      lowestRubrics: rubrics.lowest,
    }
  })
}

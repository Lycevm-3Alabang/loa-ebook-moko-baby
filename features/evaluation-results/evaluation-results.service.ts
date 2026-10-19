import { evaluationResultRepository, userRepository, evaluationRepository, facultySubjectRepository, subjectRepository } from "@/lib/repositories/factory"
import {
  computeCategoryAverages,
  computeGeneralRating,
  mapCategoryAveragesToColumns,
  findHighestLowestRubrics,
  computeSentimentScore,
  getRemark,
} from "@/lib/evaluation-utils"

export async function getEvaluationResults(periodId: string, filters?: { departmentId?: string; facultyId?: string }) {
  return evaluationResultRepository.list(periodId, filters)
}

export async function getFacultyEvaluationResult(periodId: string, facultyId: string) {
  return evaluationResultRepository.findByFaculty(periodId, facultyId)
}

export async function computeEvaluationResults(periodId: string, facultyId?: string) {
  return evaluationResultRepository.compute(periodId, facultyId)
}

export async function recomputeAllResults(periodId: string) {
  return evaluationResultRepository.computeAll(periodId)
}

export interface DepartmentSubjectResult {
  facultySubjectId: string
  facultyId: string
  facultyName: string
  facultyEmail: string
  subjectId: string
  subjectCode: string
  subjectName: string
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

export async function getDepartmentSubjectResults(evaluationPeriodId: string, departmentId: string): Promise<DepartmentSubjectResult[]> {
  const facUsers = await userRepository.listByDepartment(departmentId)
  if (!facUsers || facUsers.length === 0) return []

  const facIds = facUsers.map((u) => u.id)
  const facNameMap = new Map(facUsers.map((u) => [u.id, u]))

  const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluatees(evaluationPeriodId, facIds)
  if (evals.length === 0) return []

  const fsIds = [...new Set(evals.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
  const facultySubjects = await facultySubjectRepository.findByIds(fsIds)
  const subjects = await subjectRepository.findByIds([...new Set(facultySubjects.map((fs) => fs.subject_id))])
  const fsMap = new Map(facultySubjects.map((fs) => [fs.id, fs]))
  const subjMap = new Map(subjects.map((s) => [s.id, s]))

  // Match the detail page's eval set: evaluatee must equal the subject's faculty.
  const validEvals = evals.filter((ev) => {
    if (!ev.facultySubjectId) return false
    const fs = fsMap.get(ev.facultySubjectId)
    return !!fs && fs.faculty_id === ev.evaluateeId
  })
  if (validEvals.length === 0) return []

  const evaluationIds = validEvals.map((e) => e.id)

  const [ratings, commentsRaw] = await Promise.all([
    evaluationRepository.listRatingsByEvaluationIds(evaluationIds),
    evaluationRepository.listCommentsByEvaluationIds(evaluationIds),
  ])

  const commentsByEval = new Map<string, { sentimentScore: number | null }[]>()
  for (const c of commentsRaw) {
    if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
    commentsByEval.get(c.evaluationId)!.push(c)
  }

  const groupEvalMap = new Map<string, string[]>()
  for (const ev of validEvals) {
    const key = ev.facultySubjectId as string
    if (!groupEvalMap.has(key)) groupEvalMap.set(key, [])
    groupEvalMap.get(key)!.push(ev.id)
  }

  const out: DepartmentSubjectResult[] = []
  for (const [fsKey, evalIds] of groupEvalMap) {
    const fs = fsMap.get(fsKey)
    if (!fs) continue
    const user = facNameMap.get(fs.faculty_id)
    const subj = subjMap.get(fs.subject_id)

    const groupRatings = ratings.filter((r) => evalIds.includes(r.evaluationId))
    const catAverages = computeCategoryAverages(groupRatings)
    const general = computeGeneralRating(catAverages)
    const catColumns = mapCategoryAveragesToColumns(catAverages)
    const rubrics = findHighestLowestRubrics(catColumns)

    const groupComments = evalIds.flatMap((eid) => commentsByEval.get(eid) ?? [])
    const sentiment = computeSentimentScore(groupComments)

    out.push({
      facultySubjectId: fsKey,
      facultyId: fs.faculty_id,
      facultyName: user?.name ?? "Unknown",
      facultyEmail: user?.email ?? "",
      subjectId: fs.subject_id,
      subjectCode: subj?.code ?? "",
      subjectName: subj?.name ?? "",
      totalRespondents: evalIds.length,
      avgRating: general,
      remarks: getRemark(general),
      professionalManner: catColumns.professionalManner,
      communicationWithStudent: catColumns.communicationWithStudent,
      studentEngagement: catColumns.studentEngagement,
      learningMaterials: catColumns.learningMaterials,
      timeManagement: catColumns.timeManagement,
      experientialLearning: catColumns.experientialLearning,
      respectUniqueness: catColumns.respectUniqueness,
      assessmentAndFeedback: catColumns.assessmentAndFeedback,
      highestRubrics: rubrics.highest,
      lowestRubrics: rubrics.lowest,
      sentimentScore: sentiment,
    })
  }
  return out
}

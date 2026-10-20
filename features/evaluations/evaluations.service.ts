import { evaluationRepository, studentEnrollmentRepository } from "@/lib/repositories/factory"

export async function getPendingEvaluations(
  evaluatorId: string,
  evaluationPeriodId: string,
  activeSemesterId?: string | null,
) {
  return evaluationRepository.findPending(evaluatorId, evaluationPeriodId, activeSemesterId)
}

/**
 * The shared dummy account owns real classes but is a placeholder, never a
 * person: it must not be shown to a student as the evaluated entity, and it
 * must not be rated.
 */
export async function isDummyAssignment(facultySubjectId: string) {
  return evaluationRepository.isDummyAssignment(facultySubjectId)
}

export async function getMyEvaluations(evaluatorId: string, evaluationPeriodId?: string) {
  return evaluationRepository.findByEvaluator(evaluatorId, evaluationPeriodId)
}

export async function getMyEvaluationsBrief(evaluatorId: string) {
  return evaluationRepository.findByEvaluatorBrief(evaluatorId)
}

export async function getEvaluation(id: string) {
  return evaluationRepository.findById(id)
}

export async function getEvaluationIfOwner(evaluationId: string, userId: string) {
  const evaluation = await evaluationRepository.findById(evaluationId)
  if (!evaluation) return null
  if (evaluation.evaluatorId !== userId) return null
  return evaluation
}

export async function getOrCreateEvaluation(evaluationPeriodId: string, evaluatorId: string, evaluateeId: string, facultySubjectId: string, source?: string | null) {
  const existing = await evaluationRepository.findByComposite(evaluationPeriodId, evaluatorId, facultySubjectId)
  if (existing) return existing
  return evaluationRepository.create(evaluationPeriodId, evaluatorId, evaluateeId, facultySubjectId, source)
}

export async function saveRatings(evaluationId: string, ratings: { itemId: string; rating: number }[]) {
  return evaluationRepository.setRatings(evaluationId, ratings)
}

export async function submitEvaluation(evaluationId: string) {
  return evaluationRepository.submit(evaluationId)
}

export async function getEvaluationRatings(evaluationId: string) {
  return evaluationRepository.getRatings(evaluationId)
}

export async function addEvaluationComment(evaluationId: string, comment: string) {
  return evaluationRepository.addComment(evaluationId, comment)
}

export async function getEvaluationComment(evaluationId: string) {
  return evaluationRepository.getComment(evaluationId)
}

export async function getFacultySubjectsByStudent(student_id: string, faculty_id: string, semesterId: string) {
  return studentEnrollmentRepository.getFacultySubjectsByStudent(student_id, faculty_id, semesterId)
}

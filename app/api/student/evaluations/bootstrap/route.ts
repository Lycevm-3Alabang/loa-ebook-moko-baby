import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { userRepository, subjectRepository, facultySubjectRepository, rubricGroupRepository, sectionRepository } from "@/lib/repositories/factory"
import { getEvaluationPeriods, getActiveEvaluationPeriod } from "@/features/admin-data/evaluation-periods.service"
import { getActiveSemester } from "@/features/admin-data/semesters.service"
import { getPendingEvaluations, getMyEvaluations } from "@/features/evaluations/evaluations.service"
import { groupSnapshotRows } from "@/lib/evaluation-utils"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as Record<string, unknown>).role as string
  const userId = (session.user as Record<string, unknown>).id as string

  if (!hasRole(role, "STUDENT")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const periods = await getEvaluationPeriods()
    const activePeriod = await getActiveEvaluationPeriod()
    const activePeriodId = activePeriod?.id ?? null
    const activeSemester = await getActiveSemester()

    const [pending, evaluations, rawRubric] = await Promise.all([
      activePeriodId ? getPendingEvaluations(userId, activePeriodId, activeSemester?.id ?? null) : Promise.resolve([]),
      activePeriodId ? getMyEvaluations(userId, activePeriodId) : Promise.resolve([]),
      activePeriodId
        ? rubricGroupRepository.getSnapshot(activePeriodId).catch(() => null)
        : Promise.resolve(null),
    ])

    const rubric = rawRubric ? groupSnapshotRows(rawRubric as unknown as import("@/lib/evaluation-utils").FlatSnapshotRow[]) : null

    const pendingFacultyIds = [...new Set(pending.map((p) => p.evaluateeId))]
    const pendingSubjectIds = [...new Set(pending.map((p) => p.subjectId))]
    const [facultyData, subjectData] = await Promise.all([
      pendingFacultyIds.length > 0
        ? userRepository.listByIds(pendingFacultyIds)
        : [],
      pendingSubjectIds.length > 0
        ? subjectRepository.findByIds(pendingSubjectIds)
        : [],
    ])

    const facultyMap = new Map(facultyData.map((u) => [u.id, u]))
    const subjectMap = new Map(subjectData.map((s) => [s.id, s]))

    const enrichedPending = pending.map((p) => {
      const f = facultyMap.get(p.evaluateeId)
      const s = subjectMap.get(p.subjectId)
      return {
        evaluateeId: p.evaluateeId,
        evaluateeName: f?.name ?? "Unknown",
        evaluateeEmail: f?.email ?? "",
        facultySubjectId: p.facultySubjectId,
        subjectId: p.subjectId,
        subjectCode: s?.code ?? "",
        subjectName: s?.name ?? "",
        mappingSemesterId: p.mappingSemesterId,
        mappingSemesterTitle: p.mappingSemesterTitle,
        sectionProgram: p.sectionProgram,
        sectionName: p.sectionName,
        isMappedToActiveSemester: p.isMappedToActiveSemester,
        eligible: p.eligible,
        ineligibilityReason: p.ineligibilityReason,
      }
    })

    const evalFacultyIds = [...new Set(evaluations.map((e) => e.evaluateeId))]
    const evalFsIds = [
      ...new Set(evaluations.filter((e) => e.facultySubjectId).map((e) => e.facultySubjectId)),
    ]

    const [evalFacultyData, fsData] = await Promise.all([
      evalFacultyIds.length > 0
        ? userRepository.listByIds(evalFacultyIds)
        : [],
      evalFsIds.length > 0
        ? facultySubjectRepository.findByIds(evalFsIds)
        : [],
    ])

    const evalFacultyMap = new Map(evalFacultyData.map((u) => [u.id, u]))
    const fsSubjectIdMap = new Map<string, string>()
    const fsSectionIdMap = new Map<string, string>()
    for (const fs of fsData) {
      fsSubjectIdMap.set(fs.id, fs.subject_id)
      if (fs.section_id) fsSectionIdMap.set(fs.id, fs.section_id)
    }

    const evalSubjectIds = [...new Set(fsData.map((fs) => fs.subject_id))]
    const evalSubjectData = evalSubjectIds.length > 0
      ? await subjectRepository.findByIds(evalSubjectIds)
      : []

    const evalSubjectMap = new Map(evalSubjectData.map((s) => [s.id, s]))

    // Section names for drafts: sections are few, so resolve in memory from
    // the row's OWN section (via its mapping), not from any active value.
    const allSections = await sectionRepository.list()
    const sectionById = new Map(
      (allSections as { id: string; name: string; program: string }[]).map((s) => [s.id, s]),
    )

    const enrichedEvaluations = evaluations.map((e) => {
      const subjectId = e.facultySubjectId ? (fsSubjectIdMap.get(e.facultySubjectId) ?? "") : ""
      const subj = subjectId ? evalSubjectMap.get(subjectId) : undefined
      const fac = evalFacultyMap.get(e.evaluateeId)
      const sec = e.facultySubjectId ? sectionById.get(fsSectionIdMap.get(e.facultySubjectId) ?? "") : undefined
      return {
        ...e,
        evaluateeName: fac?.name ?? "Unknown",
        subjectId,
        subjectCode: subj?.code ?? "",
        subjectName: subj?.name ?? "",
        sectionProgram: sec?.program ?? null,
        sectionName: sec?.name ?? null,
      }
    })

    return NextResponse.json({
      periods,
      activeEvalPeriodId: activePeriodId,
      activeEvalPeriodName: activePeriod?.name ?? null,
      activeEvalPeriodSemesterId: activePeriod?.semesterId ?? null,
      activeSemesterId: activeSemester?.id ?? null,
      pending: enrichedPending,
      evaluations: enrichedEvaluations,
      rubric,
    })
  } catch {
    return NextResponse.json({ error: "Failed to load evaluation data" }, { status: 500 })
  }
}

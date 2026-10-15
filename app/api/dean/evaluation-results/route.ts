import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository, evaluationResultRepository, evaluationRepository, userRepository, evaluationPeriodRepository } from "@/lib/repositories/factory"
import { supabase } from "@/lib/db"
import { findHighestLowestRubrics, getRemark } from "@/lib/evaluation-utils"
import { logServerError } from "@/lib/services/audit"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    const userId = (session.user as Record<string, unknown>).id as string
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    const dept = await departmentRepository.findByDeanId(userId)
    if (!dept) return NextResponse.json({ departments: [] })

    // Live home department — do not filter by evaluation_results.departmentId (stale snapshot).
    async function resolveLiveDeptMap(facultyIds: string[], periodId: string) {
      const liveUsers = facultyIds.length > 0 ? await userRepository.listByIds(facultyIds) : []
      const m = new Map<string, string | null>(liveUsers.map((u) => [u.id, u.departmentId]))
      const nullIds = facultyIds.filter((id) => !m.get(id))
      if (nullIds.length > 0) {
        const ep = await evaluationPeriodRepository.findById(periodId)
        const semId = ep?.semesterId
        if (semId) {
          const { data: fsRows } = await supabase
            .from("faculty_subjects")
            .select("faculty_id, section_id")
            .in("faculty_id", nullIds)
            .eq("semesterId", semId)
          if (fsRows && fsRows.length > 0) {
            const secIds = [...new Set(fsRows.map((r) => r.section_id).filter(Boolean))]
            if (secIds.length > 0) {
              const { data: secRows } = await supabase
                .from("sections")
                .select("id, departmentCourseId")
                .in("id", secIds)
              if (secRows && secRows.length > 0) {
                const dcIds = [...new Set(secRows.map((r) => r.departmentCourseId).filter(Boolean))]
                if (dcIds.length > 0) {
                  const { data: dcRows } = await supabase
                    .from("department_courses")
                    .select("id, departmentId")
                    .in("id", dcIds)
                  if (dcRows && dcRows.length > 0) {
                    const dcMap = new Map(dcRows.map((r) => [r.id, r.departmentId]))
                    const secMap = new Map(secRows.map((r) => [r.id, dcMap.get(r.departmentCourseId)]))
                    for (const fs of fsRows) {
                      const d = secMap.get(fs.section_id) as string | undefined
                      if (d && !m.get(fs.faculty_id)) m.set(fs.faculty_id, d)
                    }
                  }
                }
              }
            }
          }
        }
      }
      return m
    }

    let allResults = await evaluationResultRepository.list(evaluationPeriodId)
    let liveMap = await resolveLiveDeptMap([...new Set(allResults.map((r) => r.facultyId))], evaluationPeriodId)
    let results = allResults.filter((r) => liveMap.get(r.facultyId) === dept.id)
    const hasCategoryData = results.length > 0 && results.some((r) => r.generalRating !== null)
    if (!hasCategoryData) {
      await evaluationResultRepository.computeAll(evaluationPeriodId)
      allResults = await evaluationResultRepository.list(evaluationPeriodId)
      liveMap = await resolveLiveDeptMap([...new Set(allResults.map((r) => r.facultyId))], evaluationPeriodId)
      results = allResults.filter((r) => liveMap.get(r.facultyId) === dept.id)
      if (results.length === 0) return NextResponse.json({ departments: [] })
    }

    const facIds = new Set(results.map((r) => r.facultyId))
    const sentimentRows = await evaluationRepository.listSubmittedWithSentiment(evaluationPeriodId)

    const sentByFaculty = new Map<string, number[]>()
    for (const row of sentimentRows) {
      if (!facIds.has(row.evaluateeId)) continue
      if (row.sentimentScore !== null) {
        if (!sentByFaculty.has(row.evaluateeId)) sentByFaculty.set(row.evaluateeId, [])
        sentByFaculty.get(row.evaluateeId)!.push(row.sentimentScore)
      }
    }
    const avgSentByFaculty = new Map<string, number>()
    for (const [facId, scores] of sentByFaculty) {
      avgSentByFaculty.set(facId, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100)
    }

    const catKeys = [
      "professionalManner", "communicationWithStudent", "studentEngagement",
      "learningMaterials", "timeManagement", "experientialLearning",
      "respectUniqueness", "assessmentAndFeedback",
    ] as const

    let facultyCount = 0
    let totalRespondents = 0
    const generalRatings: number[] = []
    const catSums: Record<string, number[]> = Object.fromEntries(catKeys.map((k) => [k, [] as number[]]))
    const sentimentScores: number[] = []
    const seenFacIds = new Set<string>()

    for (const row of results) {
      if (!seenFacIds.has(row.facultyId)) {
        seenFacIds.add(row.facultyId)
        facultyCount++
      }
      totalRespondents += row.totalRespondents
      if (row.generalRating !== null) generalRatings.push(row.generalRating)
      for (const key of catKeys) {
        const val = (row as unknown as Record<string, unknown>)[key]
        if (typeof val === "number") catSums[key].push(val)
      }
      const fs = avgSentByFaculty.get(row.facultyId)
      if (fs !== undefined) sentimentScores.push(fs)
    }

    const avgRating = generalRatings.length > 0
      ? Math.round(generalRatings.reduce((a, b) => a + b, 0) / generalRatings.length * 100) / 100
      : null

    const deptCatAverages: Record<string, number | null> = {}
    for (const key of catKeys) {
      const vals = catSums[key]
      deptCatAverages[key] = vals.length > 0
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100
        : null
    }

    const rubrics = findHighestLowestRubrics(deptCatAverages)
    const avgSentiment = sentimentScores.length > 0
      ? Math.round(sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length * 100) / 100
      : null

    return NextResponse.json({
      departments: [{
        departmentId: dept.id,
        departmentName: dept.name,
        departmentCode: dept.code ?? "",
        facultyCount,
        totalRespondents,
        avgRating,
        remarks: getRemark(avgRating),
        highestRubrics: rubrics.highest,
        lowestRubrics: rubrics.lowest,
        sentimentScore: avgSentiment,
      }],
    })
  } catch (e) {
    console.error("Dean evaluation results error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}

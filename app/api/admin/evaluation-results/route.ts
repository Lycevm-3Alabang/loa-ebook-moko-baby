import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { evaluationResultRepository, evaluationRepository, departmentRepository, userRepository, evaluationPeriodRepository } from "@/lib/repositories/factory"
import { supabase } from "@/lib/db"
import { findHighestLowestRubrics, getRemark } from "@/lib/evaluation-utils"

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    let results = await evaluationResultRepository.list(evaluationPeriodId)
    const hasCategoryData = results.length > 0 && results.some((r) => r.generalRating !== null)
    if (!hasCategoryData) {
      await evaluationResultRepository.computeAll(evaluationPeriodId)
      results = await evaluationResultRepository.list(evaluationPeriodId)
      if (results.length === 0) return NextResponse.json({ departments: [] })
    } else {
      const submittedIds = await evaluationRepository.listSubmittedEvaluateeIds(evaluationPeriodId)
      const resultFaculty = new Set(results.map((r) => r.facultyId))
      const hasMissing = submittedIds.some((id) => !resultFaculty.has(id))
      if (hasMissing) {
        await evaluationResultRepository.computeAll(evaluationPeriodId)
        results = await evaluationResultRepository.list(evaluationPeriodId)
      }
    }

    const sentimentRows = await evaluationRepository.listSubmittedWithSentiment(evaluationPeriodId)

    const sentByFaculty = new Map<string, number[]>()
    for (const row of sentimentRows) {
      if (row.sentimentScore !== null) {
        if (!sentByFaculty.has(row.evaluateeId)) sentByFaculty.set(row.evaluateeId, [])
        sentByFaculty.get(row.evaluateeId)!.push(row.sentimentScore)
      }
    }
    const avgSentByFaculty = new Map<string, number>()
    for (const [facId, scores] of sentByFaculty) {
      avgSentByFaculty.set(facId, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100)
    }

    // Live home department — do not use evaluation_results.departmentId (stale snapshot).
    const facultyIds = [...new Set(results.map((r) => r.facultyId))]
    const liveUsers = facultyIds.length > 0 ? await userRepository.listByIds(facultyIds) : []
    const liveDeptMap = new Map<string, string | null>(liveUsers.map((u) => [u.id, u.departmentId]))

    // Fallback for nulls, same chain as compute(): faculty_subjects -> sections -> department_courses.
    const nullFacIds = facultyIds.filter((id) => !liveDeptMap.get(id))
    if (nullFacIds.length > 0) {
      const evalPeriod = await evaluationPeriodRepository.findById(evaluationPeriodId)
      const semesterId = evalPeriod?.semesterId
      if (semesterId) {
        const { data: fsRows } = await supabase
          .from("faculty_subjects")
          .select("faculty_id, section_id")
          .in("faculty_id", nullFacIds)
          .eq("semesterId", semesterId)
        if (fsRows && fsRows.length > 0) {
          const sectionIds = [...new Set(fsRows.map((r) => r.section_id).filter(Boolean))]
          if (sectionIds.length > 0) {
            const { data: sectionRows } = await supabase
              .from("sections")
              .select("id, departmentCourseId")
              .in("id", sectionIds)
            if (sectionRows && sectionRows.length > 0) {
              const dcIds = [...new Set(sectionRows.map((r) => r.departmentCourseId).filter(Boolean))]
              if (dcIds.length > 0) {
                const { data: dcRows } = await supabase
                  .from("department_courses")
                  .select("id, departmentId")
                  .in("id", dcIds)
                if (dcRows && dcRows.length > 0) {
                  const dcDeptMap = new Map(dcRows.map((r) => [r.id, r.departmentId]))
                  const sectionDeptMap = new Map(
                    sectionRows.map((r) => [r.id, dcDeptMap.get(r.departmentCourseId)]),
                  )
                  for (const fs of fsRows) {
                    const deptId = sectionDeptMap.get(fs.section_id) as string | undefined
                    if (deptId && !liveDeptMap.get(fs.faculty_id)) {
                      liveDeptMap.set(fs.faculty_id, deptId)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    const deptIds = [...new Set([...liveDeptMap.values()].filter(Boolean))] as string[]
    const allDepts = await departmentRepository.listAll()
    const deptMap = new Map(allDepts.filter((d) => deptIds.includes(d.id)).map((d) => [d.id, d]))

    const catKeys = [
      "professionalManner", "communicationWithStudent", "studentEngagement",
      "learningMaterials", "timeManagement", "experientialLearning",
      "respectUniqueness", "assessmentAndFeedback",
    ] as const

    const deptGroups = new Map<string, {
      departmentId: string
      facultyIds: Set<string>
      totalRespondents: number
      generalRatings: number[]
      catSums: Record<string, number[]>
      sentimentScores: number[]
    }>()

    for (const row of results) {
      const deptId = liveDeptMap.get(row.facultyId) ?? "__unknown__"
      if (!deptGroups.has(deptId)) {
        deptGroups.set(deptId, {
          departmentId: deptId,
          facultyIds: new Set(),
          totalRespondents: 0,
          generalRatings: [],
          catSums: Object.fromEntries(catKeys.map((k) => [k, [] as number[]])),
          sentimentScores: [],
        })
      }
      const g = deptGroups.get(deptId)!
      g.facultyIds.add(row.facultyId)
      g.totalRespondents += row.totalRespondents
      if (row.generalRating !== null) g.generalRatings.push(row.generalRating)
      for (const key of catKeys) {
        const val = (row as unknown as Record<string, unknown>)[key]
        if (typeof val === "number") g.catSums[key].push(val)
      }
      const fs = avgSentByFaculty.get(row.facultyId)
      if (fs !== undefined) g.sentimentScores.push(fs)
    }

    const departments = Array.from(deptGroups.values()).map((g) => {
      const avgRating = g.generalRatings.length > 0
        ? Math.round(g.generalRatings.reduce((a, b) => a + b, 0) / g.generalRatings.length * 100) / 100
        : null

      const deptCatAverages: Record<string, number | null> = {}
      for (const key of catKeys) {
        const vals = g.catSums[key]
        deptCatAverages[key] = vals.length > 0
          ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100
          : null
      }

      const rubrics = findHighestLowestRubrics(deptCatAverages)
      const avgSentiment = g.sentimentScores.length > 0
        ? Math.round(g.sentimentScores.reduce((a, b) => a + b, 0) / g.sentimentScores.length * 100) / 100
        : null

      const dept = deptMap.get(g.departmentId)

      return {
        departmentId: g.departmentId,
        departmentName: dept?.name ?? (g.departmentId === "__unknown__" ? "Unassigned" : "Unknown"),
        departmentCode: dept?.code ?? "",
        facultyCount: g.facultyIds.size,
        totalRespondents: g.totalRespondents,
        avgRating,
        remarks: getRemark(avgRating),
        highestRubrics: rubrics.highest,
        lowestRubrics: rubrics.lowest,
        sentimentScore: avgSentiment,
      }
    })

    return NextResponse.json({ departments })
  } catch (e) {
    console.error("Admin evaluation results error:", e)
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}

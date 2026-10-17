import { describe, it, expect } from "vitest"
import { buildLiveDeptAverages, buildFacultySummary, resolveFacultyDepartment } from "@/lib/evaluation-utils"
import type { DeptResolutionContext } from "@/lib/evaluation-utils"
import type { RatingRow } from "@/lib/evaluation-utils"

const row = (cat: string, rating: number): RatingRow => ({
  rating,
  rubric_items: { categoryId: "c1", rubric_categories: { name: cat } },
})

const PM = "Professional Manner"
const TM = "Time Management"
const SE = "Student Engagement"

const ALL_CATS = [
  "Professional Manner", "Communication with Students", "Student Engagement",
  "Learning Materials", "Time Management", "Experiential Learning Provided to Students",
  "Respect the Uniqueness of the Students", "Assessment and Feedback",
]

describe("buildFacultySummary", () => {
  it("computes catAverages, general, columns, rubrics, sentiment", () => {
    const s = buildFacultySummary([row(PM, 4), row(PM, 5), row(TM, 3)], [{ sentimentScore: 0.5 }, { sentimentScore: null }])
    expect(s.catAverages).toEqual({ "Professional Manner": 4.5, "Time Management": 3 })
    expect(s.general).toBe(3.75)
    expect(s.catColumns.professionalManner).toBe(4.5)
    expect(s.catColumns.timeManagement).toBe(3)
    expect(s.rubrics.highest.map((r) => r.key)).toEqual(["professionalManner"])
    expect(s.rubrics.lowest.map((r) => r.key)).toEqual(["timeManagement"])
    expect(s.sentiment).toBe(0.5)
  })
  it("returns null general when no ratings", () => {
    const s = buildFacultySummary([])
    expect(s.general).toBeNull()
    expect(s.sentiment).toBeNull()
  })
})

describe("buildLiveDeptAverages", () => {
  it("groups by dept and computes two-stage rounded avgRating", () => {
    const inputs = [
      { facultyId: "f1", deptId: "d1", evalCount: 2, ratings: [row(PM, 4), row(TM, 4)] },
      { facultyId: "f2", deptId: "d1", evalCount: 3, ratings: [row(PM, 5), row(TM, 5)] },
      { facultyId: "f3", deptId: "d2", evalCount: 1, ratings: [row(PM, 3), row(TM, 3)] },
    ]
    const out = buildLiveDeptAverages(inputs)
    const d1 = out.find((d) => d.departmentId === "d1")!
    expect(d1.facultyIds).toEqual(["f1", "f2"])
    expect(d1.totalRespondents).toBe(5)
    expect(d1.avgRating).toBe(4.5)
    expect(d1.remarks).toBe("Outstanding")
    const d2 = out.find((d) => d.departmentId === "d2")!
    expect(d2.avgRating).toBe(3)
  })

  it("skips faculty with no usable ratings (does not blank dept)", () => {
    const inputs = [
      { facultyId: "f1", deptId: "d1", evalCount: 2, ratings: [row(PM, 4), row(TM, 4)] },
      { facultyId: "f2", deptId: "d1", evalCount: 3, ratings: [] },
    ]
    const out = buildLiveDeptAverages(inputs)
    const d1 = out.find((d) => d.departmentId === "d1")!
    expect(d1.facultyIds).toEqual(["f1"])
    expect(d1.totalRespondents).toBe(2)
    expect(d1.avgRating).toBe(4)
  })

  it("skips faculty whose general is null (empty ratings)", () => {
    const inputs = [
      { facultyId: "f1", deptId: "d1", evalCount: 1, ratings: [] },
    ]
    expect(buildLiveDeptAverages(inputs)).toEqual([])
  })

  it("preserves __unknown__ as its own group", () => {
    const inputs = [
      { facultyId: "f1", deptId: "__unknown__", evalCount: 1, ratings: [row(PM, 4), row(TM, 4)] },
    ]
    const out = buildLiveDeptAverages(inputs)
    expect(out).toHaveLength(1)
    expect(out[0].departmentId).toBe("__unknown__")
    expect(out[0].avgRating).toBe(4)
  })

  it("applies two-stage rounding (dept mean of rounded faculty generals)", () => {
    // 3 categories: PM=4, TM=4, SE=5 -> cat mean = 13/3 = 4.333 -> rounded 4.33
    const inputs = [
      { facultyId: "f1", deptId: "d1", evalCount: 1, ratings: [row(PM, 4), row(TM, 4), row(SE, 5)] },
      { facultyId: "f2", deptId: "d1", evalCount: 1, ratings: [row(PM, 4), row(TM, 4), row(SE, 5)] },
    ]
    const out = buildLiveDeptAverages(inputs)
    expect(out[0].avgRating).toBe(4.33)
  })

  it("computes per-category means from rounded faculty column values", () => {
    const inputs = [
      { facultyId: "f1", deptId: "d1", evalCount: 1, ratings: [row(PM, 4), row(TM, 4)] },
      { facultyId: "f2", deptId: "d1", evalCount: 1, ratings: [row(PM, 5), row(TM, 3)] },
    ]
    const out = buildLiveDeptAverages(inputs)
    const d1 = out[0]
    expect(d1.catAverages.professionalManner).toBe(4.5)
    expect(d1.catAverages.timeManagement).toBe(3.5)
  })

  it("returns highest/lowest rubrics from rounded catAverages", () => {
    const inputs = [
      { facultyId: "f1", deptId: "d1", evalCount: 1, ratings: [row(PM, 4), row(TM, 3)] },
    ]
    const out = buildLiveDeptAverages(inputs)
    expect(out[0].highestRubrics.map((r) => r.key)).toEqual(["professionalManner"])
    expect(out[0].lowestRubrics.map((r) => r.key)).toEqual(["timeManagement"])
  })

  it("returns empty array when no inputs", () => {
    expect(buildLiveDeptAverages([])).toEqual([])
  })
})

describe("resolveFacultyDepartment", () => {
  const ctx = (over: Partial<DeptResolutionContext>): DeptResolutionContext => ({
    userDept: new Map(),
    facultySubjects: [],
    sections: new Map(),
    departmentCourses: new Map(),
    semesterId: "sem1",
    ...over,
  })

  it("uses direct user.departmentId when present", () => {
    const c = ctx({ userDept: new Map([["f1", "dept-direct"]]) })
    expect(resolveFacultyDepartment("f1", c)).toBe("dept-direct")
  })

  it("falls back via faculty_subjects -> sections -> department_courses", () => {
    const c = ctx({
      userDept: new Map([["f1", null]]),
      facultySubjects: [{ faculty_id: "f1", section_id: "sec1", semesterId: "sem1" }],
      sections: new Map([["sec1", "dc1"]]),
      departmentCourses: new Map([["dc1", "dept-resolved"]]),
    })
    expect(resolveFacultyDepartment("f1", c)).toBe("dept-resolved")
  })

  it("returns null when semesterId is null", () => {
    const c = ctx({
      userDept: new Map([["f1", null]]),
      semesterId: null,
      facultySubjects: [{ faculty_id: "f1", section_id: "sec1", semesterId: "sem1" }],
      sections: new Map([["sec1", "dc1"]]),
      departmentCourses: new Map([["dc1", "dept-resolved"]]),
    })
    expect(resolveFacultyDepartment("f1", c)).toBeNull()
  })

  it("returns null on semester mismatch (faculty_subject semester != period semester)", () => {
    const c = ctx({
      userDept: new Map([["f1", null]]),
      facultySubjects: [{ faculty_id: "f1", section_id: "sec1", semesterId: "semOTHER" }],
      sections: new Map([["sec1", "dc1"]]),
      departmentCourses: new Map([["dc1", "dept-resolved"]]),
    })
    expect(resolveFacultyDepartment("f1", c)).toBeNull()
  })

  it("returns null when no faculty_subject mapping", () => {
    const c = ctx({ userDept: new Map([["f1", null]]) })
    expect(resolveFacultyDepartment("f1", c)).toBeNull()
  })

  it("returns null when section has no departmentCourseId", () => {
    const c = ctx({
      userDept: new Map([["f1", null]]),
      facultySubjects: [{ faculty_id: "f1", section_id: "sec1", semesterId: "sem1" }],
      sections: new Map([["sec1", null]]),
      departmentCourses: new Map(),
    })
    expect(resolveFacultyDepartment("f1", c)).toBeNull()
  })

  it("returns null when department_courses has no departmentId", () => {
    const c = ctx({
      userDept: new Map([["f1", null]]),
      facultySubjects: [{ faculty_id: "f1", section_id: "sec1", semesterId: "sem1" }],
      sections: new Map([["sec1", "dc1"]]),
      departmentCourses: new Map([["dc1", null]]),
    })
    expect(resolveFacultyDepartment("f1", c)).toBeNull()
  })

  it("direct dept takes precedence over fallback even when fallback exists", () => {
    const c = ctx({
      userDept: new Map([["f1", "dept-direct"]]),
      facultySubjects: [{ faculty_id: "f1", section_id: "sec1", semesterId: "sem1" }],
      sections: new Map([["sec1", "dc1"]]),
      departmentCourses: new Map([["dc1", "dept-resolved"]]),
    })
    expect(resolveFacultyDepartment("f1", c)).toBe("dept-direct")
  })
})

describe("performance smoke", () => {
  it("buildLiveDeptAverages handles 500 faculties x 8 categories within 100ms", () => {
    const inputs = Array.from({ length: 500 }, (_, i) => ({
      facultyId: `f${i}`,
      deptId: `d${i % 10}`,
      evalCount: 10,
      ratings: ALL_CATS.map((c, ci) => row(c, 3 + ((i + ci) % 3))),
    }))
    const t0 = performance.now()
    const out = buildLiveDeptAverages(inputs)
    const elapsed = performance.now() - t0
    expect(out).toHaveLength(10)
    expect(elapsed).toBeLessThan(100)
  })

  it("resolveFacultyDepartment handles 1000 lookups within 50ms", () => {
    const ctx: DeptResolutionContext = {
      userDept: new Map(Array.from({ length: 1000 }, (_, i) => [`f${i}`, null] as [string, null])),
      facultySubjects: Array.from({ length: 1000 }, (_, i) => ({ faculty_id: `f${i}`, section_id: `sec${i}`, semesterId: "sem1" })),
      sections: new Map(Array.from({ length: 1000 }, (_, i) => [`sec${i}`, `dc${i}`] as [string, string])),
      departmentCourses: new Map(Array.from({ length: 1000 }, (_, i) => [`dc${i}`, `dept${i % 5}`] as [string, string])),
      semesterId: "sem1",
    }
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++) resolveFacultyDepartment(`f${i}`, ctx)
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(50)
  })
})

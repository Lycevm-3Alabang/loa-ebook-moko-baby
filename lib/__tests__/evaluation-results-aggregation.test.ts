import { describe, it, expect } from "vitest"
import {
  classifyWarningAssignments,
  resolveFacultyDepartment,
  resolveSubjectDepartment,
} from "@/lib/evaluation-utils"
import type { DeptResolutionContext } from "@/lib/evaluation-utils"

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

describe("classifyWarningAssignments", () => {
  const rows = [
    { faculty_id: "f1", section_id: "sec1", semesterId: "semOther" },
    { faculty_id: "f2", section_id: "sec2", semesterId: "sem1" },
  ]
  const deptOf = (a: { section_id: string | null }) => (a.section_id === "sec1" ? "d1" : "d2")

  it("splits the unresolvable from the off-semester assignments", () => {
    const out = classifyWarningAssignments(rows, deptOf, "sem1")
    expect(out.offSemester.map((a) => a.faculty_id)).toEqual(["f1"])
    expect(out.unattributed).toEqual([])
  })

  it("scopes to one department and drops the department-less ones", () => {
    const withUnresolvable = [...rows, { faculty_id: "f3", section_id: null, semesterId: "sem1" }]
    const out = classifyWarningAssignments(withUnresolvable, deptOf, "sem1", "d1")
    expect(out.offSemester.map((a) => a.faculty_id)).toEqual(["f1"])
    expect(out.unattributed).toEqual([])
  })

  it("keeps every off-semester assignment when unscoped", () => {
    const out = classifyWarningAssignments(rows, deptOf, "sem1")
    expect(out.offSemester).toHaveLength(1)
  })
})

describe("performance smoke", () => {
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

  it("resolveSubjectDepartment handles 1000 lookups within 50ms", () => {
    const ctx: DeptResolutionContext = {
      userDept: new Map(Array.from({ length: 1000 }, (_, i) => [`f${i}`, null] as [string, null])),
      facultySubjects: [],
      sections: new Map(Array.from({ length: 1000 }, (_, i) => [`sec${i}`, `dc${i}`] as [string, string])),
      departmentCourses: new Map(Array.from({ length: 1000 }, (_, i) => [`dc${i}`, `dept${i % 5}`] as [string, string])),
      semesterId: "sem1",
    }
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++) {
      resolveSubjectDepartment({ faculty_id: `f${i}`, section_id: `sec${i}` }, ctx)
    }
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(50)
  })
})

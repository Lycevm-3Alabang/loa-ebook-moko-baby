import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEvalPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockDeptRepo = vi.hoisted(() => ({ listAll: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ list: vi.fn() }))
const mockEvalRepo = vi.hoisted(() => ({
  countSubmittedByFacultySubjectIds: vi.fn(),
  listStatusByPeriodAndFacultySubjectIds: vi.fn(),
}))
const mockEnrollmentRepo = vi.hoisted(() => ({
  countByFacultySubjectIdsPaged: vi.fn(),
  listStudentIdsByFacultySubjectIds: vi.fn(),
}))
const mockSubjectRepo = vi.hoisted(() => ({ findByIds: vi.fn() }))
const mockUserRepo = vi.hoisted(() => ({ listByIds: vi.fn(), listByDepartment: vi.fn() }))
const mockEvalResultRepo = vi.hoisted(() => ({
  buildSubjectContext: vi.fn(),
  listAttributionWarnings: vi.fn(),
}))

vi.mock("@/lib/repositories/factory", () => ({
  evaluationPeriodRepository: mockEvalPeriodRepo,
  departmentRepository: mockDeptRepo,
  facultySubjectRepository: mockFsRepo,
  evaluationRepository: mockEvalRepo,
  evaluationResultRepository: mockEvalResultRepo,
  studentEnrollmentRepository: mockEnrollmentRepo,
  subjectRepository: mockSubjectRepo,
  userRepository: mockUserRepo,
}))

import { getEvaluationStatus } from "@/features/evaluations/evaluation-status.service"

const st = (evaluatorId: string, status: "DRAFT" | "SUBMITTED" | "INVALID", isDisabled = false, fsId = "fs1") => ({
  id: `e-${evaluatorId}-${fsId}`,
  evaluatorId,
  status,
  isDisabled,
  submittedAt: null,
  facultySubjectId: fsId,
})

beforeEach(() => {
  vi.resetAllMocks()
  mockEvalPeriodRepo.findById.mockResolvedValue({ id: "p1", semesterId: "s1" })
  mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
  mockSubjectRepo.findByIds.mockResolvedValue([{ id: "sub1", code: "IT101", name: "Intro" }])
  mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "Ana Cruz", departmentId: "d1" }])
  // The section owns the subject: sec1 -> dc1 -> d1.
  mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
    userDept: new Map([["f1", "d1"]]),
    sections: new Map([["sec1", "dc1"], ["sec2", "dc1"]]),
    departmentCourses: new Map([["dc1", "d1"]]),
  })
  mockEvalResultRepo.listAttributionWarnings.mockResolvedValue({
    unattributed: { count: 0, faculty: [] },
    offSemester: { count: 0, faculty: [] },
  })
  mockEvalRepo.countSubmittedByFacultySubjectIds.mockResolvedValue({})
  mockEnrollmentRepo.countByFacultySubjectIdsPaged.mockResolvedValue({})
  mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([])
  mockEnrollmentRepo.listStudentIdsByFacultySubjectIds.mockResolvedValue(new Map())
})

describe("getEvaluationStatus — new bucket fields", () => {
  it("returns zeros when no mappings", async () => {
    mockFsRepo.list.mockResolvedValue([])
    const res = await getEvaluationStatus("p1")
    expect(res.departments).toEqual([])
    expect(res.subjects).toEqual([])
  })

  it("counts a student enrolled in two subjects only once per department", async () => {
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
      { id: "fs2", faculty_id: "f1", subject_id: "sub1", section_id: "sec2", semesterId: "s1" },
    ])
    mockEnrollmentRepo.countByFacultySubjectIdsPaged.mockResolvedValue({ fs1: 10, fs2: 10 })
    mockEnrollmentRepo.listStudentIdsByFacultySubjectIds.mockResolvedValue(
      new Map([["fs1", ["s1", "s2"]], ["fs2", ["s2", "s3"]]]),
    )
    mockEvalRepo.countSubmittedByFacultySubjectIds.mockResolvedValue({ fs1: 1, fs2: 1 })
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([
      st("s1", "SUBMITTED", false, "fs1"),
      st("s2", "SUBMITTED", false, "fs2"),
    ])

    const res = await getEvaluationStatus("p1")
    const d = res.departments[0]
    // unique students across both subjects: s1, s2, s3 = 3
    expect(d.uniqueStudents).toBe(3)
    // participated distinct: s1, s2 = 2
    expect(d.participated).toBe(2)
    expect(d.notParticipated).toBe(2) // s2(not part in fs1), s3, s1? no -> computed by set union
    expect(d.facultyCount).toBe(1)
  })

  it("classifies buckets per subject correctly", async () => {
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
    ])
    mockEnrollmentRepo.countByFacultySubjectIdsPaged.mockResolvedValue({ fs1: 4 })
    mockEnrollmentRepo.listStudentIdsByFacultySubjectIds.mockResolvedValue(new Map([["fs1", ["a", "b", "c", "d"]]]))
    mockEvalRepo.countSubmittedByFacultySubjectIds.mockResolvedValue({ fs1: 1 })
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([
      st("a", "SUBMITTED"),
      st("b", "INVALID", true),
      st("c", "DRAFT"),
      // d has no eval -> notParticipated
    ])

    const res = await getEvaluationStatus("p1")
    const s = res.subjects[0]
    expect(s.enrolled).toBe(4)
    expect(s.participated).toBe(1)
    expect(s.disputed).toBe(1)
    expect(s.inProgress).toBe(1)
    expect(s.notParticipated).toBe(1)
  })

  it("treats disabled SUBMITTED as disputed", async () => {
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
    ])
    mockEnrollmentRepo.countByFacultySubjectIdsPaged.mockResolvedValue({ fs1: 1 })
    mockEnrollmentRepo.listStudentIdsByFacultySubjectIds.mockResolvedValue(new Map([["fs1", ["a"]]]))
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([st("a", "SUBMITTED", true)])

    const res = await getEvaluationStatus("p1")
    expect(res.subjects[0].disputed).toBe(1)
    expect(res.subjects[0].participated).toBe(0)
  })

  it("prioritizes participated over disputed when both exist", async () => {
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
    ])
    mockEnrollmentRepo.countByFacultySubjectIdsPaged.mockResolvedValue({ fs1: 1 })
    mockEnrollmentRepo.listStudentIdsByFacultySubjectIds.mockResolvedValue(new Map([["fs1", ["a"]]]))
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([
      st("a", "INVALID", true, "fs1"),
      { ...st("a", "SUBMITTED", false, "fs1"), id: "e2" },
    ])

    const res = await getEvaluationStatus("p1")
    expect(res.subjects[0].participated).toBe(1)
    expect(res.subjects[0].disputed).toBe(0)
  })

  it("keeps backward-compat counts (submitted/expected/pct)", async () => {
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
    ])
    mockEnrollmentRepo.countByFacultySubjectIdsPaged.mockResolvedValue({ fs1: 20 })
    mockEnrollmentRepo.listStudentIdsByFacultySubjectIds.mockResolvedValue(new Map([["fs1", ["a", "b"]]]))
    mockEvalRepo.countSubmittedByFacultySubjectIds.mockResolvedValue({ fs1: 5 })

    const res = await getEvaluationStatus("p1")
    expect(res.subjects[0].submitted).toBe(5)
    expect(res.subjects[0].expected).toBe(20)
    expect(res.subjects[0].pct).toBe(25)
  })

  it("returns zeroed department rows for departments with no mappings", async () => {
    mockDeptRepo.listAll.mockResolvedValue([
      { id: "d1", name: "CCS", code: "CCS" },
      { id: "d9", name: "EMPTY", code: "EMP" },
    ])
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
    ])

    const res = await getEvaluationStatus("p1")
    const empty = res.departments.find((d) => d.departmentId === "d9")!
    expect(empty.subjectsTotal).toBe(0)
    expect(empty.uniqueStudents).toBe(0)
    expect(empty.facultyCount).toBe(0)
    expect(empty.completion).toBeNull()
  })

  it("applies search filter to subjects", async () => {
    mockSubjectRepo.findByIds.mockResolvedValue([
      { id: "sub1", code: "IT101", name: "Intro" },
      { id: "sub2", code: "IT102", name: "Data" },
    ])
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
      { id: "fs2", faculty_id: "f1", subject_id: "sub2", section_id: "sec2", semesterId: "s1" },
    ])
    mockEnrollmentRepo.listStudentIdsByFacultySubjectIds.mockResolvedValue(new Map())

    const res = await getEvaluationStatus("p1", "IT102")
    expect(res.subjects).toHaveLength(1)
    expect(res.subjects[0].subjectCode).toBe("IT102")
  })

  it("attributes a subject to the section's department, not the faculty's home department", async () => {
    mockDeptRepo.listAll.mockResolvedValue([
      { id: "d1", name: "MATH", code: "MATH" },
      { id: "d2", name: "CS", code: "CS" },
    ])
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec-cs", semesterId: "s1" },
    ])
    // f1 is homed in d1 (MATH) but teaches a section owned by d2 (CS).
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "Ana", departmentId: "d1" }])
    mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
      userDept: new Map([["f1", "d1"]]),
      sections: new Map([["sec-cs", "dc-cs"]]),
      departmentCourses: new Map([["dc-cs", "d2"]]),
    })

    const res = await getEvaluationStatus("p1")
    expect(res.subjects[0].departmentId).toBe("d2")
    expect(res.departments.find((d) => d.departmentId === "d2")?.subjectsTotal).toBe(1)
    expect(res.departments.find((d) => d.departmentId === "d1")?.subjectsTotal).toBe(0)
  })

  it("attributes a dept-agnostic faculty by the section", async () => {
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d2", name: "CS", code: "CS" }])
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec-cs", semesterId: "s1" },
    ])
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "Ana", departmentId: null }])
    mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
      userDept: new Map([["f1", null]]),
      sections: new Map([["sec-cs", "dc-cs"]]),
      departmentCourses: new Map([["dc-cs", "d2"]]),
    })

    const res = await getEvaluationStatus("p1")
    expect(res.subjects[0].departmentId).toBe("d2")
    expect(res.subjects[0].facultyName).toBe("Ana")
  })

  it("falls back to the home department when the section cannot be resolved", async () => {
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "MATH", code: "MATH" }])
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec-unknown", semesterId: "s1" },
    ])
    mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
      userDept: new Map([["f1", "d1"]]),
      sections: new Map(),
      departmentCourses: new Map(),
    })

    const res = await getEvaluationStatus("p1")
    expect(res.subjects[0].departmentId).toBe("d1")
  })

  it("does not count the dummy account as a teacher, but keeps its subjects", async () => {    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
      { id: "fs2", faculty_id: "f-dummy", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
    ])
    mockUserRepo.listByIds.mockResolvedValue([
      { id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" },
      { id: "f-dummy", name: "Unassigned Faculty", email: "placeholder@lyceumalabang.edu.ph", departmentId: null },
    ])
    mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
      userDept: new Map([["f1", "d1"], ["f-dummy", null]]),
      sections: new Map([["sec1", "dc1"]]),
      departmentCourses: new Map([["dc1", "d1"]]),
    })

    const res = await getEvaluationStatus("p1")
    expect(res.departments[0].facultyCount).toBe(1)
    expect(res.subjects).toHaveLength(2)
  })

  it("returns the integrity warning, scoped to the caller", async () => {
    mockFsRepo.list.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
    ])
    mockEvalResultRepo.listAttributionWarnings.mockResolvedValue({
      unattributed: { count: 0, faculty: [] },
      offSemester: { count: 1, faculty: [{ id: "f1", name: "Ana" }] },
    })

    const res = await getEvaluationStatus("p1", undefined, "d1")
    expect(res.warnings.offSemester.count).toBe(1)
    expect(res.warnings.offSemester.faculty[0].name).toBe("Ana")
    expect(mockEvalResultRepo.listAttributionWarnings).toHaveBeenCalledWith("p1", "d1")
  })
})
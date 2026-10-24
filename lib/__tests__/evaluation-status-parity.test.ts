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
  listRosterByFacultySubjectIds: vi.fn(),
}))
const mockSubjectRepo = vi.hoisted(() => ({ findByIds: vi.fn() }))
const mockSectionRepo = vi.hoisted(() => ({ list: vi.fn() }))
const mockUserRepo = vi.hoisted(() => ({ listByIds: vi.fn(), listByRole: vi.fn() }))
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
  sectionRepository: mockSectionRepo,
  userRepository: mockUserRepo,
}))

import { getEvaluationStatus, getEvaluationStatusDetail } from "@/features/evaluations/evaluation-status.service"

type Student = { id: string; name: string; email: string }
type StatusRow = {
  id: string
  evaluatorId: string
  status: "DRAFT" | "SUBMITTED" | "INVALID"
  isDisabled: boolean
  submittedAt: string | null
  facultySubjectId: string
}

const student = (id: string): Student => ({ id, name: `Student ${id}`, email: `${id}@x` })
const st = (evaluatorId: string, status: StatusRow["status"], isDisabled = false): StatusRow => ({
  id: `e-${evaluatorId}-${status}-${isDisabled}`,
  evaluatorId,
  status,
  isDisabled,
  submittedAt: null,
  facultySubjectId: "fs1",
})

/**
 * Give both surfaces the same rows, filtered by the ids they ask for — the
 * contract both repository reads honour.
 */
function useSection(roster: Student[], statusRows: StatusRow[]) {
  mockEnrollmentRepo.listRosterByFacultySubjectIds.mockImplementation(async (ids: string[]) =>
    new Map(ids.map((id) => [id, id === "fs1" ? roster : []])),
  )
  mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockImplementation(
    async (_periodId: string, ids: string[]) => statusRows.filter((row) => ids.includes(row.facultySubjectId)),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockEvalPeriodRepo.findById.mockResolvedValue({ id: "p1", semesterId: "s1" })
  mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
  mockSubjectRepo.findByIds.mockResolvedValue([{ id: "sub1", code: "IT101", name: "Intro" }])
  mockSectionRepo.list.mockResolvedValue([{ id: "sec1", name: "1A", program: "BSCS" }])
  mockUserRepo.listByIds.mockResolvedValue([
    { id: "f1", name: "Ana Cruz", email: "ana@x", departmentId: "d1" },
  ])
  mockUserRepo.listByRole.mockResolvedValue([
    { id: "f1", name: "Ana Cruz", email: "ana@x", departmentId: "d1", role: "FACULTY" },
  ])
  mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
    userDept: new Map([["f1", "d1"]]),
    sections: new Map([["sec1", "dc1"]]),
    departmentCourses: new Map([["dc1", "d1"]]),
  })
  mockEvalResultRepo.listAttributionWarnings.mockResolvedValue({
    unattributed: { count: 0, faculty: [] },
    offSemester: { count: 0, faculty: [] },
  })
  mockFsRepo.list.mockResolvedValue([
    { id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1" },
  ])
  mockEnrollmentRepo.countByFacultySubjectIdsPaged.mockResolvedValue({ fs1: 4 })
  mockEvalRepo.countSubmittedByFacultySubjectIds.mockResolvedValue({ fs1: 1 })
})

describe("coverage card and Details parity", () => {
  it("counts exactly the students the Details modal lists", async () => {
    useSection(
      [student("s1"), student("s2"), student("s3"), student("s4")],
      [st("s1", "SUBMITTED"), st("s2", "INVALID", true), st("s3", "DRAFT")],
    )

    const card = await getEvaluationStatus("p1")
    const detail = await getEvaluationStatusDetail("p1", "fs1")
    const row = card.subjects.find((subject) => subject.facultySubjectId === "fs1")!

    expect(detail.participated.map((s) => s.id)).toEqual(["s1"])
    expect(detail.disputed.map((s) => s.id)).toEqual(["s2"])
    expect(detail.inProgress.map((s) => s.id)).toEqual(["s3"])
    expect(detail.notParticipated.map((s) => s.id)).toEqual(["s4"])

    expect(row.enrolled).toBe(4)
    expect(row.participated).toBe(detail.participated.length)
    expect(row.disputed).toBe(detail.disputed.length)
    expect(row.inProgress).toBe(detail.inProgress.length)
    expect(row.notParticipated).toBe(detail.notParticipated.length)
    expect(row.enrolled).toBe(
      detail.participated.length + detail.disputed.length + detail.inProgress.length + detail.notParticipated.length,
    )
  })

  it("agrees when the roster repeats a student and that student has conflicting rows", async () => {
    useSection(
      [student("s1"), student("s1"), student("s2")],
      [st("s1", "INVALID", true), st("s1", "SUBMITTED"), st("s2", "DRAFT")],
    )

    const card = await getEvaluationStatus("p1")
    const detail = await getEvaluationStatusDetail("p1", "fs1")
    const row = card.subjects.find((subject) => subject.facultySubjectId === "fs1")!

    expect(row.enrolled).toBe(2)
    expect(row.participated).toBe(1)
    expect(row.disputed).toBe(0)
    expect(row.inProgress).toBe(1)
    expect(row.notParticipated).toBe(0)
    expect(row.participated).toBe(detail.participated.length)
    expect(row.inProgress).toBe(detail.inProgress.length)
    expect(detail.participated.map((s) => s.id)).toEqual(["s1"])
    expect(detail.inProgress.map((s) => s.id)).toEqual(["s2"])
  })
})

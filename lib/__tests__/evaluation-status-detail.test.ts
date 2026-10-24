import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEvalPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockStudentEnrollmentRepo = vi.hoisted(() => ({
  listRosterByFacultySubjectIds: vi.fn(),
}))
const mockEvalRepo = vi.hoisted(() => ({ listStatusByPeriodAndFacultySubjectIds: vi.fn() }))

vi.mock("@/lib/repositories/factory", () => ({
  evaluationPeriodRepository: mockEvalPeriodRepo,
  studentEnrollmentRepository: mockStudentEnrollmentRepo,
  evaluationRepository: mockEvalRepo,
}))

import { getEvaluationStatusDetail } from "@/features/evaluations/evaluation-status.service"

const student = (id: string, name: string, email: string) => ({ id, name, email })

beforeEach(() => {
  vi.resetAllMocks()
  mockEvalPeriodRepo.findById.mockResolvedValue({ id: "p1", semesterId: "s1" })
  mockStudentEnrollmentRepo.listRosterByFacultySubjectIds.mockResolvedValue(new Map([["fs1", []]]))
})

describe("getEvaluationStatusDetail", () => {
  it("classifies students into four buckets", async () => {
    mockStudentEnrollmentRepo.listRosterByFacultySubjectIds.mockResolvedValue(new Map([["fs1", [
      student("s1", "Alice", "a@x.com"),
      student("s2", "Bob", "b@x.com"),
      student("s3", "Cara", "c@x.com"),
      student("s4", "Dan", "d@x.com"),
    ]]]))
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([
      { id: "e1", evaluatorId: "s1", status: "SUBMITTED", isDisabled: false, submittedAt: "2026-01-01", facultySubjectId: "fs1" },
      { id: "e2", evaluatorId: "s2", status: "INVALID", isDisabled: true, submittedAt: null, facultySubjectId: "fs1" },
      { id: "e3", evaluatorId: "s3", status: "SUBMITTED", isDisabled: true, submittedAt: "2026-01-02", facultySubjectId: "fs1" },
      { id: "e4", evaluatorId: "s4", status: "DRAFT", isDisabled: false, submittedAt: null, facultySubjectId: "fs1" },
    ])

    const detail = await getEvaluationStatusDetail("p1", "fs1")
    expect(detail.participated.map((s) => s.id)).toEqual(["s1"])
    expect(detail.disputed.map((s) => s.id)).toEqual(["s2", "s3"])
    expect(detail.inProgress.map((s) => s.id)).toEqual(["s4"])
    expect(detail.notParticipated).toEqual([])
  })

  it("participated takes priority over disputed when both exist", async () => {
    mockStudentEnrollmentRepo.listRosterByFacultySubjectIds.mockResolvedValue(new Map([["fs1", [
      student("s1", "Alice", "a@x.com"),
    ]]]))
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([
      { id: "e1", evaluatorId: "s1", status: "INVALID", isDisabled: true, submittedAt: null, facultySubjectId: "fs1" },
      { id: "e2", evaluatorId: "s1", status: "SUBMITTED", isDisabled: false, submittedAt: "2026-01-02", facultySubjectId: "fs1" },
    ])

    const detail = await getEvaluationStatusDetail("p1", "fs1")
    expect(detail.participated.map((s) => s.id)).toEqual(["s1"])
    expect(detail.disputed).toEqual([])
  })

  it("returns empty buckets when the section has no roster", async () => {
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([])
    const detail = await getEvaluationStatusDetail("p1", "fs1")
    expect(detail.participated).toEqual([])
    expect(detail.notParticipated).toEqual([])
    expect(detail.disputed).toEqual([])
    expect(detail.inProgress).toEqual([])
  })

  it("marks enrolled student with no eval as notParticipated", async () => {
    mockStudentEnrollmentRepo.listRosterByFacultySubjectIds.mockResolvedValue(new Map([["fs1", [
      student("s1", "Alice", "a@x.com"),
    ]]]))
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([])
    const detail = await getEvaluationStatusDetail("p1", "fs1")
    expect(detail.notParticipated.map((s) => s.id)).toEqual(["s1"])
  })

  it("counts each eligible student once", async () => {
    mockStudentEnrollmentRepo.listRosterByFacultySubjectIds.mockResolvedValue(new Map([["fs1", [
      student("s1", "Alice", "a@x.com"),
      student("s1", "Alice", "a@x.com"),
      student("s2", "Bob", "b@x.com"),
    ]]]))
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([
      { id: "e1", evaluatorId: "s1", status: "SUBMITTED", isDisabled: false, submittedAt: "2026-01-01", facultySubjectId: "fs1" },
    ])

    const detail = await getEvaluationStatusDetail("p1", "fs1")
    expect(detail.participated.map((student) => student.id)).toEqual(["s1"])
    expect(detail.notParticipated.map((student) => student.id)).toEqual(["s2"])
  })

  it("does not invent a student from a status row when the roster is empty", async () => {
    mockStudentEnrollmentRepo.listRosterByFacultySubjectIds.mockResolvedValue(new Map())
    mockEvalRepo.listStatusByPeriodAndFacultySubjectIds.mockResolvedValue([
      { id: "e1", evaluatorId: "s1", status: "SUBMITTED", isDisabled: false, submittedAt: "2026-01-01", facultySubjectId: "fs1" },
    ])
    const detail = await getEvaluationStatusDetail("p1", "fs1")
    expect(detail.participated).toEqual([])
  })

  it("throws when period not found", async () => {
    mockEvalPeriodRepo.findById.mockResolvedValue(null)
    await expect(getEvaluationStatusDetail("p1", "fs1")).rejects.toThrow("Evaluation period not found")
  })
})

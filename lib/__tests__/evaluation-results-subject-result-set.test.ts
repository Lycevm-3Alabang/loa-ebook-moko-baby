import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFsRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockUserRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockEvalRepo = vi.hoisted(() => ({
  listSubmittedByPeriodAndEvaluateeAndFS: vi.fn(),
  listRatingsByEvaluationIds: vi.fn(),
  listFullCommentsByEvaluationIds: vi.fn(),
}))

vi.mock("@/lib/repositories/factory", () => ({
  facultySubjectRepository: mockFsRepo,
  userRepository: mockUserRepo,
  subjectRepository: mockSubjectRepo,
  evaluationPeriodRepository: mockPeriodRepo,
  evaluationRepository: mockEvalRepo,
}))

import { getSubjectResultSet } from "@/features/evaluation-results/evaluation-results.service"

/**
 * The read behind the subject page AND the export.
 *
 * ⭐ It is the ONE read (contract §3.18): the page renders it and the export
 * writes it, so they cannot disagree.
 */
beforeEach(() => {
  vi.resetAllMocks()
  mockFsRepo.findById.mockResolvedValue({
    id: "fs1",
    faculty_id: "f1",
    subject_id: "s1",
    section_id: null,
  })
  mockUserRepo.findById.mockResolvedValue({
    id: "f1",
    name: "Dela Cruz",
    email: "f@x",
    employeeNo: "2024-0017",
  })
  mockSubjectRepo.findById.mockResolvedValue({ id: "s1", code: "IT101", name: "Introduction to Computing" })
  mockPeriodRepo.findById.mockResolvedValue({
    id: "p1",
    name: "SY 2026-2027 First Semester - Evaluation",
    semesterTitle: "SY 2026-2027 First Semester",
    rubricGroupId: "rg1",
  })
  mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS.mockResolvedValue([
    { id: "e1", submittedAt: "2026-02-11T09:00:00.000Z" },
  ])
  mockEvalRepo.listFullCommentsByEvaluationIds.mockResolvedValue([])
  mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([
    {
      evaluationId: "e1",
      rating: 5,
      rubric_items: { categoryId: "c1", rubric_categories: { name: "Professional Manner" } },
    },
    {
      evaluationId: "e1",
      rating: 3,
      rubric_items: { categoryId: "c2", rubric_categories: { name: "Course Coverage" } },
    },
  ])
})

describe("getSubjectResultSet", () => {
  it("carries the LIVE per-response averages, not only the app's eight columns", async () => {
    const set = await getSubjectResultSet("fs1", "p1")
    const row = set?.evaluations[0]

    // the app's eight columns - the page's table and the PDF read these
    expect(row?.professionalManner).toBe(5)
    // ⭐ and the rubric's OWN map, including a criterion the app has no column
    // for - so an export whose columns follow the rubric has a value to put
    // under that column instead of a blank
    expect(row?.categoryAverages).toEqual({ "Professional Manner": 5, "Course Coverage": 3 })
  })

  it("carries the set's own live map too", async () => {
    const set = await getSubjectResultSet("fs1", "p1")
    expect(set?.summary.categoryAverages).toEqual({ "Professional Manner": 5, "Course Coverage": 3 })
  })

  it("reads the period's responses for that teacher and that subject", async () => {
    await getSubjectResultSet("fs1", "p1")
    expect(mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS).toHaveBeenCalledWith("p1", "f1", "fs1")
  })
})

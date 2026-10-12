import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockListAllWithEmbeds = vi.hoisted(() => vi.fn())
const mockCountByFacultySubjectIds = vi.hoisted(() => vi.fn())
const mockSemesterList = vi.hoisted(() => vi.fn())
const mockListStudentByFs = vi.hoisted(() => vi.fn())
const mockCountByFs = vi.hoisted(() => vi.fn())
const mockListAllStudentEmbeds = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/repositories/factory", () => ({
  facultySubjectRepository: { listAllWithEmbeds: mockListAllWithEmbeds },
  studentEnrollmentRepository: {
    countByFacultySubjectIds: mockCountByFacultySubjectIds,
    listByFacultySubject: mockListStudentByFs,
    countByFacultySubjectId: mockCountByFs,
    listAllWithEmbeds: mockListAllStudentEmbeds,
  },
  semesterRepository: { list: mockSemesterList },
  subjectRepository: {},
  sectionRepository: {},
}))

import { GET } from "@/app/api/data/evaluation-mappings/route"

function mockRequest(query: string): Request {
  return new Request(`http://localhost/api/data/evaluation-mappings${query}`)
}

const ROW = (overrides = {}) => ({
  id: "m1",
  faculty_id: "fac-9",
  subject_id: "sub-1",
  section_id: "sec-1",
  semesterId: "sem-1",
  faculty: { id: "fac-9", name: "Juan Dela Cruz", email: "juan@lyceumalabang.edu.ph", departmentId: "dep-1" },
  subject: { id: "sub-1", code: "CS101", name: "Intro" },
  section: { id: "sec-1", name: "32A3", program: "BSIT" },
  semester: { id: "sem-1", title: "2026-1" },
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe("GET /api/data/evaluation-mappings?type=faculty", () => {
  it("returns 403 without calling repositories", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))

    const res = await GET(mockRequest("?type=faculty") as never)

    expect(res.status).toBe(403)
    expect(mockListAllWithEmbeds).not.toHaveBeenCalled()
    expect(mockCountByFacultySubjectIds).not.toHaveBeenCalled()
  })

  it("skips the enrollment count on the bulk fetch", async () => {
    mockRequireAdmin.mockResolvedValue(null)
    mockListAllWithEmbeds.mockResolvedValue([ROW()])

    const res = await GET(mockRequest("?type=faculty") as never)

    expect(res.status).toBe(200)
    expect(mockListAllWithEmbeds).toHaveBeenCalledWith({})
    // The table never displays headcount — no enrollment query at all,
    // so a 900-row bulk fetch cannot build an oversized `in=(...)` filter.
    expect(mockCountByFacultySubjectIds).not.toHaveBeenCalled()
    expect(mockSemesterList).not.toHaveBeenCalled()

    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].headcount).toBe(0)
    expect(body.data[0].semester).toEqual({ id: "sem-1", title: "2026-1" })
  })

  it("counts per faculty_subject on the per-faculty path with join titles", async () => {
    mockRequireAdmin.mockResolvedValue(null)
    mockListAllWithEmbeds.mockResolvedValue([
      ROW({ id: "m1", semester: null }),
      ROW({ id: "m2", semester: null }),
    ])
    mockCountByFacultySubjectIds.mockResolvedValue({ m1: 30 })
    mockSemesterList.mockResolvedValue([{ id: "sem-1", title: "2026-1" }])

    const res = await GET(mockRequest("?type=faculty&semesterId=sem-1&facultyId=fac-9") as never)

    expect(res.status).toBe(200)
    expect(mockListAllWithEmbeds).toHaveBeenCalledWith({ semesterId: "sem-1", facultyId: "fac-9" })
    expect(mockCountByFacultySubjectIds).toHaveBeenCalledWith(["m1", "m2"], "sem-1")

    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.data[0].headcount).toBe(30)
    expect(body.data[1].headcount).toBe(0)
    // Semester resolved from the database per row, never assumed active.
    expect(body.data[0].semester).toEqual({ id: "sem-1", title: "2026-1" })
  })
})

describe("GET /api/data/evaluation-mappings?type=student", () => {
  const ENROLL = (overrides = {}) => ({
    id: "e1",
    semesterId: "sem-1",
    student: { id: "stu-1", name: "Ana Santos", email: "ana@lyceumalabang.edu.ph" },
    section: { id: "sec-1", name: "32A3", program: "BSIT" },
    faculty_subject: { id: "fs-1" },
    ...overrides,
  })

  it("returns scoped list + server total when facultySubjectId + semesterId", async () => {
    mockRequireAdmin.mockResolvedValue(null)
    mockListStudentByFs.mockResolvedValue([ENROLL()])
    mockCountByFs.mockResolvedValue(1)

    const res = await GET(mockRequest("?type=student&facultySubjectId=fs-1&semesterId=sem-1") as never)

    expect(res.status).toBe(200)
    expect(mockListStudentByFs).toHaveBeenCalledWith("fs-1", "sem-1")
    expect(mockCountByFs).toHaveBeenCalledWith("fs-1", "sem-1")

    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].faculty_subject_id).toBe("fs-1")
    expect(body.total).toBe(1)
  })

  it("scopes by faculty_subject without semester filter when semesterId absent", async () => {
    mockRequireAdmin.mockResolvedValue(null)
    mockListStudentByFs.mockResolvedValue([ENROLL()])
    mockCountByFs.mockResolvedValue(1)

    const res = await GET(mockRequest("?type=student&facultySubjectId=fs-1") as never)

    expect(res.status).toBe(200)
    expect(mockListStudentByFs).toHaveBeenCalledWith("fs-1", undefined)
    expect(mockCountByFs).toHaveBeenCalledWith("fs-1", undefined)
    expect((await res.json()).total).toBe(1)
  })

  it("keeps legacy bulk behavior without facultySubjectId", async () => {
    mockRequireAdmin.mockResolvedValue(null)
    mockListAllStudentEmbeds.mockResolvedValue([ENROLL(), ENROLL({ id: "e2" })])

    const res = await GET(mockRequest("?type=student") as never)

    expect(res.status).toBe(200)
    expect(mockListStudentByFs).not.toHaveBeenCalled()
    expect(mockCountByFs).not.toHaveBeenCalled()

    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.total).toBe(2)
  })
})

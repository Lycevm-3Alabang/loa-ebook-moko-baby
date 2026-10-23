import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"

const mockUseApiGet = vi.hoisted(() => vi.fn())
const mockFetcher = vi.hoisted(() => vi.fn())
const mockDispatchToast = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/evaluations/coverage",
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  fetcher: mockFetcher,
  dispatchToast: mockDispatchToast,
}))

import CoveragePage from "@/features/evaluations/components/CoveragePage"

const PERIODS = [{ id: "p1", name: "Midterm", semesterTitle: "SY 2026-2027", isActive: true }]

const subjectRow = {
  facultySubjectId: "fs1",
  departmentId: "d1",
  subjectCode: "BS101",
  subjectName: "Intro",
  sectionProgram: "BSCS",
  sectionName: "1A",
  sectionDepartment: null,
  facultyId: "f1",
  facultyName: "Ana Cruz",
  facultyEmail: "ana@x",
  submitted: 3,
  expected: 4,
  pct: 75,
  evaluated: true,
  enrolled: 4,
  participated: 3,
  disputed: 0,
  inProgress: 0,
  notParticipated: 1,
}

const payload = {
  departments: [{
    departmentId: "d1",
    departmentName: "CCS",
    departmentCode: "CCS",
    subjectsEvaluated: 1,
    subjectsTotal: 1,
    submitted: 3,
    expected: 4,
    pct: 75,
    facultyCount: 1,
    uniqueStudents: 4,
    participated: 3,
    disputed: 0,
    inProgress: 0,
    notParticipated: 1,
    completion: 75,
  }],
  subjects: [subjectRow],
  facultyAggregates: {
    d1: {
      f1: { subjects: 1, students: 4, participated: 3, disputed: 0, inProgress: 0, notParticipated: 1, completion: 75 },
    },
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  mockUseApiGet.mockImplementation((url: string | null) => {
    if (!url) return { data: undefined, error: undefined }
    if (url.startsWith("/api/evaluation-periods")) {
      return { data: { periods: PERIODS }, error: undefined }
    }
    return { data: undefined, error: undefined }
  })
  mockFetcher.mockResolvedValue(payload)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("CoveragePage status cache", () => {
  it("uses the current period and scope cache without requesting the status endpoint", async () => {
    const key = "evaluation-coverage-status:/api/admin/evaluation-status:p1"
    window.localStorage.setItem(key, JSON.stringify(payload))

    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)

    await waitFor(() => expect(screen.getByText("CCS (CCS)")).toBeTruthy())
    expect(screen.getByText(/Displayed figures are cached and may be stale/i)).toBeTruthy()
    expect(screen.getByText(/Not manually refreshed yet/i)).toBeTruthy()
    expect(screen.getByText(/admin scope/i)).toBeTruthy()
    expect(mockFetcher).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("CCS (CCS)"))
    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(mockFetcher).not.toHaveBeenCalled()
  })

  it("keeps the last cached snapshot when a manual refresh fails", async () => {
    const key = "evaluation-coverage-status:/api/admin/evaluation-status:p1"
    window.localStorage.setItem(key, JSON.stringify(payload))
    mockFetcher.mockRejectedValueOnce(new Error("refresh failed"))

    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)

    await waitFor(() => expect(screen.getByText("CCS (CCS)")).toBeTruthy())
    fireEvent.click(screen.getByText("CCS (CCS)"))
    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))

    await waitFor(() => expect(mockDispatchToast).toHaveBeenCalledWith("Refresh failed. Showing the last successful snapshot."))
    expect(screen.getByText("Ana Cruz")).toBeTruthy()
    expect(screen.queryByText("Something went wrong")).toBeNull()
    expect(mockFetcher).toHaveBeenCalledTimes(1)
  })
})

describe("CoveragePage faculty-only drill-down", () => {
  it("renders faculty cards and omits the removed subject-tabs flow", async () => {
    mockUseApiGet.mockImplementation((url: string | null) => {
      if (!url) return { data: undefined, error: undefined }
      if (url.startsWith("/api/evaluation-periods")) {
        return { data: { periods: PERIODS }, error: undefined }
      }
      return { data: payload, error: undefined }
    })

    render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)

    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(screen.getByText("1 subject")).toBeTruthy()
    expect(screen.getByText("4 students")).toBeTruthy()
    expect(screen.queryByText(/by faculty/i)).toBeNull()
    expect(screen.queryByText(/by subject/i)).toBeNull()
  })

  it("searches all faculty and subject fields without changing faculty aggregates", async () => {
    const secondSubject = {
      ...subjectRow,
      facultySubjectId: "fs2",
      subjectCode: "BS202",
      subjectName: "Advanced Topics",
      sectionName: "2A",
    }
    const secondFacultySubject = {
      ...subjectRow,
      facultySubjectId: "fs3",
      subjectCode: "BA101",
      subjectName: "Business Basics",
      sectionProgram: "BSA",
      sectionName: "1B",
      facultyId: "f2",
      facultyName: "Bea Brown",
      facultyEmail: "bea@x",
    }
    const departmentPayload = {
      ...payload,
      subjects: [subjectRow, secondSubject, secondFacultySubject],
      facultyAggregates: {
        d1: {
          f1: { subjects: 2, students: 6, participated: 5, disputed: 1, inProgress: 2, notParticipated: 3, completion: 83.3 },
          f2: { subjects: 1, students: 2, participated: 1, disputed: 0, inProgress: 0, notParticipated: 1, completion: 50 },
        },
      },
    }
    const cacheKey = "evaluation-coverage-status:department:d1:p1"
    window.localStorage.setItem(cacheKey, JSON.stringify(departmentPayload))

    const { container } = render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)
    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(mockFetcher).not.toHaveBeenCalled()

    const searchInput = screen.getByPlaceholderText("Search faculty, subject, or section...")
    for (const query of ["Cruz, Ana", "ana@x", "BS101", "Intro", "BSCS-1A"]) {
      fireEvent.change(searchInput, { target: { value: query } })
      expect(screen.getByText("Ana Cruz")).toBeTruthy()
      expect(screen.queryByText("Bea Brown")).toBeNull()
    }

    fireEvent.change(searchInput, { target: { value: "BS101" } })
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }))
    expect(screen.getByText("2 subjects")).toBeTruthy()
    expect(screen.getByText("5", { selector: ".text-sm.font-semibold" })).toBeTruthy()
    expect(screen.getByText("1", { selector: ".text-sm.font-semibold" })).toBeTruthy()
    expect(screen.getByText("2", { selector: ".text-sm.font-semibold" })).toBeTruthy()
    expect(screen.getByText("3", { selector: ".text-sm.font-semibold" })).toBeTruthy()
    expect(screen.getByText("BS101 Intro")).toBeTruthy()
    expect(screen.queryByText("BS202 Advanced Topics")).toBeNull()
    expect(mockFetcher).not.toHaveBeenCalled()

    const cardTexts = [...container.querySelectorAll(".card")].map((card) => card.textContent ?? "")
    expect(cardTexts).toHaveLength(1)
  })

  it("sorts by displayed surname and expands only the visible cards without Results controls", async () => {
    const secondFacultySubject = {
      ...subjectRow,
      facultySubjectId: "fs2",
      subjectCode: "BA101",
      subjectName: "Business Basics",
      facultyId: "f2",
      facultyName: "Bea Brown",
      facultyEmail: "bea@x",
    }
    const departmentPayload = {
      ...payload,
      subjects: [subjectRow, secondFacultySubject],
      facultyAggregates: {
        d1: {
          ...payload.facultyAggregates.d1,
          f2: { subjects: 1, students: 2, participated: 1, disputed: 0, inProgress: 0, notParticipated: 1, completion: 50 },
        },
      },
    }
    window.localStorage.setItem(
      "evaluation-coverage-status:department:d1:p1",
      JSON.stringify(departmentPayload),
    )

    const { container } = render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)
    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Name ↑" })).toBeTruthy()
    expect(screen.getByText("Bea Brown").compareDocumentPosition(screen.getByText("Ana Cruz")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Name ↑" }))
    expect(screen.getByRole("button", { name: "Name ↓" })).toBeTruthy()
    expect(screen.getByText("Ana Cruz").compareDocumentPosition(screen.getByText("Bea Brown")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(screen.queryByText(/show evaluation results to all faculty/i)).toBeNull()
    expect(screen.getAllByRole("button", { name: "Expand all" })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }))
    expect(screen.getAllByRole("button", { name: "Details" })).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }))
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull()
    expect(mockFetcher).not.toHaveBeenCalled()
  })

  it("surfaces missing faculty aggregates instead of omitting faculty or showing zero counts", async () => {
    window.localStorage.setItem(
      "evaluation-coverage-status:department:d1:p1",
      JSON.stringify({ ...payload, facultyAggregates: undefined }),
    )

    render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)

    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(screen.getByRole("alert").textContent).toContain("Coverage totals are unavailable")
    expect(screen.getByText("Coverage status counts unavailable.")).toBeTruthy()
    expect(screen.getByText("Subjects unavailable")).toBeTruthy()
  })

  it("keeps subject Details as a live request separate from the cached status snapshot", async () => {
    window.localStorage.setItem(
      "evaluation-coverage-status:department:d1:p1",
      JSON.stringify(payload),
    )
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        participated: [
          { id: "s1", name: "Student One", email: "one@x" },
          { id: "s2", name: "Student Two", email: "two@x" },
          { id: "s3", name: "Student Three", email: "three@x" },
        ],
        notParticipated: [{ id: "s4", name: "Student Four", email: "four@x" }],
        disputed: [],
        inProgress: [],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)
    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(mockFetcher).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }))
    fireEvent.click(screen.getByRole("button", { name: "Details" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toContain("facultySubjectId=fs1")
    expect(await screen.findByText("Participated (3)")).toBeTruthy()
    expect(screen.getByText("Not Participated (1)")).toBeTruthy()
    expect(screen.getByText("Disputed (0)")).toBeTruthy()
    expect(screen.getByText("In-progress (0)")).toBeTruthy()
    expect(mockFetcher).not.toHaveBeenCalled()
  })
})

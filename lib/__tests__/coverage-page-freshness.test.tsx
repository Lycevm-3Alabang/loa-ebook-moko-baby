import { describe, it, expect, vi, beforeEach } from "vitest"
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

describe("CoveragePage status cache", () => {
  it("uses the current period and scope cache without requesting the status endpoint", async () => {
    const key = "evaluation-coverage-status:/api/admin/evaluation-status:p1"
    window.localStorage.setItem(key, JSON.stringify(payload))

    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)

    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(screen.getByText(/Displayed figures are cached and may be stale/i)).toBeTruthy()
    expect(screen.getByText(/Not manually refreshed yet/i)).toBeTruthy()
    expect(screen.getByText(/admin scope/i)).toBeTruthy()
    expect(mockFetcher).not.toHaveBeenCalled()
  })

  it("keeps the last cached snapshot when a manual refresh fails", async () => {
    mockFetcher.mockResolvedValueOnce(payload).mockRejectedValueOnce(new Error("refresh failed"))

    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)

    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())

    fireEvent.click(screen.getByText("Refresh"))

    await waitFor(() => expect(mockDispatchToast).toHaveBeenCalledWith("Refresh failed. Showing the last successful snapshot."))
    expect(screen.getByText("Ana Cruz")).toBeTruthy()
    expect(screen.getByText(/Could not refresh evaluation coverage/i)).toBeTruthy()
    expect(mockFetcher).toHaveBeenCalledTimes(2)
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
})

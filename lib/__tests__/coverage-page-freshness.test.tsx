import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"

const mockUseApiGet = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/evaluations/coverage",
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  useApiMutate: vi.fn(),
  invalidate: vi.fn(),
  dispatchToast: vi.fn(),
  dispatch403: vi.fn(),
  downloadFromApi: vi.fn(),
}))

import CoveragePage from "@/features/evaluations/components/CoveragePage"

const PERIODS = [{ id: "p1", name: "Midterm", semesterTitle: "SY 2026-2027", isActive: true }]

function routeApi() {
  return (url: string | null) => {
    if (!url) return { data: undefined, error: undefined }
    if (url.startsWith("/api/evaluation-periods")) return { data: { periods: PERIODS }, error: undefined }
    return { data: { departments: [], subjects: [] }, error: undefined }
  }
}

/** The config object the component passed for a given url fragment. */
function configFor(fragment: string): unknown {
  return callFor(fragment)?.[1]
}

/** The raw useApiGet call for a given url fragment. */
function callFor(fragment: string): [string | null, unknown] | undefined {
  return mockUseApiGet.mock.calls.find(([url]) => String(url ?? "").includes(fragment)) as
    | [string | null, unknown]
    | undefined
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseApiGet.mockImplementation(routeApi())
})

describe("CoveragePage SWR freshness", () => {
  it("opts the status query into focus revalidation and a 30s poll", async () => {
    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)
    await waitFor(() => expect(configFor("evaluation-status")).toBeTruthy())

    expect(configFor("evaluation-status")).toEqual(
      expect.objectContaining({ revalidateOnFocus: true, refreshInterval: 30_000 }),
    )
  })

  it("leaves the periods query on the global default", async () => {
    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)
    // wait for the periods hook to have been called at all
    await waitFor(() => expect(callFor("evaluation-periods")).toBeTruthy())

    // no config arg = inherit SWRConfig (revalidateOnFocus:false). Must stay absent:
    // this hook is shared by every page and must not gain polling.
    expect(configFor("evaluation-periods")).toBeUndefined()
  })

  it("applies the same freshness config on the dean surface", async () => {
    render(<CoveragePage statusBase="/api/dean/evaluation-status" />)
    await waitFor(() => expect(callFor("/api/dean/evaluation-status")).toBeTruthy())

    expect(configFor("/api/dean/evaluation-status")).toEqual(
      expect.objectContaining({ revalidateOnFocus: true, refreshInterval: 30_000 }),
    )
  })
})

describe("CoveragePage attribution warning", () => {
  const warning = {
    unattributed: { count: 0, faculty: [] },
    offSemester: { count: 1, faculty: [{ id: "f1", name: "Ana Cruz" }] },
  }

  it("names the faculty behind the warning", async () => {
    mockUseApiGet.mockImplementation((url: string | null) => {
      if (!url) return { data: undefined, error: undefined }
      if (url.startsWith("/api/evaluation-periods")) {
        return { data: { periods: PERIODS }, error: undefined }
      }
      return { data: { departments: [], subjects: [], warnings: warning }, error: undefined }
    })

    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)
    await waitFor(() => expect(screen.getByText(/could not be attributed/i)).toBeTruthy())
    expect(screen.getByText(/Ana Cruz/)).toBeTruthy()
  })

  it("shows nothing when there is no warning", async () => {
    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)
    await waitFor(() => expect(callFor("evaluation-status")).toBeTruthy())
    expect(screen.queryByText(/could not be attributed/i)).toBeNull()
  })
})

describe("CoveragePage single department", () => {
  const deptRow = {
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
  }

  it("opens on the named department, with no back link", async () => {
    mockUseApiGet.mockImplementation((url: string | null) => {
      if (!url) return { data: undefined, error: undefined }
      if (url.startsWith("/api/evaluation-periods")) {
        return { data: { periods: PERIODS }, error: undefined }
      }
      return { data: { departments: [deptRow], subjects: [] }, error: undefined }
    })

    render(<CoveragePage statusBase="/api/dean/evaluation-status" departmentId="d1" />)
    await waitFor(() => expect(screen.getByText("CCS")).toBeTruthy())
    expect(screen.queryByText(/back to departments/i)).toBeNull()
  })

  it("keeps the department list when no department is named", async () => {
    mockUseApiGet.mockImplementation((url: string | null) => {
      if (!url) return { data: undefined, error: undefined }
      if (url.startsWith("/api/evaluation-periods")) {
        return { data: { periods: PERIODS }, error: undefined }
      }
      return { data: { departments: [deptRow], subjects: [] }, error: undefined }
    })

    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)
    await waitFor(() => expect(screen.getByText("CCS")).toBeTruthy())
    expect(screen.queryByText(/back to departments/i)).toBeNull()
  })
})

describe("CoveragePage groupings", () => {
  const subjectRow = {
    facultySubjectId: "fs1",
    departmentId: "d1",
    subjectCode: "BS101",
    subjectName: "Intro",
    sectionProgram: "BSCS",
    sectionName: "1A",
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

  function withPayload() {
    mockUseApiGet.mockImplementation((url: string | null) => {
      if (!url) return { data: undefined, error: undefined }
      if (url.startsWith("/api/evaluation-periods")) {
        return { data: { periods: PERIODS }, error: undefined }
      }
      return { data: payload, error: undefined }
    })
  }

  it("shows the two groupings in the department drill-down", async () => {
    withPayload()
    render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)
    await waitFor(() => expect(screen.getByText(/by subject & section/i)).toBeTruthy())
    expect(screen.getByText(/by faculty/i)).toBeTruthy()
  })

  it("lists the subject with its section in the subject grouping", async () => {
    withPayload()
    render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)
    await waitFor(() => expect(screen.getByText("BS101")).toBeTruthy())
    expect(screen.getByText("BSCS-1A")).toBeTruthy()
  })

  it("groups by faculty with the teacher's aggregate", async () => {
    withPayload()
    render(<CoveragePage statusBase="/api/admin/evaluation-status" departmentId="d1" />)
    await waitFor(() => expect(screen.getByText(/by faculty/i)).toBeTruthy())
    fireEvent.click(screen.getByText(/by faculty/i))

    await waitFor(() => expect(screen.getByText("Ana Cruz")).toBeTruthy())
    expect(screen.getByText("ana@x")).toBeTruthy()
    expect(screen.getByText("1 subject")).toBeTruthy()
    expect(screen.getByText("4 students")).toBeTruthy()
  })
})
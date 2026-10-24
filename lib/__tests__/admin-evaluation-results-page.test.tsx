import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const mockUseApiGet = vi.hoisted(() => vi.fn())
const mockFetcher = vi.hoisted(() => vi.fn())
const mockDispatchToast = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  fetcher: mockFetcher,
  dispatchToast: mockDispatchToast,
}))

import AdminEvaluationResultsPage from "@/app/admin/evaluations/results/page"

const period = { id: "p1", name: "Midterm", semesterTitle: "SY 2026-2027", isActive: true }
const departments = [{
  departmentId: "d1",
  departmentName: "Computer Studies",
  departmentCode: "CS",
  facultyCount: 2,
  avgRating: 4.5,
  remarks: "Excellent",
  highestRubrics: [],
  lowestRubrics: [],
}]
const figures = {
  d1: {
    totalRespondents: 10,
    avgRating: 4.5,
    remarks: "Excellent",
    highestRubrics: [],
    lowestRubrics: [],
    sentimentScore: null,
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  mockUseApiGet.mockReturnValue({ data: { periods: [period] }, error: undefined })
  mockFetcher.mockResolvedValue({})
})

describe("AdminEvaluationResultsPage cached-data banner", () => {
  it("renders the shared stale-data banner with its cached results", async () => {
    window.localStorage.setItem(
      "admin-evaluation-results:p1",
      JSON.stringify({ departments }),
    )
    window.localStorage.setItem("admin-evaluation-results-figures-v2:p1", JSON.stringify(figures))

    render(<AdminEvaluationResultsPage />)

    await waitFor(() => expect(screen.getByText(/Computer Studies/)).toBeTruthy())
    expect(screen.getByText(/Displayed figures are cached and may be stale/i)).toBeTruthy()
    expect(screen.getByText(/Not manually refreshed yet/i)).toBeTruthy()
    expect(screen.getByText("Refresh")).toBeTruthy()
    expect(mockFetcher).not.toHaveBeenCalled()
  })

  it("does not reuse the prior pooled-figure cache after the average rule changes", async () => {
    window.localStorage.setItem(
      "admin-evaluation-results:p1",
      JSON.stringify({ departments }),
    )
    window.localStorage.setItem(
      "admin-evaluation-results-figures:p1",
      JSON.stringify({ d1: { ...figures.d1, avgRating: 4.43 } }),
    )

    render(<AdminEvaluationResultsPage />)

    await waitFor(() => {
      expect(mockFetcher).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/evaluation-results/figures?evaluationPeriodId=p1&departmentId=d1"),
      )
    })
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const mockUseApiGet = vi.hoisted(() => vi.fn())
const mockFetcher = vi.hoisted(() => vi.fn())
const mockDownloadFromApi = vi.hoisted(() => vi.fn())
const mockDispatchToast = vi.hoisted(() => vi.fn())
const mockPush = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  fetcher: mockFetcher,
  downloadFromApi: mockDownloadFromApi,
  dispatchToast: mockDispatchToast,
}))

import AdminEvaluationResultsPage from "@/app/admin/evaluations/results/page"

const PERIODS = [{ id: "p1", name: "First Semester 2025-2026", isActive: true }]

const DEPARTMENTS = [
  {
    departmentId: "d1",
    departmentName: "College of Computer Studies",
    departmentCode: "CCS",
    facultyCount: 2,
    avgRating: 3.5,
    remarks: "Very Satisfactory",
    highestRubrics: [],
    lowestRubrics: [],
  },
  {
    departmentId: "d2",
    departmentName: "College of Business",
    departmentCode: "COB",
    facultyCount: 1,
    avgRating: 4,
    remarks: "Outstanding",
    highestRubrics: [],
    lowestRubrics: [],
  },
]

const FIGURES = {
  totalRespondents: 4,
  avgRating: 3.5,
  remarks: "Very Satisfactory",
  sentimentScore: 0.4,
  highestRubrics: [],
  lowestRubrics: [],
  cachedAt: "2026-10-23T00:00:00.000Z",
}

const resultsFor = (url: string | null) => {
  if (url === "/api/evaluation-periods") return { data: { periods: PERIODS }, error: undefined }
  if (url?.startsWith("/api/admin/evaluation-results?")) {
    return { data: { departments: DEPARTMENTS }, error: undefined }
  }
  return { data: undefined, error: undefined }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseApiGet.mockImplementation(resultsFor)
  mockFetcher.mockResolvedValue(FIGURES)
  mockDownloadFromApi.mockResolvedValue(undefined)
})

/** Renders the page and waits for the active period and the figures to land. */
const renderPage = async () => {
  render(<AdminEvaluationResultsPage />)
  await waitFor(() => {
    const select = screen.getByRole("combobox") as HTMLSelectElement
    expect(select.value).toBe("p1")
  })
  await waitFor(() => expect(screen.getByText(/figures as of/i)).toBeTruthy())
}

const exportButton = () => screen.getByRole("button", { name: /^export$/i }) as HTMLButtonElement

describe("Admin evaluation results page - Export integration", () => {
  it("renders the Export button", async () => {
    await renderPage()
    expect(exportButton()).toBeTruthy()
  })

  it("calls the ZIP route with no departments (all) when none selected after confirmation", async () => {
    await renderPage()

    fireEvent.click(exportButton())
    
    // Confirm in modal
    const confirmButton = screen.getByRole("button", { name: /start export/i })
    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(mockDownloadFromApi).toHaveBeenCalledWith(
        "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1",
        "evaluation-results-excel-p1.zip",
      ),
    )
  })

  it("calls the ZIP route with the selected department after confirmation", async () => {
    await renderPage()

    fireEvent.click(screen.getByLabelText(/select department college of computer studies \(ccs\)/i))
    fireEvent.click(exportButton())
    
    // Confirm in modal
    const confirmButton = screen.getByRole("button", { name: /start export/i })
    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(mockDownloadFromApi).toHaveBeenCalledWith(
        "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1",
        "evaluation-results-excel-p1.zip",
      ),
    )
  })

  it("shows loading on the Export button while downloading (after modal closes)", async () => {
    mockDownloadFromApi.mockReturnValue(new Promise(() => {}))
    await renderPage()

    fireEvent.click(exportButton())
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))

    await waitFor(() => expect(exportButton().disabled).toBe(true))
    // Modal should be gone
    expect(screen.queryByRole("button", { name: /start export/i })).toBeNull()
  })

  it("does not navigate when a department checkbox is ticked", async () => {
    await renderPage()

    fireEvent.click(screen.getByLabelText(/select department college of computer studies \(ccs\)/i))

    expect(mockPush).not.toHaveBeenCalled()
  })

  it("offers no select-all control - that scope is refused by design in the UI", async () => {
    await renderPage()
    expect(screen.queryByLabelText(/select all departments/i)).toBeNull()
  })

  it("clears the selection", async () => {
    await renderPage()

    fireEvent.click(screen.getByLabelText(/select department college of computer studies \(ccs\)/i))
    fireEvent.click(screen.getByLabelText(/select department college of business \(cob\)/i))

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }))

    await waitFor(() => expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull())

    fireEvent.click(exportButton())
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() =>
      expect(mockDownloadFromApi).toHaveBeenCalledWith(
        "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1",
        "evaluation-results-excel-p1.zip",
      ),
    )
  })
})

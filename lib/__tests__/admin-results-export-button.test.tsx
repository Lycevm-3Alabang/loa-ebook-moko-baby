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

const zipButton = () => screen.getByRole("button", { name: /download excel/i }) as HTMLButtonElement
const csvButton = () => screen.getByRole("button", { name: /^export$/i }) as HTMLButtonElement

// The CSV "Export" is the school-wide, flat-data download. It stays on its
// own route and its own filename while the ZIP button uses the export seam.
describe("Admin evaluation results page - CSV export (unchanged)", () => {
  it("calls the CSV route and saves the CSV filename", async () => {
    await renderPage()

    fireEvent.click(csvButton())

    await waitFor(() =>
      expect(mockDownloadFromApi).toHaveBeenCalledWith(
        "/api/admin/evaluation-results/export?evaluationPeriodId=p1",
        "evaluation-results-p1.zip",
      ),
    )
  })

  it("refuses locally when there is no period at all", async () => {
    mockUseApiGet.mockImplementation((url: string | null) =>
      url === "/api/evaluation-periods"
        ? { data: { periods: [] }, error: undefined }
        : { data: undefined, error: undefined },
    )

    render(<AdminEvaluationResultsPage />)
    fireEvent.click(csvButton())

    await waitFor(() =>
      expect(mockDispatchToast).toHaveBeenCalledWith("Select an evaluation period before exporting."),
    )
    expect(mockDownloadFromApi).not.toHaveBeenCalled()
  })
})

describe("Admin evaluation results page - department ZIP export", () => {
  it("renders the ZIP button with its own accessible name", async () => {
    await renderPage()
    expect(zipButton()).toBeTruthy()
    // Two buttons, two names: the label is never a shared /export/i.
    expect(csvButton()).toBeTruthy()
  })

  it("refuses locally when no department is selected and calls no route", async () => {
    await renderPage()

    fireEvent.click(zipButton())

    await waitFor(() =>
      expect(mockDispatchToast).toHaveBeenCalledWith("Select at least one department before exporting."),
    )
    expect(mockDownloadFromApi).not.toHaveBeenCalled()
  })

  it("calls the ZIP route with the selected department and the Excel filename", async () => {
    await renderPage()

    fireEvent.click(screen.getByLabelText(/select department college of computer studies \(ccs\)/i))
    fireEvent.click(zipButton())

    await waitFor(() =>
      expect(mockDownloadFromApi).toHaveBeenCalledWith(
        "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1",
        "evaluation-results-excel-p1.zip",
      ),
    )
  })

  it("shows loading on the ZIP button only - the CSV button does not spin", async () => {
    mockDownloadFromApi.mockReturnValue(new Promise(() => {}))
    await renderPage()

    fireEvent.click(screen.getByLabelText(/select department college of computer studies \(ccs\)/i))
    fireEvent.click(zipButton())

    await waitFor(() => expect(zipButton().disabled).toBe(true))
    expect(csvButton().disabled).toBe(false)
  })

  it("does not navigate when a department checkbox is ticked", async () => {
    await renderPage()

    fireEvent.click(screen.getByLabelText(/select department college of computer studies \(ccs\)/i))

    expect(mockPush).not.toHaveBeenCalled()
  })

  it("offers no select-all control - that scope is refused by design", async () => {
    await renderPage()
    expect(screen.queryByLabelText(/select all departments/i)).toBeNull()
  })

  it("clears the selection - the only bulk verb", async () => {
    await renderPage()

    fireEvent.click(screen.getByLabelText(/select department college of computer studies \(ccs\)/i))
    fireEvent.click(screen.getByLabelText(/select department college of business \(cob\)/i))

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }))

    await waitFor(() => expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull())

    fireEvent.click(zipButton())
    await waitFor(() =>
      expect(mockDispatchToast).toHaveBeenCalledWith("Select at least one department before exporting."),
    )
    expect(mockDownloadFromApi).not.toHaveBeenCalled()
  })
})

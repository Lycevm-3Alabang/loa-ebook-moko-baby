import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"

const mockUseApiGet = vi.hoisted(() => vi.fn())
const mockDispatchToast = vi.hoisted(() => vi.fn())
const mockDownloadFromApi = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  useApiMutate: vi.fn(),
  invalidate: vi.fn(),
  dispatchToast: mockDispatchToast,
  dispatch403: vi.fn(),
  downloadFromApi: mockDownloadFromApi,
}))

import AdminEvaluationResultsPage from "@/app/admin/evaluations/results/page"

const PERIODS = [
  { id: "p-active", name: "Final", semesterTitle: "Sem 1", isActive: true },
  { id: "p-other", name: "Prelim", semesterTitle: "Sem 1", isActive: false },
]

/** Routes useApiGet by url so each call returns only its own slice. */
function routeApi(overrides: Record<string, unknown> = {}) {
  return (url: string | null) => {
    if (!url) return { data: undefined, error: undefined }
    if (url.startsWith("/api/evaluation-periods")) {
      return { data: { periods: PERIODS }, error: undefined, ...(overrides.periods ?? {}) }
    }
    if (url.includes("/api/admin/evaluation-results")) {
      return { data: { departments: [] }, error: undefined }
    }
    return { data: undefined, error: undefined }
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("Admin Evaluation Results — Export (ZIP) button", () => {
  it("is clickable and never disabled once the page renders", async () => {
    mockUseApiGet.mockImplementation(routeApi())
    render(<AdminEvaluationResultsPage />)

    const btn = screen.getByRole("button", { name: /export/i }) as HTMLButtonElement
    await waitFor(() => expect(screen.getByRole("button", { name: /export/i })).toBeTruthy())
    expect(btn.disabled).toBe(false)
  })

  it("auto-selects the active period so the page has a default selection", async () => {
    mockUseApiGet.mockImplementation(routeApi())
    render(<AdminEvaluationResultsPage />)

    await waitFor(() => {
      const select = document.querySelector("select") as HTMLSelectElement
      expect(select.value).toBe("p-active")
    })
  })

  it("tells the user to pick a period when none can be resolved", async () => {
    mockUseApiGet.mockImplementation(routeApi({ periods: { data: { periods: [] } } }))
    render(<AdminEvaluationResultsPage />)

    const btn = screen.getByRole("button", { name: /export/i }) as HTMLButtonElement
    await waitFor(() => expect(btn).toBeTruthy())
    fireEvent.click(btn)

    await waitFor(() =>
      expect(mockDispatchToast).toHaveBeenCalledWith(expect.stringMatching(/select an evaluation period/i)),
    )
    expect(mockDownloadFromApi).not.toHaveBeenCalled()
  })

  it("requests the export for the auto-selected active period", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    mockUseApiGet.mockImplementation(routeApi())
    render(<AdminEvaluationResultsPage />)

    const btn = screen.getByRole("button", { name: /export/i }) as HTMLButtonElement
    await waitFor(() => {
      const select = document.querySelector("select") as HTMLSelectElement
      expect(select.value).toBe("p-active")
    })
    fireEvent.click(btn)

    await waitFor(() =>
      expect(mockDownloadFromApi).toHaveBeenCalledWith(
        "/api/admin/evaluation-results/export?evaluationPeriodId=p-active",
        "evaluation-results-p-active.zip",
      ),
    )
  })
})
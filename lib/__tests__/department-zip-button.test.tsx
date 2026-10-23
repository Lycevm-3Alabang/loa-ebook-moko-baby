import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

// Mock functions hoisted at module level
const mockDownloadFromApi = vi.hoisted(() => vi.fn())
const mockDispatchToast = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api/client", () => ({
  downloadFromApi: mockDownloadFromApi,
  dispatchToast: mockDispatchToast,
}))

import DepartmentZipButton from "@/features/evaluation-results/components/DepartmentZipButton"

const renderButton = (props: Partial<React.ComponentProps<typeof DepartmentZipButton>> = {}) => {
  return render(
    <DepartmentZipButton
      evaluationPeriodId="p1"
      departmentIds={["d1"]}
      exportApiBase="/api/admin/evaluation-results/export/excel"
      {...props}
    />
  )
}

afterEach(() => {
  vi.resetAllMocks()
})

describe("DepartmentZipButton", () => {
  it("renders the button with correct label", () => {
    renderButton()
    const button = screen.getByRole("button", { name: /download excel/i })
    expect(button).toBeTruthy()
  })

  it("shows toast when no period selected", async () => {
    renderButton({ evaluationPeriodId: "" })
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    await waitFor(() =>
      expect(mockDispatchToast).toHaveBeenCalledWith("Select an evaluation period before exporting."),
    )
  })

  it("opens the confirmation modal and does not download yet", () => {
    renderButton()
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    expect(screen.getByText("Confirm Export")).toBeTruthy()
    expect(mockDownloadFromApi).not.toHaveBeenCalled()
  })

  it("treats an empty department list as all departments", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    renderButton({ departmentIds: [], totalDepartments: 3 })
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    expect(screen.getByText(/all 3 departments/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() => expect(mockDownloadFromApi).toHaveBeenCalled())
    expect(mockDownloadFromApi.mock.calls[0][0]).toBe(
      "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1",
    )
  })

  it("calls downloadFromApi with correct URL when facultyId provided", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    renderButton({ facultyId: "f1" })
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() => expect(mockDownloadFromApi).toHaveBeenCalled())
    const url = mockDownloadFromApi.mock.calls[0][0] as string
    expect(url).toContain("&facultyId=f1")
  })

  it("calls downloadFromApi with correct URL without facultyId", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    renderButton()
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() => expect(mockDownloadFromApi).toHaveBeenCalled())
    const url = mockDownloadFromApi.mock.calls[0][0] as string
    expect(url).toBe("/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1")
  })
})
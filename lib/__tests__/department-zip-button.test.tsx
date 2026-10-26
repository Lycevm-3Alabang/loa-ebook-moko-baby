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

  it("names the selected faculty and sends the set as facultyIds", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    renderButton({ facultyIds: ["f1", "f2"] })
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    expect(screen.getByText(/2 selected faculty members/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() => expect(mockDownloadFromApi).toHaveBeenCalled())
    const url = mockDownloadFromApi.mock.calls[0][0] as string
    expect(url).toContain("&facultyIds=f1%2Cf2")
  })

  it("exports the whole department when no faculty is selected", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    renderButton()
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    expect(screen.getByText(/whole department/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() => expect(mockDownloadFromApi).toHaveBeenCalled())
    expect(mockDownloadFromApi.mock.calls[0][0]).toBe(
      "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1",
    )
  })

  it("keeps the existing filename by default", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    renderButton()
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() => expect(mockDownloadFromApi).toHaveBeenCalled())
    expect(mockDownloadFromApi.mock.calls[0][1]).toBe("evaluation-results-excel-p1.zip")
  })

  it("takes the consolidated filename prefix and the confirmation copy", async () => {
    mockDownloadFromApi.mockResolvedValue(undefined)
    renderButton({
      exportApiBase: "/api/admin/evaluation-results/export/consolidated",
      filenamePrefix: "evaluation-results-consolidated",
      confirmationDescription:
        "The download contains one consolidated workbook per faculty member.",
    })
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    expect(screen.getByText(/one consolidated workbook per faculty member/i)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /start export/i }))
    await waitFor(() => expect(mockDownloadFromApi).toHaveBeenCalled())
    expect(mockDownloadFromApi.mock.calls[0][0]).toContain("/export/consolidated?")
    expect(mockDownloadFromApi.mock.calls[0][1]).toBe("evaluation-results-consolidated-p1.zip")
  })

  it("does nothing while disabled", () => {
    renderButton({ disabled: true, facultyIds: ["f1"] })
    fireEvent.click(screen.getByRole("button", { name: /download excel/i }))
    expect(screen.queryByText("Confirm Export")).toBeNull()
    expect(mockDownloadFromApi).not.toHaveBeenCalled()
    expect(mockDispatchToast).not.toHaveBeenCalled()
  })
})

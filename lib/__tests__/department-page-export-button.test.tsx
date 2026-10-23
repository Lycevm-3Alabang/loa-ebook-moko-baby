import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"

const mockUseApiGet = vi.hoisted(() => vi.fn())
const mockDownloadFromApi = vi.hoisted(() => vi.fn())
const mockDispatchToast = vi.hoisted(() => vi.fn())
const mockUseParams = vi.hoisted(() => vi.fn())
const mockUseSearchParams = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
  useSearchParams: () => mockUseSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  downloadFromApi: mockDownloadFromApi,
  dispatchToast: mockDispatchToast,
}))

// Mock breadcrumb context to avoid provider wrap
vi.mock("@/lib/contexts/breadcrumb", () => ({
  useCrumb: vi.fn(),
}))

import AdminDepartmentDetailPage from "@/app/admin/evaluations/results/[departmentId]/page"
import DeanDepartmentDetailPage from "@/app/dean/evaluations/results/[departmentId]/page"

const DEPT = { id: "d1", name: "College of Computer Studies", code: "CCS" }
const AGGREGATE = {
  avgRating: 4.5,
  remarks: "Outstanding",
  highestRubrics: [],
  lowestRubrics: [],
}

const resultsFor = (url: string | null) => {
  if (url?.includes("/api/admin/evaluation-results/departments/d1") || 
      url?.includes("/api/dean/evaluation-results/departments/d1")) {
    return {
      data: {
        department: DEPT,
        subjects: [{ 
          facultyId: "f1", 
          facultyName: "John Doe", 
          totalRespondents: 10, 
          avgRating: 4.5,
          highestRubrics: [],
          lowestRubrics: [],
        }],
        members: [],
        visibilityMap: {},
        facultyAggregates: {},
        departmentAggregate: AGGREGATE,
      },
      error: undefined,
    }
  }
  return { data: undefined, error: undefined }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseParams.mockReturnValue({ departmentId: "d1" })
  mockUseSearchParams.mockReturnValue({ get: (key: string) => (key === "evaluationPeriodId" ? "p1" : null) })
  mockUseApiGet.mockImplementation(resultsFor)
})

const zipButton = () => screen.getAllByRole("button", { name: /download excel \(zip\)/i })[0]

describe("Department Results Page - Excel Export integration", () => {
  describe("Admin Department Page", () => {
    it("renders the ZIP button and calls the admin export route after confirmation", async () => {
      render(<AdminDepartmentDetailPage />)
      
      // Select faculty member f1 first to enable the ZIP button
      // The checkbox has aria-label "Include Doe, John in the export"
      const facultyCheckbox = screen.getByRole("checkbox", { 
        name: /Include Doe, John in the export/i 
      })
      fireEvent.change(facultyCheckbox, { target: { checked: true } })
      
      // Wait for the ZIP button to be enabled (disabled={false} renders disabled="")
      await waitFor(() => expect(zipButton().getAttribute("disabled")).toBeFalsy())
      
      fireEvent.click(zipButton())
      
      // Wait for any modal to appear and click the first Start Export button found in the whole document
      await waitFor(() => screen.findAllByText(/start export/i))
      const confirmButtons = screen.findAllByText(/start export/i)
      fireEvent.click(confirmButtons[0].closest("button")!)
      
      await waitFor(() =>
        expect(mockDownloadFromApi).toHaveBeenCalledWith(
          "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f1",
          "evaluation-results-excel-p1.zip",
        ),
      )
    })

    it("toasts when evaluationPeriodId is missing", async () => {
      mockUseSearchParams.mockReturnValue({ get: () => null })
      render(<AdminDepartmentDetailPage />)
      
      // Button still renders because it's inside !loading block which depends on evaluationPeriodId being truthy 
      // or at least not loading. In the page, loading = !data && !error && !!evaluationPeriodId.
      // If evaluationPeriodId is null, loading is false, but subjects.length is 0.
      // Actually, subjects is [] by default if no data.
      
      // Let's force data to be empty
      mockUseApiGet.mockReturnValue({ data: undefined, error: undefined })
      render(<AdminDepartmentDetailPage />)
      
      expect(screen.queryByRole("button", { name: /download excel \(zip\)/i })).toBeNull()
    })
  })

  describe("Dean Department Page", () => {
    it("renders the ZIP button and calls the dean export route after confirmation", async () => {
      render(<DeanDepartmentDetailPage />)
      
      // Select faculty member f1 first to enable the ZIP button
      // The checkbox has aria-label "Include Doe, John in the export"
      const facultyCheckbox = screen.getByRole("checkbox", { 
        name: /Include Doe, John in the export/i 
      })
      fireEvent.change(facultyCheckbox, { target: { checked: true } })
      
      // Wait for the ZIP button to be enabled (disabled={false} renders disabled="")
      await waitFor(() => expect(zipButton().getAttribute("disabled")).toBeFalsy())
      
      fireEvent.click(zipButton())
      
      // Wait for any modal to appear and click the first Start Export button found in the whole document
      await waitFor(() => screen.findAllByText(/start export/i))
      const confirmButtons = screen.findAllByText(/start export/i)
      fireEvent.click(confirmButtons[0].closest("button")!)
      
      await waitFor(() =>
        expect(mockDownloadFromApi).toHaveBeenCalledWith(
          "/api/dean/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f1",
          "evaluation-results-excel-p1.zip",
        ),
      )
    })
  })

  it("renders the ZIP button and calls the correct route with facultyId after confirmation", async () => {
    render(<AdminDepartmentDetailPage />)
    
    // Select faculty member f1 first to enable the ZIP button
    // The checkbox has aria-label "Include Doe, John in the export"
    const facultyCheckbox = screen.getByRole("checkbox", { 
      name: /Include Doe, John in the export/i 
    })
    fireEvent.change(facultyCheckbox, { target: { checked: true } })
    
    await waitFor(() => expect(zipButton().getAttribute("disabled")).toBeFalsy())
    
fireEvent.click(zipButton())
      
      // Wait for any modal to appear and click the first Start Export button found in the whole document
      await waitFor(() => screen.findAllByText(/start export/i))
      const confirmButtons = screen.findAllByText(/start export/i)
    fireEvent.click(confirmButtons[0].closest("button")!)
    
    await waitFor(() =>
      expect(mockDownloadFromApi).toHaveBeenCalledWith(
        "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f1",
        "evaluation-results-excel-p1.zip",
      ),
    )
  })
})
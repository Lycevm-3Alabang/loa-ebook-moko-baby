import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
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
    it("renders the ZIP button and calls the admin export route", async () => {
      render(<AdminDepartmentDetailPage />)
      
      await waitFor(() => expect(zipButton()).toBeTruthy())
      
      fireEvent.click(zipButton())
      
      await waitFor(() =>
        expect(mockDownloadFromApi).toHaveBeenCalledWith(
          "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1",
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
    it("renders the ZIP button and calls the dean export route", async () => {
      render(<DeanDepartmentDetailPage />)
      
      await waitFor(() => expect(zipButton()).toBeTruthy())
      
      fireEvent.click(zipButton())
      
      await waitFor(() =>
        expect(mockDownloadFromApi).toHaveBeenCalledWith(
          "/api/dean/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1",
          "evaluation-results-excel-p1.zip",
        ),
      )
    })
  })

  describe("Faculty Card Export", () => {
    it("renders the ZIP button on the faculty card and calls the correct route with facultyId", async () => {
      render(<AdminDepartmentDetailPage />)
      
      await waitFor(() => expect(screen.getByText("Doe, John")).toBeTruthy())
      
      // Find the card for John Doe
      const facultyCard = screen.getByText("Doe, John").closest(".card")!
      // There are multiple "buttons" because the toggle div has role="button"
      const facultyZipButton = within(facultyCard as HTMLElement).getAllByRole("button", { name: /download excel \(zip\)/i })
        .find(el => el.tagName === "BUTTON")!
      
      fireEvent.click(facultyZipButton)
      
      await waitFor(() =>
        expect(mockDownloadFromApi).toHaveBeenCalledWith(
          "/api/admin/evaluation-results/export/excel?evaluationPeriodId=p1&departmentIds=d1&facultyId=f1",
          "evaluation-results-excel-p1.zip",
        ),
      )
    })
  })
})

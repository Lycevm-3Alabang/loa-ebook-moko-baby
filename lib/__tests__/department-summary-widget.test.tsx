import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const mockUseApiGet = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ departmentId: "d1" }),
  useSearchParams: () => new URLSearchParams("evaluationPeriodId=p1"),
}))

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  useApiMutate: vi.fn(),
  invalidate: vi.fn(),
  dispatchToast: vi.fn(),
  dispatch403: vi.fn(),
  downloadFromApi: vi.fn(),
}))

vi.mock("@/lib/evaluation-pdf", () => ({
  downloadDeptPdf: vi.fn(),
  downloadEvalDetailPdf: vi.fn(),
}))

import DepartmentDetailPage from "@/app/admin/evaluations/results/[departmentId]/page"

// Two subjects for one faculty, unequal responses (3 and 1) and unequal averages
// (4.00 and 2.00). Mean of the subject averages = 3.00; pooled = 3.50.
const SUBJECTS = [
  {
    facultySubjectId: "fs1", facultyId: "f1", facultyName: "Ana Reyes", facultyEmail: "ana@x.com",
    subjectId: "s1", subjectCode: "IT101", subjectName: "Intro",
    totalRespondents: 3, avgRating: 4, remarks: "Outstanding",
    professionalManner: 4, communicationWithStudent: 4, studentEngagement: 4, learningMaterials: 4,
    timeManagement: 4, experientialLearning: 4, respectUniqueness: 4, assessmentAndFeedback: 4,
    highestRubrics: [], lowestRubrics: [], sentimentScore: 0.5,
  },
  {
    facultySubjectId: "fs2", facultyId: "f1", facultyName: "Ana Reyes", facultyEmail: "ana@x.com",
    subjectId: "s2", subjectCode: "IT102", subjectName: "Advanced",
    totalRespondents: 1, avgRating: 2, remarks: "Poor",
    professionalManner: 2, communicationWithStudent: 2, studentEngagement: 2, learningMaterials: 2,
    timeManagement: 2, experientialLearning: 2, respectUniqueness: 2, assessmentAndFeedback: 2,
    highestRubrics: [], lowestRubrics: [], sentimentScore: 0.1,
  },
]

const DEPARTMENT_AGGREGATE = {
  totalSubjects: 2,
  uniqueFaculty: 1,
  totalResponses: 4,
  avgRating: 3.5,
  remarks: "Very Satisfactory",
  professionalManner: 3.5, communicationWithStudent: 3.5, studentEngagement: 3.5, learningMaterials: 3.5,
  timeManagement: 3.5, experientialLearning: 3.5, respectUniqueness: 3.5, assessmentAndFeedback: 3.5,
  highestRubrics: [{ key: "professionalManner", label: "Professional Manner", score: 3.5 }],
  lowestRubrics: [{ key: "timeManagement", label: "Time Management", score: 3.5 }],
  sentimentScore: 0.4,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseApiGet.mockReturnValue({
    data: {
      department: { id: "d1", name: "CCS", code: "CCS" },
      subjects: SUBJECTS,
      visibilityMap: { f1: true },
      facultyAggregates: { f1: { ...DEPARTMENT_AGGREGATE, facultyId: "f1" } },
      departmentAggregate: DEPARTMENT_AGGREGATE,
    },
    error: undefined,
  })
})

describe("Department results page - Department Summary widget", () => {
  it("shows the server department average, not a mean of the subject averages", async () => {
    render(<DepartmentDetailPage />)

    await waitFor(() => expect(screen.getByText("3.50")).toBeTruthy())
    expect(screen.queryByText("3.00")).toBeNull()
    expect(screen.getByText("Very Satisfactory")).toBeTruthy()
  })

  it("shows the server pooled sentiment, not a mean of the subject sentiments", async () => {
    render(<DepartmentDetailPage />)

    await waitFor(() => expect(screen.getByText("0.4000")).toBeTruthy())
    expect(screen.queryByText("0.3000")).toBeNull()
  })

  it("labels the response count as responses", async () => {
    render(<DepartmentDetailPage />)

    const label = await screen.findByText("Total Responses")
    expect(label.parentElement?.textContent).toContain("4")
    expect(screen.queryByText("Total Respondents")).toBeNull()
  })
})

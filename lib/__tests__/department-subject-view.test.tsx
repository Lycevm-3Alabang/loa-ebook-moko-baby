import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/lib/evaluation-pdf", () => ({ downloadEvalDetailPdf: vi.fn() }))

import DepartmentSubjectView from "@/features/evaluations/components/DepartmentSubjectView"
import type { FacultyAggregate } from "@/lib/evaluation-utils"

interface Row {
  facultySubjectId: string
  facultyId: string
  facultyName: string
  facultyEmail: string
  subjectId: string
  subjectCode: string
  subjectName: string
  sectionProgram: string | null
  sectionName: string | null
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

const row = (overrides: Partial<Row> = {}): Row => ({
  facultySubjectId: "fs1",
  facultyId: "f1",
  facultyName: "Ana Reyes",
  facultyEmail: "ana@x.com",
  subjectId: "s1",
  subjectCode: "IT101",
  subjectName: "Intro",
  sectionProgram: null,
  sectionName: null,
  totalRespondents: 3,
  avgRating: 4,
  remarks: "Outstanding",
  professionalManner: 4,
  communicationWithStudent: 4,
  studentEngagement: 4,
  learningMaterials: 4,
  timeManagement: 4,
  experientialLearning: 4,
  respectUniqueness: 4,
  assessmentAndFeedback: 4,
  highestRubrics: [],
  lowestRubrics: [],
  sentimentScore: 0.5,
  ...overrides,
})

const aggregate = (overrides: Partial<FacultyAggregate> = {}): FacultyAggregate => ({
  facultyId: "f1",
  totalRespondents: 4,
  avgRating: 3.5,
  remarks: "Very Satisfactory",
  professionalManner: 3.5,
  communicationWithStudent: 3.5,
  studentEngagement: 3.5,
  learningMaterials: 3.5,
  timeManagement: 3.5,
  experientialLearning: 3.5,
  respectUniqueness: 3.5,
  assessmentAndFeedback: 3.5,
  highestRubrics: [],
  lowestRubrics: [],
  sentimentScore: 0.4,
  ...overrides,
})

// Two subjects for one faculty, unequal responses (3 and 1) and unequal averages
// (4.00 and 2.00). Mean of the subject averages = 3.00; pooled = 3.50.
const TWO_SUBJECTS = [
  row({ facultySubjectId: "fs1", subjectCode: "IT101", subjectName: "Intro", avgRating: 4, totalRespondents: 3 }),
  row({ facultySubjectId: "fs2", subjectCode: "IT102", subjectName: "Advanced", avgRating: 2, totalRespondents: 1 }),
]

const SECTIONED_SUBJECTS = [
  row({ facultySubjectId: "fs1", subjectCode: "IT101", subjectName: "Intro", avgRating: 4, totalRespondents: 3, sectionProgram: "BSCS", sectionName: "1A" }),
  row({ facultySubjectId: "fs2", subjectCode: "IT102", subjectName: "Advanced", avgRating: 2, totalRespondents: 1, sectionProgram: "BSCS", sectionName: "2A" }),
]

function renderView(opts: {
  facultyAggregates?: Record<string, FacultyAggregate>
  subjects?: Row[]
  search?: string
} = {}) {
  return render(
    <DepartmentSubjectView
      subjects={opts.subjects ?? TWO_SUBJECTS}
      departmentId="d1"
      evaluationPeriodId="p1"
      search={opts.search ?? ""}
      onSearchChange={() => {}}
      facultyAggregates={opts.facultyAggregates}
    />,
  )
}

describe("DepartmentSubjectView - By Faculty card", () => {
  it("shows the server faculty aggregate instead of the mean of the subject averages", () => {
    renderView({ facultyAggregates: { f1: aggregate() } })

    fireEvent.click(screen.getByText("By Faculty"))

    expect(screen.getByText("3.50")).toBeTruthy()
    expect(screen.queryByText("3.00")).toBeNull()
    expect(screen.getByText("Very Satisfactory")).toBeTruthy()
    expect(screen.getByText("4 responses")).toBeTruthy()
  })

  it("does not derive a faculty average when the server sends none", () => {
    renderView()

    fireEvent.click(screen.getByText("By Faculty"))

    expect(screen.queryByText("3.50")).toBeNull()
    expect(screen.queryByText("3.00")).toBeNull()
  })

  it("keeps the per-subject rows on the subject values when the card is expanded", () => {
    renderView({ facultyAggregates: { f1: aggregate() } })

    fireEvent.click(screen.getByText("By Faculty"))
    fireEvent.click(screen.getByText("Ana Reyes"))

    expect(screen.getByText("4.00")).toBeTruthy()
    expect(screen.getByText("2.00")).toBeTruthy()
    expect(screen.getByText("3.50")).toBeTruthy()
  })
})

describe("DepartmentSubjectView - Section column", () => {
  it("shows the section label in the By Subject & Section table", () => {
    renderView({ subjects: SECTIONED_SUBJECTS })

    expect(screen.getByText("BSCS-1A")).toBeTruthy()
    expect(screen.getByText("BSCS-2A")).toBeTruthy()
  })

  it("shows the same section label in the By Faculty card's expanded rows", () => {
    renderView({ subjects: SECTIONED_SUBJECTS })

    fireEvent.click(screen.getByText("By Faculty"))
    fireEvent.click(screen.getByText("Ana Reyes"))

    expect(screen.getByText("BSCS-1A")).toBeTruthy()
    expect(screen.getByText("BSCS-2A")).toBeTruthy()
  })

  it("finds a row by its section label", () => {
    renderView({ subjects: SECTIONED_SUBJECTS, search: "bscs-1a" })

    expect(screen.getByText("IT101 Intro")).toBeTruthy()
    expect(screen.queryByText("IT102 Advanced")).toBeNull()
  })
})

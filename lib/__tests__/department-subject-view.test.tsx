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
  members?: { id: string; name: string; email: string }[]
  search?: string
} = {}) {
  return render(
    <DepartmentSubjectView
      subjects={opts.subjects ?? TWO_SUBJECTS}
      members={opts.members}
      departmentId="d1"
      evaluationPeriodId="p1"
      search={opts.search ?? ""}
      onSearchChange={() => {}}
      facultyAggregates={opts.facultyAggregates}
    />,
  )
}

describe("DepartmentSubjectView - the faculty card", () => {
  it("shows the server faculty aggregate instead of the mean of the subject averages", () => {
    renderView({ facultyAggregates: { f1: aggregate() } })

    expect(screen.getByText("3.50")).toBeTruthy()
    expect(screen.queryByText("3.00")).toBeNull()
    expect(screen.getByText("Very Satisfactory")).toBeTruthy()
  })

  it("shows no response counts - the coverage page owns them", () => {
    renderView({ facultyAggregates: { f1: aggregate() } })

    expect(screen.queryByText("4 responses")).toBeNull()
    expect(screen.queryByText("2 subjects")).toBeNull()

    // The expanded table has no response column either.
    fireEvent.click(screen.getByText("Reyes, Ana"))
    expect(screen.queryByText("Resp.")).toBeNull()
  })

  it("gives a card to a member with no results, and to nobody else", () => {
    renderView({
      members: [
        { id: "f1", name: "Ana Reyes", email: "ana@x.com" },
        { id: "f2", name: "Ben Cruz", email: "ben@x.com" },
      ],
      facultyAggregates: { f1: aggregate() },
    })

    // Both members are cards - a teacher homed elsewhere is not.
    expect(screen.getByText("Reyes, Ana")).toBeTruthy()
    expect(screen.getByText("Cruz, Ben")).toBeTruthy()
  })

  it("does not derive a faculty average when the server sends none", () => {
    renderView()

    expect(screen.queryByText("3.50")).toBeNull()
    expect(screen.queryByText("3.00")).toBeNull()
  })

  it("keeps the per-subject rows on the subject values when the card is expanded", () => {
    renderView({ facultyAggregates: { f1: aggregate() } })

    fireEvent.click(screen.getByText("Reyes, Ana"))

    expect(screen.getByText("4.00")).toBeTruthy()
    expect(screen.getByText("2.00")).toBeTruthy()
    expect(screen.getByText("3.50")).toBeTruthy()
  })
})

describe("DepartmentSubjectView - the name", () => {
  it("shows the name as Surname, FirstName", () => {
    renderView({
      subjects: [row({ facultyName: "Juan B. Dela Cruz" })],
      facultyAggregates: { f1: aggregate() },
    })

    expect(screen.getByText("Dela Cruz, Juan B.")).toBeTruthy()
  })

  it("sorts the cards by the surname, ascending and descending", () => {
    const { container } = renderView({
      subjects: [
        row({ facultySubjectId: "fs1", facultyId: "f1", facultyName: "Zeta Santos" }),
        row({ facultySubjectId: "fs2", facultyId: "f2", facultyName: "Ana Reyes" }),
      ],
      facultyAggregates: { f1: aggregate(), f2: aggregate({ facultyId: "f2" }) },
    })

    const order = () => {
      const text = container.textContent ?? ""
      return text.indexOf("Reyes, Ana") < text.indexOf("Santos, Zeta") ? "ana-first" : "zeta-first"
    }
    expect(order()).toBe("ana-first")

    fireEvent.click(screen.getByTitle("Sorted by surname A–Z — click for Z–A"))
    expect(order()).toBe("zeta-first")
  })

  it("finds a teacher by the name as it is displayed", () => {
    renderView({
      subjects: [row({ facultyName: "Juan B. Dela Cruz" })],
      facultyAggregates: { f1: aggregate() },
      search: "dela cruz, juan",
    })

    expect(screen.getByText("Dela Cruz, Juan B.")).toBeTruthy()
  })
})

describe("DepartmentSubjectView - expanding", () => {
  it("keeps several cards open at once", () => {
    renderView({
      subjects: [
        row({ facultySubjectId: "fs1", facultyId: "f1", facultyName: "Ana Reyes" }),
        row({ facultySubjectId: "fs2", facultyId: "f2", facultyName: "Ben Cruz" }),
      ],
      facultyAggregates: { f1: aggregate(), f2: aggregate({ facultyId: "f2" }) },
    })

    fireEvent.click(screen.getByText("Reyes, Ana"))
    fireEvent.click(screen.getByText("Cruz, Ben"))

    // Both cards' subject rows are on screen at the same time.
    expect(screen.getAllByText("IT101 Intro")).toHaveLength(2)
  })

  it("expands every card at once", () => {
    renderView({
      subjects: [
        row({ facultySubjectId: "fs1", facultyId: "f1", facultyName: "Ana Reyes" }),
        row({ facultySubjectId: "fs2", facultyId: "f2", facultyName: "Ben Cruz" }),
      ],
      facultyAggregates: { f1: aggregate(), f2: aggregate({ facultyId: "f2" }) },
    })

    expect(screen.queryAllByText("IT101 Intro")).toHaveLength(0)

    fireEvent.click(screen.getByText("Expand all"))
    expect(screen.getAllByText("IT101 Intro")).toHaveLength(2)
  })

  it("collapses every card at once", () => {
    renderView({
      subjects: [
        row({ facultySubjectId: "fs1", facultyId: "f1", facultyName: "Ana Reyes" }),
        row({ facultySubjectId: "fs2", facultyId: "f2", facultyName: "Ben Cruz" }),
      ],
      facultyAggregates: { f1: aggregate(), f2: aggregate({ facultyId: "f2" }) },
    })

    fireEvent.click(screen.getByText("Reyes, Ana"))
    fireEvent.click(screen.getByText("Cruz, Ben"))
    expect(screen.getAllByText("IT101 Intro")).toHaveLength(2)

    // Every card is open, so the button offers to close them.
    fireEvent.click(screen.getByText("Collapse all"))
    expect(screen.queryAllByText("IT101 Intro")).toHaveLength(0)
  })
})

describe("DepartmentSubjectView - Section column", () => {
  it("shows the section label in the card's expanded rows", () => {
    // The server's faculty list is the department's own faculty - the card
    // exists because f1 is one of them.
    renderView({ subjects: SECTIONED_SUBJECTS, facultyAggregates: { f1: aggregate() } })

    fireEvent.click(screen.getByText("Reyes, Ana"))

    expect(screen.getByText("BSCS-1A")).toBeTruthy()
    expect(screen.getByText("BSCS-2A")).toBeTruthy()
  })

  it("gives a card only to a member of the department", () => {
    // f1 teaches a subject here but the server does not count them as one of
    // this department's members: no card, and the subject stays in the rows.
    renderView({
      subjects: SECTIONED_SUBJECTS,
      members: [{ id: "f2", name: "Ben Cruz", email: "ben@x.com" }],
      facultyAggregates: { f2: aggregate({ facultyId: "f2" }) },
    })

    expect(screen.queryByText("Reyes, Ana")).toBeNull()
    expect(screen.getByText("Cruz, Ben")).toBeTruthy()
    expect(screen.getByText("1 faculty")).toBeTruthy()
  })

  it("finds a row by its section label", () => {
    renderView({ subjects: SECTIONED_SUBJECTS, search: "bscs-1a", facultyAggregates: { f1: aggregate() } })

    fireEvent.click(screen.getByText("Reyes, Ana"))

    expect(screen.getByText("IT101 Intro")).toBeTruthy()
    expect(screen.queryByText("IT102 Advanced")).toBeNull()
  })
})

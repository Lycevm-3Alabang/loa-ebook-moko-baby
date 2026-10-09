import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the factory module BEFORE any imports that use it
vi.mock("@/lib/repositories/factory", () => ({
  subjectRepository: { upsertMany: vi.fn() },
  sectionRepository: { upsertMany: vi.fn() },
  userRepository: { findManyByEmail: vi.fn(), createMany: vi.fn() },
  facultySubjectRepository: { replaceBySection: vi.fn(), create: vi.fn(), list: vi.fn().mockResolvedValue([]), update: vi.fn() },
  studentEnrollmentRepository: { replaceBySection: vi.fn() },
  // Precedence insert path: importFacultySubjects resolves departments and
  // department_courses through these repositories rather than direct supabase.
  departmentRepository: {
    findByCode: vi.fn(async (code: string) =>
      code === "CCS" ? { id: "dept-ccs", name: "CCS", code: "CCS" }
        : code === "CAS" ? { id: "dept-cas", name: "CAS", code: "CAS" }
          : null,
    ),
    create: vi.fn(async (data: { name: string; code: string }) => ({
      id: `dept-${data.code.toLowerCase()}`, name: data.name, code: data.code,
    })),
  },
  departmentCourseRepository: {
    findByDepartmentAndCode: vi.fn(async (departmentId: string, code: string) =>
      code === "BSIT" ? { id: "course-bsit", departmentId, name: "BSIT", code }
        : code === "BSCS" ? { id: "course-bscs", departmentId, name: "BSCS", code }
          : null,
    ),
    create: vi.fn(async (data: { departmentId: string; code: string; name: string }) => ({
      id: `course-${data.code.toLowerCase()}`, departmentId: data.departmentId, name: data.name, code: data.code,
    })),
  },
}))

vi.mock("@/lib/supabase", () => {
  const tableData: Record<string, { id: string; code: string }[]> = {
    department_courses: [
      { id: "course-bsit", code: "BSIT" },
      { id: "course-bscs", code: "BSCS" },
    ],
    departments: [
      { id: "dept-ccs", code: "CCS" },
      { id: "dept-cas", code: "CAS" },
    ],
  }
  return {
    supabase: {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockResolvedValue({
          data: tableData[table] || [],
          error: null,
        }),
      })),
    },
  }
})

import { parseFacultySubjectCsv, parseStudentEnrollmentCsv, importFacultySubjects, importStudentEnrollments } from "@/lib/services/etlEvaluation"
import * as factory from "@/lib/repositories/factory"

// ── Helpers ───────────────────────────────────────────────

function mockSubjectUpsert(map: Map<string, { id: string }>, created = 0) {
  ;(factory.subjectRepository.upsertMany as ReturnType<typeof vi.fn>).mockResolvedValue({ data: map, created })
}

function mockSectionUpsert(map: Map<string, { id: string }>, created = 0) {
  ;(factory.sectionRepository.upsertMany as ReturnType<typeof vi.fn>).mockResolvedValue({ data: map, created })
}

function mockFindUsers(map: Map<string, { id: string; email: string; name: string; role: string }>) {
  ;(factory.userRepository.findManyByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(map)
}

function mockCreateUsers(map: Map<string, { id: string; email: string; name: string; role: string }>) {
  ;(factory.userRepository.createMany as ReturnType<typeof vi.fn>).mockResolvedValue(map)
}

const userCreateRepo = () => factory.userRepository.createMany as ReturnType<typeof vi.fn>
const fsRepo = () => factory.facultySubjectRepository.create as ReturnType<typeof vi.fn>
const seRepo = () => factory.studentEnrollmentRepository.replaceBySection as ReturnType<typeof vi.fn>

// ── parseFacultySubjectCsv ─────────────────────────────────

describe("parseFacultySubjectCsv", () => {
  const validHeaders = "faculty email, name, section, subject code, subject name, department code"

  it("parses valid rows", () => {
    const csv = `${validHeaders}
juan.delacruz@lyceumalabang.edu.ph, Juan Dela Cruz, BSIT-32A3, CS101, Introduction to Computer Science, CCS
maria.santos@lyceumalabang.edu.ph, Maria Santos, BSCS-21B, MATH201, Calculus II, CAS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.headerError).toBeUndefined()
    expect(result.rows).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
    expect(result.rows[0]).toEqual({
      email: "juan.delacruz@lyceumalabang.edu.ph",
      name: "Juan Dela Cruz",
      subjectCode: "CS101",
      subjectName: "Introduction to Computer Science",
      sectionName: "32A3",
      sectionProgram: "BSIT",
      departmentCode: "CCS",
    })
    expect(result.rows[1]).toEqual({
      email: "maria.santos@lyceumalabang.edu.ph",
      name: "Maria Santos",
      subjectCode: "MATH201",
      subjectName: "Calculus II",
      sectionName: "21B",
      sectionProgram: "BSCS",
      departmentCode: "CAS",
    })
  })

  it("parses section without program prefix", () => {
    const csv = `${validHeaders}
juan.delacruz@lyceumalabang.edu.ph, Juan, 32A3, CS101, Intro, CCS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].sectionName).toBe("32A3")
    expect(result.rows[0].sectionProgram).toBe("")
  })

  it("rejects empty file", () => {
    const result = parseFacultySubjectCsv("")
    expect(result.headerError).toBe("CSV file is empty")
    expect(result.rows).toHaveLength(0)
  })

  it("rejects wrong headers", () => {
    const csv = `email, name, section, subject code, subject name, department code
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3, CS101, Intro, CCS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.headerError).toContain("faculty email")
  })

  it("rejects missing subject name column", () => {
    const csv = `faculty email, name, section, subject code
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3, CS101`
    const result = parseFacultySubjectCsv(csv)
    expect(result.headerError).toContain("subject name")
  })

  it("rejects missing department code column", () => {
    const csv = `faculty email, name, section, subject code, subject name
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3, CS101, Intro`
    const result = parseFacultySubjectCsv(csv)
    expect(result.headerError).toContain("department code")
  })

  it("rejects misordered columns", () => {
    const csv = `faculty email, name, subject code, section, subject name, department code
juan@lyceumalabang.edu.ph, Juan, CS101, BSIT-32A3, Intro, CCS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.headerError).toContain("Expected headers")
  })

  it("rejects too few columns", () => {
    const csv = `faculty email, name, section
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3`
    const result = parseFacultySubjectCsv(csv)
    expect(result.headerError).toBeTruthy()
  })

  it("collects row-level errors for short rows", () => {
    const csv = `${validHeaders}
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3, CS101, Intro, CCS
incomplete`
    const result = parseFacultySubjectCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].row).toBe(3)
    expect(result.errors[0].message).toContain("6 columns")
  })

  it("maps missing faculty email to the shared dummy", () => {
    const csv = `${validHeaders}
, Juan, BSIT-32A3, CS101, Intro, CCS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].email).toBe("placeholder@lyceumalabang.edu.ph")
    expect(result.errors).toHaveLength(0)
  })

  it("rejects missing subject code", () => {
    const csv = `${validHeaders}
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3,, Intro, CCS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("Subject code")
  })

  it("rejects missing section", () => {
    const csv = `${validHeaders}
juan@lyceumalabang.edu.ph, Juan,, CS101, Intro, CCS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("Section is required")
  })

  it("trims whitespace from values", () => {
    const csv = `${validHeaders}
  juan@lyceumalabang.edu.ph  ,  Juan  ,  BSIT-32A3  ,  CS101  ,  Intro  ,  CCS  `
    const result = parseFacultySubjectCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].email).toBe("juan@lyceumalabang.edu.ph")
    expect(result.rows[0].name).toBe("Juan")
    expect(result.rows[0].subjectCode).toBe("CS101")
    expect(result.rows[0].subjectName).toBe("Intro")
    expect(result.rows[0].sectionProgram).toBe("BSIT")
    expect(result.rows[0].sectionName).toBe("32A3")
    expect(result.rows[0].departmentCode).toBe("CCS")
  })

  it("handles duplicate rows by keeping both", () => {
    const csv = `${validHeaders}
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3, CS101, Intro, CCS
juan@lyceumalabang.edu.ph, Juan, BSIT-32A3, CS101, Intro, CCS`
    const result = parseFacultySubjectCsv(csv)
    expect(result.rows).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })
})

// ── parseStudentEnrollmentCsv ──────────────────────────────

describe("parseStudentEnrollmentCsv", () => {
  const validHeaders = "student email, name, section"

  it("parses valid rows with name column", () => {
    const csv = `${validHeaders}
ana.reyes@lyceumalabang.edu.ph, Ana Reyes, BSIT-32A3
pedro.cruz@lyceumalabang.edu.ph, Pedro Cruz, BSCS-21B`
    const result = parseStudentEnrollmentCsv(csv)
    expect(result.headerError).toBeUndefined()
    expect(result.rows).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
    expect(result.rows[0]).toEqual({
      email: "ana.reyes@lyceumalabang.edu.ph",
      name: "Ana Reyes",
      sectionName: "32A3",
      sectionProgram: "BSIT",
    })
    expect(result.rows[1]).toEqual({
      email: "pedro.cruz@lyceumalabang.edu.ph",
      name: "Pedro Cruz",
      sectionName: "21B",
      sectionProgram: "BSCS",
    })
  })

  it("parses valid rows without name column", () => {
    const csv = `student email, section
ana.reyes@lyceumalabang.edu.ph, BSIT-32A3`
    const result = parseStudentEnrollmentCsv(csv)
    expect(result.headerError).toBeUndefined()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe("")
    expect(result.rows[0].email).toBe("ana.reyes@lyceumalabang.edu.ph")
  })

  it("rejects wrong first header", () => {
    const csv = `email, name, section
ana@lyceumalabang.edu.ph, Ana, BSIT-32A3`
    const result = parseStudentEnrollmentCsv(csv)
    expect(result.headerError).toContain("student email")
  })

  it("rejects missing email", () => {
    const csv = `${validHeaders}
, Ana, BSIT-32A3`
    const result = parseStudentEnrollmentCsv(csv)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("email is required")
  })

  it("rejects missing section", () => {
    const csv = `${validHeaders}
ana@lyceumalabang.edu.ph, Ana,`
    const result = parseStudentEnrollmentCsv(csv)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("Section is required")
  })

  it("handles duplicate rows by keeping both", () => {
    const csv = `${validHeaders}
ana@lyceumalabang.edu.ph, Ana, BSIT-32A3
ana@lyceumalabang.edu.ph, Ana, BSIT-32A3`
    const result = parseStudentEnrollmentCsv(csv)
    expect(result.rows).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it("trims whitespace", () => {
    const csv = `${validHeaders}
  ana@lyceumalabang.edu.ph  ,  Ana  ,  BSIT-32A3  `
    const result = parseStudentEnrollmentCsv(csv)
    expect(result.rows[0].email).toBe("ana@lyceumalabang.edu.ph")
    expect(result.rows[0].name).toBe("Ana")
  })
})

// ── Import functions ───────────────────────────────────────

describe("importFacultySubjects", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    ;(factory.facultySubjectRepository.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it("imports faculty subjects successfully", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 1)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 1)
    mockFindUsers(new Map())
    mockCreateUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))

    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
    ])

    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(result.createdSubjects).toBe(1)
    expect(result.createdSections).toBe(1)
    expect(userCreateRepo()).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY", departmentId: "dept-ccs" }),
      ]),
    )
    expect(fsRepo()).toHaveBeenCalledWith({ faculty_id: "user-1", subject_id: "subj-1", section_id: "sec-1", semesterId: null })
  })

  it("uses email fallback name when name is empty", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map())
    mockCreateUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "juan", role: "FACULTY" }]]))

    await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
    ])

    expect(userCreateRepo()).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "juan" }),
      ]),
    )
  })

  it("reports error when subject not found", async () => {
    mockSubjectUpsert(new Map(), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))

    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "NONEXISTENT", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
    ])

    expect(result.matched).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("could not be created or found")
  })

  it("reports error when section not found", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map(), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))

    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
    ])

    expect(result.matched).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("could not be created or found")
  })

  it("creates a missing department instead of dropping the row", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))

    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "UNKNOWN" },
    ])

    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
    // Precedence insert: the department is created with name derived from code,
    // and the row survives instead of being filtered out.
    expect(factory.departmentRepository.create).toHaveBeenCalledWith({ name: "UNKNOWN", code: "UNKNOWN" })
  })

  it("handles duplicate emails without re-creating users", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))
    mockCreateUsers(new Map())

    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
    ])

    expect(result.matched).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(userCreateRepo()).not.toHaveBeenCalled()
  })

  it("returns empty result for no rows", async () => {
    const result = await importFacultySubjects([])
    expect(result.matched).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.createdSubjects).toBe(0)
    expect(result.createdSections).toBe(0)
  })

  it("reports error when user not found and create fails", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map())
    mockCreateUsers(new Map())

    const result = await importFacultySubjects([
      { email: "nobody@lyceumalabang.edu.ph", name: "Nobody", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
    ])

    expect(result.matched).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("not found")
  })
})

describe("importStudentEnrollments", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("imports student enrollments successfully", async () => {
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 1)
    mockFindUsers(new Map())
    mockCreateUsers(new Map([["ana@lyceumalabang.edu.ph", { id: "user-1", email: "ana@lyceumalabang.edu.ph", name: "Ana", role: "STUDENT" }]]))

    const result = await importStudentEnrollments([
      { email: "ana@lyceumalabang.edu.ph", name: "Ana", sectionName: "32A3", sectionProgram: "BSIT" },
    ])

    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(result.createdSections).toBe(1)
    expect(userCreateRepo()).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ email: "ana@lyceumalabang.edu.ph", name: "Ana", role: "STUDENT" }),
      ]),
    )
    expect(seRepo()).toHaveBeenCalledWith("sec-1", [{ student_id: "user-1" }])
  })

  it("uses email fallback name when name is empty", async () => {
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map())
    mockCreateUsers(new Map([["ana@lyceumalabang.edu.ph", { id: "user-1", email: "ana@lyceumalabang.edu.ph", name: "ana", role: "STUDENT" }]]))

    await importStudentEnrollments([
      { email: "ana@lyceumalabang.edu.ph", name: "", sectionName: "32A3", sectionProgram: "BSIT" },
    ])

    expect(userCreateRepo()).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "ana" }),
      ]),
    )
  })

  it("reports error when student not found and create fails", async () => {
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map())
    mockCreateUsers(new Map())

    const result = await importStudentEnrollments([
      { email: "unknown@lyceumalabang.edu.ph", name: "", sectionName: "32A3", sectionProgram: "BSIT" },
    ])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("not found")
  })

  it("handles duplicate emails without re-creating users", async () => {
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["ana@lyceumalabang.edu.ph", { id: "user-1", email: "ana@lyceumalabang.edu.ph", name: "Ana", role: "STUDENT" }]]))
    mockCreateUsers(new Map())

    const result = await importStudentEnrollments([
      { email: "ana@lyceumalabang.edu.ph", name: "Ana", sectionName: "32A3", sectionProgram: "BSIT" },
      { email: "ana@lyceumalabang.edu.ph", name: "Ana", sectionName: "32A3", sectionProgram: "BSIT" },
    ])

    expect(result.matched).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(userCreateRepo()).not.toHaveBeenCalled()
    expect(seRepo()).toHaveBeenCalledTimes(1)
  })

  it("returns empty result for no rows", async () => {
    const result = await importStudentEnrollments([])
    expect(result.matched).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.createdSections).toBe(0)
  })

  it("reports error when section not found", async () => {
    mockSectionUpsert(new Map(), 0)
    mockFindUsers(new Map([["ana@lyceumalabang.edu.ph", { id: "user-1", email: "ana@lyceumalabang.edu.ph", name: "Ana", role: "STUDENT" }]]))

    const result = await importStudentEnrollments([
      { email: "ana@lyceumalabang.edu.ph", name: "Ana", sectionName: "NONEXISTENT", sectionProgram: "BSIT" },
    ])

    expect(result.matched).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("could not be created or found")
  })
})

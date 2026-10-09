import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the factory module BEFORE any imports that use it
vi.mock("@/lib/repositories/factory", () => ({
  subjectRepository: { upsertMany: vi.fn() },
  sectionRepository: { upsertMany: vi.fn() },
  userRepository: { findManyByEmail: vi.fn(), createMany: vi.fn() },
  facultySubjectRepository: { replaceBySection: vi.fn(), create: vi.fn(), list: vi.fn().mockResolvedValue([]), update: vi.fn(), findBySubjectAndSection: vi.fn().mockResolvedValue(null), findBySubjectSectionAndFaculty: vi.fn().mockResolvedValue(null) },
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

import { parseFacultySubjectCsv, parseStudentEnrollmentCsv, importFacultySubjects, importStudentEnrollments, importDepartmentsStep, importCoursesStep, importSectionsStep, importSubjectsStep, importFacultyUsersStep, importMappingsStep, DUMMY_FACULTY_EMAIL } from "@/lib/services/etlEvaluation"
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

// ── importDepartmentsStep (stepper step 2) ───────────────────

describe("importDepartmentsStep", () => {
  const deptFind = () => factory.departmentRepository.findByCode as ReturnType<typeof vi.fn>
  const deptCreate = () => factory.departmentRepository.create as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    deptFind().mockImplementation(async (code: string) =>
      code === "CCS" ? { id: "dept-ccs", name: "CCS", code: "CCS" }
        : code === "CAS" ? { id: "dept-cas", name: "CAS", code: "CAS" }
          : null,
    )
    deptCreate().mockImplementation(async (data: { name: string; code: string }) => ({
      id: `dept-${data.code.toLowerCase()}`, name: data.name, code: data.code,
    }))
    ;(factory.facultySubjectRepository.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it("creates missing departments with name=code (case-insensitive dedup)", async () => {
    const result = await importDepartmentsStep(["COE", "coe", "CCS"])
    expect(result.stepId).toBe("departments")
    expect(result.status).toBe("done")
    expect(result.inserted).toBe(1)
    expect(result.existing).toBe(1)
    expect(Object.keys(result.deptCodeToId)).toHaveLength(2)
    expect(result.deptCodeToId["COE"]).toBe("dept-coe")
    expect(result.deptCodeToId["CCS"]).toBe("dept-ccs")
    expect(deptCreate()).toHaveBeenCalledTimes(1)
    expect(deptCreate()).toHaveBeenCalledWith({ name: "COE", code: "COE" })
  })

  it("reuses existing departments without creating", async () => {
    const result = await importDepartmentsStep(["CCS", "CAS"])
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(2)
    expect(result.invalid).toHaveLength(0)
    expect(deptCreate()).not.toHaveBeenCalled()
  })

  it("flags blank codes as invalid without inserting", async () => {
    const result = await importDepartmentsStep(["CCS", "   ", ""])
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(1)
    expect(result.invalid).toHaveLength(2)
    expect(result.invalid[0].reason).toBe("Department code is required")
    expect(deptCreate()).not.toHaveBeenCalled()
  })

  it("treats a 23505 race as existing via re-read", async () => {
    let reads = 0
    deptFind().mockImplementation(async () => {
      reads++
      return reads === 1 ? null : { id: "dept-race", name: "RACE", code: "RACE" }
    })
    deptCreate().mockImplementation(async () => {
      throw { code: "23505" }
    })
    const result = await importDepartmentsStep(["RACE"])
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(1)
    expect(result.invalid).toHaveLength(0)
    expect(result.deptCodeToId["RACE"]).toBe("dept-race")
  })

  it("leaves the composed importFacultySubjects path unchanged", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))
    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "UNKNOWN" },
    ])
    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(deptCreate()).toHaveBeenCalledWith({ name: "UNKNOWN", code: "UNKNOWN" })
  })
})

 // ── importCoursesStep (stepper step 3) ───────────────────────

describe("importCoursesStep", () => {
  const deptFind = () => factory.departmentRepository.findByCode as ReturnType<typeof vi.fn>
  const deptCreate = () => factory.departmentRepository.create as ReturnType<typeof vi.fn>
  const courseFind = () => factory.departmentCourseRepository.findByDepartmentAndCode as ReturnType<typeof vi.fn>
  const courseCreate = () => factory.departmentCourseRepository.create as ReturnType<typeof vi.fn>

  const deptMap = { CCS: "dept-ccs", CAS: "dept-cas", COE: "dept-coe", CBA: "dept-cba", CHS: "dept-chs" }

  beforeEach(() => {
    vi.resetAllMocks()
    deptFind().mockImplementation(async (code: string) =>
      code === "CCS" ? { id: "dept-ccs", name: "CCS", code: "CCS" }
        : code === "CAS" ? { id: "dept-cas", name: "CAS", code: "CAS" }
          : null,
    )
    deptCreate().mockImplementation(async (data: { name: string; code: string }) => ({
      id: `dept-${data.code.toLowerCase()}`, name: data.name, code: data.code,
    }))
    courseFind().mockImplementation(async () => null)
    courseCreate().mockImplementation(async (data: { departmentId: string; code: string; name: string }) => ({
      id: `course-${data.code.toLowerCase()}`, departmentId: data.departmentId, name: data.name, code: data.code,
    }))
    ;(factory.facultySubjectRepository.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  const pairs16 = [
    { departmentCode: "CCS", program: "BSIT" },
    { departmentCode: "CCS", program: "BSCS" },
    { departmentCode: "COE", program: "BSCE" },
    { departmentCode: "COE", program: "BSEE" },
    { departmentCode: "COE", program: "BSME" },
    { departmentCode: "COE", program: "BSIE" },
    { departmentCode: "CAS", program: "BSPsych" },
    { departmentCode: "CAS", program: "BSChem" },
    { departmentCode: "CBA", program: "BSBA" },
    { departmentCode: "CBA", program: "BSAc" },
    { departmentCode: "CHS", program: "BSN" },
    { departmentCode: "CHS", program: "BSMT" },
    { departmentCode: "CCS", program: "BSIS" },
    { departmentCode: "COE", program: "BSCpE" },
    { departmentCode: "CAS", program: "BSBio" },
    { departmentCode: "CBA", program: "BSHM" },
  ]

  it("creates missing courses with marked name (trims, uppercases, dedups by pair)", async () => {
    const result = await importCoursesStep([...pairs16, { departmentCode: "coe", program: " BSIE " }], deptMap)
    expect(result.stepId).toBe("courses")
    expect(result.status).toBe("done")
    expect(result.inserted).toBe(16)
    expect(result.existing).toBe(0)
    expect(result.invalid).toHaveLength(0)
    expect(Object.keys(result.programToCourseId)).toHaveLength(16)
    expect(result.programToCourseId["BSIE"]).toBe("course-bsie")
    expect(courseCreate()).toHaveBeenCalledWith({ departmentId: "dept-coe", code: "BSIE", name: "BSIE [unmapped]" })
  })

  it("reuses existing courses by pair without creating", async () => {
    courseFind().mockImplementation(async (departmentId: string, code: string) => ({ id: `course-${code.toLowerCase()}`, departmentId, name: code, code }))
    const result = await importCoursesStep(pairs16, deptMap)
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(16)
    expect(result.invalid).toHaveLength(0)
    expect(courseCreate()).not.toHaveBeenCalled()
    expect(courseFind()).toHaveBeenCalledWith("dept-coe", "BSIE")
    expect(Object.keys(result.programToCourseId)).toHaveLength(16)
  })

  it("flags a program without a department without inserting", async () => {
    courseFind().mockImplementation(async (departmentId: string, code: string) =>
      code === "BSIT" ? { id: "course-bsit", departmentId, name: code, code } : null,
    )
    const result = await importCoursesStep(
      [...pairs16.slice(0, 1), { departmentCode: "NOPE", program: "BSXX" }],
      deptMap,
    )
    expect(result.existing).toBe(1)
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0]).toEqual({ key: "BSXX", reason: 'No department for course "BSXX"' })
    expect(courseCreate()).not.toHaveBeenCalled()
  })

  it("treats a 23505 race as existing via re-read", async () => {
    let reads = 0
    courseFind().mockImplementation(async (departmentId: string, code: string) => {
      reads++
      return reads === 1 ? null : { id: "course-race", departmentId, name: code, code }
    })
    courseCreate().mockImplementation(async () => {
      throw { code: "23505" }
    })
    const result = await importCoursesStep([{ departmentCode: "CCS", program: "RACE" }], deptMap)
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(1)
    expect(result.invalid).toHaveLength(0)
    expect(result.programToCourseId["RACE"]).toBe("course-race")
  })

  it("leaves the composed importFacultySubjects path unchanged", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))
    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "UNKNOWN" },
    ])
    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(deptCreate()).toHaveBeenCalledWith({ name: "UNKNOWN", code: "UNKNOWN" })
  })
})

// ── importSectionsStep (stepper step 4) ──────────────────────

describe("importSectionsStep", () => {
  const deptFind = () => factory.departmentRepository.findByCode as ReturnType<typeof vi.fn>
  const deptCreate = () => factory.departmentRepository.create as ReturnType<typeof vi.fn>
  const sectionUpsert = () => factory.sectionRepository.upsertMany as ReturnType<typeof vi.fn>

  const courseMap = { BSIT: "course-bsit", BSCS: "course-bscs", BSIE: "course-bsie" }

  const sectionItems142 = Array.from({ length: 142 }, (_, i) => ({
    name: `S${String(i).padStart(3, "0")}`,
    program: "BSIT",
  }))

  const sectionMapFor = (items: { name: string; program: string }[], created: number) => {
    const map = new Map(items.map((s, i) => [`${s.name}|${s.program}`, { id: `sec-${i}` }]))
    mockSectionUpsert(map, created)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    deptFind().mockImplementation(async (code: string) =>
      code === "CCS" ? { id: "dept-ccs", name: "CCS", code: "CCS" }
        : code === "CAS" ? { id: "dept-cas", name: "CAS", code: "CAS" }
          : null,
    )
    deptCreate().mockImplementation(async (data: { name: string; code: string }) => ({
      id: `dept-${data.code.toLowerCase()}`, name: data.name, code: data.code,
    }))
    ;(factory.facultySubjectRepository.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it("upserts all distinct sections in a single call", async () => {
    sectionMapFor(sectionItems142, 142)
    const result = await importSectionsStep(sectionItems142, courseMap)
    expect(result.stepId).toBe("sections")
    expect(result.status).toBe("done")
    expect(sectionUpsert()).toHaveBeenCalledTimes(1)
    expect(sectionUpsert().mock.calls[0][0]).toHaveLength(142)
    expect(result.inserted).toBe(142)
    expect(result.existing).toBe(0)
    expect(result.invalid).toHaveLength(0)
    expect(Object.keys(result.sectionKeyToId)).toHaveLength(142)
  })

  it("splits created from existing via the repository count", async () => {
    sectionMapFor(sectionItems142, 30)
    const result = await importSectionsStep(sectionItems142, courseMap)
    expect(result.inserted).toBe(30)
    expect(result.existing).toBe(112)
  })

  it("flags a program without a course and never sends that section", async () => {
    sectionMapFor([{ name: "32A3", program: "BSIT" }], 0)
    const result = await importSectionsStep(
      [
        { name: "32A3", program: "BSIT" },
        { name: "99Z9", program: "BSXX" },
      ],
      courseMap,
    )
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0]).toEqual({ key: "BSXX-99Z9", reason: 'No department course found for program "BSXX"' })
    expect(sectionUpsert()).toHaveBeenCalledTimes(1)
    expect(sectionUpsert().mock.calls[0][0]).toHaveLength(1)
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(1)
  })

  it("trims trailing whitespace so duplicates collapse to one item", async () => {
    sectionMapFor([{ name: "41M2", program: "BSIE" }], 1)
    const result = await importSectionsStep(
      [
        { name: "41M2 ", program: "BSIE" },
        { name: "41M2", program: " BSIE " },
      ],
      courseMap,
    )
    expect(sectionUpsert()).toHaveBeenCalledTimes(1)
    expect(sectionUpsert().mock.calls[0][0]).toEqual([
      { name: "41M2", program: "BSIE", departmentCourseId: "course-bsie" },
    ])
    expect(result.inserted).toBe(1)
    expect(result.existing).toBe(0)
    expect(result.invalid).toHaveLength(0)
  })

  it("leaves the composed importFacultySubjects path unchanged", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))
    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "UNKNOWN" },
    ])
    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(deptCreate()).toHaveBeenCalledWith({ name: "UNKNOWN", code: "UNKNOWN" })
  })
})

// ── importSubjectsStep (stepper step 5) ──────────────────────

describe("importSubjectsStep", () => {
  const subjectUpsert = () => factory.subjectRepository.upsertMany as ReturnType<typeof vi.fn>
  const deptFind = () => factory.departmentRepository.findByCode as ReturnType<typeof vi.fn>
  const deptCreate = () => factory.departmentRepository.create as ReturnType<typeof vi.fn>

  const codes315 = Array.from({ length: 315 }, (_, i) => `SUBJ${String(i).padStart(3, "0")}`)

  const subjectMapFor = (codes: string[], created: number) => {
    const map = new Map(codes.map((c, i) => [c, { id: `subj-${i}` }]))
    mockSubjectUpsert(map, created)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    deptFind().mockImplementation(async (code: string) =>
      code === "CCS" ? { id: "dept-ccs", name: "CCS", code: "CCS" }
        : code === "CAS" ? { id: "dept-cas", name: "CAS", code: "CAS" }
          : null,
    )
    deptCreate().mockImplementation(async (data: { name: string; code: string }) => ({
      id: `dept-${data.code.toLowerCase()}`, name: data.name, code: data.code,
    }))
    ;(factory.facultySubjectRepository.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it("upserts all distinct subjects in a single call", async () => {
    subjectMapFor(codes315, 315)
    const result = await importSubjectsStep(codes315)
    expect(result.stepId).toBe("subjects")
    expect(result.status).toBe("done")
    expect(subjectUpsert()).toHaveBeenCalledTimes(1)
    expect(subjectUpsert().mock.calls[0][0]).toHaveLength(315)
    expect(result.inserted).toBe(315)
    expect(result.existing).toBe(0)
    expect(result.invalid).toHaveLength(0)
    expect(Object.keys(result.subjectCodeToId)).toHaveLength(315)
  })

  it("falls back to name = code for every item", async () => {
    subjectMapFor(codes315, 315)
    await importSubjectsStep(codes315)
    const sent = subjectUpsert().mock.calls[0][0] as { code: string; name: string }[]
    expect(sent.every((s) => s.name === s.code)).toBe(true)
  })

  it("splits created from existing via the repository count", async () => {
    subjectMapFor(codes315, 30)
    const result = await importSubjectsStep(codes315)
    expect(result.inserted).toBe(30)
    expect(result.existing).toBe(285)
  })

  it("trims and dedupes without case-folding, skipping blanks", async () => {
    subjectMapFor(["CS101", "cs101"], 2)
    const result = await importSubjectsStep(["  CS101 ", "CS101", "cs101", "   ", ""])
    expect(subjectUpsert()).toHaveBeenCalledTimes(1)
    expect(subjectUpsert().mock.calls[0][0]).toEqual([
      { code: "CS101", name: "CS101" },
      { code: "cs101", name: "cs101" },
    ])
    expect(result.inserted).toBe(2)
    expect(result.existing).toBe(0)
    expect(result.invalid).toHaveLength(0)
  })

  it("leaves the composed importFacultySubjects path unchanged", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "subj-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan@lyceumalabang.edu.ph", { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))
    const result = await importFacultySubjects([
      { email: "juan@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "UNKNOWN" },
    ])
    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
  })
})

// ── importFacultyUsersStep (stepper step 6) ──────────────────────

describe("importFacultyUsersStep", () => {
  const deptMap = { CCS: "dept-ccs", CAS: "dept-cas" }

  const userEntry = (email: string, id: string) => ({ id, email, name: email.split("@")[0], role: "FACULTY" })

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("creates missing faculty with role FACULTY and department stamping", async () => {
    mockFindUsers(new Map())
    mockCreateUsers(new Map([
      ["juan.delacruz@lyceumalabang.edu.ph", userEntry("juan.delacruz@lyceumalabang.edu.ph", "user-1")],
      ["maria.santos@lyceumalabang.edu.ph", userEntry("maria.santos@lyceumalabang.edu.ph", "user-2")],
    ]))
    const result = await importFacultyUsersStep([
      { email: "juan.delacruz@lyceumalabang.edu.ph", name: "Juan Dela Cruz", departmentCode: "CCS" },
      { email: "maria.santos@lyceumalabang.edu.ph", name: "Maria Santos", departmentCode: "CAS" },
    ], deptMap)
    expect(result.stepId).toBe("faculty-users")
    expect(result.status).toBe("done")
    expect(result.inserted).toBe(2)
    expect(result.existing).toBe(0)
    expect(result.invalid).toHaveLength(0)
    expect(userCreateRepo()).toHaveBeenCalledTimes(1)
    expect(userCreateRepo().mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: "juan.delacruz@lyceumalabang.edu.ph", role: "FACULTY", departmentId: "dept-ccs" }),
      expect.objectContaining({ email: "maria.santos@lyceumalabang.edu.ph", role: "FACULTY", departmentId: "dept-cas" }),
    ]))
    expect(Object.keys(result.facultyUserMap)).toHaveLength(2)
  })

  it("reuses existing faculty without calling createMany", async () => {
    mockFindUsers(new Map([
      ["juan.delacruz@lyceumalabang.edu.ph", userEntry("juan.delacruz@lyceumalabang.edu.ph", "user-1")],
    ]))
    const result = await importFacultyUsersStep([
      { email: "juan.delacruz@lyceumalabang.edu.ph", name: "Juan Dela Cruz", departmentCode: "CCS" },
    ], deptMap)
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(1)
    expect(result.invalid).toHaveLength(0)
    expect(userCreateRepo()).not.toHaveBeenCalled()
    expect(result.facultyUserMap["juan.delacruz@lyceumalabang.edu.ph"]).toBe("user-1")
  })

  it("creates the dummy dept-agnostic", async () => {
    mockFindUsers(new Map())
    mockCreateUsers(new Map([
      [DUMMY_FACULTY_EMAIL, { id: "user-dummy", email: DUMMY_FACULTY_EMAIL, name: "Unassigned Faculty", role: "FACULTY" }],
    ]))
    const result = await importFacultyUsersStep([
      { email: "", name: "", departmentCode: "CCS" },
    ], deptMap)
    expect(result.inserted).toBe(1)
    expect(result.invalid).toHaveLength(0)
    expect(userCreateRepo().mock.calls[0][0]).toEqual([
      expect.objectContaining({ email: DUMMY_FACULTY_EMAIL, name: "Unassigned Faculty", departmentId: undefined }),
    ])
  })

  it("flags off-domain emails invalid and never creates them", async () => {
    mockFindUsers(new Map())
    mockCreateUsers(new Map([
      ["good@lyceumalabang.edu.ph", userEntry("good@lyceumalabang.edu.ph", "user-1")],
    ]))
    const result = await importFacultyUsersStep([
      { email: "good@lyceumalabang.edu.ph", name: "Good", departmentCode: "CCS" },
      { email: "stray@gmail.com", name: "Stray", departmentCode: "CCS" },
    ], deptMap)
    expect(result.invalid).toEqual([{ key: "stray@gmail.com", reason: "Email domain not allowed: stray@gmail.com" }])
    expect(result.inserted).toBe(1)
    expect(result.existing).toBe(0)
    const sent = userCreateRepo().mock.calls[0][0] as { email: string }[]
    expect(sent.map((s) => s.email)).toEqual(["good@lyceumalabang.edu.ph"])
  })

  it("collapses many blank emails onto one dummy user", async () => {
    mockFindUsers(new Map())
    mockCreateUsers(new Map([
      [DUMMY_FACULTY_EMAIL, { id: "user-dummy", email: DUMMY_FACULTY_EMAIL, name: "Unassigned Faculty", role: "FACULTY" }],
    ]))
    const blanks = Array.from({ length: 902 }, () => ({ email: "", name: "", departmentCode: "CCS" }))
    const result = await importFacultyUsersStep(blanks, deptMap)
    expect(userCreateRepo()).toHaveBeenCalledTimes(1)
    expect(userCreateRepo().mock.calls[0][0]).toHaveLength(1)
    expect(result.inserted).toBe(1)
    expect(result.existing).toBe(0)
    expect(Object.keys(result.facultyUserMap)).toHaveLength(1)
  })
})

// ── importMappingsStep (UI Step 6 Faculty Loading) ──────────────

describe("importMappingsStep", () => {
  const maps = {
    sectionKeyToId: { "32A3|BSIT": "sec-1", "21B|BSCS": "sec-2" },
    subjectCodeToId: { CS101: "sub-1", MATH201: "sub-2" },
    facultyUserMap: {
      "juan.delacruz@lyceumalabang.edu.ph": "user-1",
      "maria.santos@lyceumalabang.edu.ph": "user-2",
      [DUMMY_FACULTY_EMAIL]: "user-dummy",
    },
  }
  const fsList = () => factory.facultySubjectRepository.list as ReturnType<typeof vi.fn>
  const fsCreate = () => factory.facultySubjectRepository.create as ReturnType<typeof vi.fn>
  const fsUpdate = () => factory.facultySubjectRepository.update as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    fsList().mockResolvedValue([])
    fsCreate().mockResolvedValue({ id: "fs-new" })
    fsUpdate().mockResolvedValue({ id: "fs-1" })
  })

  it("maps slots on a fresh DB", async () => {
    const result = await importMappingsStep([
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
      { subjectCode: "MATH201", sectionName: "21B", sectionProgram: "BSCS", facultyEmail: "maria.santos@lyceumalabang.edu.ph" },
    ], maps, "sem-1")
    expect(result.stepId).toBe("mappings")
    expect(result.status).toBe("done")
    expect(result.inserted).toBe(2)
    expect(result.existing).toBe(0)
    expect(result.invalid).toHaveLength(0)
    expect(fsCreate()).toHaveBeenCalledTimes(2)
    expect(fsCreate()).toHaveBeenCalledWith(expect.objectContaining({ faculty_id: "user-1", subject_id: "sub-1", section_id: "sec-1", semesterId: "sem-1" }))
  })

  it("re-run is fully idempotent", async () => {
    fsList().mockResolvedValue([
      { id: "fs-1", faculty_id: "user-1", subject_id: "sub-1", section_id: "sec-1", semesterId: "sem-1" },
      { id: "fs-2", faculty_id: "user-2", subject_id: "sub-2", section_id: "sec-2", semesterId: "sem-1" },
    ])
    fsCreate().mockRejectedValue({ code: "23505" })
    const result = await importMappingsStep([
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
      { subjectCode: "MATH201", sectionName: "21B", sectionProgram: "BSCS", facultyEmail: "maria.santos@lyceumalabang.edu.ph" },
    ], maps, "sem-1")
    expect(result.inserted).toBe(0)
    expect(result.existing).toBe(2)
    expect(result.invalid).toHaveLength(0)
  })

  it("duplicates collapse through comboMap", async () => {
    const result = await importMappingsStep([
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
    ], maps, "sem-1")
    expect(result.inserted).toBe(1)
    expect(fsCreate()).toHaveBeenCalledTimes(1)
  })

  it("real beats dummy", async () => {
    const result = await importMappingsStep([
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "" },
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
    ], maps, "sem-1")
    expect(result.inserted).toBe(1)
    expect(fsCreate()).toHaveBeenCalledTimes(1)
    expect(fsCreate()).toHaveBeenCalledWith(expect.objectContaining({ faculty_id: "user-1" }))
  })

  it("dummy-held slot is updated to the real faculty on conflict", async () => {
    fsList().mockResolvedValue([
      { id: "fs-1", faculty_id: "user-dummy", subject_id: "sub-1", section_id: "sec-1", semesterId: "sem-1" },
    ])
    fsCreate().mockRejectedValue({ code: "23505" })
    const result = await importMappingsStep([
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
    ], maps, "sem-1")
    expect(fsUpdate()).toHaveBeenCalledWith("fs-1", { faculty_id: "user-1" })
    expect(result.inserted).toBe(1)
    expect(result.invalid).toHaveLength(0)
  })

  it("real vs real is refused and existing is unchanged", async () => {
    fsList().mockResolvedValue([
      { id: "fs-1", faculty_id: "user-2", subject_id: "sub-1", section_id: "sec-1", semesterId: "sem-1" },
    ])
    fsCreate().mockRejectedValue({ code: "23505" })
    const result = await importMappingsStep([
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
    ], maps, "sem-1")
    expect(fsUpdate()).not.toHaveBeenCalled()
    expect(result.invalid).toEqual([expect.objectContaining({ reason: "Already assigned — not overwritten (existing load kept)" })])
  })

  it("blank faculty resolves to the dummy slot", async () => {
    const result = await importMappingsStep([
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "" },
    ], maps, "sem-1")
    expect(result.inserted).toBe(1)
    expect(fsCreate()).toHaveBeenCalledWith(expect.objectContaining({ faculty_id: "user-dummy" }))
  })

  it("unresolved subject/section/faculty are flagged invalid", async () => {
    const result = await importMappingsStep([
      { subjectCode: "NOPE", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
      { subjectCode: "CS101", sectionName: "ZZ", sectionProgram: "BSIT", facultyEmail: "juan.delacruz@lyceumalabang.edu.ph" },
      { subjectCode: "CS101", sectionName: "32A3", sectionProgram: "BSIT", facultyEmail: "ghost@lyceumalabang.edu.ph" },
    ], maps, "sem-1")
    expect(result.inserted).toBe(0)
    expect(result.invalid).toHaveLength(3)
    expect(fsCreate()).not.toHaveBeenCalled()
  })

  it("leaves the composed importFacultySubjects path unchanged", async () => {
    mockSubjectUpsert(new Map([["CS101", { id: "sub-1" }]]), 0)
    mockSectionUpsert(new Map([["32A3|BSIT", { id: "sec-1" }]]), 0)
    mockFindUsers(new Map([["juan.delacruz@lyceumalabang.edu.ph", { id: "user-1", email: "juan.delacruz@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }]]))
    fsList().mockResolvedValue([])
    const result = await importFacultySubjects([
      { email: "juan.delacruz@lyceumalabang.edu.ph", name: "Juan", subjectCode: "CS101", subjectName: "CS", sectionName: "32A3", sectionProgram: "BSIT", departmentCode: "CCS" },
    ], "sem-1")
    expect(result.matched).toBe(1)
    expect(result.errors).toHaveLength(0)
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

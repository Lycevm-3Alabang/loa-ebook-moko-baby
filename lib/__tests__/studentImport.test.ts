import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the factory BEFORE importing the module under test. All repository
// shapes match the real interfaces; the fixtures below stand in for what the
// FACULTY import leaves behind, so the STUDENT import is exercised against
// realistic residue rather than empty tables.
vi.mock("@/lib/repositories/factory", () => ({
  subjectRepository: {
    findByCode: vi.fn(),
  },
  sectionRepository: {
    findByNameAndProgram: vi.fn(),
  },
  userRepository: {
    findManyByEmail: vi.fn(),
    createMany: vi.fn(),
  },
  facultySubjectRepository: {
    findBySubjectSectionAndFaculty: vi.fn(),
    findBySubjectAndSection: vi.fn(),
  },
  studentEnrollmentRepository: {
    addEnrollments: vi.fn(),
  },
}))

import { importStudents } from "@/lib/services/studentImport"
import * as factory from "@/lib/repositories/factory"

// ── Fixtures: what the FACULTY csv leaves in the database ──────────
const SUBJ = { id: "subj-1", code: "CS101" }
const SEC = { id: "sec-1", name: "41M2", program: "BSIE" }
const FACULTY = { id: "user-1", email: "juan@lyceumalabang.edu.ph", name: "Juan", role: "FACULTY" }
const MAPPING = { id: "fs-1", subject_id: SUBJ.id, section_id: SEC.id, faculty_id: FACULTY.id }

const STUDENT_EMAIL = "keith@itmlyceumalabang.onmicrosoft.com"

function baseStudentRow(overrides: Partial<{
  email: string; name: string; subjectCode: string; sectionName: string;
  sectionProgram: string; facultyEmail?: string; departmentId?: string | null
}> = {}) {
  return {
    email: STUDENT_EMAIL,
    name: "Keith",
    subjectCode: "CS101",
    sectionName: "41M2",
    sectionProgram: "BSIE",
    facultyEmail: "juan@lyceumalabang.edu.ph",
    departmentId: "dept-1",
    ...overrides,
  }
}

// ── Arrange: the faculty import's residue ─────────────────────────
function arrangeTables(options: {
  students?: Map<string, { id: string; email: string; name: string; role: string }>
  subject?: { id: string; code: string } | null
  section?: { id: string; name: string; program: string } | null
  namedMapping?: { id: string } | null
  slotMapping?: { id: string } | null
  facultyUsers?: Map<string, { id: string; email: string; name: string; role: string }>
} = {}) {
  const students = options.students ?? new Map()
  const facultyUsers = options.facultyUsers ?? new Map([[FACULTY.email.toLowerCase(), FACULTY]])
  const created = new Map<string, { id: string; email: string; name: string; role: string }>()

  ;(factory.subjectRepository.findByCode as ReturnType<typeof vi.fn>)
    .mockImplementation(async (code: string) =>
      options.subject != null && options.subject.code === code ? options.subject : null)
  ;(factory.sectionRepository.findByNameAndProgram as ReturnType<typeof vi.fn>)
    .mockImplementation(async (name: string, program: string) =>
      options.section != null && options.section.name === name && options.section.program === program ? options.section : null)
  ;(factory.userRepository.findManyByEmail as ReturnType<typeof vi.fn>)
    .mockImplementation(async (emails: string[]) => {
      const map = new Map<string, { id: string; email: string; name: string; role: string }>()
      for (const e of emails) {
        const norm = e.toLowerCase()
        const source = [students, facultyUsers].find((m) => m.has(norm))
        const user = source?.get(norm)
        if (user) map.set(norm, user)
      }
      return map
    })
  ;(factory.userRepository.createMany as ReturnType<typeof vi.fn>)
    .mockImplementation(async (rows: { email: string; name: string; role: string }[]) => {
      const map = new Map<string, { id: string; email: string; name: string; role: string }>()
      rows.forEach((r, i) => {
        const user = { id: `stu-${i + 1}`, email: r.email, name: r.name, role: r.role }
        map.set(r.email.toLowerCase(), user)
        created.set(r.email.toLowerCase(), user)
      })
      return map
    })
  ;(factory.facultySubjectRepository.findBySubjectSectionAndFaculty as ReturnType<typeof vi.fn>)
    .mockImplementation(async () => options.namedMapping === undefined ? MAPPING : options.namedMapping)
  ;(factory.facultySubjectRepository.findBySubjectAndSection as ReturnType<typeof vi.fn>)
    .mockImplementation(async () => options.slotMapping === undefined ? MAPPING : options.slotMapping)
  ;(factory.studentEnrollmentRepository.addEnrollments as ReturnType<typeof vi.fn>)
    .mockResolvedValue({ inserted: 0, skipped: 0 })

  return { created }
}

const asFn = (repo: unknown, method: string) =>
  (repo as Record<string, ReturnType<typeof vi.fn>>)[method]

beforeEach(() => {
  vi.resetAllMocks()
})

// ═══ The two-file flow ════════════════════════════════════════════

describe("importStudents — faculty inserts prerequisites, student looks them up", () => {
  it("enrols a named-faculty row when the mapping the faculty import created exists", async () => {
    arrangeTables({
      subject: SUBJ,
      section: SEC,
      namedMapping: MAPPING,
    })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.enrolled).toBe(1)
    expect(result.failed).toHaveLength(0)
    expect(factory.facultySubjectRepository.findBySubjectSectionAndFaculty)
      .toHaveBeenCalledWith(SUBJ.id, SEC.id, FACULTY.id)
    expect(factory.facultySubjectRepository.findBySubjectAndSection).not.toHaveBeenCalled()
  })

  it("enrols a blank-faculty row via the subject+section mapping — the slice-3 fallback", async () => {
    arrangeTables({
      subject: SUBJ,
      section: SEC,
      // Named lookup must not be consulted: facultyEmail is blank.
      namedMapping: null,
      slotMapping: MAPPING,
    })

    const result = await importStudents(
      [baseStudentRow({ facultyEmail: undefined })], null, null,
    )

    expect(result.enrolled).toBe(1)
    expect(result.failed).toHaveLength(0)
    // Proof the fallback ran, not the exact-match path.
    expect(factory.facultySubjectRepository.findBySubjectAndSection)
      .toHaveBeenCalledWith(SUBJ.id, SEC.id)
    expect(factory.facultySubjectRepository.findBySubjectSectionAndFaculty).not.toHaveBeenCalled()
  })

  it("still fails a blank-faculty row when no mapping owns that slot", async () => {
    arrangeTables({
      subject: SUBJ,
      section: SEC,
      namedMapping: null,
      slotMapping: null,
    })

    const result = await importStudents(
      [baseStudentRow({ facultyEmail: undefined })], null, null,
    )

    expect(result.enrolled).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].remark).toContain("No faculty assigned to CS101 in BSIE-41M2")
  })

  it("fails a named-faculty row whose mapping is missing", async () => {
    arrangeTables({
      subject: SUBJ,
      section: SEC,
      namedMapping: null,
    })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.enrolled).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].remark).toContain("juan@lyceumalabang.edu.ph not assigned to CS101 in BSIE-41M2")
  })
})

// ═══ Hard-block rules the client preview mirrors ══════════════════

describe("importStudents — no-pass rows (server half of the preview contract)", () => {
  it.each([
    ["blank email", { email: "" }, "Email is required"],
    ["off-domain email", { email: "someone@gmail.com" }, "Email domain not allowed"],
  ])("fails a row with %s", async (_label, override, expectedRemark) => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const result = await importStudents([baseStudentRow(override)], null, null)

    expect(result.enrolled).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].remark).toContain(expectedRemark)
  })

  it("fails a row whose subject the faculty import did not create", async () => {
    arrangeTables({ subject: null, section: SEC, slotMapping: MAPPING })

    const result = await importStudents(
      [baseStudentRow({ subjectCode: "NOPE-999" })], null, null,
    )

    expect(result.enrolled).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].remark).toContain('Subject "NOPE-999" not found')
  })

  it("fails a row whose section the faculty import did not create", async () => {
    arrangeTables({ subject: SUBJ, section: null, slotMapping: MAPPING })

    const result = await importStudents(
      [baseStudentRow({ sectionName: "XX-1" })], null, null,
    )

    expect(result.enrolled).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].remark).toContain('Section "BSIE-XX-1" not found')
  })
})

// ═══ STUDENT account creation (the student path's only write besides enrollments) ═══

describe("importStudents — student accounts", () => {
  it("creates a missing student once, stamped with the looked-up department", async () => {
    const { created } = arrangeTables({
      subject: SUBJ, section: SEC, slotMapping: MAPPING,
    })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.enrolled).toBe(1)
    expect(result.created).toHaveLength(1)
    expect(created.has(STUDENT_EMAIL)).toBe(true)
    expect(factory.userRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        email: STUDENT_EMAIL,
        name: "Keith",
        role: "STUDENT",
        departmentId: "dept-1",
      }),
    ])
  })

  it("creates one student row only when the same student appears twice", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const result = await importStudents(
      [baseStudentRow(), baseStudentRow({ facultyEmail: undefined })], null, null,
    )

    expect(result.created).toHaveLength(1)
    expect(result.enrolled).toBe(2)
  })
})

// ═══ Enrollment write ═════════════════════════════════════════════

describe("importStudents — enrollments", () => {
  it("passes the resolved mapping through to addEnrollments", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    await importStudents([baseStudentRow({ facultyEmail: undefined })], null, null)

    expect(factory.studentEnrollmentRepository.addEnrollments).toHaveBeenCalledWith([
      expect.objectContaining({
        section_id: SEC.id,
        faculty_subject_id: MAPPING.id,
      }),
    ])
  })

  it("skips nothing when the database reports no duplicates", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.enrolled).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it("does not call addEnrollments when every row fails", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const result = await importStudents(
      [baseStudentRow({ email: "" })], null, null,
    )

    expect(result.enrolled).toBe(0)
    expect(factory.studentEnrollmentRepository.addEnrollments).not.toHaveBeenCalled()
  })
})

// Sanity guard: keep the helper exported shape honest for future edits.
describe("asFn helper", () => {
  it("resolves a repository method", () => {
    const fn = asFn(factory.subjectRepository, "findByCode")
    expect(typeof fn).toBe("function")
  })
})

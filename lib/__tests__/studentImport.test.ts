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
    findManyBySubjectSectionIds: vi.fn(),
  },
  studentEnrollmentRepository: {
    addEnrollments: vi.fn(),
  },
}))

import { importStudents } from "@/lib/services/studentImport"
import { reasonRemarks } from "@/lib/csv-utils"
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
  // Both the named-faculty path and the blank-faculty path now resolve from ONE
  // batched read. Either option set means a slot exists; the row is owned by
  // FACULTY so the named-faculty assertion still holds.
  ;(factory.facultySubjectRepository.findManyBySubjectSectionIds as ReturnType<typeof vi.fn>)
    .mockImplementation(async (subjectIds: string[], sectionIds: string[]) => {
      if (options.namedMapping == null && options.slotMapping == null) return []
      if (!subjectIds.includes(SUBJ.id) || !sectionIds.includes(SEC.id)) return []
      return [{ id: MAPPING.id, subject_id: SUBJ.id, section_id: SEC.id, faculty_id: FACULTY.id, semesterId: null }]
    })
  ;(factory.studentEnrollmentRepository.addEnrollments as ReturnType<typeof vi.fn>)
    .mockResolvedValue({ inserted: 0, skipped: 0, skippedItems: [] })

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
    // ONE batched read for the whole chunk, not one await per row.
    expect(factory.facultySubjectRepository.findManyBySubjectSectionIds).toHaveBeenCalledTimes(1)
    expect(factory.facultySubjectRepository.findManyBySubjectSectionIds)
      .toHaveBeenCalledWith([SUBJ.id], [SEC.id])
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
    // The blank-faculty path resolves from the SAME single batched read.
    expect(factory.facultySubjectRepository.findManyBySubjectSectionIds).toHaveBeenCalledTimes(1)
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
    // Spec-mandated copy: the ledger remark spells out the allowed domains
    // (ledger-reason-codes.md §2.1) rather than the old terse "not allowed".
    ["off-domain email", { email: "someone@gmail.com" }, reasonRemarks("EMAIL_DOMAIN_NOT_ALLOWED")],
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

  it("creates one student row and ONE enrollment when the same student+topic repeats", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const result = await importStudents(
      [baseStudentRow(), baseStudentRow({ facultyEmail: undefined })], null, null,
    )

    // The student is created once…
    expect(result.created).toHaveLength(1)
    // …and the repeated row is collapsed, NOT counted as a second enrollment.
    // The pre-fix assertion here was `enrolled).toBe(2)` — i.e. it asserted two
    // copies of one (student, faculty_subject, semester) tuple, which is exactly
    // what made the multi-row INSERT raise 23505 in production.
    expect(result.enrolled).toBe(1)
    expect(result.duplicateRows).toHaveLength(1)
    expect(result.skipped).toBe(1)
    expect(factory.studentEnrollmentRepository.addEnrollments).toHaveBeenCalledTimes(1)
    expect(factory.studentEnrollmentRepository.addEnrollments).toHaveBeenCalledWith([
      expect.objectContaining({ student_id: "stu-1", faculty_subject_id: MAPPING.id }),
    ])
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

// ═══ D7: the mapping read is per-chunk, not per-row ═══════════════

describe("importStudents — batched faculty-subject resolution", () => {
  it("reads the slot map ONCE for many rows sharing it", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const rows = Array.from({ length: 20 }, (_, i) =>
      baseStudentRow({ email: `student${i}@itmlyceumalabang.onmicrosoft.com` }),
    )

    await importStudents(rows, null, null)

    // The pre-D7 shape awaited one findBySubjectSectionAndFaculty per row, so
    // this would have been 20 calls — each a PostgREST round trip.
    expect(factory.facultySubjectRepository.findManyBySubjectSectionIds).toHaveBeenCalledTimes(1)
    expect(factory.facultySubjectRepository.findBySubjectSectionAndFaculty).not.toHaveBeenCalled()
    expect(factory.facultySubjectRepository.findBySubjectAndSection).not.toHaveBeenCalled()
  })

  it("does not call the per-row finders at all", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    await importStudents([baseStudentRow()], null, null)

    expect(factory.facultySubjectRepository.findBySubjectSectionAndFaculty).not.toHaveBeenCalled()
    expect(factory.facultySubjectRepository.findBySubjectAndSection).not.toHaveBeenCalled()
  })

  it("picks the ACTIVE semester's slot, never another term's", async () => {
    // Two rows for one pair — one per semester, which UNIQUE(subject, section,
    // "semesterId") permits. Register the active semester's owner.
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    ;(factory.facultySubjectRepository.findManyBySubjectSectionIds as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { id: "fs-2026-1", subject_id: SUBJ.id, section_id: SEC.id, faculty_id: FACULTY.id, semesterId: "sem-2026-1" },
        { id: "fs-2026-2", subject_id: SUBJ.id, section_id: SEC.id, faculty_id: "other-faculty", semesterId: "sem-2026-2" },
      ])

    const result = await importStudents([baseStudentRow()], null, "sem-2026-1")

    expect(result.enrolled).toBe(1)
    expect(factory.studentEnrollmentRepository.addEnrollments).toHaveBeenCalledWith([
      expect.objectContaining({ faculty_subject_id: "fs-2026-1", semesterId: "sem-2026-1" }),
    ])
  })

  it("falls back to a legacy null-semester slot when the active term has none", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    ;(factory.facultySubjectRepository.findManyBySubjectSectionIds as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { id: "fs-legacy", subject_id: SUBJ.id, section_id: SEC.id, faculty_id: FACULTY.id, semesterId: null },
      ])

    const result = await importStudents([baseStudentRow()], null, "sem-2026-2")

    expect(result.enrolled).toBe(1)
    expect(factory.studentEnrollmentRepository.addEnrollments).toHaveBeenCalledWith([
      expect.objectContaining({ faculty_subject_id: "fs-legacy" }),
    ])
    // A null-semester mapping resolves via fallback, so it is NOT a term mismatch.
    expect(result.termMismatch).toBeNull()
  })

  it("surfaces a term mismatch when the mappings belong to an inactive semester", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    // Every mapping is stamped with a term other than the active one.
    ;(factory.facultySubjectRepository.findManyBySubjectSectionIds as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { id: "fs-old", subject_id: SUBJ.id, section_id: SEC.id, faculty_id: FACULTY.id, semesterId: "sem-2026-1" },
      ])

    const result = await importStudents([baseStudentRow()], null, "sem-2026-2")

    // The row fails with its specific reason, as before…
    expect(result.enrolled).toBe(0)
    expect(result.failed[0].remark).toContain("not assigned to CS101 in BSIE-41M2")
    // …AND the run says why, so the admin is not sent hunting for a typo.
    expect(result.termMismatch).toEqual({
      mappedTerms: ["sem-2026-1"],
      activeTerm: "sem-2026-2",
    })
  })

  it("does not report a mismatch when the active term's mappings are present", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    ;(factory.facultySubjectRepository.findManyBySubjectSectionIds as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { id: "fs-active", subject_id: SUBJ.id, section_id: SEC.id, faculty_id: FACULTY.id, semesterId: "sem-2026-2" },
      ])

    const result = await importStudents([baseStudentRow()], null, "sem-2026-2")

    expect(result.enrolled).toBe(1)
    expect(result.termMismatch).toBeNull()
  })

  it("fails the row when the active term has no slot and no legacy one", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    ;(factory.facultySubjectRepository.findManyBySubjectSectionIds as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { id: "fs-2026-1", subject_id: SUBJ.id, section_id: SEC.id, faculty_id: FACULTY.id, semesterId: "sem-2026-1" },
      ])

    const result = await importStudents([baseStudentRow()], null, "sem-2026-2")

    expect(result.enrolled).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].remark).toContain("not assigned to CS101 in BSIE-41M2")
  })
})

// Sanity guard: keep the helper exported shape honest for future edits.
describe("asFn helper", () => {
  it("resolves a repository method", () => {
    const fn = asFn(factory.subjectRepository, "findByCode")
    expect(typeof fn).toBe("function")
  })
})

// ═══ D3: reason codes at the reject sites ══════════════════════════

describe("importStudents — reason codes (D3)", () => {
  it("stamps SUBJECT_NOT_FOUND and a vocabulary-identical remark", async () => {
    arrangeTables({ subject: null, section: SEC, slotMapping: MAPPING })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].reasonCode).toBe("SUBJECT_NOT_FOUND")
    expect(result.failed[0].remark).toBe(reasonRemarks("SUBJECT_NOT_FOUND", { code: "CS101" }))
  })

  it("stamps SECTION_NOT_FOUND", async () => {
    arrangeTables({ subject: SUBJ, section: null, slotMapping: MAPPING })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.failed[0].reasonCode).toBe("SECTION_NOT_FOUND")
    expect(result.failed[0].remark).toBe(reasonRemarks("SECTION_NOT_FOUND", { section: "BSIE-41M2" }))
  })

  it("stamps FACULTY_NOT_FOUND for an unknown named faculty", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING, facultyUsers: new Map() })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.failed[0].reasonCode).toBe("FACULTY_NOT_FOUND")
    expect(result.failed[0].remark).toBe(reasonRemarks("FACULTY_NOT_FOUND", { email: FACULTY.email }))
  })

  it("stamps FACULTY_NOT_ASSIGNED when the slot belongs to someone else", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, namedMapping: null })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.failed[0].reasonCode).toBe("FACULTY_NOT_ASSIGNED")
    expect(result.failed[0].remark).toBe(reasonRemarks("FACULTY_NOT_ASSIGNED", { email: FACULTY.email, subject: "CS101", section: "BSIE-41M2" }))
  })

  it("stamps NO_FACULTY_ASSIGNED on the blank-faculty fallback", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, namedMapping: null, slotMapping: null })

    const result = await importStudents([baseStudentRow({ facultyEmail: undefined })], null, null)

    expect(result.failed[0].reasonCode).toBe("NO_FACULTY_ASSIGNED")
  })

  it("stamps EXCEL_ERROR_CELL with the offender column in the remark", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const result = await importStudents([baseStudentRow({ name: "#VALUE!" })], null, null)

    expect(result.failed[0].reasonCode).toBe("EXCEL_ERROR_CELL")
    expect(result.failed[0].remark).toMatch(/^Invalid value in .+ \(Excel error\)$/)
  })
})

// ═══ D3: already-persisted join + in-file duplicates ═══════════════

describe("importStudents — already-persisted and duplicates (D3)", () => {
  it("joins repo-skipped keys back to source rows as ALREADY_PERSISTED", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    // The repo reports this exact (student, faculty_subject, semester) key as
    // already in the database — the enrollment exists, the row did not insert.
    asFn(factory.studentEnrollmentRepository, "addEnrollments")
      .mockResolvedValue({ inserted: 0, skipped: 1, skippedItems: [{ student_id: "stu-1", faculty_subject_id: MAPPING.id, section_id: SEC.id }] })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.alreadyPersisted).toHaveLength(1)
    expect(result.alreadyPersisted[0].row).toBe(1)
    expect(result.alreadyPersisted[0].reasonCode).toBe("ALREADY_PERSISTED")
  })

  it("marks in-file repeats DUPLICATE_IN_FILE pointing at the first row", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })

    const result = await importStudents([baseStudentRow(), baseStudentRow()], null, null)

    expect(result.enrolled).toBe(1)
    expect(result.duplicateRows).toHaveLength(1)
    expect(result.duplicateRows[0].reasonCode).toBe("DUPLICATE_IN_FILE")
    expect(result.duplicateRows[0].remark).toBe(reasonRemarks("DUPLICATE_IN_FILE", { row: "1" }))
  })

  it("reports rows actually written, distinct from rows resolved", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    // A re-run: the repo finds the key already present, so nothing is written.
    asFn(factory.studentEnrollmentRepository, "addEnrollments")
      .mockResolvedValue({ inserted: 0, skipped: 1, skippedItems: [{ student_id: "stu-1", faculty_subject_id: MAPPING.id, section_id: SEC.id }] })

    const result = await importStudents([baseStudentRow()], null, null)

    // Resolved but NOT written — the pair that makes idempotency visible.
    expect(result.enrolled).toBe(1)
    expect(result.inserted).toBe(0)
  })

  it("counts a fresh write in inserted", async () => {
    arrangeTables({ subject: SUBJ, section: SEC, slotMapping: MAPPING })
    asFn(factory.studentEnrollmentRepository, "addEnrollments")
      .mockResolvedValue({ inserted: 1, skipped: 0, skippedItems: [] })

    const result = await importStudents([baseStudentRow()], null, null)

    expect(result.enrolled).toBe(1)
    expect(result.inserted).toBe(1)
  })
})

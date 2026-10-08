import { cleanSubjectCode, isExcelErrorCell } from "@/lib/csv-utils"
import type { FacultyMapping } from "./types"

export type CsvRow = { email: string; name: string; subjectCode: string; subjectName: string; section: string; departmentCode: string }

export interface CsvRowWithFlags extends CsvRow {
  isNewSubject: boolean
  isNewSection: boolean
  isNewTeacher: boolean
  isUnassignedFaculty: boolean
  isInvalidDept: boolean
  isExistingMapping: boolean
  isInvalidValue: boolean
}

export interface CsvFlagContext {
  existingMappings: FacultyMapping[]
  validDeptCodes: string[]
  subjectCodes: string[]
  sectionPairs: { name: string; program: string }[]
  facultyEmails: string[]
}

export const DUMMY_FACULTY_EMAIL_CLIENT = "placeholder@lyceumalabang.edu.ph"

export function deriveCsvFlags(rows: CsvRow[], ctx: CsvFlagContext): CsvRowWithFlags[] {
  const existingKeys = new Set(
    ctx.existingMappings.map(
      (m) => `${(m.faculty.email || "").toLowerCase().trim()}|${(m.subject.code || "").trim()}|${(m.section.program || "").trim()}-${(m.section.name || "").trim()}`,
    ),
  )
  const validDeptSet = new Set(ctx.validDeptCodes.map((c) => (c || "").trim().toUpperCase()))
  const subjectSet = new Set(ctx.subjectCodes.map((c) => (c || "").trim()))
  const sectionPairs = ctx.sectionPairs.map((s) => ({ name: (s.name || "").trim(), program: (s.program || "").trim() }))
  const emailSet = new Set(ctx.facultyEmails.map((e) => (e || "").toLowerCase().trim()))

  return rows.map((r) => {
    const tEmail = (r.email || "").trim()
    const tName = (r.name || "").trim()
    const tSubjectCode = cleanSubjectCode(r.subjectCode || "")
    const tSubjectName = (r.subjectName || "").trim()
    const tSection = (r.section || "").trim()
    const tDept = (r.departmentCode || "").trim().toUpperCase()
    const dashIdx = tSection.indexOf("-")
    const spaceIdx = tSection.indexOf(" ")
    const idx = dashIdx !== -1 ? dashIdx : spaceIdx
    const sectionProgram = idx === -1 ? "" : tSection.slice(0, idx).trim()
    const sectionName = idx === -1 ? tSection : tSection.slice(idx + 1).trim()
    const loweredEmail = tEmail.toLowerCase()
    const isEmptyEmail = loweredEmail.length === 0
    const isDummyEmail = loweredEmail === DUMMY_FACULTY_EMAIL_CLIENT
    const isUnassigned = isEmptyEmail || isDummyEmail
    // Narrow translation (seed parity): an Excel-error NAME on an unassigned row
    // becomes "Unassigned Faculty" via the dummy — not blocked. All other
    // Excel-error cells (including email itself) stay invalid.
    const isInvalidValue = [tEmail, tSubjectCode, tSubjectName, tSection, tDept].some((c) =>
      isExcelErrorCell(c || ""),
    ) || (!isUnassigned && isExcelErrorCell(tName || ""))
    return {
      email: tEmail,
      name: isUnassigned && isExcelErrorCell(tName || "") ? "Unassigned Faculty" : tName,
      subjectCode: tSubjectCode,
      subjectName: tSubjectName,
      section: tSection,
      departmentCode: tDept,
      isNewSubject: !subjectSet.has(tSubjectCode),
      isNewSection: !sectionPairs.some((s) => s.name === sectionName && s.program === sectionProgram),
      isNewTeacher: isUnassigned ? false : !emailSet.has(loweredEmail),
      isUnassignedFaculty: isUnassigned,
      isInvalidValue,
      isInvalidDept: !validDeptSet.has(tDept),
      isExistingMapping: existingKeys.has(`${loweredEmail}|${tSubjectCode}|${tSection}`),
    }
  })
}

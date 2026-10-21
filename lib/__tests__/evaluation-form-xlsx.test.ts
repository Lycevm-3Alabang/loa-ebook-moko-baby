import { describe, it, expect } from "vitest"
import {
  buildEvaluationWorkbook,
  assertRubricFitsTemplate,
  FormRubricMismatchError,
  orDash,
  type EvalFormCriterion,
  type EvalFormInput,
} from "@/lib/evaluation-form-xlsx"
import {
  readZip,
  partText,
  readSharedStrings,
  readCellText,
  deriveFormPositions,
  loadEvalTemplate,
  SHEET_COMMENTS,
  SHEET_INDIVIDUAL,
  SHEET_OVERALL,
} from "@/lib/xlsx-template"

/** The rubric the seeded app carries: 8 criteria, 3.6.4.4.4.4.3.6 statements. */
const CRITERIA: EvalFormCriterion[] = [
  { name: "Professional Manner", average: 4.35, statements: [
    { text: "The professor has always dressed appropriately and is well groomed.", avg: 4.4 },
    { text: "He/she behaves appropriately at all times.", avg: 4.3 },
    { text: "He/she shows composure, exude confidence, and displays a good sense of humor.", avg: 4.35 },
  ] },
  { name: "Communication with Students", average: 4.2, statements: [
    { text: "The professors appropriately/immediately responds when students communicate (timely response to the students).", avg: 4.5 },
    { text: "He/she gives positive and specific feedback to students, which reinforces behaviour and helps them understand how to improve and makes progress.", avg: 4.2 },
    { text: "3 He/she guides the direction of the discussion.", avg: 4.1 },
    { text: "4. He/she spcifies how learning tasks will be evaluated (if appropriate).", avg: 4.0 },
    { text: "5. He/she seeks feedback from students on lesson and on ease of online technology and accesssibility of course.", avg: 4.1 },
    { text: "6. He/she shows good subject knowledge and understanding which engages students' creativity and sense of humor during the discussion.", avg: 4.2 },
  ] },
  { name: "Student Engagement", average: 4.1, statements: [
    { text: "The professor uses active-learning excercises in balance with a teacher-led presentation appropriate to the lesson.", avg: 4.2 },
    { text: "Before sending students to active learning tasks (group work, paired discussions, polling, team problem-sovling, in-class writing), the professor provides explicit modeling and clear instructions (eg rationale, duration, product).", avg: 4.1 },
    { text: "Instructor creates opportunities for interaction between students (breakout rooms, use of chat, collaborative google docs).", avg: 4.0 },
    { text: "It is evident that professor is present, proactive, and engaged (if webcam on, is clearly visible and facing camera, keeps an eye on chat or Q&A, monitors waiting room, turs on/off mute as needed, minimal distractions.", avg: 4.1 },
  ] },
  { name: "Learning Materials", average: 4.15, statements: [
    { text: "The professor prepared and uses technology appropriate for the lesson, and gathers needed links and presentations before the start of class.", avg: 4.2 },
    { text: "The professor provides relevant instructional materials with clear instructions.", avg: 4.2 },
    { text: "The materials are made available to help students who cannot attend online classes or have technical difficulties.", avg: 4.1 },
    { text: "The professor presents course material in a clear mannerl that facilitates understanding.", avg: 4.15 },
  ] },
  { name: "Time Management", average: 4.3, statements: [
    { text: "The professor starts and ends the class session on time.", avg: 4.4 },
    { text: "He/she allows time for questions, discussion and/or summarizing the session's lesson.", avg: 4.3 },
    { text: "He/she maximizes in-class time, using active learning or applications.", avg: 4.2 },
    { text: "He/she clearly indicates time limits for all student activities, using a time-based agenda, or visual and auditory prompts.", avg: 4.3 },
  ] },
  { name: "Experiential Learning Provided to Students", average: 4.1, statements: [
    { text: "The professor utilizes appropriate tools and materials to motivate learners (e.g. interactive or competitive games, music, video, etc).", avg: 4.2 },
    { text: "He/she builds in-pauses in the lesson to provide opportunities for students to ask questions and promptly responds to questions.", avg: 4.1 },
    { text: "He/she arouses students' interest with relevant life-learning skills (relatable stories).", avg: 4.0 },
    { text: "He/she provide opportunities for students to take responsibility.", avg: 4.1 },
  ] },
  { name: "Respect the Uniqueness of the Students", average: 4.25, statements: [
    { text: "The professor shows consideration and provides opportunities to students.", avg: 4.3 },
    { text: "He/she draws non-participating students into activities/ discussions and prevents specific students from dominating/ monopolizing activities/ discussions.", avg: 4.2 },
    { text: "3. Addresses potentially disruptive behaviours before they impact learning environment.", avg: 4.25 },
  ] },
  { name: "Assessment and Feedback", average: 4.3, statements: [
    { text: "1.The professor provides class generalized constructive and encouraging feedback on how to improve their comprehension or perforance in class.", avg: 4.4 },
    { text: "2. He/she attends respectfully to student's comprehension or confusion.", avg: 4.3 },
    { text: "3. He/she shows evidence of reinforcement (such as token or certificate, positive points) appropriate to remote or online contexts.", avg: 4.2 },
    { text: "4. His/her assessments are suitable for distance learning environment (different tools, roleplay, written activity and others.", avg: 4.3 },
    { text: "5. He/she assesses students both informally and formally within the online or remote classroom through use of games, quizzes, online tests, etc.", avg: 4.3 },
    { text: "6. He/she provides immediate feedback.", avg: 4.4 },
  ] },
]

const INPUT: EvalFormInput = {
  employeeNo: "2024-0017",
  facultyName: "Ana Reyes",
  program: "BSCS",
  sectionName: "A",
  subjectCode: "IT101",
  subjectName: "Intro to Computing",
  departmentName: "Computer Science",
  departmentCode: "BSCS",
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  avgRating: 4.28,
  remarks: "Very Satisfactory",
  totalRespondents: 32,
  criteria: CRITERIA,
  comments: [
    { submittedAt: "2026-02-11T09:00:00.000Z", comment: "Great explanations and clear examples." },
    { submittedAt: "2026-02-12T14:30:00.000Z", comment: "Always willing to help after class." },
  ],
}

/** The workbook the builder produced, read back. */
function readWorkbook() {
  const parts = readZip(buildEvaluationWorkbook(INPUT))
  const sheet = partText(parts, SHEET_INDIVIDUAL)
  const comments = partText(parts, SHEET_COMMENTS)
  const overall = partText(parts, SHEET_OVERALL)
  const strings = readSharedStrings(parts)
  return {
    parts,
    sheet,
    comments,
    overall,
    strings,
    text: (ref: string, source = sheet) => readCellText(source, ref, strings),
    number: (ref: string, source = sheet) => {
      const cell = source.match(new RegExp(`<c r="${ref}"[^>]*>(?:<v>([^<]*)</v>)?`))
      return cell && cell[1] !== undefined ? Number(cell[1]) : null
    },
  }
}

/**
 * The position map, read from the TEMPLATE.
 *
 * The output has no formulas - the export replaces them with their values (the
 * legacy's own rule: the workbook is a report, not a worksheet) - so the map
 * can only be read out of the template, which is where it comes from.
 */
function templatePositions() {
  return deriveFormPositions(partText(loadEvalTemplate(), SHEET_INDIVIDUAL))
}

describe("buildEvaluationWorkbook", () => {
  it("writes the identity block", () => {
    const wb = readWorkbook()
    expect(wb.text("B7")).toBe("2024-0017")
    expect(wb.text("B8")).toBe("Ana Reyes")
    expect(wb.text("B9")).toBe("BSCS")
    expect(wb.text("B10")).toBe("A")
    expect(wb.number("H7")).toBe(4.28)
    expect(wb.text("H8")).toBe("Very Satisfactory")
    expect(wb.text("A4")).toBe("Semester: SY 2026-2027 First Semester")
    expect(wb.text("A5")).toBe("Evaluation Period: SY 2026-2027 First Semester - Evaluation")
    expect(wb.number("H77")).toBe(32)
  })

  it("writes the statement ratings, in the template's own positions", () => {
    const wb = readWorkbook()
    const positions = templatePositions()
    // the first criterion's three statements are I12, I13, I14
    expect(positions.statementCells[0]).toEqual(["I12", "I13", "I14"])
    expect(positions.statementCells[1].slice(0, 2)).toEqual(["I18", "I19"])
    expect(positions.criterionAverageCells[0]).toBe("I15")
    expect(positions.finalRatingCell).toBe("I78")

    expect(wb.number("I12")).toBe(4.4)
    expect(wb.number("I13")).toBe(4.3)
    expect(wb.number("I14")).toBe(4.35)
    expect(wb.number("I15")).toBe(4.35)
    expect(wb.number("I18")).toBe(4.5)
    expect(wb.number("I78")).toBe(4.28)
  })

  it("writes the statement TEXT the students rated, not the legacy's wording", () => {
    const wb = readWorkbook()
    // the legacy typed "a good sence of humor"; the app's rubric says "sense"
    expect(wb.text("A14")).toBe(
      "He/she shows composure, exude confidence, and displays a good sense of humor.",
    )
  })

  it("leaves no formula behind", () => {
    const wb = readWorkbook()
    // the template's AVERAGE cells are now values, so the workbook is a report.
    // (the template writes them as `<f aca="false">`, so the check is "<f")
    expect(wb.sheet).not.toContain("<f")
    expect(wb.comments).not.toContain("<f")
    expect(wb.overall).not.toContain("<f")
  })

  it("writes the comments, one per row, on the comments sheet", () => {
    const wb = readWorkbook()
    expect(wb.text("A11", wb.comments)).toBe("2026-02-11")
    expect(wb.text("B11", wb.comments)).toBe("Great explanations and clear examples.")
    expect(wb.text("A12", wb.comments)).toBe("2026-02-12")
    expect(wb.text("B12", wb.comments)).toBe("Always willing to help after class.")
    // and the comments sheet carries the same identity block
    expect(wb.text("B7", wb.comments)).toBe("2024-0017")
    expect(wb.text("A5", wb.comments)).toBe(
      "Evaluation Period: SY 2026-2027 First Semester - Evaluation",
    )
  })

  it("writes ONE row on the overall sheet, and drops the legacy's stray numbering", () => {
    const wb = readWorkbook()
    expect(wb.text("B7", wb.overall)).toBe("Ana Reyes")
    expect(wb.number("C7", wb.overall)).toBe(4.35)
    expect(wb.number("J7", wb.overall)).toBe(4.3)
    expect(wb.number("K7", wb.overall)).toBe(4.28)
    expect(wb.text("L7", wb.overall)).toBe("Very Satisfactory")
    expect(wb.number("M7", wb.overall)).toBe(32)
    expect(wb.text("N7", wb.overall)).toBe("Computer Science")
    // the legacy's rows 8 and down are gone
    expect(wb.overall).not.toContain('<row r="8"')
  })

  it("is a workbook a reader can open", () => {
    const parts = readZip(buildEvaluationWorkbook(INPUT))
    expect(parts.size).toBeGreaterThan(20)
    expect(parts.has(SHEET_INDIVIDUAL)).toBe(true)
    expect(parts.has(SHEET_COMMENTS)).toBe(true)
    expect(parts.has(SHEET_OVERALL)).toBe(true)
  })
})

describe("the guard", () => {
  it("refuses a rubric with a different number of criteria", () => {
    const positions = templatePositions()
    expect(() => assertRubricFitsTemplate(CRITERIA.slice(0, 7), positions)).toThrow(
      FormRubricMismatchError,
    )
  })

  it("refuses a criterion with a different number of statements", () => {
    const positions = templatePositions()
    const changed = CRITERIA.map((c, i) =>
      i === 0 ? { ...c, statements: c.statements.slice(0, 2) } : c,
    )
    expect(() => assertRubricFitsTemplate(changed, positions)).toThrow(
      /2 statements in the rubric but the template has 3/,
    )
  })

  it("does NOT refuse a renamed criterion - the heading travels with the numbers", () => {
    // The legacy's headings are the school's own wording ("COMMUNICATION WITH
    // STUDENT", singular) and the app's rubric says "Communication with
    // Students", so a name comparison would reject the app's own rubric. The
    // export writes the rubric's wording into the heading instead.
    const positions = templatePositions()
    const renamed = CRITERIA.map((c, i) => (i === 0 ? { ...c, name: "Manners" } : c))
    expect(() => assertRubricFitsTemplate(renamed, positions)).not.toThrow()
  })

  it("accepts the rubric the app carries", () => {
    const positions = templatePositions()
    expect(() => assertRubricFitsTemplate(CRITERIA, positions)).not.toThrow()
  })

  it("writes the criterion's own heading, numbered", () => {
    const wb = readWorkbook()
    expect(wb.text("A11")).toBe("I. Professional Manner")
    expect(wb.text("A17")).toBe("II. Communication with Students")
  })
})

describe("orDash", () => {
  it("prints a dash for nothing, and the value otherwise", () => {
    expect(orDash(null)).toBe("—")
    expect(orDash("")).toBe("—")
    expect(orDash("   ")).toBe("—")
    expect(orDash("BSCS")).toBe("BSCS")
  })
})

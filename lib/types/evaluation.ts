// ── Entity Types ──────────────────────────────────────────

import type { UserData } from "./repository"

export interface Semester {
  id: string
  title: string
  evalStartDate: string
  evalEndDate: string | null
  isActive: boolean
  createdAt: Date
}

export interface EvaluationPeriod {
  id: string
  semesterId: string
  name: string
  source: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  createdAt: Date
}

export interface Subject {
  id: string
  code: string
  name: string
}

export interface Section {
  id: string
  name: string
  program: string
  departmentCourseId: string
  isDisabled?: boolean
}

export interface FacultySubject {
  id: string
  facultyId: string
  subjectId: string
  sectionId: string
  semesterId: string | null
}

export interface StudentEnrollment {
  id: string
  studentId: string
  sectionId: string
  semesterId: string | null
}

export interface RubricCategory {
  id: string
  rubricGroupId: string
  name: string
  displayOrder: number
  items?: RubricItem[]
}

export interface RubricItem {
  id: string
  categoryId: string
  text: string
  displayOrder: number
  weight: number
}

export interface Evaluation {
  id: string
  evaluationPeriodId: string
  evaluatorId: string
  evaluateeId: string
  facultySubjectId: string
  status: "DRAFT" | "SUBMITTED" | "INVALID"
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  source: string | null
  remarks: string | null
  isDisabled?: boolean
}

export interface EvaluationRating {
  id: string
  evaluationId: string
  itemId: string
  rating: number
}

export interface EvaluationComment {
  id: string
  evaluationId: string
  comment: string
  sentimentScore: number | null
  sentimentLabel: string | null
  sentimentAnalyzedAt: Date | null
  createdAt: Date
}

export interface EvaluationCommentWithEvaluation extends EvaluationComment {
  evaluation: EvaluationData
}

export interface EvaluationResult {
  id: string
  evaluationPeriodId: string
  facultyId: string
  subjectId: string
  departmentId: string | null
  totalRespondents: number
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  generalRating: number | null
  remarks: string | null
  computedAt: Date
}

// ── Data Types (for repositories) ─────────────────────────

export interface SemesterData {
  id: string
  title: string
  evalStartDate: string
  evalEndDate: string | null
  isActive: boolean
  createdAt: Date
}

export interface CreateSemesterInput {
  title: string
  evalStartDate?: string | null
  evalEndDate?: string | null
}

export interface EvaluationPeriodData {
  id: string
  semesterId: string
  name: string
  source: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  rubricGroupId: string | null
  createdAt: Date
  semesterTitle?: string
}

export interface CreateEvaluationPeriodInput {
  semesterId: string
  name: string
  source?: string | null
  startDate?: string | null
  endDate?: string | null
  rubricGroupId?: string | null
}

export interface SubjectData {
  id: string
  code: string
  name: string
}

export interface SectionData {
  id: string
  name: string
  program: string
  departmentCourseId: string
  isDisabled?: boolean
}

export interface FacultySubjectData {
  id: string
  faculty_id: string
  subject_id: string
  section_id: string
  semesterId: string | null
}

export interface FacultySubjectWithEmbeds extends FacultySubjectData {
  faculty: { id: string; name: string; email: string; departmentId: string | null } | null
  subject: { id: string; code: string; name: string } | null
  section: { id: string; name: string; program: string } | null
  semester: { id: string; title: string } | null
}

export interface FacultySubjectWithSubjectsSections {
  id: string
  subject_id: string
  subjects: { id: string; code: string; name: string } | null
  sections: { departmentCourseId: string } | null
}

export interface StudentEnrollmentData {
  id: string
  student_id: string
  section_id: string
  faculty_subject_id: string | null
  semesterId: string | null
}

export interface StudentEnrollmentWithEmbeds extends StudentEnrollmentData {
  student: { id: string; name: string; email: string } | null
  section: { id: string; name: string; program: string } | null
  faculty_subject: {
    id: string
    faculty: { id: string; name: string; email: string } | null
    subject: { id: string; code: string; name: string } | null
    section: { id: string; name: string; program: string } | null
  } | null
}

/** A student on an evaluation roster — the identity the coverage card tallies and the Details modal renders. */
export interface RosterStudent {
  id: string
  name: string
  email: string
}

export interface RubricCategoryData {
  id: string
  rubricGroupId: string
  name: string
  displayOrder: number
}

export interface RubricItemData {
  id: string
  categoryId: string
  text: string
  displayOrder: number
  weight: number
}

export interface RubricGroupData {
  id: string
  name: string
  description: string | null
  seed: boolean
  createdAt: Date
}

export interface RubricGroupWithCategories extends RubricGroupData {
  categories: (RubricCategoryData & { items: RubricItemData[] })[]
}

export interface RubricGroupSnapshotData {
  id: string
  evaluationPeriodId: string
  rubricGroupId: string
  rubricGroupName: string
  categoryName: string
  categoryDisplayOrder: number
  itemText: string
  itemDisplayOrder: number
  itemWeight: number
  itemId: string | null
  categoryId: string | null
  createdAt: Date
}

export interface IRubricGroupRepository {
  list(): Promise<RubricGroupData[]>
  findById(id: string): Promise<RubricGroupWithCategories | null>
  create(name: string, description?: string | null): Promise<RubricGroupData>
  update(id: string, data: { name?: string; description?: string | null }): Promise<RubricGroupData>
  duplicate(id: string, newName: string): Promise<RubricGroupData>
  isLocked(groupId: string): Promise<boolean>
  createSnapshot(evaluationPeriodId: string, groupId: string): Promise<void>
  getSnapshot(evaluationPeriodId: string): Promise<RubricGroupSnapshotData[]>
}

export interface EvaluationData {
  id: string
  evaluationPeriodId: string
  evaluatorId: string
  evaluateeId: string
  facultySubjectId: string
  status: "DRAFT" | "SUBMITTED" | "INVALID"
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  source: string | null
  remarks: string | null
  isDisabled?: boolean
}

export interface PendingEvaluationItem {
  evaluateeId: string
  facultySubjectId: string
  subjectId: string
  // Mapped term, sourced from faculty_subjects."semesterId" — never the
  // active semester/period. Null when the mapping has no semester.
  mappingSemesterId: string | null
  // Human-readable semesters.title for mappingSemesterId; null when unmapped.
  mappingSemesterTitle: string | null
  // mappingSemesterId === activeSemesterId (both non-null). Display/diagnostic
  // only — never gates. Locking keys off `eligible`.
  isMappedToActiveSemester: boolean
  // Gate mirror: a student_enrollments row exists for
  // (student, facultySubjectId, active evaluation_periods."semesterId").
  eligible: boolean
  // Why not eligible: enrollment row names another/absent mapping vs names
  // this mapping under a different semester. Null when eligible.
  ineligibilityReason: "WRONG_TERM" | "NOT_ENROLLED" | null
  // Section of the mapping (faculty_subjects.section_id → sections),
  // composed client-side as `${sectionProgram}-${sectionName}` to match CSV labels.
  sectionProgram: string | null
  sectionName: string | null
}

export interface EvaluationResultData {
  id: string
  evaluationPeriodId: string
  facultyId: string
  subjectId: string
  departmentId: string | null
  totalRespondents: number
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  generalRating: number | null
  remarks: string | null
  computedAt: Date
  isResultsVisible: boolean
}

// ── DTO Types ─────────────────────────────────────────────

export interface EvaluationWithDetails extends Evaluation {
  ratings: EvaluationRating[]
  comments: EvaluationComment[]
  result?: EvaluationResult
}

export interface EvaluationResultDetail extends EvaluationResult {
  commentCount: number
  sentimentDistribution: {
    positive: number
    negative: number
    neutral: number
  }
}

export interface SentimentSummary {
  totalComments: number
  analyzed: number
  distribution: {
    label: string
    count: number
    percentage: number
  }[]
  averageScore: number | null
}

export interface EnrollmentStats {
  facultyCount: number
  subjectCount: number
  studentCount: number
  enrollmentCount: number
}

// ── Repository Interfaces ─────────────────────────────────

export interface ISemesterRepository {
  list(filter?: { isActive?: boolean }): Promise<SemesterData[]>
  findById(id: string): Promise<SemesterData | null>
  findActive(): Promise<SemesterData | null>
  create(input: CreateSemesterInput): Promise<SemesterData>
  update(id: string, data: Partial<SemesterData>): Promise<SemesterData>
  delete(id: string): Promise<void>
  setActive(id: string): Promise<SemesterData>
}

export interface IEvaluationPeriodRepository {
  list(filter?: { semesterId?: string; isActive?: boolean }): Promise<EvaluationPeriodData[]>
  findById(id: string): Promise<EvaluationPeriodData | null>
  findActive(): Promise<EvaluationPeriodData | null>
  findBySemester(semesterId: string): Promise<EvaluationPeriodData[]>
  create(input: CreateEvaluationPeriodInput): Promise<EvaluationPeriodData>
  update(id: string, data: Partial<EvaluationPeriodData>): Promise<EvaluationPeriodData>
  delete(id: string): Promise<void>
  setActive(id: string): Promise<EvaluationPeriodData>
  hasEvaluations(id: string): Promise<boolean>
  reset(id: string): Promise<void>
}

export interface ISubjectRepository {
  list(): Promise<SubjectData[]>
  upsertMany(items: { code: string; name: string }[]): Promise<{ data: Map<string, SubjectData>; created: number; updated: number }>
  findByCode(code: string): Promise<SubjectData | null>
  findById(id: string): Promise<SubjectData | null>
  findByIds(ids: string[]): Promise<SubjectData[]>
  create(data: { code: string; name: string; isDisabled?: boolean }): Promise<SubjectData>
  update(id: string, data: Partial<SubjectData>): Promise<SubjectData>
}

export interface ISectionRepository {
  list(): Promise<SectionData[]>
  upsertMany(items: { name: string; program: string; departmentCourseId: string }[]): Promise<{ data: Map<string, SectionData>; created: number }>
  findByNameAndProgram(name: string, program: string): Promise<SectionData | null>
  findById(id: string): Promise<SectionData | null>
  create(data: { name: string; program: string; departmentCourseId: string; isDisabled?: boolean }): Promise<SectionData>
  update(id: string, data: Partial<SectionData>): Promise<SectionData>
  countBySemesterId(semesterId: string): Promise<number>
}

export interface IFacultySubjectRepository {
  list(filters?: { faculty_id?: string; section_id?: string; semesterId?: string }): Promise<FacultySubjectData[]>
  listAllWithEmbeds(filters?: { semesterId?: string; facultyId?: string }): Promise<FacultySubjectWithEmbeds[]>
  replaceBySection(section_id: string, items: { faculty_id: string; subject_id: string; semesterId?: string | null }[]): Promise<void>
  findById(id: string): Promise<FacultySubjectData | null>
  findByIdWithEmbeds(id: string): Promise<FacultySubjectWithEmbeds | null>
  create(data: { faculty_id: string; subject_id: string; section_id: string; semesterId?: string | null }): Promise<FacultySubjectData>
  createMany(items: { faculty_id: string; subject_id: string; section_id: string; semesterId?: string | null }[]): Promise<FacultySubjectData[]>
  update(id: string, data: Partial<FacultySubjectData>): Promise<FacultySubjectData>
  updateSemesterForIds(ids: string[], semesterId: string): Promise<number>
  findBySubjectAndSection(subject_id: string, section_id: string): Promise<FacultySubjectData | null>
  findBySubjectSectionAndFaculty(subject_id: string, section_id: string, faculty_id: string): Promise<FacultySubjectData | null>
  findBySubjectSectionSemester?(subject_id: string, section_id: string, semesterId?: string | null): Promise<FacultySubjectData | null>
  findManyBySubjectSectionIds(subjectIds: string[], sectionIds: string[]): Promise<FacultySubjectData[]>
  findByIds(ids: string[]): Promise<FacultySubjectData[]>
  findByFacultyIdWithEmbeds(facultyId: string): Promise<FacultySubjectWithSubjectsSections[]>
  countBySemesterId(semesterId: string): Promise<number>
}

export interface IStudentEnrollmentRepository {
  list(filters?: { student_id?: string; section_id?: string; semesterId?: string }): Promise<StudentEnrollmentData[]>
  replaceBySection(section_id: string, items: { student_id: string; semesterId?: string | null }[]): Promise<void>
  addEnrollments(items: { student_id: string; section_id: string; faculty_subject_id?: string | null; semesterId?: string | null }[]): Promise<{ inserted: number; skipped: number; skippedItems: { student_id: string; faculty_subject_id: string | null; section_id: string }[] }>
  findExisting(student_id: string, faculty_subject_id: string, semesterId?: string | null): Promise<StudentEnrollmentData | null>
  create(data: { student_id: string; faculty_subject_id: string; section_id: string; semesterId?: string | null }): Promise<StudentEnrollmentData>
  findById(id: string): Promise<StudentEnrollmentData | null>
  deleteById(id: string): Promise<void>
  getDistinctFaculty(student_id: string, semesterId?: string): Promise<string[]>
  countBySectionIds(sectionIds: string[]): Promise<Record<string, number>>
  countByFacultySubjectIds(ids: string[], semesterId?: string): Promise<Record<string, number>>
  countByFacultySubjectIdsPaged(ids: string[], semesterId?: string): Promise<Record<string, number>>
  listAllWithEmbeds(filters?: { semesterId?: string }): Promise<StudentEnrollmentWithEmbeds[]>
  listByFacultySubject(facultySubjectId: string, semesterId?: string): Promise<StudentEnrollmentWithEmbeds[]>
  /** One roster read for the coverage card and its Details modal. */
  listRosterByFacultySubjectIds(facultySubjectIds: string[], semesterId?: string): Promise<Map<string, RosterStudent[]>>
  countBySemesterId(semesterId: string): Promise<number>
  countByFacultySubjectId(facultySubjectId: string, semesterId?: string): Promise<number>
  getFacultySubjectsByStudent(student_id: string, faculty_id: string, semesterId: string): Promise<{ id: string; code: string; title: string }[]>
}

export interface IRubricRepository {
  getCategoriesWithItems(groupId: string): Promise<RubricCategoryData[]>
  replaceRubric(groupId: string, categories: { name: string; displayOrder: number; items: { text: string; displayOrder: number; weight?: number }[] }[]): Promise<RubricCategoryData[]>
  copyFromSource(groupId: string, sourceGroupId: string): Promise<RubricCategoryData[]>
  deleteCategory(id: string): Promise<void>
  createItem(data: { categoryId: string; text: string; displayOrder: number; weight?: number }): Promise<RubricItemData>
  updateItem(id: string, data: Partial<RubricItemData>): Promise<RubricItemData>
  deleteItem(id: string): Promise<void>
}

export interface IEvaluationRepository {
  findPending(evaluatorId: string, evaluationPeriodId: string, activeSemesterId?: string | null): Promise<PendingEvaluationItem[]>
  /** True when the assignment belongs to the shared dummy (placeholder) account. */
  isDummyAssignment(facultySubjectId: string): Promise<boolean>
  findByEvaluator(evaluatorId: string, evaluationPeriodId?: string): Promise<EvaluationData[]>
  findByEvaluatorBrief(evaluatorId: string): Promise<EvaluationData[]>
  findById(id: string): Promise<EvaluationData | null>
  findByComposite(evaluationPeriodId: string, evaluatorId: string, facultySubjectId: string): Promise<EvaluationData | null>
  create(evaluationPeriodId: string, evaluatorId: string, evaluateeId: string, facultySubjectId: string, source?: string | null): Promise<EvaluationData>
  setRatings(evaluationId: string, ratings: { itemId: string; rating: number }[]): Promise<void>
  submit(evaluationId: string): Promise<EvaluationData>
  getRatings(evaluationId: string): Promise<{ itemId: string; rating: number }[]>
  addComment(evaluationId: string, comment: string): Promise<EvaluationComment>
  getComment(evaluationId: string): Promise<EvaluationComment | null>
  listCommentsWithFilters(filters?: { evaluationPeriodId?: string | null; sentimentLabel?: string | null }): Promise<EvaluationCommentWithEvaluation[]>
  bulkDisableByPeriod(evaluationPeriodId: string, filter?: { facultyId?: string; facultySubjectId?: string }): Promise<void>
  restoreByIds(ids: string[]): Promise<void>
  listDisabled(): Promise<unknown[]>
  deleteDisabled(ids?: string[]): Promise<void>
  invalidateByFacultySubjectAndEvaluator(facultySubjectId: string, evaluatorId: string, remarks: string): Promise<void>
  invalidateById(id: string, remarks: string): Promise<void>
  invalidateByEvaluatorAndPeriod(evaluatorId: string, facultySubjectId: string, evaluationPeriodId: string, remarks: string): Promise<void>
  invalidateByFacultySubject(facultySubjectId: string, remarks: string): Promise<void>
  countSubmittedByFacultyIds(facultyIds: string[]): Promise<number>
  countSubmittedByFacultySubjectIds(evaluationPeriodId: string, facultySubjectIds: string[]): Promise<Record<string, number>>
  countDistinctSubmittedEvaluateesByFacultyIds(facultyIds: string[]): Promise<{ total: number; distinctEvaluatees: number }>
  listSubmittedByPeriodAndEvaluatee(evaluationPeriodId: string, evaluateeId: string): Promise<EvaluationListItem[]>
  listSubmittedByPeriodAndEvaluatees(evaluationPeriodId: string, evaluateeIds: string[]): Promise<EvaluationListItem[]>
  countBySemesterId(semesterId: string): Promise<number>
  listSubmittedByPeriodAndEvaluateeAndFS(evaluationPeriodId: string, evaluateeId: string, facultySubjectId: string): Promise<EvaluationDetailItem[]>
  listSubmittedByPeriodAndFacultySubjectIds(evaluationPeriodId: string, facultySubjectIds: string[]): Promise<EvaluationDetailItem[]>
  listStatusByPeriodAndFacultySubjectIds(evaluationPeriodId: string, facultySubjectIds: string[]): Promise<EvaluationStatusItem[]>
  listRatingsByEvaluationIds(evaluationIds: string[]): Promise<EvaluationRatingRow[]>
  listCommentsByEvaluationIds(evaluationIds: string[]): Promise<EvaluationCommentLight[]>
  listFullCommentsByEvaluationIds(evaluationIds: string[]): Promise<EvaluationCommentFull[]>
  listByUser(userId: string, limit?: number): Promise<EvaluationData[]>
}

// ── Evaluation Report Types ──────────────────────────────────

export interface EvaluationListItem {
  id: string
  evaluateeId: string
  facultySubjectId: string | null
  submittedAt: string | null
}

export interface EvaluationDetailItem {
  id: string
  evaluatorId: string
  submittedAt: string | null
  createdAt: string
  facultySubjectId: string | null
}

export interface EvaluationStatusItem {
  id: string
  evaluatorId: string
  status: "DRAFT" | "SUBMITTED" | "INVALID"
  isDisabled: boolean
  submittedAt: string | null
  facultySubjectId: string | null
}

export interface EvaluationRatingRow {
  evaluationId: string
  rating: number
  /** The rubric item this rating is for — the statement, not the criterion. */
  itemId: string
  rubric_items: {
    id: string
    categoryId: string
    text: string
    displayOrder: number
    rubric_categories: { id: string; name: string; displayOrder: number }
  }
}

export interface EvaluationCommentLight {
  evaluationId: string
  sentimentScore: number | null
}

export interface EvaluationCommentFull {
  id: string
  evaluationId: string
  comment: string
  sentimentLabel: string | null
  sentimentScore: number | null
}

// ── Dean Report Types ──────────────────────────────────────

export interface StudentBreakdownItem {
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  generalRating: number | null
  comment: string | null
  sentimentLabel: string | null
  sentimentScore: number | null
}

export interface FacultyEvalDetail {
  facultyId: string
  facultyName: string
  totalRespondents: number
  generalRating: number | null
  remarks: string | null
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  students: StudentBreakdownItem[]
}

/**
 * The lookups one department decision needs: the faculty's home department,
 * and the section -> department_course -> department chain an evaluated
 * subject can fall back to.
 */
export interface SubjectResolutionContext {
  userDept: Map<string, string | null>
  sections: Map<string, string | null>
  departmentCourses: Map<string, string | null>
}

/** A teaching assignment (a faculty_subjects row) with its owning department. */
export interface EvaluationAssignment {
  /** faculty_subjects.id */
  id: string
  faculty_id: string
  subject_id: string
  section_id: string | null
  /** The department the assignment counts under — the teacher's own department; null when unresolvable. */
  departmentId: string | null
}

/**
 * One department's figures for a period: how many responses count under it,
 * and the faculty whose teaching they are.
 */
export interface PeriodDepartmentFigure {
  departmentId: string
  totalRespondents: number
  facultyIds: string[]
}

/**
 * One department's figures for a period: the unweighted mean of its rated
 * Subject–Section scores and its remark, the highest and lowest rubrics, and
 * the comment sentiment.
 */
export interface DepartmentFigures {
  departmentId: string
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

/**
 * One faculty's figures for a period: the pooled rating and its remark, the
 * eight criterion averages, the highest and lowest rubrics, and the comment
 * sentiment — plus the per-category totals they came from.
 *
 * The totals are the weights: a department's figure is the pool of its
 * faculty's totals, so the two grains come from one read.
 */
export interface FacultyFigures {
  facultyId: string
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  /** The eight criterion averages, keyed by the column name. */
  catColumns: Record<string, number | null>
  /** The weights: the raw rubric category name -> its sum and its count. */
  catTotals: Record<string, { sum: number; count: number }>
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

/**
 * A period's departments, with the integrity warnings read from the same
 * facts — so the results list and the coverage page cannot disagree.
 */
export interface PeriodFigures {
  departments: PeriodDepartmentFigure[]
  warnings: IntegrityWarnings
}

/**
 * The integrity conditions the RESULTS surfaces report: the assignments whose
 * teacher has no home department — a subject that belongs to no department.
 */
export interface IntegrityWarnings {
  /** The assignment's department could not be resolved. */
  unattributed: { count: number; faculty: { id: string; name: string }[] }
}

/**
 * The coverage page's conditions: the integrity ones plus the assignments that
 * belong to another semester than the period — its list IS term-scoped, so
 * "outside the term" is a real condition there. The results surfaces do not
 * report it: their list is period-scoped, so a response on an earlier term's
 * assignment is a response of this period (contract §3.21).
 */
export interface AttributionWarnings extends IntegrityWarnings {
  /** The assignment belongs to another semester than the period. */
  offSemester: { count: number; faculty: { id: string; name: string }[] }
}

export interface EvaluationVisibilityRow {
  id: string
  evaluation_period_id: string | null
  semesterId: string | null
  facultyId: string
  is_results_visible: boolean
}

/**
 * A department's live response set for a period: the period's submitted and
 * enabled evaluations by the faculty homed in the department, minus the ones
 * whose assignment no longer belongs to their evaluatee (the live-eval rule).
 *
 * The ONE place the set is decided — the results list's figure and the
 * department page's rows both read it, so the two cannot drift apart.
 */
export interface DepartmentResponseSet {
  /** The department's own faculty — the accounts homed in it. */
  members: UserData[]
  /** The live evaluations — the period's, by those members. */
  evaluations: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
  /** The assignments those evaluations point at — the subject rows' source. */
  assignments: Map<string, EvaluationAssignment>
}

export interface IEvaluationResultRepository {
  /**
   * A department's live response set for a period — the one place the set is
   * decided (the period scopes the responses, contract §3.21).
   */
  listDepartmentResponseSet(departmentId: string, evaluationPeriodId: string): Promise<DepartmentResponseSet>
  /**
   * The period's departments and their response counts, with the attribution
   * warnings read from the same facts.
   */
  listPeriodFigures(evaluationPeriodId: string, departmentId?: string): Promise<PeriodFigures>
  /**
   * One department's figures for a period: the unweighted mean of its rated
   * Subject–Section scores, its remark, the highest and lowest rubrics, and
   * the comment sentiment.
   */
  listDepartmentFigures(departmentId: string, evaluationPeriodId: string): Promise<DepartmentFigures>
  /**
   * One faculty's figures for a period: the pooled rating, its remark, the
   * eight criterion averages, the highest and lowest rubrics, the comment
   * sentiment, and the per-category totals they pool from.
   */
  listFacultyFigures(facultyId: string, evaluationPeriodId: string): Promise<FacultyFigures>
  /**
   * The evaluated assignments of one department — the department's own
   * subjects, by the teacher's own department.
   */
  listDepartmentAssignments(departmentId: string, evaluationPeriodId: string): Promise<EvaluationAssignment[]>
  /**
   * The department's assignments in the term: every subject that counts under
   * it, evaluated or not.
   */
  listDepartmentTeachingAssignments(departmentId: string, semesterId: string): Promise<EvaluationAssignment[]>
  /** The lookups a department decision needs, for a set of assignments. */
  buildSubjectContext(assignments: { faculty_id: string; section_id: string | null }[]): Promise<SubjectResolutionContext>
  /** The evaluations that could not be attributed cleanly. */
  listAttributionWarnings(evaluationPeriodId: string, departmentId?: string): Promise<AttributionWarnings>
  /** The people who teach in each department in a term. */
  listSemesterRoster(semesterId: string): Promise<Record<string, { id: string; name: string; email: string }[]>>
  setVisibility(evaluationPeriodId: string, facultyIds: string[], visible: boolean): Promise<void>
  getVisibilityMap(evaluationPeriodId: string): Promise<Map<string, boolean>>
  countBySemesterId(semesterId: string): Promise<number>
  listByFacultyId(facultyId: string, limit?: number): Promise<EvaluationVisibilityRow[]>
  assertPeriodIsActive(evaluationPeriodId: string): Promise<void>
}

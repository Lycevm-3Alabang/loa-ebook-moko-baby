// ── Pagination ──────────────────────────────────────────

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PagedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ── User ────────────────────────────────────────────────

export interface UserData {
  id: string
  name: string
  email: string
  passwordHash: string | null
  role: string
  departmentId: string | null
  course: string | null
  employeeNo: string | null
  semesterId: string | null
  isDisabled: boolean
  hasLoggedInBefore: boolean
  lastLoginAt: Date | null
  tokenVersion: number
  onboardingVersion: number
  createdAt: Date
  deletedAt: Date | null
}

export interface CreateUserInput {
  name: string
  email: string
  passwordHash?: string | null
  role: string
  departmentId?: string | null
  course?: string | null
  employeeNo?: string | null
}

export interface ListUsersOptions {
  includeDeleted?: boolean
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserData | null>
  findById(id: string): Promise<UserData | null>
  findManyByEmail(emails: string[]): Promise<Map<string, UserData>>
  create(input: CreateUserInput): Promise<UserData>
  createMany(inputs: CreateUserInput[]): Promise<{ created: Map<string, UserData>; failures: string[] }>
  listByRole(role: string, options?: ListUsersOptions): Promise<UserData[]>
  listByDepartment(departmentId: string, options?: ListUsersOptions): Promise<UserData[]>
  listByIds(ids: string[], options?: ListUsersOptions): Promise<UserData[]>
  listAll(options?: ListUsersOptions): Promise<UserData[]>
  update(id: string, data: Partial<UserData>): Promise<UserData>
  softDelete(id: string): Promise<void>
  bulkSoftDelete(ids: string[]): Promise<void>
  restore(id: string): Promise<void>
  permanentDelete(id: string): Promise<void>
  listDeleted(): Promise<UserData[]>
  countActive(): Promise<number>
  countByRole(role: string): Promise<number>
}

// ── Department ──────────────────────────────────────────

export interface DepartmentData {
  id: string
  name: string
  code: string
  deanId: string | null
  isDisabled: boolean
}

export interface IDepartmentRepository {
  listAll(): Promise<DepartmentData[]>
  findById(id: string): Promise<DepartmentData | null>
  findByCode(code: string): Promise<DepartmentData | null>
  findByDeanId(deanId: string): Promise<DepartmentData | null>
  create(data: { name: string; code: string; deanId?: string | null }): Promise<DepartmentData>
  update(id: string, data: Partial<DepartmentData>): Promise<DepartmentData>
  countActive(): Promise<number>
  listByDeanId(deanId: string): Promise<DepartmentData[]>
}

// ── Department Course ───────────────────────────────────

export interface DepartmentCourseData {
  id: string
  departmentId: string
  name: string
  code: string
  createdAt: string
}

export interface IDepartmentCourseRepository {
   findById(id: string): Promise<DepartmentCourseData | null>
   findByDepartmentAndCode(departmentId: string, code: string): Promise<DepartmentCourseData | null>
   create(data: { departmentId: string; name: string; code: string }): Promise<DepartmentCourseData>
   update(id: string, data: Partial<DepartmentCourseData>): Promise<DepartmentCourseData>
   findAll(): Promise<DepartmentCourseData[]>
   deleteById(id: string): Promise<void>
 }

// ── Appointment ─────────────────────────────────────────

export interface AppointmentData {
  id: string
  studentId: string
  facultyId: string
  createdByEmail: string
  meetingType: "CONSULTATION" | "INTERNAL"
  sessionGroupId: string | null
  date: string
  startTime: string
  endTime: string
  title: string | null
  description: string | null
  actionTaken: string | null
  additionalRemarks: string | null
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED"
  teamsLink: string | null
  teamsSyncStatus: "UNWRITTEN" | "WRITTEN" | "FAILED"
  teamsSyncRetries: number
  teamsSyncError: string | null
  teamsSyncLastAttempt: Date | null
  requestedAt: Date
  updatedAt: Date
}

export interface CreateAppointmentInput {
  studentId: string | null
  facultyId: string
  createdByEmail: string
  meetingType?: "CONSULTATION" | "INTERNAL"
  sessionGroupId?: string | null
  date: string
  startTime: string
  endTime: string
  title?: string | null
  description?: string | null
}

export interface AppointmentAttendeeData {
  id: string
  appointmentId: string
  userId: string
  status: "INVITED" | "ACCEPTED" | "DECLINED"
  isMandatory: boolean
}

export interface AppointmentTimeSlotData {
  id: string
  appointmentId: string
  date: string
  startTime: string
  endTime: string
  teamsLink: string | null
  createdAt: Date
}

export interface AppointmentFileData {
  id: string
  appointmentId: string
  fileName: string
  fileType: string
  fileData: string
  fileSize: number
  createdAt: Date
}

export interface IAppointmentRepository {
  create(input: CreateAppointmentInput): Promise<AppointmentData>
  listByStudent(studentId: string, pagination?: PaginationParams): Promise<PagedResult<AppointmentData>>
  listByFaculty(facultyId: string, pagination?: PaginationParams): Promise<PagedResult<AppointmentData>>
  listByParticipant(userId: string, pagination?: PaginationParams): Promise<PagedResult<AppointmentData>>
  listAll(pagination?: PaginationParams): Promise<PagedResult<AppointmentData>>
  listPendingSync(): Promise<AppointmentData[]>
  findById(id: string): Promise<AppointmentData | null>
  update(id: string, data: Partial<AppointmentData>): Promise<AppointmentData>
  addAttendee(appointmentId: string, userId: string, isMandatory?: boolean): Promise<AppointmentAttendeeData>
  listAttendees(appointmentId: string): Promise<AppointmentAttendeeData[]>
  updateAttendeeStatus(appointmentId: string, userId: string, status: "INVITED" | "ACCEPTED" | "DECLINED"): Promise<AppointmentAttendeeData>
  addTimeSlot(appointmentId: string, date: string, startTime: string, endTime: string): Promise<AppointmentTimeSlotData>
  removeTimeSlot(slotId: string): Promise<void>
  updateTimeSlot(id: string, data: Partial<Pick<AppointmentTimeSlotData, "teamsLink">>): Promise<AppointmentTimeSlotData>
  findTimeSlotById(id: string): Promise<AppointmentTimeSlotData | null>
  listTimeSlots(appointmentId: string): Promise<AppointmentTimeSlotData[]>
  listStudentConflictingSlots(studentId: string, date: string, startTime: string, endTime: string, excludeSessionGroupId?: string): Promise<AppointmentTimeSlotData[]>
  listConflictingSlots(facultyIds: string[], date: string, startTime: string, endTime: string): Promise<AppointmentTimeSlotData[]>
  listFacultyAppointmentsByDateRange(facultyId: string, startDate: string, endDate: string, status?: string): Promise<AppointmentData[]>
  addFile(appointmentId: string, data: { fileName: string; fileType: string; fileData: string; fileSize: number }): Promise<AppointmentFileData>
  listFiles(appointmentId: string): Promise<AppointmentFileData[]>
  listByUserId(userId: string, limit?: number): Promise<AppointmentData[]>
  listAttendeesByUserId(userId: string, limit?: number): Promise<AppointmentAttendeeData[]>
}

// ── Availability Rule ───────────────────────────────────

export interface AvailabilityRuleData {
  id: string
  facultyId: string
  dayOfWeek: number
  isBlocked: boolean
  startTime: string | null
  endTime: string | null
  startDate: string
  endDate: string | null
}

export interface UpsertAvailabilityRuleInput {
  facultyId: string
  dayOfWeek: number
  isBlocked: boolean
  startTime?: string | null
  endTime?: string | null
  startDate: string
  endDate?: string | null
}

export interface IAvailabilityRuleRepository {
  listByFaculty(facultyId: string): Promise<AvailabilityRuleData[]>
  listByFaculties(facultyIds: string[]): Promise<Map<string, AvailabilityRuleData[]>>
  findByFacultyAndDay(facultyId: string, dayOfWeek: number, startDate?: string): Promise<AvailabilityRuleData | null>
  upsert(input: UpsertAvailabilityRuleInput): Promise<AvailabilityRuleData>
  delete(id: string): Promise<void>
}

// ── Password Reset Token ────────────────────────────────

export interface PasswordResetTokenData {
  id: string
  email: string
  token: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

export interface IPasswordResetTokenRepository {
  create(email: string, token: string, expiresAt: Date): Promise<void>
  findByToken(token: string): Promise<PasswordResetTokenData | null>
  markUsed(id: string): Promise<void>
  findByEmail(email: string): Promise<PasswordResetTokenData | null>
}

// ── Audit Log ───────────────────────────────────────────

export interface AuditLogData {
  id: string
  userId: string | null
  email: string | null
  action: string
  details: string | null
  createdAt: Date
}

export interface IAuditLogRepository {
  create(data: { userId?: string | null; email?: string | null; action: string; details?: string | null }): Promise<AuditLogData>
  list(limit?: number, offset?: number, filters?: { action?: string; email?: string; dateFrom?: string; dateTo?: string }, orderBy?: string, orderDir?: "asc" | "desc"): Promise<{ logs: AuditLogData[]; total: number }>
  clearAll(): Promise<void>
  getDistinctActions(): Promise<string[]>
  findByEmailAndActions(email: string, actions: string[], limit?: number): Promise<AuditLogData[]>
}

// ── Reports ─────────────────────────────────────────────

export interface FacultyStatsData {
  facultyId: string
  facultyName: string
  total: number
  completed: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  completionRate: number
}

export interface RawAppointmentData {
  id: string
  facultyId: string
  facultyName: string
  studentName: string
  date: string
  startTime: string
  endTime: string
  status: string
  title: string | null
}

export interface ConsultationSummaryData {
  id: string
  facultyId: string
  facultyName: string
  studentName: string
  studentId: string
  date: string
  startTime: string
  endTime: string
  status: string
  title: string | null
  description: string | null
  actionTaken: string | null
  additionalRemarks: string | null
  hasFiles: boolean
}

export interface DepartmentFrequencyEntry {
  month: string
  monthName: string
  year: number
  count: number
}

export interface FacultyFrequencyData {
  facultyId: string
  facultyName: string
  total: number
  averagePerMonth: number
  monthlyCounts: { month: string; monthName: string; count: number }[]
}

export interface DepartmentYearlyEntry {
  year: number
  count: number
}

export interface FacultyYearlyData {
  facultyId: string
  facultyName: string
  total: number
  averagePerYear: number
  yearlyCounts: { year: number; count: number }[]
}

export interface DailyFrequencyData {
  date: string
  dayName: string
  count: number
}

export interface WeeklyFrequencyData {
  weekStart: string
  weekEnd: string
  label: string
  count: number
}

export interface ResponseTimeStats {
  averageHours: number
  medianHours: number
  fastestHours: number
  slowestHours: number
  totalResponded: number
}

export interface FacultyResponseTime {
  facultyId: string
  facultyName: string
  averageHours: number
  medianHours: number
  fastestHours: number
  slowestHours: number
  totalResponded: number
}

export interface ResponseTimeDistribution {
  label: string
  fromHours: number
  toHours: number | null
  count: number
}

export interface BacklogEntry {
  id: string
  facultyId: string
  facultyName: string
  studentName: string
  date: string
  startTime: string
  endTime: string
  status: "PENDING" | "APPROVED"
  title: string | null
  ageDays: number
  agingBucket: string
}

export interface BacklogAgingBucket {
  label: string
  fromDays: number
  toDays: number | null
  count: number
}

export interface BacklogSummary {
  totalPending: number
  totalApproved: number
  totalUnresolved: number
  oldestDays: number
  oldestDate: string | null
  oldestFaculty: string
  oldestStudent: string
}

export interface DepartmentSummary {
  id: string
  name: string
  facultyCount: number
  total: number
  completed: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  completionRate: number
  inactiveFaculty: number
  unresponded: number
  overdueCompletion: number
}

export interface AdminConsultationRow {
  id: string
  studentId: string
  studentName: string
  facultyId: string
  facultyName: string
  departmentId: string
  departmentName: string
  meetingType: string
  date: string
  startTime: string
  endTime: string
  title: string | null
  description: string | null
  actionTaken: string | null
  additionalRemarks: string | null
  status: string
  teamsLink: string | null
}

export interface IReportsRepository {
  getDepartmentConsultationStats(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<FacultyStatsData[]>

  getDepartmentConsultationAppointments(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<RawAppointmentData[]>

  getConsultationSummaries(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<ConsultationSummaryData[]>

  getDepartmentFrequency(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<DepartmentFrequencyEntry[]>

  getFacultyFrequency(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<FacultyFrequencyData[]>

  getDepartmentDailyFrequency(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<DailyFrequencyData[]>

  getDepartmentWeeklyFrequency(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<WeeklyFrequencyData[]>

  getDepartmentBacklog(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<{
    entries: BacklogEntry[]
    agingBuckets: BacklogAgingBucket[]
    summary: BacklogSummary
  }>

  getDepartmentResponseTimes(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<{
    stats: ResponseTimeStats
    byFaculty: FacultyResponseTime[]
    distribution: ResponseTimeDistribution[]
  }>

  getDepartmentYearlyFrequency(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<DepartmentYearlyEntry[]>

  getFacultyYearlyFrequency(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<FacultyYearlyData[]>

  getConsultationCoverageData(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<CoverageReportData>

  getWorkloadDistribution(
    departmentId: string,
    filters?: { startDate?: string; endDate?: string; status?: string }
  ): Promise<WorkloadDistributionData>

  getAllAppointments(filters?: {
    departmentId?: string
    status?: string
    upcoming?: boolean
    search?: string
  }): Promise<AdminConsultationRow[]>
}

export interface CoverageData {
  totalStudents: number
  studentsWithConsultations: number
  studentsWithoutConsultations: number
  coveragePercentage: number
}

export interface CoverageTrendEntry {
  month: string
  monthName: string
  year: number
  totalStudents: number
  studentsWithConsultations: number
  coveragePercentage: number
}

export interface CoverageReportData {
  overall: CoverageData
  byDepartment: (CoverageData & { departmentId: string; departmentName: string })[]
  trend: CoverageTrendEntry[]
  departmentName: string
}

export interface WorkloadDistributionEntry {
  facultyId: string
  facultyName: string
  departmentId: string
  departmentName: string
  total: number
  completed: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  completionRate: number
  departmentShare: number
}

export interface WorkloadDistributionData {
  entries: WorkloadDistributionEntry[]
  departmentTotal: number
  departmentName: string
}

// ── Bug Report ──────────────────────────────────────────

export interface BugReportData {
  id: string
  userId: string
  userEmail: string
  url: string
  description: string
  status: "open" | "resolved"
  createdAt: Date
}

export interface IBugReportRepository {
  create(data: { userId: string; userEmail: string; url: string; description: string }): Promise<BugReportData>
  list(limit?: number, offset?: number, filters?: { status?: string }): Promise<{ reports: BugReportData[]; total: number }>
  updateStatus(id: string, status: "open" | "resolved"): Promise<BugReportData>
}

// ── Group Access ──────────────────────────────────────────

export interface GroupAccessData {
  groupName: string
  pages: string[]
  api_overrides: Record<string, Record<string, boolean>>
  updatedAt: string
}

export interface IGroupAccessRepository {
  listAll(): Promise<GroupAccessData[]>
  findByGroupName(groupName: string): Promise<GroupAccessData | null>
  create(groupName: string): Promise<GroupAccessData>
  update(groupName: string, data: Partial<GroupAccessData>): Promise<GroupAccessData>
  delete(groupName: string): Promise<void>
  deleteAll(): Promise<void>
  insertMany(groups: GroupAccessData[]): Promise<void>
  listAllPages(): Promise<string[]>
}

// ── User Permissions ──────────────────────────────────────

export interface UserPermissionData {
  id: number
  user_id: string
  resource_path: string
  grants: string[]
  denies: string[]
}

export interface IUserPermissionRepository {
  findByUserId(userId: string): Promise<UserPermissionData[]>
  findByUserIdLight(userId: string): Promise<{ resource_path: string; grants: string[] }[]>
  upsertPermission(userId: string, resource_path: string, grants?: string[], denies?: string[]): Promise<UserPermissionData | null>
  deleteByUserId(userId: string): Promise<void>
  listAll(): Promise<UserPermissionData[]>
  deleteAll(): Promise<void>
  insertMany(perms: { user_id: string; resource_path: string; grants: string[]; denies: string[] }[]): Promise<void>
}

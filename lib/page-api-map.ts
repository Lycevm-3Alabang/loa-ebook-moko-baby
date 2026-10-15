export interface PageApiEntry {
  label: string
  apis: string[]
}

export const pageApiMap: Record<string, PageApiEntry> = {
  // ── General ──
  "/": { label: "Dashboard (root)", apis: [] },
  "/403": { label: "Forbidden", apis: [] },
  "/faq": { label: "FAQ", apis: [] },

  // ── Auth ──
  "/login": { label: "Login", apis: [] },
  "/activate": { label: "Activate Account", apis: ["/api/auth/activate"] },
  "/forgot-password": { label: "Forgot Password", apis: ["/api/auth/forgot-password"] },
  "/change-password": { label: "Change Password", apis: ["/api/auth/change-password", "/api/auth/change-password/validate"] },
  "/setup-password": { label: "Setup Password", apis: [] },

  // ── Admin ──
  "/admin": {
    label: "Admin Dashboard",
    apis: [],
  },
  "/admin/data/users": {
    label: "Data Users",
    apis: ["/api/admin/users", "/api/auth/activate"],
  },
  "/admin/data/users/deleted": {
    label: "Deleted Users",
    apis: ["/api/admin/users/deleted", "/api/admin/users/[id]/restore"],
  },
  "/admin/system/access-config": {
    label: "Access Configuration",
    apis: [
      "/api/admin/access-config",
      "/api/admin/users",
      "/api/admin/user-permissions/paths",
      "/api/admin/user-permissions/[userId]",
      "/api/auth/me",
    ],
  },
  "/admin/system/user-permissions": {
    label: "User Permissions",
    apis: [
      "/api/admin/access-config",
      "/api/admin/users",
      "/api/admin/user-permissions/paths",
      "/api/admin/user-permissions/[userId]",
      "/api/auth/me",
    ],
  },
  "/admin/system/audit-trail": {
    label: "Audit Trail",
    apis: ["/api/admin/audit-logs"],
  },
  "/admin/system/reported-bugs": {
    label: "Reported Bugs",
    apis: ["/api/bug-reports", "/api/bug-reports/[id]"],
  },
  "/admin/data/maintenance": {
    label: "Maintenance",
    apis: ["/api/admin/data/delete-students", "/api/admin/data/export-consultations"],
  },
  "/admin/data/academic-infrastructure": {
    label: "Academic Configurations",
    apis: [
      "/api/semesters",
      "/api/admin/departments",
      "/api/admin/department-courses",
      "/api/admin/subjects",
      "/api/admin/sections",
      "/api/admin/faculty-subjects",
      "/api/admin/student-enrollments",
      "/api/admin/users",
      "/api/data/evaluation-mappings",
      "/api/evaluation-periods",
      "/api/auth/me",
      "/api/import/faculties",
    ],
  },
  "/admin/evaluations": {
    label: "Evaluations",
    apis: [],
  },
  "/admin/evaluations/disabled": {
    label: "Invalidated Evaluations",
    apis: ["/api/admin/evaluations/disabled"],
  },
  "/admin/evaluations/results": {
    label: "Evaluation Results",
    apis: [
      "/api/admin/evaluation-results",
      "/api/dean/evaluation-results/details",
      "/api/admin/evaluation-results/visibility",
      "/api/data/evaluation-mappings",
    ],
  },
  "/admin/evaluations/status": {
    label: "Evaluation Status",
    apis: [
      "/api/admin/evaluation-status",
      "/api/evaluation-periods",
    ],
  },
  "/admin/evaluations/rubrics": {
    label: "Rubrics",
    apis: [
      "/api/evaluation-periods",
      "/api/evaluation-periods/[id]/rubric",
      "/api/evaluation-periods/[id]/rubrics/items",
    ],
  },
  "/admin/consultations": {
    label: "All Consultations",
    apis: [],
  },
  "/admin/consultations/reports/health": {
    label: "General Report",
    apis: [],
  },
  "/admin/consultations/reports/demand": {
    label: "Demand Report",
    apis: [],
  },
  "/admin/consultations/reports/backlog": {
    label: "Backlog Report",
    apis: [],
  },
  "/admin/consultations/reports/coverage": {
    label: "Coverage Report",
    apis: [],
  },
  "/admin/consultations/reports/distribution": {
    label: "Distribution Report",
    apis: [],
  },
  "/admin/consultations/reports": {
    label: "Reports",
    apis: [],
  },

  // ── Dean ──
  "/dean": {
    label: "Dean Dashboard",
    apis: ["/api/appointments/[id]/decline", "/api/appointments/[id]/accept", "/api/appointments/[id]/teams-link", "/api/auth/onboarding"],
  },
  "/dean/evaluations": {
    label: "Evaluations",
    apis: [],
  },
  "/dean/evaluations/results": {
    label: "Evaluation Results",
    apis: [
      "/api/dean/evaluation-results",
      "/api/dean/evaluation-results/details",
      "/api/admin/evaluation-results/visibility",
      "/api/data/evaluation-mappings",
      "/api/evaluation-periods",
    ],
  },
  "/dean/evaluations/rubrics": {
    label: "Rubrics",
    apis: [
      "/api/evaluation-periods",
      "/api/evaluation-periods/[id]/rubric",
      "/api/evaluation-periods/[id]/rubrics/items",
    ],
  },
  "/dean/evaluations/reports": {
    label: "Evaluation Reports",
    apis: [],
  },
  "/dean/evaluations/reports/sentiment": {
    label: "Sentiment Analysis",
    apis: ["/api/evaluation-periods", "/api/evaluation-comments"],
  },
  "/dean/evaluations/reports/detail": {
    label: "Evaluation Reports Detail",
    apis: ["/api/dean/evaluation-results/details"],
  },
  "/dean/departments": {
    label: "Departments",
    apis: ["/api/admin/users", "/api/admin/department-courses"],
  },
  "/dean/data/users": {
    label: "Data Users",
    apis: ["/api/admin/users", "/api/auth/activate"],
  },
  "/dean/data/users/deleted": {
    label: "Deleted Users",
    apis: ["/api/admin/users/deleted", "/api/admin/users/[id]/restore"],
  },
  "/dean/data/academic-infrastructure": {
    label: "Academic Configurations",
    apis: [
      "/api/semesters",
      "/api/admin/departments",
      "/api/admin/department-courses",
      "/api/admin/subjects",
      "/api/admin/sections",
      "/api/admin/faculty-subjects",
      "/api/admin/student-enrollments",
      "/api/admin/users",
      "/api/data/evaluation-mappings",
      "/api/evaluation-periods",
      "/api/auth/me",
      "/api/import/faculties",
    ],
  },
  "/dean/upload": {
    label: "Import Users",
    apis: [],
  },
  "/dean/reports/health": {
    label: "Health Report",
    apis: [],
  },
  "/dean/reports/demand": {
    label: "Demand Report",
    apis: [],
  },
  "/dean/reports/backlog": {
    label: "Backlog Report",
    apis: [],
  },
  "/dean/reports/coverage": {
    label: "Coverage Report",
    apis: [],
  },
  "/dean/reports/distribution": {
    label: "Distribution Report",
    apis: [],
  },
  "/dean/reports": {
    label: "Reports",
    apis: [],
  },

  // ── Faculty ──
  "/faculty": {
    label: "Faculty Dashboard",
    apis: ["/api/appointments/[id]/decline", "/api/appointments/[id]/accept", "/api/appointments/[id]/teams-link", "/api/auth/onboarding", "/api/semesters"],
  },
  "/faculty/meetings": {
    label: "Faculty Meetings",
    apis: [
      "/api/appointments/[id]",
      "/api/appointments/[id]/accept",
      "/api/appointments/[id]/decline",
      "/api/appointments/[id]/teams-link",
      "/api/appointments/slots/[slotId]/teams-link",
      "/api/appointments/[id]/complete",
      "/api/appointments/[id]/files",
      "/api/appointments/[id]/retry-sync",
    ],
  },
  "/faculty/meetings/new": {
    label: "New Meeting",
    apis: [
      "/api/appointments/batch",
      "/api/appointments/faculty-booked",
      "/api/users/primary",
      "/api/users/attendees",
      "/api/availability-rules",
    ],
  },
  "/faculty/availability": {
    label: "Availability Settings",
    apis: ["/api/availability-rules"],
  },
  "/faculty/upload": {
    label: "Import Students",
    apis: [],
  },
  "/faculty/reports": {
    label: "Department Reports",
    apis: [],
  },
  "/faculty/evaluations": {
    label: "Evaluations",
    apis: ["/api/evaluation-periods", "/api/faculty/evaluation-results"],
  },
  "/faculty/evaluations/results": {
    label: "Evaluation Results",
    apis: [
      "/api/faculty/evaluation-results",
      "/api/data/evaluation-mappings",
      "/api/evaluation-periods",
      "/api/dean/evaluation-results/details",
      "/api/admin/evaluation-results/visibility",
      "/api/admin/evaluation-results/invalidate",
      "/api/admin/departments",
    ],
  },
  "/faculty/evaluations/reports": {
    label: "Evaluation Reports",
    apis: ["/api/dean/evaluation-results/details"],
  },

  // ── Student ──
  "/student": {
    label: "Student Dashboard",
    apis: ["/api/auth/onboarding", "/api/semesters"],
  },
  "/student/book": {
    label: "Book Consultation",
    apis: [
      "/api/appointments/batch",
      "/api/appointments/faculty-booked",
      "/api/users/primary",
      "/api/users/attendees",
      "/api/availability-rules",
    ],
  },
  "/student/meetings": {
    label: "Student Meetings",
    apis: [
      "/api/appointments/[id]",
      "/api/appointments/[id]/student-cancel",
    ],
  },
  "/student/history": {
    label: "Consultation History",
    apis: [],
  },
  "/student/evaluations": {
    label: "Faculty Evaluations",
    apis: [
      "/api/evaluation-periods",
      "/api/evaluation-periods/[id]/rubric",
      "/api/evaluations/pending",
      "/api/evaluations",
      "/api/evaluations/[id]/ratings",
      "/api/evaluations/[id]/comments",
      "/api/evaluations/[id]/submit",
      "/api/evaluations/dispute",
      "/api/student/evaluations/bootstrap",
    ],
  },
  "/student/evaluations/thank-you": {
    label: "Evaluation Thank You",
    apis: [],
  },
  "/evaluate": {
    label: "Evaluation Form",
    apis: [
      "/api/evaluations/[id]",
      "/api/evaluations/[id]/ratings",
      "/api/evaluations/[id]/comments",
      "/api/evaluations/[id]/submit",
      "/api/evaluation-periods",
      "/api/evaluation-periods/[id]/rubric",
    ],
  },
}

export function getApisForPage(pagePath: string): string[] {
  const entry = pageApiMap[pagePath]
  return entry?.apis ?? []
}

export function getPagesForApi(apiPath: string): string[] {
  const pages: string[] = []
  for (const [page, entry] of Object.entries(pageApiMap)) {
    if (entry.apis.includes(apiPath)) {
      pages.push(page)
    }
  }
  return pages
}

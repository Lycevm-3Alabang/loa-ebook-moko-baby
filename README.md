# ACES — Academic Consultation & Evaluation System

Academic consultation management system built with **Next.js 16**, **Supabase**, and **Tailwind CSS 4**.

## Architecture

### Database

Supabase PostgreSQL. Tables created via `supabase-schema.sql` (run in Supabase SQL Editor).

### MS Teams Integration

Optional — guarded by `FEATURE_CREATE_TEAMS_MEETING` flag. Sync tracking fields on `Appointment` (`teamsSyncStatus`, `teamsSyncRetries`, etc.) with a cron-triggered endpoint at `POST /api/admin/sync-teams`.

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Client["🌐 Client Layer"]
        Browser["Browser / Mobile"]
    end

    subgraph Edge["🛡️ Edge / Middleware"]
        proxy["proxy.ts<br/>JWT Validation<br/>Role-based Access<br/>Mobile-UA Redirect"]
    end

    subgraph Presentation["🎨 Presentation Layer"]
        direction TB
        Pages["app/ (Pages & Layouts)<br/>Server Components → async data fetch<br/>Client Components → fetch / hooks"]
        API["app/api/ (REST Handlers)<br/>Thin — parse request → call controller"]
        UI["components/ui/ + layouts/<br/>Skeleton, SubmitButton, Sidebar..."]
    end

    subgraph Application["⚙️ Application Layer"]
        direction TB
        Controllers["features/*/*.controller.ts<br/>Orchestration, cross-domain aggregation, DTO shaping"]
        Services["features/*/*.service.ts<br/>Business logic, validation, single-domain queries"]
    end

    subgraph DataAccess["🗄️ Data Access Layer"]
        Repos["features/*/*.repository.ts<br/>Type-safe data access via Supabase REST"]
        Factory["lib/repositories/factory.ts<br/>Wires repositories via DI"]
    end

    subgraph Infrastructure["🔧 Infrastructure Layer"]
        direction TB
        DB[("Supabase PostgreSQL<br/>supabase-schema.sql")]
        Email["lib/services/email.ts<br/>Nodemailer (Gmail SMTP)"]
        Workflows["lib/workflows/email-workflows.ts<br/>Vercel Workflows (durable delivery)"]
        Templates["lib/email-templates/<br/>HTML template literals"]
        Types["lib/types/<br/>Entity, DTO, repository interfaces"]
        Utils["lib/utils/<br/>Date, roles, semester helpers"]
        Audit["features/audit/<br/>Audit logging"]
        ICS["lib/services/<br/>iCal generation"]
    end

    Browser --> proxy
    proxy --> Pages
    proxy --> API
    Pages --> Controllers
    Pages --> Services
    API --> Controllers
    Controllers --> Services
    Controllers --> Repos
    Services --> Repos
    Services --> Workflows
    Services --> Audit
    Services --> ICS
    Controllers --> Types
    Services --> Types
    Repos --> Factory
    Repos --> DB
    Workflows --> Email
    Email --> Templates
    Pages --> UI

    linkStyle default stroke:#666,stroke-width:1.5px
```

### Layered Structure

```
app/                          # Next.js App Router — pages, layouts, API routes (174 files)
├── (auth)/                   # Auth route group (login, activate, forgot-password)
├── api/                      # REST API routes (thin handlers -> controllers)
├── admin/                    # Admin dashboard & management
├── dean/                     # Dean dashboard & management
├── faculty/                  # Faculty dashboard & management
├── student/                  # Student dashboard & booking
├── 403/                      # Access denied page
├── faq/                      # FAQ page
├── error.tsx                 # Global error boundary (inside layout)
├── global-error.tsx          # Root error boundary (outside layout)
├── layout.tsx                # Root layout (SessionProvider + AppShell)
└── page.tsx                  # Root page (role-based redirect / multi-role selector)

features/                     # Domain slices — controllers, services, repos, UI (120 files)
├── appointments/             # Booking, conflict detection, calendar, Teams sync
├── reports/                  # 7 report types + 6 controllers + merge helpers
├── users/                    # User CRUD, bulk import, auth flows
├── evaluations/              # Evaluation periods, forms, ratings, comments
├── evaluation-results/       # Computing and viewing evaluation results
├── admin-data/               # Departments, semesters, subjects, sections, enrollments
├── rubrics/                  # Rubric CRUD + category/item management
├── audit/                    # Audit logging
└── user-permissions/         # Permission management

components/                   # Global reusable React components (23 files — ui/ + layouts/)
├── ui/                       # StatusBadge, Skeleton, SubmitButton, SearchInput, etc.
└── layouts/                  # AppShell, Sidebar, Navbar, Providers, Breadcrumbs

lib/                          # Cross-cutting infrastructure (62 files)
├── repositories/             # Repository factory + Supabase implementations
│   └── supabase/             #   (16 repository files)
├── services/                 # Email, audit, CSV parse, iCal generation
├── email-templates/          # HTML email templates (5 variants)
├── types/                    # Shared type definitions (entity, dto, repository)
├── utils/                    # Date, roles, semester helpers
├── workflows/                # Vercel Workflow functions (email orchestration)
├── api/                      # API utility helpers
├── contexts/                 # React context providers
├── db/                       # DB client helpers
└── __tests__/                # Test files (14 files)

hooks/                        # Custom React hooks (2 files)
├── useDebounce.ts
└── usePullToRefresh.ts

types/                        # Global type augmentations (1 file)
└── jspdf-autotable.d.ts
```

### Data Flow

```
Browser HTTP Request
    ↓
proxy.ts (NextAuth Middleware) — JWT validation, mobile-UA redirect, role-based page access
    ↓
Next.js App Router / API Routes
    ↓
API Route Handler (thin) — parse request, call controller, return JSON
    ↓
Controller (features/*/*.controller.ts) — orchestration, cross-domain aggregation, DTO shaping
    ↓
Service (features/*/*.service.ts) — business logic, validation, single-domain data fetching
    ↓
Repository (features/*/*.repository.ts) — data access via Supabase REST API
    ↓
Supabase PostgreSQL
```

Server Components fetch data directly via controllers (or services for simpler lookups) and pass props to Client Components.

### Current Patterns

| Pattern | Implementation |
|---------|---------------|
| **Routing** | Next.js App Router — file-based, route groups, dynamic `[id]` routes |
| **Auth** | NextAuth v4 (Credentials provider, JWT, bcryptjs) |
| **Authorization** | Middleware (`proxy.ts`) + per-route `auth()` calls + DB role checks |
| **Data access** | Repository pattern with interface abstraction |
| **Layered architecture** | Controller orchestrates cross-domain logic + DTO shaping; service handles pure business logic and single-domain data fetching; repository handles data access |
| **Roles** | Multi-role via pipe-delimited string in `user.role`; resolved by priority (ADMIN > DEAN > FACULTY > STUDENT); Faculty ⇔ Dean mutually exclusive |
| **UI state** | React built-in hooks (`useState`, `useEffect`); no global state library |
| **Forms** | Local `useState`; `SubmitButton` double-click prevention |
| **Email** | Nodemailer (Gmail SMTP), durable via Vercel Workflows with sequenced steps |
| **iCal** | Custom `.ics` generation (no library) |
| **CSV import** | Custom parser in `lib/services/` |
| **PDF export** | jsPDF + jspdf-autotable (dynamically imported on click) |
| **Code splitting** | `next/dynamic` for tab-based report content; chart/schedule/summary views loaded on tab activation |
| **Batch DB ops** | `Promise.all` for parallel slot/attendee creation and conflict checks instead of sequential `for...of` + `await` |
| **Feature flags** | Environment variables (`EMAIL_FEATURE_FLAG`, `SSO_FEATURE_FLAG`, etc.) |
| **Loading states** | Dedicated skeleton components + `loading.tsx` per route segment |
| **Dark mode** | Class-based (`.dark` on `<html>`), persisted in localStorage, Tailwind v4 `@custom-variant dark` |

### File Count

| Directory | Source Files |
|-----------|-------------|
| `app/` | 174 (pages, API routes, layouts, error boundaries, loading states) |
| `features/` | 120 (controllers, services, repos, actions, domain components) |
| `components/` | 23 (global React components in ui/ + layouts/) |
| `lib/` | 63 (types, utils, tests, services, repos factory, workflows, email) |
| `hooks/` | 2 |
| `types/` | 1 |
| Total | ~398 source files |

### Page Rendering Strategy

Pages use one of three patterns depending on interactivity needs:

| Pattern | Count | How it works |
|---------|-------|-------------|
| **Server Component** | 20 | `async function` page imports controller/service directly, fetches data during SSR, passes props to client children |
| **Client Component** | 22 | `"use client"` page calls API routes via `fetch`/custom hooks for data and mutations |
| **Redirect / Static** | 10 | Redirect-only (`redirect()`) or static UI with no data fetching |

| Route | Pattern | Notes |
|-------|---------|-------|
| `/` | Redirect | Conditional redirect based on session/role |
| `/403` | Static | Forbidden page |
| `/faq` | Server | Imports lib directly |
| `/login` | Client | Auth form |
| `/activate` | Client | Account activation form |
| `/forgot-password` | Client | Password reset form |
| `/change-password` | Client | Password change form |
| `/admin` | Server | Dashboard — imports services |
| `/admin/reports` | Redirect | → `/admin/reports/health` |
| `/admin/reports/health` | Server | Imports `admin-reports.controller` |
| `/admin/reports/backlog` | Server | Imports `backlog.controller` |
| `/admin/reports/coverage` | Server | Imports `coverage.controller` |
| `/admin/reports/distribution` | Server | Imports `distribution.controller` |
| `/admin/reports/demand` | Server | Imports `demand.controller` |
| `/admin/reports/responsiveness` | Redirect | → `/admin/reports/health` |
| `/admin/evaluations` | Server | Evaluations hub |
| `/admin/evaluations/results` | Client | Wraps `EvaluationDashboard` |
| `/admin/evaluations/rubrics` | Client | Rubric CRUD |
| `/admin/evaluations/reports` | Server | Reports hub |
| `/admin/evaluations/reports/sentiment` | Client | Sentiment analysis chart |
| `/admin/data/users` | Client | User management (replaces old `/admin/users`) |
| `/admin/data/users/deleted` | Client | Deleted users list |
| `/admin/data/academic-infrastructure` | Client | Multi-tab data manager |
| `/admin/system/audit-trail` | Client | Audit log viewer (moved from `/admin/audit-trail`) |
| `/admin/system/access-config` | Client | Access config list (moved from `/admin/access-config`) |
| `/admin/system/access-config/[groupName]` | Client | Group detail editor |
| `/admin/data/maintenance` | Client | Data purge/management (moved from `/admin/data-management`) |
| `/admin/system/user-permissions` | Redirect | → `/admin/system/access-config` |
| `/admin/etl-hub` | Client | ETL import with preview |
| `/dean` | Server | Dashboard — imports services |
| `/dean/departments` | Client | Department course management |
| `/dean/evaluations` | Server | Dean evaluations list |
| `/dean/evaluations/results` | Client | Wraps `EvaluationDashboard` |
| `/dean/evaluations/reports` | Server | Reports hub |
| `/faculty` | Server | Dashboard — imports services |
| `/faculty/upload` | Client | Bulk import uploader |
| `/faculty/availability` | Client | Availability scheduler |
| `/faculty/meetings` | Server | Meetings list |
| `/faculty/meetings/new` | Server | Schedule meeting form |
| `/faculty/meetings/[id]` | Static | Delegates to client `<AppointmentDetail>` |
| `/faculty/reports` | Redirect | → `/admin/reports/health` |
| `/faculty/evaluations` | Client | Evaluation periods list |
| `/faculty/evaluations/[periodId]` | Server | Faculty period breakdown |
| `/faculty/evaluations/results` | Client | Wraps `EvaluationDashboard` |
| `/student` | Server | Dashboard — imports services |
| `/student/book` | Server | Book consultation |
| `/student/history` | Server | Consultation history |
| `/student/meetings` | Server | Meetings list |
| `/student/meetings/[id]` | Static | Delegates to client `<AppointmentDetail>` |
| `/student/evaluations` | Client | Pending evaluations list |
| `/student/evaluations/[id]` | Client | Evaluation form |
| `/student/evaluations/history` | Client | Past evaluations list |
| `/student/evaluations/thank-you` | Static | Thank-you confirmation |

### Known Issues & Risks

1. **Minimal test coverage** — Only 14 test files (166 tests) for ~23,000 LOC. Critical paths remain untested: full report aggregation edge cases, most repository methods, email workflow orchestration edge cases.
2. **HTML email templates via template literals** — Fragile string concatenation. No type safety or template engine.

## Environment Variables

Copy `.env` to set up your local environment.

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | NextAuth signing secret (generate via `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | App base URL (`http://localhost:3000` for dev) |
| `AUTH_URL` | No | Alias for NEXTAUTH_URL |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `SSO_FEATURE_FLAG` | No | Enable Microsoft Entra ID sign-in |
| `EMAIL_FEATURE_FLAG` | No | Enable email sending via Gmail SMTP |
| `GMAIL_USER` | If email | Gmail address for sending activation emails |
| `GMAIL_APP_PASSWORD` | If email | Gmail app password |
| `FEATURE_CREATE_TEAMS_MEETING` | No | Master toggle for Teams sync features |

## UI Patterns

### Double-Click Prevention

All form submissions and action buttons use `SubmitButton` (`components/ui/SubmitButton.tsx`) which has a built-in `useRef` guard that blocks re-entry for 500ms after the first click, preventing double-submissions even before React re-renders.

### Skeleton Loading

Client-side pages that fetch data on mount show skeleton placeholders (`components/ui/Skeleton.tsx`) instead of "Loading..." text. Variants: `text`, `card`, `table-row`, `avatar`, `metric`, `badge`, plus composite layouts `SkeletonTable`, `SkeletonMetricGrid`, `SkeletonCard`.

### Redirect Guard on Login

The login page checks `useSession()` on mount and auto-redirects already-authenticated users to their role-specific dashboard, preventing them from seeing the login form after session errors or redirects.

### Dark Mode

Class-based strategy: `.dark` class on `<html>` toggles Tailwind `dark:` variants. Persisted in `localStorage` with an inline no-flash script in `<head>`. Sidebar toggle uses sun/moon icons. CSS variable overrides in `globals.css` for custom components.

## Email Delivery via Vercel Workflows

### Architecture

Emails are sent through **Vercel Workflows** (durable execution) with built-in retries per step, surviving deployment restarts and serverless cold starts. On local development the `"use workflow"` / `"use step"` directives are no-ops and functions run as regular async calls.

### Workflow Functions

| Function | Purpose | Steps |
|----------|---------|-------|
| `sendConsultationInviteWorkflow` | Student → Faculty consultation invite | 1 — `sendConsultationInvite` |
| `sendApprovedWorkflow` | Consultation accepted with Teams link | 1 — `sendApprovedWithTeamsLink` |
| `sendPasswordChangedWorkflow` | Password change notification | 1 — `sendPasswordChangedEmail` |
| `sendAppointmentCreatedWorkflow` | Dynamic booking email dispatch | 1 — `sendAppointmentCreatedEmail` |
| `sendConsultationApprovedWorkflow` | Student-booking accepted | 1 — `sendConsultationApprovedEmail` |
| `sendMeetingInviteWithAcknowledgementWorkflow` | Faculty/Dean booking: invite → creator ack | 2 — `sendInviteStep` → `sendAcknowledgementStep` |
| `sendConsultationInviteWithAcknowledgementWorkflow` | Student booking: invite → student ack | 2 — `sendConsultationInviteStep` → `sendAcknowledgementStep` |
| `sendStatusUpdateWorkflow` | Accept/complete/cancel notifications | 1 — `sendStatusUpdateEmail` |

### Email Flows

| Trigger | Recipients | Template | Workflow |
|---------|-----------|----------|----------|
| Student books consultation | Faculty TO + CC attendees | `consultation-invite` | `sendConsultationInviteWithAcknowledgementWorkflow` |
| Student books consultation (ack) | Student | `booking-acknowledgement` (request variant) | ↑ step 2 |
| Faculty/Dean creates meeting | Attendees TO + CC | `meeting-invite` | `sendMeetingInviteWithAcknowledgementWorkflow` |
| Faculty/Dean creates meeting (ack) | Creator | `booking-acknowledgement` (booking variant) | ↑ step 2 |
| Faculty accepts consultation (student-booking) | Student TO, CC faculty + attendees | `consultation-approved` | `sendConsultationApprovedWorkflow` |
| Faculty accepts (self-booking) | Faculty TO, CC attendees | `status-notification` (accepted + creator wording) | `sendStatusUpdateWorkflow` |
| Appointment cancelled | Non-actor participants | `status-notification` (cancelled) | `sendStatusUpdateWorkflow` |
| Appointment completed | Creator TO, CC attendees | `status-notification` (completed + action taken) | `sendStatusUpdateWorkflow` |
| Password changed | User | Inline HTML | `sendPasswordChangedWorkflow` |

### Files

| File | Role |
|------|------|
| `lib/services/email.ts` | Low-level Nodemailer senders (7 functions) |
| `lib/email-templates/*.ts` | HTML templates (5 variants) |
| `lib/workflows/email-workflows.ts` | Durable workflow wrappers (8 functions) |
| `features/appointments/appointments.controller.ts` | Orchestration that invokes workflows |
| `features/reports/*.controller.ts` | 6 report controllers (admin-reports, backlog, coverage, demand, distribution, responsiveness) |
| `features/reports/*.service.ts` | 6 report services (pure helpers only — merge, computeByFaculty, etc.) |

### Prerequisites for Production

- Vercel deployment (Workflows require Vercel infrastructure)
- `VERCEL_ENV` (automatically set on Vercel)
- `"workflow"` dependency in `package.json` (already installed)

## Quick Start

### Setup

```bash
# 1. Run supabase-schema.sql in Supabase SQL Editor (creates all tables + seed data)
# 2. Configure .env with Supabase credentials
# 3. Deploy
```

## Seed Accounts

| Role | Email | Password | Activated |
|------|-------|----------|-----------|
| Admin | admin@lyceumalabang.ph | `a7Kx9mPq4Rz2wY8b` | Yes |
| Dean | regie@itmlyceumalabang.onmicrosoft.com | `password123` | No |
| Faculty | nino_francisco_alamo@itmlyceumalabang.onmicrosoft.com | `password123` | No |
| Student | nin.alamo@outlook.com | `password123` | No |

Non-activated accounts must use the activation flow at `/activate`.

## Feature Status

| Phase | Status |
|-------|--------|
| 1. Availability Rules Engine | ✅ Done |
| 2. Faculty Dashboard Tabs | ✅ Done |
| 3. Faculty Cancel Flow | ✅ Done |
| 4. Student Cancellation | ✅ Done |
| 5. Faculty-to-Faculty Meetings | ✅ Done |
| 6. Sync Tracking Fields | ✅ Done |
| 7. Teams Sync Orchestration | ✅ Done |
| 8. Conflict Detection w/ Teams | ✅ Done |
| 9. Enhanced Booking (Title, Desc, Attendees) | ✅ Done |
| 10. Department & Dean Role | ✅ Done |
| 11. ETL — Bulk User Import (CSV) | ✅ Done |
| 12. Email-based Auth & Password Setup | ✅ Done |
| 13. Consultation Completion (Action Taken) | ✅ Done |
| 14. Attendee Permissions | ✅ Done |
| 15. Reports & Export | ✅ Done |
| 16. Staggered & Multi-Faculty Booking | ✅ Done |
| 17. Mobile Companion Pages | ✅ Done |
| 18. Dark Mode | ✅ Done |
| 19. Pagination & Indexes | ✅ Done |

## Recent Improvements

### Academic Infrastructure Setup Guide
- Added collapsible "Setup Guide — What depends on what?" UI to `/admin/data/academic-infrastructure`
- Shows 7-step dependency chain for Semesters → Departments → Courses → Subjects → Sections → Faculty Loading → Enrollments
- New section helps admins understand the correct setup order before adding data

### Bulk Subject Importer
- New `BulkSubjectImport` component in `/admin/data/academic-infrastructure`
- Supports CSV upload with preview table, inline editing, status badges (New amber, update blue, exists green)
- Added `GET /api/import/subjects/reference` API for duplicate detection
- Updated `subjectRepository.upsertMany` with full update semantics — updates name when code exists but name differs
- Includes download templates, success/failure CSV exports

### Student History Performance Improvements
- Fixed UX flaw: Student history page had 5 sequential queries, no parallel execution
- Changed from single-page fetch to 2-phase parallel: Wave 1 (user, appointments, evaluations), Wave 2 (faculty names, audit logs)
- Leaned down `appointmentSelect` for history use case (removes redundant student join, unused attendees join)
- Added new `findByEvaluatorBrief` with only 4 columns instead of `*` in `evaluations.repository.ts`
- Created `idx_audit_logs_email_action_created` composite index to eliminate full table scans for email+action filters

## Architecture/Better Performance Summary

### Database Optimization
- **Audit Logs query** now uses composite index (`email, action, createdAt`) — eliminates full table scans
- **Appointments query** for history uses minimal select — removes unused `studentId`, `facultyId`, `teamsLink`, `teamsSyncStatus`, etc.
- **Evaluations query** fetches only needed `id, evaluateeId, status, submittedAt` — not `SELECT *`

### Performance Wins
- **Student history page**: 5 sequential round-trips → 2 parallel waves
- **Bulk subject import**: Smart duplicate detection with name updates
- **Academic infrastructure**: Clear setup order guidance for new admins
- **Test coverage**: 203 tests across 17 files (14 existing + 3 new test files)

## Code Quality Improvements
- All existing tests pass (206 tests across 17 files)
- Comprehensive tests added for new code (csv-utils, subject repository, subject reference route)
- Includes submission infrastructure with feature content submission workflow support
- New API endpoints for academic data management

## Faculty Evaluation Module

**Implementation branch:** `eval`
**Working plan:** `FACULTY-EVALUATION.md`

### Pages

| Route | Status |
|-------|--------|
| `/admin/data/users` | ✅ Done — Moved from `/admin/users`, CRUD only |
| `/admin/data/users/deleted` | ✅ Done — Moved from `/admin/users/deleted` |
| `/admin/data/departments` | ✅ Done — Moved from `/admin/departments` |
| `/admin/data/subjects` | ✅ Done — Searchable subject table |
| `/admin/data/sections` | ✅ Done — Searchable section table |
| `/admin/data/faculty-mappings` | ✅ Done — Joined faculty-subject view |
| `/admin/data/student-enrollments` | ✅ Done — Joined enrollment view |
| `/admin/etl-hub` | ✅ Done — ETL upload with editable preview |
| `/admin/evaluations` (hub) | ✅ Done |
| `/admin/evaluations/periods` | ✅ Done |
| `/admin/evaluations/periods/new` | ✅ Done |
| `/admin/evaluations/periods/[id]` | ✅ Done |
| `/admin/evaluations/periods/[id]/rubric` | ✅ Done |
| `/admin/evaluations/results` | ✅ Done |
| `/admin/evaluations/rubrics` (standalone editor) | ✅ Done |
| `/admin/evaluations/upload` (ETL status) | ✅ N/A — use `/admin/etl-hub` |
| `/admin/evaluations/reports` (landing + sentiment) | ✅ Done |
| `/dean/evaluations` (dashboard) | ✅ Done |
| `/dean/evaluations/results` | ✅ Done |
| `/dean/evaluations/reports` | ✅ Done |
| `/faculty/evaluations` (dashboard) | ✅ Done |
| `/faculty/evaluations/results` | ✅ Done |
| `/faculty/evaluations/[periodId]` | ✅ Done |
| `/student/evaluations` (pending list) | ✅ Done |
| `/student/evaluations/[id]` (evaluation form) | ✅ Done |
| `/student/evaluations/history` | ✅ Done |

### Database

| Item | Status |
|------|--------|
| Migration 13: 11 new eval tables | ✅ Done (`supabase-schema.sql`) |
| Migration 14: ALTER users (`employeeNo`, `evaluationEligible`) | ✅ Done |
| Migration 15: `group_access` eval paths | ✅ Done |
| Migration 16: Drop periodId FKs, make nullable — decouple ETL from periods | ✅ Done |
| Migration 17: Introduce `sections` table, rewrite `faculty_subjects` + `student_enrollments` to section-based, add `code` to `subjects` | ✅ Done |

### Types

| File | Status |
|------|--------|
| `lib/types/evaluation.ts` (all entity/DTO types) | ✅ Done |

### Repositories

| Repository | Status |
|------------|--------|
| `evaluation-period` | ✅ Done |
| `subject` | ✅ Done |
| `section` | ✅ Done |
| `faculty-subject` | ✅ Done |
| `student-enrollment` | ✅ Done |
| `rubric` | ✅ Done |
| `evaluation` | ✅ Done |
| `evaluation-result` | ✅ Done |
| `evaluation-rating` | ✅ Done — inline in `evaluations.repository.ts` |
| `evaluation-comment` | ✅ Done — inline in `evaluations.repository.ts` |

### Controllers

| Controller | Status |
|------------|--------|
| `evaluation-periods.ts` | ✅ Done |
| `rubrics.ts` | ✅ Done |
| `evaluations.ts` | ✅ Done |
| `evaluation-results.ts` | ✅ Done |
| `sentiment-analysis.ts` | ✅ Done |
| `etl-evaluation.ts` | ✅ N/A — routes call service directly |

### API Routes

| Route | Status |
|-------|--------|
| `GET/POST /api/evaluation-periods` | ✅ Done |
| `GET/PATCH/DELETE /api/evaluation-periods/[id]` | ✅ Done |
| `POST /api/evaluation-periods/[id]/activate` | ✅ Done |
| `GET/POST /api/evaluation-periods/[id]/rubric` | ✅ Done |
| `POST /api/evaluation-periods/[id]/rubric/copy` | ✅ Done |
| `PATCH/DELETE /api/evaluation-periods/[id]/rubrics/categories/[categoryId]` | ✅ Done |
| `POST /api/evaluation-periods/[id]/rubrics/items` | ✅ Done |
| `PATCH/DELETE /api/evaluation-periods/[id]/rubrics/items/[itemId]` | ✅ Done |
| `GET /api/evaluation-periods/[id]/subjects` | ✅ Done |
| `GET /api/evaluation-periods/[id]/faculty-subjects` | ✅ Done |
| `GET /api/evaluation-periods/[id]/enrollments` | ✅ Done |
| `GET /api/evaluation-periods/[id]/enrollment-stats` | ✅ Done |
| `GET /api/evaluations/submitted` | ✅ Done |
| `GET /api/evaluations/[id]` | ✅ Done |
| `PATCH /api/evaluations/[id]/ratings` | ✅ Done |
| `POST /api/evaluations/[id]/submit` | ✅ Done |
| `POST /api/evaluations/[id]/comments` | ✅ Done |
| `GET /api/evaluation-results` | ✅ Done |
| `GET /api/evaluation-results/[id]` | ✅ Done |
| `POST /api/evaluation-results/compute` | ✅ Done |
| `GET /api/evaluation-results/export` | ✅ Done |
| `GET /api/evaluation-comments` | ✅ Done |
| `POST /api/sentiment-analysis/analyze` | ✅ Placeholder |
| `POST /api/sentiment-analysis/batch` | ✅ Placeholder |
| `GET /api/sentiment-analysis/summary` | ✅ Placeholder |
| `admin/evaluation-periods` (CRUD) | ✅ Done |
| `admin/evaluation-results` | ✅ Done |
| `admin/evaluation-results/compute` | ✅ Done |
| `dean/evaluation-results` | ✅ Done |
| `faculty/evaluation-results` | ✅ Done |
| `import/evaluation-faculty` | ✅ Done |
| `import/evaluation-student` | ✅ Done |
| ETL handler for eval types | ✅ Done — `/admin/etl-hub` uses direct import endpoints |

### Shared Components

| Component | Status |
|-----------|--------|
| `RatingScale` | ✅ Done |
| `CategoryProgressBar` | ✅ Done |
| `FacultyResultCard` | ✅ Done |
| `SentimentBadge` | ✅ Done |
| `EvaluationFilters` | ✅ Done |
| `EvaluationForm` | ✅ Done |

### Services

| Service | Status |
|---------|--------|
| `etlEvaluation.ts` (CSV parse + import) | ✅ Done |
| `sentiment.ts` (AI sentiment analysis) | ✅ Placeholder |

### Wiring

| Item | Status |
|------|--------|
| `EtlUploadType` constants | ✅ Done |
| `lib/access.ts` DEFAULT_CONFIG | ✅ Done |
| `components/layouts/Sidebar.tsx` collapsible Evaluations group | ✅ Done |
| `lib/types/index.ts` evaluation export | ✅ Done |

### Summary

| Category | Done | Missing |
|----------|------|---------|
| Pages | 26 | 0 |
| Database | 5 | 0 |
| Types | 1 | 0 |
| Repositories | 10 | 0 |
| Controllers | 6 | 0 |
| API Routes | 27 | 0 |
| Components | 6 | 0 |
| Services | 2 | 0 |
| Wiring | 4 | 0 |
| **Total** | **88** | **0** |

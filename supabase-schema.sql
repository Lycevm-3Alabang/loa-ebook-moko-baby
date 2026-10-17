-- =========================================================
-- E-CONSULT DATABASE SCHEMA
-- Consolidated Supabase/Postgres Schema
-- =========================================================

-- =========================================================
-- 1. DROP ALL TABLES (reverse dependency order)
-- =========================================================

DROP TABLE IF EXISTS evaluation_ratings CASCADE;
DROP TABLE IF EXISTS evaluation_comments CASCADE;
DROP TABLE IF EXISTS evaluation_results CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS student_enrollments CASCADE;
DROP TABLE IF EXISTS faculty_subjects CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS rubric_items CASCADE;
DROP TABLE IF EXISTS rubric_categories CASCADE;
DROP TABLE IF EXISTS rubric_groups CASCADE;
DROP TABLE IF EXISTS rating_scales CASCADE;
DROP TABLE IF EXISTS semesters CASCADE;
DROP TABLE IF EXISTS userrole CASCADE;
DROP TABLE IF EXISTS appointment_time_slots CASCADE;
DROP TABLE IF EXISTS appointment_attendees CASCADE;
DROP TABLE IF EXISTS faculty_availability_rules CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS verification_tokens CASCADE;
DROP TABLE IF EXISTS user_permissions CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS role CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS internal_meeting_participants;
DROP TABLE IF EXISTS internal_meetings;

-- =========================================================
-- 2. REFERENCE / LOOKUP TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  "deanId" TEXT,
  "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS role (
  name TEXT PRIMARY KEY
);

INSERT INTO role (name) VALUES
  ('ADMIN'), ('DEAN'), ('FACULTY'), ('STUDENT'), ('GUEST')
ON CONFLICT (name) DO NOTHING;

-- =========================================================
-- 3. CORE ENTITY TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT,
  "departmentId" TEXT,
  course TEXT,
  "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "hasLoggedInBefore" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastLoginAt" TIMESTAMPTZ,
  "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  "onboardingVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS userrole (
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "roleName" TEXT NOT NULL REFERENCES role(name) ON DELETE CASCADE,
  PRIMARY KEY ("userId", "roleName")
);

-- Circular FK between departments and users
ALTER TABLE departments
ADD CONSTRAINT fk_departments_dean
FOREIGN KEY ("deanId")
REFERENCES users(id)
ON DELETE SET NULL
DEFERRABLE;

ALTER TABLE users
ADD CONSTRAINT fk_users_department
FOREIGN KEY ("departmentId")
REFERENCES departments(id)
ON DELETE SET NULL
DEFERRABLE;

-- =========================================================
-- 4. WORKING / TRANSACTIONAL TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "studentId" TEXT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  "facultyId" TEXT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  "sessionGroupId" TEXT,

  "createdByEmail" TEXT NOT NULL,

  "meetingType" TEXT NOT NULL DEFAULT 'CONSULTATION'
    CHECK (
      "meetingType" IN (
        'CONSULTATION',
        'INTERNAL'
      )
    ),

  date TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,

  title TEXT,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (
      status IN (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  "actionTaken" TEXT,
  "additionalRemarks" TEXT,

  "teamsLink" TEXT,

  "teamsSyncStatus" TEXT NOT NULL DEFAULT 'UNWRITTEN'
    CHECK (
      "teamsSyncStatus" IN (
        'UNWRITTEN',
        'WRITTEN',
        'FAILED'
      )
    ),

  "teamsSyncRetries" INTEGER NOT NULL DEFAULT 0,
  "teamsSyncError" TEXT,
  "teamsSyncLastAttempt" TIMESTAMPTZ,

  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointment_time_slots (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "appointmentId" TEXT NOT NULL
    REFERENCES appointments(id)
    ON DELETE CASCADE,

  date TEXT NOT NULL,

  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,

  "teamsLink" TEXT,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_timeslot_unique
    UNIQUE ("appointmentId", date, "startTime")
);

CREATE TABLE IF NOT EXISTS appointment_attendees (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "appointmentId" TEXT NOT NULL
    REFERENCES appointments(id)
    ON DELETE CASCADE,

  "userId" TEXT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'INVITED'
    CHECK (
      status IN (
        'INVITED',
        'ACCEPTED',
        'DECLINED'
      )
    ),

  "isMandatory" BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT uq_appointment_user
    UNIQUE ("appointmentId", "userId")
);

CREATE TABLE IF NOT EXISTS appointment_files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "appointmentId" TEXT NOT NULL
    REFERENCES appointments(id)
    ON DELETE CASCADE,

  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileData" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_availability_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "facultyId" TEXT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  "dayOfWeek" INTEGER NOT NULL,

  "isBlocked" BOOLEAN NOT NULL DEFAULT FALSE,

  "startTime" TEXT,
  "endTime" TEXT,

  "startDate" TEXT NOT NULL,
  "endDate" TEXT,

  CONSTRAINT uq_faculty_day_date
    UNIQUE ("facultyId", "dayOfWeek", "startDate")
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  email TEXT NOT NULL,

  token TEXT NOT NULL UNIQUE,

  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- 5. NEXTAUTH TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "userId" TEXT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  type TEXT NOT NULL,

  provider TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,

  refresh_token TEXT DEFAULT '',
  access_token TEXT DEFAULT '',

  expires_at INTEGER,

  token_type TEXT DEFAULT '',
  scope TEXT DEFAULT '',
  id_token TEXT DEFAULT '',
  session_state TEXT DEFAULT '',

  CONSTRAINT uq_provider_account
    UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "sessionToken" TEXT NOT NULL UNIQUE,

  "userId" TEXT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,

  token TEXT NOT NULL UNIQUE,

  expires TIMESTAMPTZ NOT NULL,

  CONSTRAINT uq_identifier_token
    UNIQUE (identifier, token)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  "userId" TEXT,

  email TEXT,

  action TEXT NOT NULL,

  details TEXT,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- 6. INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_appointments_student
  ON appointments("studentId");

CREATE INDEX IF NOT EXISTS idx_appointments_faculty
  ON appointments("facultyId");

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments(status);

CREATE INDEX IF NOT EXISTS idx_appointments_date
  ON appointments("date");

CREATE INDEX IF NOT EXISTS idx_appointments_meeting_type
  ON appointments("meetingType");

CREATE INDEX IF NOT EXISTS idx_appointments_faculty_status_date
  ON appointments("facultyId", status, "date");

CREATE INDEX IF NOT EXISTS idx_timeslot_appointment
  ON appointment_time_slots("appointmentId");

CREATE INDEX IF NOT EXISTS idx_timeslot_date
  ON appointment_time_slots(date);

CREATE INDEX IF NOT EXISTS idx_availability_faculty
  ON faculty_availability_rules("facultyId");

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

CREATE INDEX IF NOT EXISTS idx_userrole_user
  ON userrole("userId");

CREATE INDEX IF NOT EXISTS idx_userrole_role
  ON userrole("roleName");

CREATE INDEX IF NOT EXISTS idx_users_department
  ON users("departmentId");

CREATE INDEX IF NOT EXISTS idx_appointment_files_appointment
  ON appointment_files("appointmentId");

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
  ON password_reset_tokens(token);

-- =========================================================
-- 7. DEPARTMENT COURSES (managed by admin/dean)
-- =========================================================

CREATE TABLE IF NOT EXISTS department_courses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "departmentId" TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("departmentId", code)
);

CREATE INDEX IF NOT EXISTS idx_department_courses_dept
  ON department_courses("departmentId");

INSERT INTO department_courses (id, "departmentId", name, code)
SELECT d.id, d.id, 'Bachelor of Science in Information Technology', 'BSIT'
FROM departments d WHERE d.code = 'CCS'
AND NOT EXISTS (SELECT 1 FROM department_courses WHERE "departmentId" = d.id AND code = 'BSIT');

INSERT INTO department_courses (id, "departmentId", name, code)
SELECT d.id || '2', d.id, 'Bachelor of Science in Computer Science', 'BSCS'
FROM departments d WHERE d.code = 'CCS'
AND NOT EXISTS (SELECT 1 FROM department_courses WHERE "departmentId" = d.id AND code = 'BSCS');

CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
   user_id TEXT REFERENCES users(id) ON DELETE CASCADE,

  resource_path VARCHAR(255),
  grants TEXT[],
  denies TEXT[],
  UNIQUE(user_id, resource_path)
);

-- =========================================================
-- 7b. SEMESTERS
-- =========================================================

CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  title TEXT NOT NULL,
  "evalStartDate" DATE,
  "evalEndDate" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semesters_active ON semesters("isActive");



-- =========================================================
-- 9. POST-SCHEMA MIGRATIONS
-- Apply these *after* the main schema above, against an
-- existing database that needs to be upgraded.
-- =========================================================

-- -------------------------------------------------------
-- Migration 1: Populate appointment_time_slots from legacy
--             appointments (run once after adding the
--             appointment_time_slots table)
-- -------------------------------------------------------

BEGIN;

INSERT INTO appointment_time_slots ("appointmentId", date, "startTime", "endTime", "createdAt")
SELECT 
  id,
  date,
  "startTime",
  "endTime",
  NOW()
FROM appointments
ON CONFLICT ("appointmentId", date, "startTime") DO NOTHING;

COMMIT;

-- -------------------------------------------------------
-- Migration 2: Add meetingType column to appointments
--             (run once after schema update adds the column)
-- -------------------------------------------------------

BEGIN;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "meetingType" TEXT NOT NULL DEFAULT 'CONSULTATION'
  CHECK ("meetingType" IN ('CONSULTATION', 'INTERNAL'));

COMMIT;

-- -------------------------------------------------------
-- Migration 3: Add tokenVersion column to users
--             (used for JWT invalidation — increment when
--              a user is disabled or on DB reset)
-- -------------------------------------------------------

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

COMMIT;

-- -------------------------------------------------------
-- Migration 4: Add teamsLink column to appointment_time_slots
--             (run after schema update adds the column)
-- -------------------------------------------------------

BEGIN;

ALTER TABLE appointment_time_slots ADD COLUMN IF NOT EXISTS "teamsLink" TEXT;

COMMIT;

-- -------------------------------------------------------
-- Migration 5: Create appointment_files table
--             (run after schema update adds the table)
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS appointment_files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "appointmentId" TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileData" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_files_appointment
  ON appointment_files("appointmentId");

-- =========================================================
-- IMPORTANT AFTER RUNNING
-- =========================================================
-- Refresh PostgREST schema cache:
--
-- NOTIFY pgrst, 'reload schema';
--
-- This is REQUIRED if embeds still fail.
-- =========================================================

-- Apply this migration to your database
BEGIN;

ALTER TABLE appointments
ALTER COLUMN "studentId" DROP NOT NULL;

COMMIT;

-- =========================================================
-- Migration 7: Remove role CHECK constraint for multi-role support
-- =========================================================

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

COMMIT;

-- =========================================================
-- Migration 8: Create role + userrole tables, migrate existing data
-- Run this after the main schema (or against an existing DB)
-- to move role data from users.role into userrole.
--
-- Uses EXCEPTION-based approach — tries the migration and
-- gracefully catches "column does not exist" errors.
-- This avoids schema-scope pitfalls with information_schema.
-- =========================================================

BEGIN;

-- Create role table if not exists (idempotent for fresh schema runs)
CREATE TABLE IF NOT EXISTS role (
  name TEXT PRIMARY KEY
);

INSERT INTO role (name) VALUES
  ('ADMIN'), ('DEAN'), ('FACULTY'), ('STUDENT'), ('GUEST')
ON CONFLICT (name) DO NOTHING;

-- Create userrole table if not exists
CREATE TABLE IF NOT EXISTS userrole (
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "roleName" TEXT NOT NULL REFERENCES role(name) ON DELETE CASCADE,
  PRIMARY KEY ("userId", "roleName")
);

-- Migrate existing users.role data into userrole
-- Uses EXECUTE + EXCEPTION: if the `role` column doesn't exist
-- (fresh schema), the error is caught and migration is skipped.
DO $$
BEGIN
  EXECUTE '
    INSERT INTO userrole ("userId", "roleName")
    SELECT id, role FROM users
    WHERE role IS NOT NULL
    ON CONFLICT ("userId", "roleName") DO NOTHING;
  ';
  DROP INDEX IF EXISTS idx_users_role;
  ALTER TABLE users DROP COLUMN IF EXISTS role;
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'Migration 8: column "role" does not exist on users — skipping data migration';
END $$;

COMMIT;

-- =========================================================
-- Migration 9: Create group_access table for access control
-- Run this after Migration 8 (or against any existing DB).
-- Stores per-group allowed pages and API endpoints.
-- =========================================================

CREATE TABLE IF NOT EXISTS group_access (
  "groupName" TEXT PRIMARY KEY,
  pages JSONB NOT NULL DEFAULT '[]',
  "api_overrides" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO group_access ("groupName", pages) VALUES
  ('ADMIN',
   '["/admin","/admin/data/maintenance","/admin/data/users/deleted","/admin/system/access-config","/admin/system/user-permissions","/admin/system/audit-trail","/admin/consultations","/admin/consultations/reports/health","/admin/consultations/reports/backlog","/admin/consultations/reports/coverage","/admin/consultations/reports/demand","/admin/consultations/reports/distribution","/faq"]'::JSONB),
  ('DEAN',
   '["/dean","/dean/upload","/dean/departments","/faculty/meetings","/faculty/availability","/faculty/reports","/faq"]'::JSONB),
   ('FACULTY',
    '["/","/403","/faq","/faculty","/faculty/availability","/faculty/evaluations","/faculty/evaluations/results","/faculty/meetings","/faculty/meetings/new","/faculty/reports","/faculty/upload","/api/admin/departments","/api/admin/evaluation-results/invalidate","/api/admin/evaluation-results/visibility","/api/appointments/[id]","/api/appointments/[id]/accept","/api/appointments/[id]/complete","/api/appointments/[id]/decline","/api/appointments/[id]/files","/api/appointments/[id]/retry-sync","/api/appointments/[id]/teams-link","/api/appointments/batch","/api/appointments/faculty-booked","/api/appointments/slots/[slotId]/teams-link","/api/auth/onboarding","/api/availability-rules","/api/data/evaluation-mappings","/api/dean/evaluation-results/details","/api/evaluation-periods","/api/faculty/evaluation-results","/api/semesters","/api/users/attendees","/api/users/primary"]'::JSONB),
   ('STUDENT',
    '["/","/student","/student/book","/student/meetings","/student/history","/student/evaluations","/student/evaluations/history","/student/evaluations/thank-you","/faq","/403","/api/auth/onboarding","/api/appointments/batch","/api/appointments/faculty-booked","/api/appointments/[id]","/api/appointments/[id]/student-cancel","/api/users/primary","/api/users/attendees","/api/availability-rules","/api/evaluation-periods","/api/evaluation-periods/[id]/rubric","/api/evaluations/pending","/api/evaluations","/api/evaluations/[id]/ratings","/api/evaluations/[id]/comments","/api/evaluations/[id]/submit","/api/evaluations/dispute","/api/semesters"]'::JSONB),
  ('GUEST',
   '[]'::JSONB)
ON CONFLICT ("groupName") DO NOTHING;

-- Migration 9a: Update STUDENT group_access with full page and API paths
-- (for existing databases where STUDENT row was inserted with minimal paths)
UPDATE group_access SET pages = '["/","/student","/student/book","/student/meetings","/student/history","/student/evaluations","/student/evaluations/history","/student/evaluations/thank-you","/faq","/403","/api/auth/onboarding","/api/appointments/batch","/api/appointments/faculty-booked","/api/appointments/[id]","/api/appointments/[id]/student-cancel","/api/users/primary","/api/users/attendees","/api/availability-rules","/api/evaluation-periods","/api/evaluation-periods/[id]/rubric","/api/evaluations/pending","/api/evaluations","/api/evaluations/[id]/ratings","/api/evaluations/[id]/comments","/api/evaluations/[id]/submit","/api/evaluations/dispute","/api/semesters"]'::JSONB WHERE "groupName" = 'STUDENT';

-- Migration 9b: Update FACULTY group_access with full page and API paths
UPDATE group_access SET pages = '["/","/403","/faq","/faculty","/faculty/availability","/faculty/evaluations","/faculty/evaluations/results","/faculty/meetings","/faculty/meetings/new","/faculty/reports","/faculty/upload","/api/admin/departments","/api/admin/evaluation-results/invalidate","/api/admin/evaluation-results/visibility","/api/appointments/[id]","/api/appointments/[id]/accept","/api/appointments/[id]/complete","/api/appointments/[id]/decline","/api/appointments/[id]/files","/api/appointments/[id]/retry-sync","/api/appointments/[id]/teams-link","/api/appointments/batch","/api/appointments/faculty-booked","/api/appointments/slots/[slotId]/teams-link","/api/auth/onboarding","/api/availability-rules","/api/data/evaluation-mappings","/api/dean/evaluation-results/details","/api/evaluation-periods","/api/faculty/evaluation-results","/api/semesters","/api/users/attendees","/api/users/primary"]'::JSONB WHERE "groupName" = 'FACULTY';

-- =========================================================
-- Migration 10: RPC for database size checking
-- Run this to enable the get_database_size RPC used by the
-- admin dashboard's storage threshold indicator.
-- =========================================================

CREATE OR REPLACE FUNCTION get_database_size()
RETURNS BIGINT
LANGUAGE SQL
STABLE
AS $$
  SELECT pg_database_size(current_database());
$$;

-- =========================================================
-- Migration 11: Add deletedAt column to users table for
-- soft-delete support. When a user is "deleted", this column
-- is set to NOW() instead of removing the record.
-- Existing queries filter out soft-deleted users by default.
-- =========================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- =========================================================
-- Migration 12: Add isDisabled column to departments table
-- =========================================================

ALTER TABLE departments ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE;

-- =========================================================
-- Migration 13: Faculty Evaluation — new tables
-- =========================================================

CREATE TABLE IF NOT EXISTS rating_scales (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "semesterId" TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 1),
  "displayOrder" INTEGER NOT NULL,
  UNIQUE("semesterId", value)
);

CREATE INDEX IF NOT EXISTS idx_rating_scales_semester ON rating_scales("semesterId");

CREATE TABLE IF NOT EXISTS rubric_groups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  description TEXT,
  seed BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rubric_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  rubric_group_id TEXT NOT NULL REFERENCES rubric_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rubric_categories_group ON rubric_categories(rubric_group_id);

CREATE TABLE IF NOT EXISTS rubric_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "categoryId" TEXT NOT NULL REFERENCES rubric_categories(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "weight" DECIMAL(5,2) NOT NULL DEFAULT 1.00
);

CREATE INDEX IF NOT EXISTS idx_rubric_items_category ON rubric_items("categoryId");

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  program TEXT NOT NULL,
  "departmentCourseId" TEXT NOT NULL REFERENCES department_courses(id),
  "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(name, program)
);

CREATE TABLE IF NOT EXISTS faculty_subjects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  faculty_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  UNIQUE(subject_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_subjects_section ON faculty_subjects(section_id);
CREATE INDEX IF NOT EXISTS idx_faculty_subjects_faculty ON faculty_subjects(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_subjects_subject ON faculty_subjects(subject_id);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  UNIQUE(student_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_section ON student_enrollments(section_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student ON student_enrollments(student_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "semesterId" TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  "evaluatorId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "evaluateeId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED')),
  "submittedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("semesterId", "evaluatorId", "evaluateeId")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluations' AND column_name = 'source'
  ) THEN
    ALTER TABLE evaluations ADD COLUMN "source" TEXT DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evaluations_semester ON evaluations("semesterId");
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator ON evaluations("evaluatorId");
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluatee ON evaluations("evaluateeId");
CREATE INDEX IF NOT EXISTS idx_evaluations_status ON evaluations(status);
CREATE INDEX IF NOT EXISTS idx_evaluations_semester_evaluator ON evaluations("semesterId", "evaluatorId");

CREATE TABLE IF NOT EXISTS evaluation_ratings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "evaluationId" TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES rubric_items(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  UNIQUE("evaluationId", "itemId")
);

CREATE INDEX IF NOT EXISTS idx_eval_ratings_evaluation ON evaluation_ratings("evaluationId");

CREATE TABLE IF NOT EXISTS evaluation_comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "evaluationId" TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  "sentimentScore" DECIMAL(5,4),
  "sentimentLabel" TEXT,
  "sentimentAnalyzedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_comments_evaluation ON evaluation_comments("evaluationId");
CREATE INDEX IF NOT EXISTS idx_eval_comments_sentiment ON evaluation_comments("sentimentLabel");

CREATE TABLE IF NOT EXISTS evaluation_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "semesterId" TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  "facultyId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "departmentId" TEXT REFERENCES departments(id) ON DELETE SET NULL,
  "totalRespondents" INTEGER NOT NULL DEFAULT 0,
  "professionalManner" DECIMAL(5,2),
  "communicationWithStudent" DECIMAL(5,2),
  "studentEngagement" DECIMAL(5,2),
  "learningMaterials" DECIMAL(5,2),
  "timeManagement" DECIMAL(5,2),
  "experientialLearning" DECIMAL(5,2),
  "respectUniqueness" DECIMAL(5,2),
  "assessmentAndFeedback" DECIMAL(5,2),
  "generalRating" DECIMAL(5,2),
  remarks TEXT,
  "computedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("semesterId", "facultyId")
);

CREATE INDEX IF NOT EXISTS idx_eval_results_semester ON evaluation_results("semesterId");
CREATE INDEX IF NOT EXISTS idx_eval_results_faculty ON evaluation_results("facultyId");
CREATE INDEX IF NOT EXISTS idx_eval_results_department ON evaluation_results("departmentId");

-- =========================================================
-- Migration 14: Faculty Evaluation — ALTER users
-- =========================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS "employeeNo" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "evaluationPeriodId" TEXT REFERENCES semesters(id) ON DELETE SET NULL;

-- =========================================================
-- Migration 15: Add evaluation page paths to group_access
-- =========================================================

-- Removed old eval results paths; replaced with reports-based paths
-- Old: /admin/evaluations/results -> /admin/reports/evaluation-results
-- Old: /dean/evaluations/results   -> /dean/reports + /dean/reports/evaluation-results
UPDATE group_access SET pages = pages || '["/admin/evaluations","/admin/evaluations/periods","/admin/evaluations/periods/new"]'::JSONB WHERE "groupName" = 'ADMIN';
UPDATE group_access SET pages = pages || '["/dean/reports","/dean/reports/evaluation-results"]'::JSONB WHERE "groupName" = 'DEAN';
UPDATE group_access SET pages = pages || '["/faculty/evaluations/results"]'::JSONB WHERE "groupName" = 'FACULTY';
UPDATE group_access SET pages = pages || '["/student/evaluations"]'::JSONB WHERE "groupName" = 'STUDENT';

-- =========================================================
-- Migration 16: Make evaluation periodId a plain text field
-- =========================================================

-- Only needed for legacy databases that still use periodId.
-- Fresh DBs create tables with semesterId directly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'evaluation_periods') THEN
    -- subjects
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subjects' AND column_name='periodId') THEN
      ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_periodid_fkey;
      ALTER TABLE subjects ALTER COLUMN "periodId" DROP NOT NULL;
      ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_periodId_name_key;
      DROP INDEX IF EXISTS idx_subjects_period;
    END IF;
    -- faculty_subjects
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_subjects' AND column_name='periodId') THEN
      ALTER TABLE faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_periodid_fkey;
      ALTER TABLE faculty_subjects ALTER COLUMN "periodId" DROP NOT NULL;
      ALTER TABLE faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_subjectId_periodId_key;
      DROP INDEX IF EXISTS idx_faculty_subjects_period;
    END IF;
    -- student_enrollments
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_enrollments' AND column_name='periodId') THEN
      ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_periodid_fkey;
      ALTER TABLE student_enrollments ALTER COLUMN "periodId" DROP NOT NULL;
      ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_studentId_subjectId_periodId_key;
      DROP INDEX IF EXISTS idx_student_enrollments_period;
    END IF;
    -- evaluations
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evaluations' AND column_name='periodId') THEN
      ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_periodid_fkey;
      ALTER TABLE evaluations ALTER COLUMN "periodId" DROP NOT NULL;
      ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_periodId_studentId_facultyId_key;
    END IF;
    DROP INDEX IF EXISTS idx_evaluations_period;
    DROP INDEX IF EXISTS idx_evaluations_period_student;
    DROP INDEX IF EXISTS idx_evaluations_student;
    DROP INDEX IF EXISTS idx_evaluations_faculty;
    -- evaluation_results
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evaluation_results' AND column_name='periodId') THEN
      ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_periodid_fkey;
      ALTER TABLE evaluation_results ALTER COLUMN "periodId" DROP NOT NULL;
      ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_periodId_facultyId_key;
    END IF;
    -- rating_scales
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rating_scales' AND column_name='periodId') THEN
      ALTER TABLE rating_scales DROP CONSTRAINT IF EXISTS rating_scales_periodid_fkey;
      ALTER TABLE rating_scales ALTER COLUMN "periodId" DROP NOT NULL;
    END IF;
    -- rubric_categories
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rubric_categories' AND column_name='periodId') THEN
      ALTER TABLE rubric_categories DROP CONSTRAINT IF EXISTS rubric_categories_periodid_fkey;
      ALTER TABLE rubric_categories ALTER COLUMN "periodId" DROP NOT NULL;
    END IF;
  END IF;
END $$;

-- =========================================================
-- Migration 18: Unquote column names in faculty_subjects
--               and student_enrollments for PostgREST FK
--               detection (PGRST201).
-- Run this BEFORE Migration 17 when upgrading an existing DB.
-- =========================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_subjects' AND column_name='facultyId') THEN
    ALTER TABLE faculty_subjects RENAME COLUMN "facultyId" TO faculty_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_subjects' AND column_name='subjectId') THEN
    ALTER TABLE faculty_subjects RENAME COLUMN "subjectId" TO subject_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_subjects' AND column_name='sectionId') THEN
    ALTER TABLE faculty_subjects RENAME COLUMN "sectionId" TO section_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_enrollments' AND column_name='studentId') THEN
    ALTER TABLE student_enrollments RENAME COLUMN "studentId" TO student_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_enrollments' AND column_name='sectionId') THEN
    ALTER TABLE student_enrollments RENAME COLUMN "sectionId" TO section_id;
  END IF;
END $$;

-- =========================================================
-- Migration 17: Section-based faculty-subject & enrollment model
-- =========================================================

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  program TEXT NOT NULL,
  "departmentCourseId" TEXT NOT NULL REFERENCES department_courses(id),
  "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(name, program)
);

CREATE INDEX IF NOT EXISTS idx_sections_department_course ON sections("departmentCourseId");
ALTER TABLE faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_subjectId_fkey;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_periodId_fkey;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_periodId_name_key;

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS code TEXT;
UPDATE subjects SET code = name WHERE code IS NULL;
ALTER TABLE subjects ALTER COLUMN code SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subjects_code_key') THEN
    ALTER TABLE subjects ADD CONSTRAINT subjects_code_key UNIQUE (code);
  END IF;
END $$;

ALTER TABLE subjects DROP COLUMN IF EXISTS "periodId";
DROP INDEX IF EXISTS idx_subjects_period;

-- Migrate faculty_subjects
ALTER TABLE faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_subjectId_periodId_key;
ALTER TABLE faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_periodid_fkey;

ALTER TABLE faculty_subjects ADD COLUMN IF NOT EXISTS section_id TEXT REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE faculty_subjects ALTER COLUMN faculty_id SET NOT NULL;
ALTER TABLE faculty_subjects ALTER COLUMN subject_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_subjects_subject_id_fkey') THEN
    ALTER TABLE faculty_subjects ADD CONSTRAINT faculty_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE faculty_subjects DROP COLUMN IF EXISTS "periodId";
DROP INDEX IF EXISTS idx_faculty_subjects_period;

CREATE INDEX IF NOT EXISTS idx_faculty_subjects_section ON faculty_subjects(section_id);
CREATE INDEX IF NOT EXISTS idx_faculty_subjects_subject ON faculty_subjects(subject_id);

-- Migrate student_enrollments
ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_studentId_subjectId_periodId_key;
ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_subjectid_fkey;
ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_periodid_fkey;

ALTER TABLE student_enrollments ADD COLUMN IF NOT EXISTS section_id TEXT REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE student_enrollments ALTER COLUMN student_id SET NOT NULL;

ALTER TABLE student_enrollments DROP COLUMN IF EXISTS "subjectId";
ALTER TABLE student_enrollments DROP COLUMN IF EXISTS "periodId";
DROP INDEX IF EXISTS idx_student_enrollments_period;

CREATE INDEX IF NOT EXISTS idx_student_enrollments_section ON student_enrollments(section_id);

-- =========================================================
-- Migration 19: Semester Rearchitecture
-- =========================================================
--
-- Replaces evaluation_periods with semesters as the central
-- scoping entity. Renames periodId → semesterId on child
-- tables. Adds semesterId to faculty_subjects and
-- student_enrollments.
--
-- Idempotent — safe to re-run on fresh or existing DB.
-- =========================================================

-- Step 1 already handled above (semesters table in main schema)

-- =========================================================
-- Step 2: Migrate existing evaluation_periods → semesters
-- =========================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'evaluation_periods'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_periods' AND column_name = 'semester'
  ) THEN
    INSERT INTO semesters (id, title, "evalStartDate", "evalEndDate", "isActive", "createdAt")
    SELECT id, name || ' : ' || semester, "startDate", "endDate", "isActive", "createdAt"
    FROM evaluation_periods
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- =========================================================
-- Step 3: Add semesterId to faculty_subjects
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'faculty_subjects' AND column_name = 'semesterId'
  ) THEN
    ALTER TABLE faculty_subjects ADD COLUMN "semesterId" TEXT REFERENCES semesters(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_faculty_subjects_semester ON faculty_subjects("semesterId");
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'faculty_subjects_subject_id_section_id_key'
  ) THEN
    ALTER TABLE faculty_subjects DROP CONSTRAINT faculty_subjects_subject_id_section_id_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'faculty_subjects_subject_id_section_id_semesterId_key'
  ) THEN
    ALTER TABLE faculty_subjects ADD CONSTRAINT faculty_subjects_subject_id_section_id_semesterId_key UNIQUE(subject_id, section_id, "semesterId");
  END IF;
END $$;

-- =========================================================
-- Step 4: Add semesterId to student_enrollments
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'student_enrollments' AND column_name = 'semesterId'
  ) THEN
    ALTER TABLE student_enrollments ADD COLUMN "semesterId" TEXT REFERENCES semesters(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_student_enrollments_semester ON student_enrollments("semesterId");
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_enrollments_student_id_section_id_key'
  ) THEN
    ALTER TABLE student_enrollments DROP CONSTRAINT student_enrollments_student_id_section_id_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_enrollments_student_id_section_id_semesterId_key'
  ) THEN
    ALTER TABLE student_enrollments ADD CONSTRAINT student_enrollments_student_id_section_id_semesterId_key UNIQUE(student_id, section_id, "semesterId");
  END IF;
END $$;

-- =========================================================
-- Step 5: Rename periodId → semesterId on evaluations
-- =========================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluations' AND column_name = 'periodId'
  ) THEN
    ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_periodId_evaluatorId_evaluateeId_key;
    ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_periodid_fkey;
    ALTER TABLE evaluations RENAME COLUMN "periodId" TO "semesterId";
    ALTER TABLE evaluations ADD CONSTRAINT fk_evaluations_semester FOREIGN KEY ("semesterId") REFERENCES semesters(id) ON DELETE CASCADE;
    ALTER TABLE evaluations ADD CONSTRAINT evaluations_semesterId_evaluatorId_evaluateeId_key UNIQUE("semesterId", "evaluatorId", "evaluateeId");
    CREATE INDEX IF NOT EXISTS idx_evaluations_semester ON evaluations("semesterId");
    CREATE INDEX IF NOT EXISTS idx_evaluations_semester_evaluator ON evaluations("semesterId", "evaluatorId");
  END IF;
END $$;

-- =========================================================
-- Step 6: Rename periodId → semesterId on evaluation_results
-- =========================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_results' AND column_name = 'periodId'
  ) THEN
    ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_periodId_facultyId_key;
    ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_periodid_fkey;
    ALTER TABLE evaluation_results RENAME COLUMN "periodId" TO "semesterId";
    ALTER TABLE evaluation_results ADD CONSTRAINT fk_evaluation_results_semester FOREIGN KEY ("semesterId") REFERENCES semesters(id) ON DELETE CASCADE;
    ALTER TABLE evaluation_results ADD CONSTRAINT evaluation_results_semesterId_facultyId_key UNIQUE("semesterId", "facultyId");
    CREATE INDEX IF NOT EXISTS idx_eval_results_semester ON evaluation_results("semesterId");
  END IF;
END $$;

-- =========================================================
-- Step 7: Rename periodId → semesterId on rating_scales
-- =========================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rating_scales' AND column_name = 'periodId'
  ) THEN
    ALTER TABLE rating_scales DROP CONSTRAINT IF EXISTS rating_scales_periodId_value_key;
    ALTER TABLE rating_scales DROP CONSTRAINT IF EXISTS rating_scales_periodid_fkey;
    ALTER TABLE rating_scales RENAME COLUMN "periodId" TO "semesterId";
    ALTER TABLE rating_scales ADD CONSTRAINT fk_rating_scales_semester FOREIGN KEY ("semesterId") REFERENCES semesters(id) ON DELETE CASCADE;
    ALTER TABLE rating_scales ADD CONSTRAINT rating_scales_semesterId_value_key UNIQUE("semesterId", value);
    CREATE INDEX IF NOT EXISTS idx_rating_scales_semester ON rating_scales("semesterId");
  END IF;
END $$;

-- =========================================================
-- Step 8: Rename periodId → semesterId on rubric_categories
-- =========================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_categories' AND column_name = 'periodId'
  ) THEN
    ALTER TABLE rubric_categories DROP CONSTRAINT IF EXISTS rubric_categories_periodid_fkey;
    ALTER TABLE rubric_categories RENAME COLUMN "periodId" TO "semesterId";
    ALTER TABLE rubric_categories ADD CONSTRAINT fk_rubric_categories_semester FOREIGN KEY ("semesterId") REFERENCES semesters(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_rubric_categories_semester ON rubric_categories("semesterId");
  END IF;
END $$;

-- =========================================================
-- Step 9: Rename evaluationPeriodId → semesterId on users
-- =========================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'evaluationPeriodId'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_evaluationperiodid_fkey;
    ALTER TABLE users RENAME COLUMN "evaluationPeriodId" TO "semesterId";
    ALTER TABLE users ADD CONSTRAINT fk_users_semester FOREIGN KEY ("semesterId") REFERENCES semesters(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_semester ON users("semesterId");
  END IF;
END $$;

-- =========================================================
-- Step 10: Drop old indexes on periodId (if any remain)
-- =========================================================

DROP INDEX IF EXISTS idx_eval_periods_active;
DROP INDEX IF EXISTS idx_eval_periods_school_year;
DROP INDEX IF EXISTS idx_evaluations_period;
DROP INDEX IF EXISTS idx_evaluations_period_evaluator;
DROP INDEX IF EXISTS idx_eval_results_period;
DROP INDEX IF EXISTS idx_rating_scales_period;
DROP INDEX IF EXISTS idx_rubric_categories_period;

-- =========================================================
-- Step 11: Drop evaluation_periods
-- =========================================================

DROP TABLE IF EXISTS evaluation_periods CASCADE;

-- =========================================================
-- Step 12: Update group_access with semester page paths
-- =========================================================

UPDATE group_access
SET pages = pages || '["/admin/evaluations/semesters","/admin/evaluations/semesters/new"]'::JSONB
WHERE "groupName" = 'ADMIN'
  AND NOT pages @> '["/admin/evaluations/semesters"]'::JSONB;

-- =========================================================
-- Migration 20: Add unique constraint to user_permissions
-- =========================================================
--
-- Required for upsert operations via onConflict: 'user_id,resource_path'.
-- Idempotent — safe to re-run.
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_permissions_user_id_resource_path_key'
  ) THEN
    ALTER TABLE user_permissions
    ADD CONSTRAINT user_permissions_user_id_resource_path_key
    UNIQUE(user_id, resource_path);
  END IF;
END $$;

-- =========================================================
-- Migration 21: Add faculty_subject_id to student_enrollments
-- =========================================================
--
-- Links each enrollment to a specific faculty-subject-section combo.
-- Idempotent — safe to re-run.
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'student_enrollments' AND column_name = 'faculty_subject_id'
  ) THEN
    ALTER TABLE student_enrollments ADD COLUMN faculty_subject_id TEXT REFERENCES faculty_subjects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_student_enrollments_faculty_subject ON student_enrollments(faculty_subject_id);
  END IF;

  ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_student_id_section_id_semesterid_key;
  ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS "student_enrollments_student_id_section_id_semesterId_key";

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_enrollments_student_id_faculty_subject_id_key'
  ) THEN
    ALTER TABLE student_enrollments ADD CONSTRAINT student_enrollments_student_id_faculty_subject_id_key UNIQUE(student_id, faculty_subject_id, "semesterId");
  END IF;
END $$;

-- =========================================================
-- Migration 22: Add isDisabled column to subjects and sections
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subjects' AND column_name = 'isDisabled'
  ) THEN
    ALTER TABLE subjects ADD COLUMN "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sections' AND column_name = 'isDisabled'
  ) THEN
    ALTER TABLE sections ADD COLUMN "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- =========================================================
-- Migration 23: Add is_results_visible to evaluation_results
-- =========================================================
--
-- Controls faculty-facing visibility of evaluation results.
-- Admin sets this flag; faculty can only see their result when TRUE.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_results' AND column_name = 'is_results_visible'
  ) THEN
    ALTER TABLE evaluation_results ADD COLUMN is_results_visible BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- =========================================================
-- Migration 24: Add departmentCourseId to sections
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sections' AND column_name = 'departmentCourseId'
  ) THEN
    ALTER TABLE sections ADD COLUMN "departmentCourseId" TEXT REFERENCES department_courses(id);
    UPDATE sections SET "departmentCourseId" = dc.id
    FROM department_courses dc
    WHERE sections.program = dc.code;
    ALTER TABLE sections ALTER COLUMN "departmentCourseId" SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sections_department_course ON sections("departmentCourseId");
  END IF;
END $$;

-- Update initial CREATE TABLE for fresh installs (idempotent via IF NOT EXISTS)
-- Only applies if the column was added by the migration above
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sections_departmentCourseId_fkey'
  ) THEN
    -- The FK is already added by the ALTER TABLE ... REFERENCES above, so no-op.
  END IF;
END $$;

-- =========================================================
-- Migration 25: Drop old student_enrollments unique constraints
-- =========================================================
-- The old constraint was on (student_id, section_id, "semesterId")
-- and could clash when inserting the same student+section under
-- a different faculty_subject_id.  Clean up any variants.
-- =========================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_enrollments_student_id_section_id_semesterId_key') THEN
    ALTER TABLE student_enrollments DROP CONSTRAINT student_enrollments_student_id_section_id_semesterId_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_enrollments_student_id_section_id_semesterid_key') THEN
    ALTER TABLE student_enrollments DROP CONSTRAINT student_enrollments_student_id_section_id_semesterid_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_enrollments_student_id_section_id_key') THEN
    ALTER TABLE student_enrollments DROP CONSTRAINT student_enrollments_student_id_section_id_key;
  END IF;
END $$;

-- =========================================================
-- Migration 26: Subject-level evaluations
-- =========================================================
--
-- Links evaluations to a specific faculty-subject combo so
-- students can evaluate the same faculty under different
-- subjects. Adds isDisabled for faculty reassignment scenario.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluations' AND column_name = 'facultySubjectId'
  ) THEN
    ALTER TABLE evaluations ADD COLUMN "facultySubjectId" TEXT REFERENCES faculty_subjects(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_evaluations_faculty_subject ON evaluations("facultySubjectId");
  END IF;
END $$;

ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_semesterid_evaluatorid_evaluateeid_key;
ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS "evaluations_semesterId_evaluatorId_evaluateeId_key";

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_semesterId_evaluatorId_facultySubjectId_key'
  ) THEN
    ALTER TABLE evaluations ADD CONSTRAINT evaluations_semesterId_evaluatorId_facultySubjectId_key
      UNIQUE("semesterId", "evaluatorId", "facultySubjectId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluations' AND column_name = 'isDisabled'
  ) THEN
    ALTER TABLE evaluations ADD COLUMN "isDisabled" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- =========================================================
-- Migration 27: Subject-level evaluation_results
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_results' AND column_name = 'subjectId'
  ) THEN
    ALTER TABLE evaluation_results ADD COLUMN "subjectId" TEXT REFERENCES subjects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_eval_results_subject ON evaluation_results("subjectId");
  END IF;
END $$;

ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_semesterid_facultyid_key;
ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS "evaluation_results_semesterId_facultyId_key";

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_results_semesterId_facultyId_subjectId_key'
  ) THEN
    ALTER TABLE evaluation_results ADD CONSTRAINT evaluation_results_semesterId_facultyId_subjectId_key
      UNIQUE("semesterId", "facultyId", "subjectId");
  END IF;
END $$;

-- =========================================================
-- Migration 28: Update rubric items for Communication with Students
-- =========================================================
-- Replaces the 3 generic items with 6 detailed items.
-- Updates existing item texts (preserves FK references) and
-- inserts 3 new items.

DO $$
DECLARE
  _cat_id TEXT := 'e0000000-0000-0000-0000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rubric_categories WHERE id = _cat_id) THEN
    RETURN;
  END IF;

  -- Update existing item texts
  UPDATE rubric_items SET text = 'The professors appropriately/immediately responds when students communicate (timely response to the students).', weight = 1.00
  WHERE id = 'e0000002-0000-0000-0000-000000000001' AND "categoryId" = _cat_id;

  UPDATE rubric_items SET text = 'He/she gives positive and specific feedback to students, which reinforces behaviour and helps them understand how to improve and makes progress.', weight = 1.00
  WHERE id = 'e0000002-0000-0000-0000-000000000002' AND "categoryId" = _cat_id;

  UPDATE rubric_items SET text = 'He/she guides the direction of the discussion.', weight = 1.00
  WHERE id = 'e0000002-0000-0000-0000-000000000003' AND "categoryId" = _cat_id;

  -- Insert new items (idempotent)
  INSERT INTO rubric_items (id, "categoryId", text, "displayOrder", weight) VALUES
    ('e0000002-0000-0000-0000-000000000004', _cat_id, 'He/she specifies how learning tasks will be evaluated (if appropriate).', 4, 1.00),
    ('e0000002-0000-0000-0000-000000000005', _cat_id, 'He/she seeks feedback from students on lesson and on ease of online technology and accessibility of course.', 5, 1.00),
    ('e0000002-0000-0000-0000-000000000006', _cat_id, 'He/she shows good subject knowledge and understanding which engages students'' creativity and sense of humor during the discussion.', 6, 1.00)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =========================================================
-- MIGRATION 29: Update all rubric items to match the new evaluation form.
-- Updates 7 categories (all except Communication with Students which was
-- already updated in Migration 28) with new item texts, adds new items
-- where categories expanded (3→4 or 3→6), and renames 2 category names.
-- =========================================================

DO $$
DECLARE
  _cat1_id TEXT := 'e0000000-0000-0000-0000-000000000001'; -- Professional Manner
  _cat3_id TEXT := 'e0000000-0000-0000-0000-000000000003'; -- Student Engagement
  _cat4_id TEXT := 'e0000000-0000-0000-0000-000000000004'; -- Learning Materials
  _cat5_id TEXT := 'e0000000-0000-0000-0000-000000000005'; -- Time Management
  _cat6_id TEXT := 'e0000000-0000-0000-0000-000000000006'; -- Experiential Learning
  _cat7_id TEXT := 'e0000000-0000-0000-0000-000000000007'; -- Respect for Uniqueness
  _cat8_id TEXT := 'e0000000-0000-0000-0000-000000000008'; -- Assessment and Feedback
BEGIN
  -- Only run on existing databases where seed data already populated categories
  IF NOT EXISTS (SELECT 1 FROM rubric_categories WHERE id = _cat1_id) THEN
    RETURN;
  END IF;
  -- ── Rename categories ────────────────────────────────
  UPDATE rubric_categories SET name = 'Experiential Learning Provided to Students'
  WHERE id = _cat6_id AND name = 'Experiential Learning';

  UPDATE rubric_categories SET name = 'Respect the Uniqueness of the Students'
  WHERE id = _cat7_id AND name = 'Respect for Uniqueness';

  -- ── I. PROFESSIONAL MANNER (3 items, update in-place) ──
  UPDATE rubric_items SET text = 'The professor has always dressed appropriately and is well groomed.', weight = 1.00
  WHERE id = 'e0000001-0000-0000-0000-000000000001' AND "categoryId" = _cat1_id;

  UPDATE rubric_items SET text = 'He/she behaves appropriately at all times.', weight = 1.00
  WHERE id = 'e0000001-0000-0000-0000-000000000002' AND "categoryId" = _cat1_id;

  UPDATE rubric_items SET text = 'He/she shows composure, exude confidence, and displays a good sense of humor.', weight = 1.00
  WHERE id = 'e0000001-0000-0000-0000-000000000003' AND "categoryId" = _cat1_id;

  -- ── III. STUDENT ENGAGEMENT (3→4, update 3 + insert 1) ──
  UPDATE rubric_items SET text = 'The professor uses active-learning exercises in balance with a teacher-led presentation appropriate to the lesson.', weight = 1.00
  WHERE id = 'e0000003-0000-0000-0000-000000000001' AND "categoryId" = _cat3_id;

  UPDATE rubric_items SET text = 'Before sending students to active learning tasks (group work, paired discussions, polling, team problem-solving, in-class writing), the professor provides explicit modeling and clear instructions (eg rationale, duration, product).', weight = 1.00
  WHERE id = 'e0000003-0000-0000-0000-000000000002' AND "categoryId" = _cat3_id;

  UPDATE rubric_items SET text = 'Instructor creates opportunities for interaction between students (breakout rooms, use of chat, collaborative google docs).', weight = 1.00
  WHERE id = 'e0000003-0000-0000-0000-000000000003' AND "categoryId" = _cat3_id;

  INSERT INTO rubric_items (id, "categoryId", text, "displayOrder", weight) VALUES
    ('e0000003-0000-0000-0000-000000000004', _cat3_id, 'It is evident that professor is present, proactive, and engaged (if webcam on, is clearly visible and facing camera, keeps an eye on chat or Q&A, monitors waiting room, turns on/off mute as needed, minimal distractions).', 4, 1.00)
  ON CONFLICT (id) DO NOTHING;

  -- ── IV. LEARNING MATERIALS (3→4, update 3 + insert 1) ──
  UPDATE rubric_items SET text = 'The professor prepared and uses technology appropriate for the lesson, and gathers needed links and presentations before the start of class.', weight = 1.00
  WHERE id = 'e0000004-0000-0000-0000-000000000001' AND "categoryId" = _cat4_id;

  UPDATE rubric_items SET text = 'The professor provides relevant instructional materials with clear instructions.', weight = 1.00
  WHERE id = 'e0000004-0000-0000-0000-000000000002' AND "categoryId" = _cat4_id;

  UPDATE rubric_items SET text = 'The materials are made available to help students who cannot attend online classes or have technical difficulties.', weight = 1.00
  WHERE id = 'e0000004-0000-0000-0000-000000000003' AND "categoryId" = _cat4_id;

  INSERT INTO rubric_items (id, "categoryId", text, "displayOrder", weight) VALUES
    ('e0000004-0000-0000-0000-000000000004', _cat4_id, 'The professor presents course material in a clear manner that facilitates understanding.', 4, 1.00)
  ON CONFLICT (id) DO NOTHING;

  -- ── V. TIME MANAGEMENT (3→4, update 3 + insert 1) ──
  UPDATE rubric_items SET text = 'The professor starts and ends the class session on time.', weight = 1.00
  WHERE id = 'e0000005-0000-0000-0000-000000000001' AND "categoryId" = _cat5_id;

  UPDATE rubric_items SET text = 'He/she allows time for questions, discussion and/or summarizing the session''s lesson.', weight = 1.00
  WHERE id = 'e0000005-0000-0000-0000-000000000002' AND "categoryId" = _cat5_id;

  UPDATE rubric_items SET text = 'He/she maximizes in-class time, using active learning or applications.', weight = 1.00
  WHERE id = 'e0000005-0000-0000-0000-000000000003' AND "categoryId" = _cat5_id;

  INSERT INTO rubric_items (id, "categoryId", text, "displayOrder", weight) VALUES
    ('e0000005-0000-0000-0000-000000000004', _cat5_id, 'He/she clearly indicates time limits for all student activities, using a time-based agenda, or visual and auditory prompts.', 4, 1.00)
  ON CONFLICT (id) DO NOTHING;

  -- ── VI. EXPERIENTIAL LEARNING PROVIDED TO STUDENTS (3→4, update 3 + insert 1) ──
  UPDATE rubric_items SET text = 'The professor utilizes appropriate tools and materials to motivate learners (e.g. interactive or competitive games, music, video, etc).', weight = 1.00
  WHERE id = 'e0000006-0000-0000-0000-000000000001' AND "categoryId" = _cat6_id;

  UPDATE rubric_items SET text = 'He/she builds in-pauses in the lesson to provide opportunities for students to ask questions and promptly responds to questions.', weight = 1.00
  WHERE id = 'e0000006-0000-0000-0000-000000000002' AND "categoryId" = _cat6_id;

  UPDATE rubric_items SET text = 'He/she arouses students'' interest with relevant life-learning skills (relatable stories).', weight = 1.00
  WHERE id = 'e0000006-0000-0000-0000-000000000003' AND "categoryId" = _cat6_id;

  INSERT INTO rubric_items (id, "categoryId", text, "displayOrder", weight) VALUES
    ('e0000006-0000-0000-0000-000000000004', _cat6_id, 'He/she provides opportunities for students to take responsibility.', 4, 1.00)
  ON CONFLICT (id) DO NOTHING;

  -- ── VII. RESPECT THE UNIQUENESS OF THE STUDENTS (3 items, update in-place) ──
  UPDATE rubric_items SET text = 'The professor shows consideration and provides opportunities to students.', weight = 1.00
  WHERE id = 'e0000007-0000-0000-0000-000000000001' AND "categoryId" = _cat7_id;

  UPDATE rubric_items SET text = 'He/she draws non-participating students into activities/discussions and prevents specific students from dominating/monopolizing activities/discussions.', weight = 1.00
  WHERE id = 'e0000007-0000-0000-0000-000000000002' AND "categoryId" = _cat7_id;

  UPDATE rubric_items SET text = 'Addresses potentially disruptive behaviours before they impact learning environment.', weight = 1.00
  WHERE id = 'e0000007-0000-0000-0000-000000000003' AND "categoryId" = _cat7_id;

  -- ── VIII. ASSESSMENT AND FEEDBACK (3→6, update 3 + insert 3) ──
  UPDATE rubric_items SET text = 'The professor provides class generalized constructive and encouraging feedback on how to improve their comprehension or performance in class.', weight = 1.00
  WHERE id = 'e0000008-0000-0000-0000-000000000001' AND "categoryId" = _cat8_id;

  UPDATE rubric_items SET text = 'He/she attends respectfully to student''s comprehension or confusion.', weight = 1.00
  WHERE id = 'e0000008-0000-0000-0000-000000000002' AND "categoryId" = _cat8_id;

  UPDATE rubric_items SET text = 'He/she shows evidence of reinforcement (such as token or certificate, positive points) appropriate to remote or online contexts.', weight = 1.00
  WHERE id = 'e0000008-0000-0000-0000-000000000003' AND "categoryId" = _cat8_id;

  INSERT INTO rubric_items (id, "categoryId", text, "displayOrder", weight) VALUES
    ('e0000008-0000-0000-0000-000000000004', _cat8_id, 'His/her assessments are suitable for distance learning environment (different tools, roleplay, written activity and others).', 4, 1.00),
    ('e0000008-0000-0000-0000-000000000005', _cat8_id, 'He/she assesses students both informally and formally within the online or remote classroom through use of games, quizzes, online tests, etc.', 5, 1.00),
    ('e0000008-0000-0000-0000-000000000006', _cat8_id, 'He/she provides immediate feedback.', 6, 1.00)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =========================================================
-- SEED DATA
--    Uses fixed UUIDs for idempotent re-runs.
--    Placed after all migrations so all tables and
--    renamed columns exist.
-- =========================================================

DO $$
DECLARE
  _admin_id TEXT    := 'a0000000-0000-0000-0000-000000000001';
  _dept_id TEXT    := 'b0000000-0000-0000-0000-000000000001';
  _dean_id TEXT    := 'c0000000-0000-0000-0000-000000000001';
  _faculty1_id TEXT := 'd0000000-0000-0000-0000-000000000001';
  _course_bsit_id TEXT := 'f0000000-0000-0000-0000-000000000001';
  _course_bscs_id TEXT := 'f0000000-0000-0000-0000-000000000002';

  _hash TEXT := '$2b$12$GvU25kxpeLdvzSUmiZNm9edIlzresvMlzb2cT1PLdsQYjPAqRyYNW';
BEGIN

  -- ── ADMIN ──────────────────────────────────────────────────
  INSERT INTO users (id, name, email, "passwordHash", "hasLoggedInBefore")
  VALUES (_admin_id, 'Mr. Admin', 'admin@lyceumalabang.edu.ph', _hash, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO userrole ("userId", "roleName") VALUES (_admin_id, 'ADMIN')
  ON CONFLICT DO NOTHING;

  -- ── DEAN ──────────────────────────────────────────────────
  INSERT INTO users (id, name, email, "passwordHash")
  VALUES (_dean_id, 'Regie Ellana', 'r.ellana@lyceumalabang.edu.ph', _hash)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO userrole ("userId", "roleName") VALUES (_dean_id, 'DEAN')
  ON CONFLICT DO NOTHING;

  -- ── DEPARTMENT (College of Computer Studies) ────────────
  INSERT INTO departments (id, name, code, "deanId")
  VALUES (_dept_id, 'College of Computer Studies', 'CCS', _dean_id)
  ON CONFLICT (id) DO NOTHING;

  UPDATE users SET "departmentId" = _dept_id WHERE id = _dean_id AND "departmentId" IS NULL;

  -- ── DEPARTMENT COURSES ───────────────────────────────────
  INSERT INTO department_courses (id, "departmentId", name, code) VALUES
    (_course_bsit_id, _dept_id, 'Bachelor of Science in Information Technology', 'BSIT'),
    (_course_bscs_id, _dept_id, 'Bachelor of Science in Computer Science', 'BSCS')
  ON CONFLICT ("departmentId", code) DO NOTHING;

  -- ── FACULTY (1) ─────────────────────────────────────────
  INSERT INTO users (id, name, email, "passwordHash", "departmentId")
  VALUES (_faculty1_id, 'Nin Alamo', 'n.alamo@lyceumalabang.edu.ph', _hash, _dept_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO userrole ("userId", "roleName") VALUES (_faculty1_id, 'FACULTY')
  ON CONFLICT DO NOTHING;

  -- ── ADDITIONAL SEED VARIABLES ──────────────────────────
  DECLARE
    _student_id TEXT   := 'd0000000-0000-0000-0000-000000000002';
    _sem_id TEXT       := 'e0000000-0000-0000-0000-000000000000';
    _subject_id TEXT   := 'f0000000-0000-0000-0000-000000000003';
    _section_id TEXT   := 'g0000000-0000-0000-0000-000000000001';
    _fs_id TEXT        := 'h0000000-0000-0000-0000-000000000001';
  BEGIN

  -- ── DEFAULT SEMESTER ─────────────────────────────────────
  INSERT INTO semesters (id, title, "evalStartDate", "evalEndDate", "isActive")
  VALUES (_sem_id, 'SY 2026-2027 First Semester', CURRENT_DATE, CURRENT_DATE + INTERVAL '180 days', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- ── DEFAULT RUBRIC GROUP ───────────────────────────────
  DECLARE
    _rg_id TEXT := 'e0000000-0000-0000-0000-000000000010';
  BEGIN
  INSERT INTO rubric_groups (id, name, description, seed)
  VALUES (_rg_id, 'Faculty Evaluation Rubric', 'Default evaluation rubric with 8 categories and 27 items', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- ── RUBRIC CATEGORIES ──────────────────────────────────
  INSERT INTO rubric_categories (id, rubric_group_id, name, "displayOrder") VALUES
    ('e0000000-0000-0000-0000-000000000001', _rg_id, 'Professional Manner',             1),
    ('e0000000-0000-0000-0000-000000000002', _rg_id, 'Communication with Students',      2),
    ('e0000000-0000-0000-0000-000000000003', _rg_id, 'Student Engagement',               3),
    ('e0000000-0000-0000-0000-000000000004', _rg_id, 'Learning Materials',               4),
    ('e0000000-0000-0000-0000-000000000005', _rg_id, 'Time Management',                  5),
    ('e0000000-0000-0000-0000-000000000006', _rg_id, 'Experiential Learning Provided to Students', 6),
    ('e0000000-0000-0000-0000-000000000007', _rg_id, 'Respect the Uniqueness of the Students',    7),
    ('e0000000-0000-0000-0000-000000000008', _rg_id, 'Assessment and Feedback',          8)
  ON CONFLICT (id) DO NOTHING;

  -- ── RUBRIC ITEMS (27 total, 3-6 per category) ────────────
  INSERT INTO rubric_items (id, "categoryId", text, "displayOrder", weight) VALUES
    -- Professional Manner
    ('e0000001-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'The professor has always dressed appropriately and is well groomed.', 1, 1.00),
    ('e0000001-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'He/she behaves appropriately at all times.', 2, 1.00),
    ('e0000001-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'He/she shows composure, exude confidence, and displays a good sense of humor.', 3, 1.00),
    -- Communication with Students
    ('e0000002-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'The professors appropriately/immediately responds when students communicate (timely response to the students).', 1, 1.00),
    ('e0000002-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'He/she gives positive and specific feedback to students, which reinforces behaviour and helps them understand how to improve and makes progress.', 2, 1.00),
    ('e0000002-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'He/she guides the direction of the discussion.', 3, 1.00),
    ('e0000002-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', 'He/she specifies how learning tasks will be evaluated (if appropriate).', 4, 1.00),
    ('e0000002-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000002', 'He/she seeks feedback from students on lesson and on ease of online technology and accessibility of course.', 5, 1.00),
    ('e0000002-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000002', 'He/she shows good subject knowledge and understanding which engages students'' creativity and sense of humor during the discussion.', 6, 1.00),
    -- Student Engagement
    ('e0000003-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'The professor uses active-learning exercises in balance with a teacher-led presentation appropriate to the lesson.', 1, 1.00),
    ('e0000003-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 'Before sending students to active learning tasks (group work, paired discussions, polling, team problem-solving, in-class writing), the professor provides explicit modeling and clear instructions (eg rationale, duration, product).', 2, 1.00),
    ('e0000003-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'Instructor creates opportunities for interaction between students (breakout rooms, use of chat, collaborative google docs).', 3, 1.00),
    ('e0000003-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000003', 'It is evident that professor is present, proactive, and engaged (if webcam on, is clearly visible and facing camera, keeps an eye on chat or Q&A, monitors waiting room, turns on/off mute as needed, minimal distractions).', 4, 1.00),
    -- Learning Materials
    ('e0000004-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'The professor prepared and uses technology appropriate for the lesson, and gathers needed links and presentations before the start of class.', 1, 1.00),
    ('e0000004-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'The professor provides relevant instructional materials with clear instructions.', 2, 1.00),
    ('e0000004-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004', 'The materials are made available to help students who cannot attend online classes or have technical difficulties.', 3, 1.00),
    ('e0000004-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'The professor presents course material in a clear manner that facilitates understanding.', 4, 1.00),
    -- Time Management
    ('e0000005-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 'The professor starts and ends the class session on time.', 1, 1.00),
    ('e0000005-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000005', 'He/she allows time for questions, discussion and/or summarizing the session''s lesson.', 2, 1.00),
    ('e0000005-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000005', 'He/she maximizes in-class time, using active learning or applications.', 3, 1.00),
    ('e0000005-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005', 'He/she clearly indicates time limits for all student activities, using a time-based agenda, or visual and auditory prompts.', 4, 1.00),
    -- Experiential Learning Provided to Students
    ('e0000006-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000006', 'The professor utilizes appropriate tools and materials to motivate learners (e.g. interactive or competitive games, music, video, etc).', 1, 1.00),
    ('e0000006-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000006', 'He/she builds in-pauses in the lesson to provide opportunities for students to ask questions and promptly responds to questions.', 2, 1.00),
    ('e0000006-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000006', 'He/she arouses students'' interest with relevant life-learning skills (relatable stories).', 3, 1.00),
    ('e0000006-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000006', 'He/she provides opportunities for students to take responsibility.', 4, 1.00),
    -- Respect the Uniqueness of the Students
    ('e0000007-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000007', 'The professor shows consideration and provides opportunities to students.', 1, 1.00),
    ('e0000007-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000007', 'He/she draws non-participating students into activities/discussions and prevents specific students from dominating/monopolizing activities/discussions.', 2, 1.00),
    ('e0000007-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000007', 'Addresses potentially disruptive behaviours before they impact learning environment.', 3, 1.00),
    -- Assessment and Feedback
    ('e0000008-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000008', 'The professor provides class generalized constructive and encouraging feedback on how to improve their comprehension or performance in class.', 1, 1.00),
    ('e0000008-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000008', 'He/she attends respectfully to student''s comprehension or confusion.', 2, 1.00),
    ('e0000008-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000008', 'He/she shows evidence of reinforcement (such as token or certificate, positive points) appropriate to remote or online contexts.', 3, 1.00),
    ('e0000008-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000008', 'His/her assessments are suitable for distance learning environment (different tools, roleplay, written activity and others).', 4, 1.00),
    ('e0000008-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000008', 'He/she assesses students both informally and formally within the online or remote classroom through use of games, quizzes, online tests, etc.', 5, 1.00),
    ('e0000008-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000008', 'He/she provides immediate feedback.', 6, 1.00)
  ON CONFLICT (id) DO NOTHING;

  END; -- _rg_id block

  -- ── STUDENT ─────────────────────────────────────────────
  INSERT INTO users (id, name, email, "passwordHash")
  VALUES (_student_id, 'Nino Francisco Alamo', 'nino_francisco_alamo@itmlyceumalabang.onmicrosoft.com', _hash)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO userrole ("userId", "roleName") VALUES (_student_id, 'STUDENT')
  ON CONFLICT DO NOTHING;

  -- ── SUBJECT ─────────────────────────────────────────────
  INSERT INTO subjects (id, code, name)
  VALUES (_subject_id, '1815-ITELEC009', 'IT ELECTIVE 2 - Web Systems and Technologies')
  ON CONFLICT (id) DO NOTHING;

  -- ── SECTION ─────────────────────────────────────────────
  INSERT INTO sections (id, name, program, "departmentCourseId")
  VALUES (_section_id, '31E1', 'BSIT', _course_bsit_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── FACULTY-SUBJECT LINK ────────────────────────────────
  INSERT INTO faculty_subjects (id, faculty_id, subject_id, section_id, "semesterId")
  VALUES (_fs_id, _faculty1_id, _subject_id, _section_id, _sem_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── STUDENT ENROLLMENT ─────────────────────────────────
  INSERT INTO student_enrollments (student_id, section_id, "semesterId", faculty_subject_id)
  VALUES (_student_id, _section_id, _sem_id, _fs_id)
  ON CONFLICT (student_id, faculty_subject_id, "semesterId") DO NOTHING;

  END;
END $$;

-- =========================================================
-- Migration 22: Add api_overrides column to group_access
-- Stores per-page API override state: {"pagePath": {"/api/...": true|false}}
-- true = granted, false = denied, absent = inherit from page selection
-- =========================================================
ALTER TABLE group_access ADD COLUMN IF NOT EXISTS "api_overrides" JSONB NOT NULL DEFAULT '{}';

-- =========================================================
-- Migration 23: Add INVALID status and remarks to evaluations
-- =========================================================
DO $$ BEGIN
  ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_status_check;
  ALTER TABLE evaluations ADD CONSTRAINT evaluations_status_check CHECK (status IN ('DRAFT', 'SUBMITTED', 'INVALID'));
EXCEPTION WHEN OTHERS THEN
  -- constraint may have already been updated
END $$;

ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- ── Performance Indexes ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_appointments_meetingType_facultyId
  ON appointments("meetingType", "facultyId");

CREATE INDEX IF NOT EXISTS idx_appointments_date_status
  ON appointments("date", "status");

CREATE INDEX IF NOT EXISTS idx_appointments_meetingType_studentId
  ON appointments("meetingType", "studentId");

CREATE INDEX IF NOT EXISTS idx_appointments_teamsSyncStatus_status
  ON appointments("teamsSyncStatus", "status");

CREATE INDEX IF NOT EXISTS idx_appointments_sessionGroupId
  ON appointments("sessionGroupId");

CREATE INDEX IF NOT EXISTS idx_appointment_time_slots_date_time
  ON appointment_time_slots("date", "startTime", "endTime");

CREATE INDEX IF NOT EXISTS idx_evaluation_results_semesterId_departmentId
  ON evaluation_results("semesterId", "departmentId");

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email
  ON password_reset_tokens("email");

-- =========================================================
-- Migration 24: Bug Reports
-- =========================================================

CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "userId" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_createdAt ON bug_reports("createdAt" DESC);

-- =========================================tang================
-- Migration 25: Seed group_access from access-config export
-- Source: access-config-2026-07-11.json
-- =========================================================

INSERT INTO group_access ("groupName", pages, "api_overrides", "updatedAt") VALUES
  ('ADMIN',
   '["/","/faq","/403","/admin/evaluations/periods","/admin/evaluations/periods/new","/admin/evaluations/semesters","/admin/evaluations/semesters/new","/admin","/admin/data/maintenance","/admin/data/academic-infrastructure","/admin/evaluations/reports","/admin/audit-trail","/admin/evaluations/reports/sentiment","/admin/evaluations/rubrics","/admin/data/users","/admin/data/users/deleted","/faculty/reports","/admin/reports","/admin/reports/health","/admin/reports/responsiveness","/admin/reports/distribution","/admin/reports/demand","/admin/reports/coverage","/admin/reports/backlog","/admin/evaluations/reports/detail","/admin/consultations","/admin/consultations/reports","/admin/consultations/reports/health","/admin/consultations/reports/distribution","/admin/consultations/reports/demand","/admin/consultations/reports/coverage","/admin/consultations/reports/backlog","/admin/evaluations/disabled","/admin/evaluations/results","/admin/evaluations","/api/semesters","/api/admin/departments","/api/admin/department-courses","/api/admin/subjects","/api/admin/sections","/api/admin/faculty-subjects","/api/admin/student-enrollments","/api/admin/users","/api/data/evaluation-mappings","/api/evaluation-periods","/api/auth/me","/api/import/faculties","/api/evaluation-periods/[id]/rubric","/api/evaluation-periods/[id]/rubrics/items","/api/auth/activate","/api/admin/users/deleted","/api/admin/users/[id]/restore","/api/admin/evaluations/disabled","/api/admin/evaluation-results","/api/dean/evaluation-results/details","/api/admin/evaluation-results/visibility","/admin/evaluations","/admin/evaluations/periods","/admin/evaluations/periods/new"]'::JSONB,
   '{}'::JSONB,
   '2026-07-09T07:30:24.502+00:00'::TIMESTAMPTZ),
  ('DEAN',
   '["/dean/upload","/faculty/meetings","/faculty/availability","/faq","/dean/m","/faculty/meetings/new","/admin/reports","/dean/reports/evaluation-results","/admin/evaluations/reports","/admin/evaluations/results","/admin/evaluations/reports/sentiment","/403","/admin/etl-hub","/student/evaluations/thank-you","/admin/reports/health","/","/dean","/dean/evaluations/reports","/faculty/evaluations","/dean/evaluations/results","/dean/evaluations","/admin/evaluations/rubrics","/admin/evaluations/disabled","/faculty/evaluations/results","/admin/evaluations","/api/appointments/[id]","/api/appointments/[id]/accept","/api/appointments/[id]/decline","/api/appointments/[id]/teams-link","/api/appointments/slots/[slotId]/teams-link","/api/appointments/[id]/complete","/api/appointments/[id]/files","/api/appointments/[id]/retry-sync","/api/availability-rules","/api/appointments/batch","/api/appointments/faculty-booked","/api/users/primary","/api/users/attendees","/api/admin/evaluation-results","/api/dean/evaluation-results/details","/api/admin/evaluation-results/visibility","/api/data/evaluation-mappings","/api/evaluation-periods","/api/evaluation-comments","/api/auth/onboarding","/api/faculty/evaluation-results","/api/dean/evaluation-results","/api/evaluation-periods/[id]/rubric","/api/evaluation-periods/[id]/rubrics/items","/api/admin/evaluations/disabled","/api/admin/evaluation-results/invalidate","/api/admin/departments","/dean/reports","/dean/reports/evaluation-results","/dean/reports","/dean/reports/evaluation-results","/dean/reports","/dean/reports/evaluation-results"]'::JSONB,
   '{}'::JSONB,
   '2026-07-05T01:11:13.286+00:00'::TIMESTAMPTZ),
  ('FACULTY',
   '["/","/403","/faq","/faculty","/faculty/availability","/faculty/evaluations","/faculty/evaluations/results","/faculty/meetings","/faculty/meetings/new","/faculty/reports","/faculty/upload","/api/admin/departments","/api/admin/evaluation-results/invalidate","/api/admin/evaluation-results/visibility","/api/appointments/[id]","/api/appointments/[id]/accept","/api/appointments/[id]/complete","/api/appointments/[id]/decline","/api/appointments/[id]/files","/api/appointments/[id]/retry-sync","/api/appointments/[id]/teams-link","/api/appointments/batch","/api/appointments/faculty-booked","/api/appointments/slots/[slotId]/teams-link","/api/auth/onboarding","/api/availability-rules","/api/data/evaluation-mappings","/api/dean/evaluation-results/details","/api/evaluation-periods","/api/faculty/evaluation-results","/api/semesters","/api/users/attendees","/api/users/primary","/faculty/evaluations/results"]'::JSONB,
   '{}'::JSONB,
   '2026-07-04T14:54:30.711+00:00'::TIMESTAMPTZ),
  ('GUEST',
   '[]'::JSONB,
   '{}'::JSONB,
   '2026-05-28T04:55:59.485976+00:00'::TIMESTAMPTZ),
  ('STUDENT',
   '["/student/evaluations/history"]'::JSONB,
   '{}'::JSONB,
   '2026-07-11T06:30:53.1+00:00'::TIMESTAMPTZ)
ON CONFLICT ("groupName") DO UPDATE SET
  pages = EXCLUDED.pages,
  "api_overrides" = EXCLUDED."api_overrides",
  "updatedAt" = EXCLUDED."updatedAt";

-- =========================================================
-- Migration 30: Evaluation Periods
-- =========================================================
-- Separates evaluation periods from semesters. A semester can
-- have multiple evaluation periods (e.g., Pre-Semester, Post-Semester).
-- Evaluation-specific tables now reference evaluation_periods
-- instead of semesters directly.

-- ── 30a. Create evaluation_periods table ──────────────────

CREATE TABLE IF NOT EXISTS evaluation_periods (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "semesterId"    TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  source          TEXT DEFAULT NULL,
  "startDate"     DATE,
  "endDate"       DATE,
  "isActive"      BOOLEAN NOT NULL DEFAULT FALSE,
  rubric_group_id TEXT REFERENCES rubric_groups(id),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_periods_semester ON evaluation_periods("semesterId");
CREATE INDEX IF NOT EXISTS idx_eval_periods_active ON evaluation_periods("isActive");
CREATE INDEX IF NOT EXISTS idx_eval_periods_rubric_group ON evaluation_periods(rubric_group_id);

-- ── 30b. Add evaluation_period_id to child tables ─────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_categories' AND column_name = 'evaluation_period_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_categories' AND column_name = 'rubric_group_id'
  ) THEN
    ALTER TABLE rubric_categories ADD COLUMN evaluation_period_id TEXT REFERENCES evaluation_periods(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_rubric_categories_period ON rubric_categories(evaluation_period_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rating_scales' AND column_name = 'evaluation_period_id'
  ) THEN
    ALTER TABLE rating_scales ADD COLUMN evaluation_period_id TEXT REFERENCES evaluation_periods(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_rating_scales_period ON rating_scales(evaluation_period_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluations' AND column_name = 'evaluation_period_id'
  ) THEN
    ALTER TABLE evaluations ADD COLUMN evaluation_period_id TEXT REFERENCES evaluation_periods(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_evaluations_period ON evaluations(evaluation_period_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_results' AND column_name = 'evaluation_period_id'
  ) THEN
    ALTER TABLE evaluation_results ADD COLUMN evaluation_period_id TEXT REFERENCES evaluation_periods(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_eval_results_period ON evaluation_results(evaluation_period_id);
  END IF;
END $$;

-- ── 30c. Migrate existing data: create evaluation_periods from semesters ──

DO $$
DECLARE
  _sem RECORD;
  _ep_id TEXT;
  _has_sem_col BOOLEAN;
BEGIN
  -- Check if rubric_categories still has the old semesterId column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_categories' AND column_name = 'semesterId'
  ) INTO _has_sem_col;

  IF NOT _has_sem_col THEN
    RAISE NOTICE 'Migration 30c: semesterId column not found on rubric_categories — skipping data migration';
    RETURN;
  END IF;

  FOR _sem IN SELECT id, title, "evalStartDate", "evalEndDate", "isActive" FROM semesters
  LOOP
    -- Create an evaluation period for each semester that has eval dates or is active
    IF _sem."evalStartDate" IS NOT NULL OR _sem."isActive" = TRUE THEN
      _ep_id := gen_random_uuid()::TEXT;
      INSERT INTO evaluation_periods (id, "semesterId", name, source, "startDate", "endDate", "isActive")
      VALUES (_ep_id, _sem.id, _sem.title || ' - Evaluation', NULL, _sem."evalStartDate", _sem."evalEndDate", _sem."isActive")
      ON CONFLICT DO NOTHING;

      -- Migrate rubric_categories
      UPDATE rubric_categories SET evaluation_period_id = _ep_id
      WHERE "semesterId" = _sem.id AND evaluation_period_id IS NULL;

      -- Migrate rating_scales
      UPDATE rating_scales SET evaluation_period_id = _ep_id
      WHERE "semesterId" = _sem.id AND evaluation_period_id IS NULL;

      -- Migrate evaluations
      UPDATE evaluations SET evaluation_period_id = _ep_id
      WHERE "semesterId" = _sem.id AND evaluation_period_id IS NULL;

      -- Migrate evaluation_results
      UPDATE evaluation_results SET evaluation_period_id = _ep_id
      WHERE "semesterId" = _sem.id AND evaluation_period_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- ── 30d. Update UNIQUE constraints to use evaluation_period_id ──

-- evaluations: drop old UNIQUE on (semesterId, evaluatorId, facultySubjectId)
ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_semesterId_evaluatorId_facultySubjectId_key;
ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS "evaluations_semesterId_evaluatorId_facultySubjectId_key";

-- Add new UNIQUE on (evaluation_period_id, evaluatorId, facultySubjectId)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_period_evaluator_fs_unique'
  ) THEN
    ALTER TABLE evaluations ADD CONSTRAINT evaluations_period_evaluator_fs_unique
      UNIQUE (evaluation_period_id, "evaluatorId", "facultySubjectId");
  END IF;
END $$;

-- evaluation_results: drop old UNIQUE on (semesterId, facultyId, subjectId)
ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_semesterId_facultyId_subjectId_key;
ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS "evaluation_results_semesterId_facultyId_subjectId_key";
ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_semesterId_facultyId_key;
ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS "evaluation_results_semesterId_facultyId_key";

-- Add new UNIQUE on (evaluation_period_id, facultyId, subjectId)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eval_results_period_faculty_subject_unique'
  ) THEN
    ALTER TABLE evaluation_results ADD CONSTRAINT eval_results_period_faculty_subject_unique
      UNIQUE (evaluation_period_id, "facultyId", "subjectId");
  END IF;
END $$;

-- ── 30e. Add is_results_visible column if missing ────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_results' AND column_name = 'is_results_visible'
  ) THEN
    ALTER TABLE evaluation_results ADD COLUMN "is_results_visible" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- =========================================================
-- 31. RUBRIC GROUPS: Decouple rubrics from evaluation periods
-- =========================================================

-- ── 31a. Add rubric_group_id to evaluation_periods ────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_periods' AND column_name = 'rubric_group_id'
  ) THEN
    ALTER TABLE evaluation_periods ADD COLUMN rubric_group_id TEXT REFERENCES rubric_groups(id);
    CREATE INDEX IF NOT EXISTS idx_eval_periods_rubric_group ON evaluation_periods(rubric_group_id);
  END IF;
END $$;

-- ── 31b. Migrate rubric_categories: semesterId → rubric_group_id ──

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_categories' AND column_name = 'semesterId'
  ) THEN
    ALTER TABLE rubric_categories DROP CONSTRAINT IF EXISTS fk_rubric_categories_semester;
    ALTER TABLE rubric_categories DROP COLUMN "semesterId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_categories' AND column_name = 'evaluation_period_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_categories' AND column_name = 'rubric_group_id'
  ) THEN
    -- Drop old FK constraint
    ALTER TABLE rubric_categories DROP CONSTRAINT IF EXISTS rubric_categories_evaluation_period_id_fkey;
    -- Rename column
    ALTER TABLE rubric_categories RENAME COLUMN evaluation_period_id TO rubric_group_id;
    -- Rename index
    DROP INDEX IF EXISTS idx_rubric_categories_period;
    CREATE INDEX IF NOT EXISTS idx_rubric_categories_group ON rubric_categories(rubric_group_id);
    -- Add new FK to rubric_groups
    ALTER TABLE rubric_categories ADD CONSTRAINT fk_rubric_categories_group
      FOREIGN KEY (rubric_group_id) REFERENCES rubric_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 31c. Create rubric_group_snapshots table if missing ────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'rubric_group_snapshots'
  ) THEN
    CREATE TABLE rubric_group_snapshots (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      evaluation_period_id TEXT NOT NULL REFERENCES evaluation_periods(id) ON DELETE CASCADE,
      rubric_group_id TEXT NOT NULL,
      rubric_group_name TEXT NOT NULL,
      category_name TEXT NOT NULL,
      category_display_order INTEGER NOT NULL,
      item_text TEXT NOT NULL,
      item_display_order INTEGER NOT NULL,
      item_weight DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_email_action_created
  ON audit_logs(email, action, "createdAt" DESC);
    CREATE INDEX IF NOT EXISTS idx_rubric_snapshots_period ON rubric_group_snapshots(evaluation_period_id);
  END IF;
END $$;

-- =========================================================
-- Migration 32: Add seed column to rubric_groups
-- Marks the original/default rubric group as immutable.
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_groups' AND column_name = 'seed'
  ) THEN
    ALTER TABLE rubric_groups ADD COLUMN seed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- =========================================================
-- Migration 33: Add isInvalid to evaluations
-- Marks evaluation entries as invalid after a period reset.
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluations' AND column_name = 'isInvalid'
  ) THEN
    ALTER TABLE evaluations ADD COLUMN "isInvalid" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- =========================================================
-- Migration 34: Add item_id + category_id to rubric_group_snapshots
-- Preserves real rubric_items/rubric_categories IDs so that
-- evaluation_ratings."itemId" FK can resolve correctly.
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rubric_group_snapshots' AND column_name = 'item_id'
  ) THEN
    ALTER TABLE rubric_group_snapshots ADD COLUMN item_id TEXT;
    ALTER TABLE rubric_group_snapshots ADD COLUMN category_id TEXT;
  END IF;
END $$;

-- =========================================================
-- exec_sql: RPC function for executing raw SQL statements
-- Used by the admin reset-database endpoint.
-- =========================================================

CREATE OR REPLACE FUNCTION exec_sql(sql_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;

-- =========================================================
-- Migration 35: Grant evaluation-status paths to ADMIN
-- (Renamed to Coverage in Migration 36; kept for the redirect stub.)
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_access
    WHERE "groupName" = 'ADMIN' AND pages @> '["/admin/evaluations/status"]'::JSONB
  ) THEN
    UPDATE group_access SET pages = pages || '["/admin/evaluations/status","/api/admin/evaluation-status"]'::JSONB
    WHERE "groupName" = 'ADMIN';
  END IF;
END $$;

-- =========================================================
-- Migration 36: Grant evaluation-coverage paths to ADMIN
-- Status was renamed to Coverage; both stay granted so legacy
-- /status links (redirect stub) keep working.
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_access
    WHERE "groupName" = 'ADMIN' AND pages @> '["/admin/evaluations/coverage"]'::JSONB
  ) THEN
    UPDATE group_access SET pages = pages || '["/admin/evaluations/coverage"]'::JSONB
    WHERE "groupName" = 'ADMIN';
  END IF;
END $$;

-- =========================================================
-- Migration 37: Grant evaluation-coverage paths to DEAN
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_access
    WHERE "groupName" = 'DEAN' AND pages @> '["/dean/evaluations/coverage"]'::JSONB
  ) THEN
    UPDATE group_access SET pages = pages || '["/dean/evaluations/coverage","/api/dean/evaluation-status"]'::JSONB
    WHERE "groupName" = 'DEAN';
  END IF;
END $$;

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ACES (Academic Consultation & Evaluation System)** is a faculty-student consultation booking system built on Next.js 16 (App Router) + Supabase PostgreSQL. Core features include: appointment booking with time-slot management, availability rules for faculty, faculty evaluation with rubrics and sentiment analysis, department/semester ETL imports, durable email workflows via Vercel, and role-based access control with four roles (ADMIN, DEAN, FACULTY, STUDENT) that can be combined (e.g., `DEAN|FACULTY`).

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Vitest (CI mode, single pass)

# Testing variants
npx vitest                          # Watch mode
npx vitest --reporter=verbose       # Verbose output
npx vitest --grep "pattern"         # Run matching tests
```

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` — app base URL (default: `http://localhost:3000`)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project
- Feature flags default to `false`: `SSO_FEATURE_FLAG`, `EMAIL_FEATURE_FLAG`, `FEATURE_CREATE_TEAMS_MEETING`

## Architecture

### Layered Pattern

Every domain follows: **Route Handler → Controller → Service → Repository → Supabase**

- **`app/api/`** — Thin handlers: authenticate session, parse request, call controller, return JSON.
- **`features/*/`** — Domain slices (appointments, evaluations, users, reports, admin-data, etc.). Each contains `*.controller.ts` (orchestration, DTO shaping), `*.service.ts` (business logic, single-domain queries), and `*.repository.ts` (type-safe DB access).
- **`lib/repositories/`** — Interface definitions + Supabase implementations. All wired through `lib/repositories/factory.ts` (dependency injection).
- **`lib/`** — Infrastructure: `auth.ts` (NextAuth config), `supabase.ts` (client), `db.ts` (re-exports), `services/` (email, audit, CSV, iCal, sentiment), `workflows/` (Vercel durable email), `types/` (entity/DTO/repo interfaces), `contexts/` (React providers).
- **`components/`** — Reusable UI (`ui/`) and layout shells (`layouts/`).

### Access Control

**`proxy.ts`** (Next.js middleware) is the enforcement point:
1. Public paths bypass auth (login, activate, forgot-password, faq, `/_next`, `/api/auth`).
2. JWT is validated via NextAuth `getToken()`.
3. `getUserAccess(userId, role)` reads per-user overrides from `lib/page-api-map.ts` against the default matrix in `lib/access.ts`.
4. API routes are blocked by default unless present in the access matrix or the caller is ADMIN.

Role representation: pipe-delimited string stored in the DB (`ADMIN|FACULTY`). Priority resolution order: ADMIN > DEAN > FACULTY > STUDENT. Helper: `hasRole(user.role, "ADMIN")` from `lib/utils/roles.ts`.

Session validation in `lib/auth.ts` re-fetches the role from DB on every request and checks that `tokenVersion` still matches — bumping `tokenVersion` for a user forces an immediate logout.

### Data Access

All Supabase access goes through repositories. The pattern:

```ts
import { supabase } from "@/lib/db"

const { data, error } = await supabase
  .from("table")
  .select("..., join(...)")
  .eq("field", value)
  .single()

if (error) throw error
return toEntityMapper(data)
```

Database schema is in `supabase-schema.sql`. Key tables: `users`, `userrole` (junction), `appointments`, `appointment_time_slots`, `appointment_attendees`, `availability_rules`, `evaluation_periods`, `evaluations`, `rubrics`, `evaluation_results`, `departments`, `semesters`, `subjects`, `sections`, `faculty_subjects`, `student_enrollments`, `audit_logs`.

### Email Workflows

Emails are sent via Vercel Workflows (durable, survives restarts) defined in `lib/workflows/email-workflows.ts`. The low-level sender uses Nodemailer (Gmail SMTP) in `lib/services/email.ts`. Templates are plain HTML template-literal functions in `lib/email-templates/`. Controllers call email functions fire-and-forget (catch + log, never block the response).

### Testing

Tests live in `lib/__tests__/` (14 files, ~166 tests). Framework is Vitest with jsdom. The standard mock pattern using `vi.hoisted`:

```ts
const mockUserRepo = vi.hoisted(() => ({ findById: vi.fn() }))
vi.mock("@/lib/repositories/factory", () => ({
  userRepository: mockUserRepo,
}))
```

### Key Conventions

- **Path alias:** `@/*` maps to the project root (configured in `tsconfig.json` and `vitest.config.ts`).
- **Multi-role selector:** `app/page.tsx` redirects to the correct dashboard or shows a role picker when a user has multiple roles.
- **Form submissions:** Use the `<SubmitButton>` component which has a 500ms double-click guard.
- **Dark mode:** Class-based (`.dark` on `<html>`), persisted in `localStorage`, injected via an inline no-flash script in the root layout.
- **PDF export:** Loaded via `dynamic()` import on demand (not bundled upfront).
- **50 MB body limit** is set in `next.config.ts` to support bulk CSV imports.

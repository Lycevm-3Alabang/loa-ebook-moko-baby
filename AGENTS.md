# AGENTS.md — LOA Connect Hub

## Stack

- **Framework:** Next.js 16 (App Router), TypeScript, React 19
- **Styling:** Tailwind CSS 4, `@tailwindcss/postcss` plugin
- **Database:** Supabase PostgreSQL (schema in `supabase-schema.sql`)
- **Auth:** NextAuth v4, Credentials provider, JWT (bcryptjs)
- **Email:** Nodemailer (Gmail SMTP) via Vercel Workflows
- **PDF:** jsPDF + jspdf-autotable
- **Scheduling:** Vercel Workflows (`"workflow"` dep) for durable email delivery

## Commands

| Command | Action |
|---------|--------|
| `npm run dev` | Start dev server |
| `npm run build` | TypeScript + Next build |
| `npm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `npm test` (or `npx vitest run`) | Run all tests |
| `npx vitest run --reporter=verbose` | Verbose test output |
| `npx vitest run lib/__tests__/FILE.test.ts` | Single test file |
| `npx vitest watch` | Watch mode |

## Architecture

```
proxy.ts (NextAuth middleware) — JWT validation + role-based page access
  → app/api/ (thin BFF)  →  features/*/*.service.ts  →  features/*/*.repository.ts
  → Server Components fetch via services directly, pass props to Client Components
```

```
app/                    # Next.js routing & pages (entry points)
├── (auth)/             # login, activate, forgot-password, change-password
├── api/                # Thin REST/BFF endpoints
├── admin|dean|faculty|student/  # Role dashboards
├── globals.css
└── layout.tsx

features/               # Vertical slices (domain + business logic)
├── users/              # users.service, auth.service, users.repository, bulk-import/
├── appointments/       # appointments.service, booking UI, calendar
├── evaluations/        # evaluations.service, evaluation form UI
├── evaluation-results/
├── rubrics/
├── reports/            # backlog, coverage, demand, distribution, responsiveness services
├── admin-data/         # departments, semesters, subjects, sections, enrollments
└── audit/

components/             # Global reusable UI
├── ui/                 # SubmitButton, Skeleton, StatusBadge, SearchInput, …
└── layouts/            # AppShell, Sidebar, Navbar, Providers, …

lib/                    # Global utilities & infrastructure
├── db.ts               # Supabase client + repository factory
├── db/common.ts        # Shared query helpers (USER_SELECT, appointmentSelect, …)
├── utils.ts            # Barrel: roles, date, semester, report-helpers, …
├── auth.ts, supabase.ts, types/, services/, workflows/, …
```

- Middleware at `proxy.ts` (exported as `proxy`, matched via `config.matcher` excluding `api/`, `_next/`, static files)
- Route groups: `app/(auth)/`, `app/admin/`, `app/dean/`, `app/faculty/`, `app/student/`
- Mobile companion pages under `app/{role}/m/` (book, meetings, departments, upload)
- Path alias `@/*` → project root (tsconfig paths)
- **New code** goes in `features/` and `components/ui|layouts/`; `components/*.tsx` shims exist for backward compatibility

## Role System

- `user.role` is pipe-delimited string (e.g. `"ADMIN|FACULTY"`)
- Primary role resolved by priority: ADMIN > DEAN > FACULTY > STUDENT > GUEST
- Faculty ⇔ Dean are mutually exclusive
- `proxy.ts` `PAGE_ACCESS` map defines per-role routes; unmatched → redirect `/403`

## Data Layer

- **Repositories** in `features/*/*.repository.ts`, implement interfaces from `lib/types/repository.ts`, wired via `lib/repositories/factory.ts` (also exported from `lib/db.ts`)
- **Services** in `features/*/*.service.ts` — business logic + validation
- **Types** in `lib/types/` (shared) + `features/*/types.ts` (per-slice re-exports)
- DB schema in `supabase-schema.sql` (run manually in Supabase SQL Editor)
- Supabase client in `lib/supabase.ts` (uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)

## Key Conventions

- **Double-click prevention:** all form buttons use `SubmitButton` (500ms guard via `useRef`)
- **Skeletons:** `Skeleton.tsx` variants (`text`, `card`, `table-row`, etc.) + composite (`SkeletonTable`, `SkeletonMetricGrid`, `SkeletonCard`)
- **Dark mode:** class-based (`.dark` on `<html>`), persisted in localStorage, Tailwind `dark:` variant, no-flash inline script in `<head>`
- **Feature flags:** env vars (`EMAIL_FEATURE_FLAG`, `SSO_FEATURE_FLAG`, `FEATURE_CREATE_TEAMS_MEETING`)
- **API routes** are thin — parse request, call controller, return JSON
- **Error boundaries** per route group (auth, admin, dean, faculty, student) + global (`error.tsx` / `global-error.tsx`)
- **Loading states:** dedicated `loading.tsx` per route segment

## Email

- Triggered via Vercel Workflows in `lib/workflows/email-workflows.ts` (safe no-ops locally)
- Templates in `lib/email-templates/` (HTML template literals)
- Sender in `lib/services/email.ts` (Nodemailer)
- Requires `VERCEL_ENV` on Vercel; locally runs as regular async calls

## Testing

- Vitest with jsdom environment (config: `vitest.config.ts`)
- All tests in `lib/__tests__/` (9 test files)
- Repositories mocked via `lib/repositories/factory.ts` module mock
- CI runs `npx vitest run` on push/PR to `main`

## Missing / Incomplete

- **Faculty Evaluation Module** (`eval` branch): ~18 items marked ❌ missing in `README.md` (pages, API routes, repositories, reports)
- **Sentiment analysis:** placeholders only (`lib/services/sentiment.ts`, API stubs)
- **Test coverage:** minimal (8 test files ~17,619 LOC)

## Setup

```
# 1. Run supabase-schema.sql in Supabase SQL Editor
# 2. cp .env.example .env and fill in credentials
# 3. npm ci
# 4. npm run dev
```

Seed accounts documented in `README.md` (4 roles). Non-activated accounts use `/activate` flow.

## Lessons Learned

### 1. PostgREST FK Detection (`PGRST201`)

- **Symptom:** Embedded join syntax `foreignTable:foreignColumn()` returns 300/PGRST201 error
- **Root cause:** Double-quoted camelCase column names (`"facultyId"`) cause PostgREST's schema introspection to miss FK relationships
- **Fix:** Unquote or rename columns to lowercase snake_case (`faculty_id`), then refresh schema cache via `NOTIFY pgrst, 'reload schema'`
- **Note:** Raw SQL works fine — the issue is only in PostgREST's PostgREST API layer

### 2. `supabase-schema.sql` Dual-Purpose Pitfalls

The schema file serves **both** fresh installs (`CREATE TABLE IF NOT EXISTS`) and incremental upgrades (migration blocks). When modifying it:

- **Inline FK constraints** (`REFERENCES ...`) auto-create a constraint name (e.g. `faculty_subjects_subject_id_fkey`). Any later `ADD CONSTRAINT` with the same name will fail on fresh installs. Wrap in `DO $$ BEGIN IF NOT EXISTS ... END $$;` blocks as needed.
- **Migration order matters** — rename migrations go BEFORE migrations that reference the new names.
- **Guard destructive DDL** — `RENAME COLUMN`, `DROP COLUMN`, etc. must check `IF EXISTS` via `information_schema.columns` to avoid failure on fresh installs.

### 3. Column Rename Scope

Renaming DB columns cascade through the full TypeScript stack:
1. **TypeScript interfaces** — property names must match Supabase return shape
2. **Repository `.eq()` / `.select()` / `.in()` strings** — exact column name strings in Supabase queries
3. **Property access** — `row.oldName` → `row.newName` on returned data
4. **Embedded join syntax** — `alias:oldColumn()` → `alias:newColumn()` in `.select()`
5. **Object spread / insert** — key names in insert objects must match

### 4. React 19 Lint: `react-hooks/set-state-in-effect`

- **Symptom:** `useEffect(() => { fetchData() }, [fetchData])` errors with "Calling setState synchronously within an effect"
- **Root cause:** React 19 ESLint (`react-hooks/set-state-in-effect`) flags any synchronous setState call transitively reachable from a `useEffect` body, even if the setState happens after an `await`.
- **Fix:** Defer the call so the effect body doesn't invoke it directly:
  ```tsx
  useEffect(() => { Promise.resolve().then(() => fetchData()) }, [fetchData])
  ```
  Or avoid useEffect for data fetching entirely (derive loading state or use a library).
- **Related:** Changing a function's signature (e.g. adding `isRefresh` param) breaks `onClick={fetchData}` because `MouseEventHandler<T>` no longer matches. Always wrap: `onClick={() => fetchData(true)}`.

### 5. Vitest: `clearAllMocks` vs `resetAllMocks` with Shared Mocks

- **Symptom:** `vi.clearAllMocks()` in `beforeEach` causes tests to fail when run in suite but pass in isolation. Mock functions retain consumed `mockResolvedValueOnce` implementations across tests/describe blocks.
- **Root cause:** `clearAllMocks` clears calls/results but **not** the `_mockImplementationQueue`. `mockResolvedValueOnce` additions from previous tests persist even after clear.
- **Fix:** Use `vi.resetAllMocks()` instead — it clears the implementation queue too. Or use `mockResolvedValue` (persistent) over `mockResolvedValueOnce`.
- **Corollary:** Use static `import` + helper functions (not dynamic `await import()` in test bodies) when the module is already `vi.mock`'d at the top level. Delete unused helper constants after refactoring.

### 6. Unused Variable Naming Convention

- **Symptom:** ESLint `@typescript-eslint/no-unused-vars` on destructured params like `({ role, ...fields })`
- **Fix:** Prefix with underscore: `({ role: _role, ...fields })` — the config allows unused args matching `/^_/u`.

## Behavioral Rules (from deleted `app/AGENT.md`)

- **Default mode: advisory** — analyze, explain, review, recommend, ask. Do not generate code unless explicitly asked.
- **Ask before assuming** — if uncertain, ambiguous, or requirements are incomplete, ask. Never guess or infer.
- **Explain before implementing** — what, why, where, risks, alternatives. Wait for approval.
- **One change rule** — perform exactly one requested change, then return to advisory mode. No adjacent refactoring or cleanup.
- **No autopilot** — prohibited unless requested: refactoring, renaming, restructuring, file movement/deletion, dependency install, arch changes, DB changes, API redesign, new features, cleanup, optimization, test gen, docs updates.
- **Code review first** — point to files, methods, root causes. Do not rewrite code immediately.
- **Proposal format** — for changes >20 lines: Understanding, Questions, Recommendation, Files Affected, Risks, then await approval.
- **Implementation checklist** — TypeScript passes, build passes, lint passes, no unused imports, no `console.log`, no `any`, no `ts-ignore`, error handling present.

## Working with Specs (living template — amend by agreement)

> Specs are the source of truth for behavior. Code matches the spec — never the reverse. This section is a starting template and may change as the team learns.

- **Lifecycle:** discuss → write spec → user approves spec as **Final** → implement exactly the spec. No code, migration, or dependency change lands on a Draft spec.
- **Where specs live:** feature specs in `specs/` (see `specs/README.md`); endpoint behavior owned by the Consult backend specs (below) — reference by ID, never duplicate.
- **Draft vs Final:** Draft = under discussion, code forbidden. Final = user-approved, code gates open. Promotion (Draft → Final) needs an explicit user yes with no normative change, or a revised Draft first.
- **One change rule applies:** finish the approved spec step, report, stop. Ask before the next phase, even if it seems obvious.
- **Discoveries:** implementation defect → fix code; test defect → fix test; spec gap → refine the spec first, then code. Never silently choose behavior.

## Spec Authoring Guideline

Every normative spec is its own file and MUST follow this shape (no normative change via reformat/polish alone):

1. **Metadata table** — ID / Title / Status (Draft v0.x or Final vX.Y) / Owner / Version / Scope / Non-goals.
2. **RFC 2119 terminology** — MUST/MUST NOT/SHOULD/MAY per RFC 2119.
3. **Context** — what exists today (with verified file paths), why the spec exists.
4. **Constraints** — numbered `CON-*` (MUST/MUST NOT): paths, shapes, auth, filters, pagination, what must not break.
5. **Goal** — decisions `DEC-*` (chosen behavior) + acceptance `ACC-*`, split into:
   - **Objective** — deterministic, machine-checkable (statuses, shapes, counts, guards 401/403/404/422, idempotency).
   - **Subjective** — human-judged steps stated as observable reviewer actions (e.g. "reviewer confirms the login flow completes with no error toast").
6. **Deliverables** — numbered `D-*` (files/routes/tests to create, in order).
7. **Glossary + References** — terms defined; specs referenced by ID, never pasted.

Tests (Vitest, `lib/__tests__/`) cover both halves: unit/integration cases for logic (one behavior per test, mocked repositories), plus user-run manual checks (browser SSO, role matrices) for paths tests cannot prove. No behavior without a `CON-*` + `ACC-*` + `D-*`.

## Consult Backend Awareness (reference only — this project does not depend on its repo)

- **Backend:** Laravel 12 API at `D:\loa\loa-apache-server-apps\assemblies\loa-consult-platform\` (own repo, own lifecycle). This frontend consumes it at cutover; the backend never adapts to the frontend.
- **Known Final contracts:** `api-endpoints.md` v2.1 (flat 104+5, bare shapes `{data}`/`{error}` — no envelope), `endpoints-reports.md` v1.0 (7 report families), `frontend-transition.md` v1.1 (T0→T5 cutover order — the plan this repo executes).
- **Auth model:** Auth-issued JWT (in-memory only, never localStorage) + httpOnly refresh cookie; tenant `loa-consultation`; groups come from the JWT `groups` claim (`aces-admin`/`aces-dean`/`aces-faculty`/`aces-user`) — never local roles. Pipe-delimited `user.role` strings are legacy display vocabulary only.
- **Topology:** Vercel host, **Option B = same-origin BFF passthrough** — a catch-all Route Handler forwards browser traffic server-side to `CONSULT_API_URL`/`AUTH_API_URL`; no `vercel.json`/`next.config.ts` rewrites and **no CORS**, so the refresh cookie stays same-origin `SameSite=Lax` (mechanism corrected 2026-09-30 after reading the e-cert handler; see `specs/decisions/bff-passthrough.md`). Cookie flags verified at T1 E2E.
- **Local specs:** `specs/services/{api-client,auth,platform}.md` (`EC-API-001`/`EC-AUTH-001`/`EC-PLAT-001`, Draft v0.1) + `specs/decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`).
- **Rule:** cite backend specs by ID when a frontend change depends on endpoint behavior; file backend discrepancies as spec gaps there, do not work around them here.



# AGENTS.md — LOA Connect Hub

## The Core Loop

Three rules. They govern every task in this repo and are not advisory. They refine the Behavioral Rules below rather than competing with them.

### 1. Frame first, code later — the five fields

Before writing **any** spec, and before implementing anything whose problem statement is not already on record, ask the user for these five. They are the user's to supply, not yours to draft:

| Field | The question it answers |
|-------|-------------------------|
| **Problem** | What is actually broken or missing, and for whom? |
| **Constraints** | What must not change — backward compatibility, the bare-shape contract, the cutover order, the BFF topology? |
| **Non-goals** | What is deliberately out of scope, so it does not creep back in? |
| **Success criteria** | What is observably true when this is finished? |
| **What "done" means** | Which gate proves it — a pasted `npx vitest run`, a browser/SSO check, a user yes? |

- **Never invent these five.** In a cutover repo the most expensive guess is a *boundary* guess — re-pointing the wrong area, or re-pointing an area the backend cannot serve.
- **Hard rules for spec creation specifically.** This repo's whole spec program depends on it: a spec missing any of the five is a Draft with a hole in it. Write the spec anyway if asked, but put `TBD — user input required` in the metadata table rather than a plausible guess.
- **If the user has already framed it,** do not block. Reflect their framing back as the five fields and ask only for what is missing — a confirmation, not an interrogation.
- **Reconcile with the spec lifecycle below:** authoring a spec is always honored. Ask for the framing first, then write. A missing field is never grounds to refuse.

### 2. Solution hierarchy — always top-down

```text
Problem  →  Options & trade-offs  →  Architecture  →  Contracts / interfaces  →  Implementation  →  Tests
```

- **Only work the layers below the user's current layer.** If they are deciding *what* to re-point, you propose options and trade-offs. Once they have decided, you design. Implementation starts only after Architecture and Contracts are settled with them.
- **The stop line is the boundary, not the code.** Never start re-pointing an area while the real issue is ambiguous requirements or wrong scope boundaries. A re-point against an endpoint the backend 403s or has not built converts a backend defect into a user-visible failure and makes rollback ambiguous.
- **Trade-offs are mandatory.** Always name what is given up: the rejected alternative and its cost, what is deferred, what breaks later. A recommendation with no stated cost is not a recommendation.
- **A discovery that invalidates a layer sends you back up.** If implementation reveals the requirement was wrong, that is Classification C — return to the spec, then re-approach. Do not patch downstream and keep moving.
- **Check the other side before proposing a layer change.** This repo consumes a backend with its own lifecycle. Before designing against an endpoint, confirm it is spec'd *and* served there, and cite it by ID (`EC-CUTOVER-001` CON-2). Never restate backend behavior, and never work around a backend gap here.

### 3. Who holds what

**The user holds the "why" and the "what."** That is judgment under ambiguity — what to build, what to cut, what will break in production, whether a boundary is right. It is not typing speed and not syntax recall, and it is measured by neither.

**You hold the "how."** You are a tireless junior: fast, no context, no stakes. Concrete consequences:

- **Never ask the user for something you should own.** File locations, component structure, TypeScript types, command syntax, which of two implementations is idiomatic. Asking them to recall syntax offloads your job and wastes the only thing they are actually good at.
- **Do bring them the things only they can judge.** Which re-point order is survivable. What a rollback costs. Whether a legacy route can be deleted yet. Whether a parity sample is convincing. Whether a deferral is honest.
- **Do not pad with restatement.** Do not summarize what the user just said back to them; go to the next layer.
- **Fast is not the goal.** A large volume of plausible work against an unconfirmed target is a failure mode, not productivity.
- **You have no stake and they do.** Flag the risk and the thing that will fail in production. Do not soft-pedal a problem you found, and do not withhold one because the work is nearly finished.

> Every turn also ends with a **Next action** block — see the end of this file.

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
- All tests in `lib/__tests__/` — 18 `*.test.ts` files + `vitest.setup.ts` (the "9 test files" figure in older notes is stale)
- Only `bff-proxy-route.test.ts` currently carries a spec ID in its header (`EC-API-001` D-4); the other 17 have no spec citation. There is **no** `test-suite.md` equivalent for this frontend — the test contract is distributed across `EC-API-001` / `EC-AUTH-001` acceptance lists, which is a known gap
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

> These operationalize the Core Loop at the top. "Ask before assuming" is Core Loop 1; "Explain before implementing" and "Proposal format" are Core Loop 2's Options layer; "No autopilot" is what keeps the Core Loop from becoming autopilot.

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
- **⚠ Gating T2 — `frontend-integration-gate.md` `CONSULT-FIG-001` (backend, **Draft v0.2**, own repo).** This is the endpoint-correctness gate ahead of all T2 work, and it is currently **not Final**, so T2 area re-pointing is not authorized. Its root finding: 22 authorization gates in the backend's `AppointmentController` / `EvaluationController` / `AvailabilityRuleController` compare pre-tenant literals (`STUDENT`/`FACULTY`/`DEAN`/`ADMIN`) against a claim normalized to `ACES-*`, so `POST /appointments`, `POST /evaluations` and the availability rules **403 for every real caller**, and `GET /appointments` **fails open** to internal staff meetings; 6 backend test files encode the same wrong literals, so its 120-green proved nothing. Cite by ID; do not restate, and do not work around it here (DEC-13/DEC-14 leave two restrictions as Auth provisioning requirements, not code).
- **Auth model:** Auth-issued JWT (in-memory only, never localStorage) + httpOnly refresh cookie; tenant `loa-consultation`; groups come from the JWT `groups` claim (`aces-admin`/`aces-dean`/`aces-faculty`/`aces-user`) — never local roles. Pipe-delimited `user.role` strings are legacy display vocabulary only.
- **Topology:** Vercel host, **Option B = same-origin BFF passthrough** — a catch-all Route Handler forwards browser traffic server-side to `CONSULT_API_URL`/`AUTH_API_URL`; no `vercel.json`/`next.config.ts` rewrites and **no CORS**, so the refresh cookie stays same-origin `SameSite=Lax` (mechanism corrected 2026-09-30 after reading the e-cert handler; see `specs/decisions/bff-passthrough.md`). Cookie flags verified at T1 E2E.
- **Local specs:** `specs/services/{api-client,auth,platform}.md` (`EC-API-001` v1.1 / `EC-AUTH-001` v1.1 / `EC-PLAT-001` v1.0, all Final) + `specs/decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`) + `cutover-headline.md` (`EC-CUTOVER-001` v1.4) and `appointments-flow.md` (`EC-APPT-001` v1.0).
- **Reference discipline:** backend behavior is cited by ID, never restated. See the Reference discipline section in each service spec. Where a citation and a local spec disagree, the citation wins and the local spec is a bug.
- **Rule:** cite backend specs by ID when a frontend change depends on endpoint behavior; file backend discrepancies as spec gaps there, do not work around them here.

## Cutover state (as of 2026-09-30)

- **T0 + T1-a + T1-b done** (2026-09-26): SSO seam, fragment callback, in-memory token, login button.
- **BFF handler built, awaiting gates** (`EC-API-001` D-1): `app/api/v1/[...path]/route.ts`. Gates are `npm run lint`, `npx tsc --noEmit`, and the two vitest files — the agent does not run them.
- **`proxy.ts` still live** and still holds a legacy next-auth server gate; it is retired at T3 (`EC-CUTOVER-001` DEC-6). Until then `/api/v1` is explicitly exempt from it (`EC-API-001` CON-12) — a leftover legacy session on a non-admin account would otherwise 403 every BFF call.
- **Still direct-Supabase:** 112 legacy `app/api/**/route.ts` handlers (plus the BFF catch-all = 113 `route.ts` total), `features/*/`, `lib/repositories/factory.ts`, `lib/auth.ts`, `lib/access.ts`. Those go per T2 area and at T4 — and T2 is gated on `CONSULT-FIG-001` going Final and green.
- **Do not reintroduce:** a public API-URL variable, a cross-origin browser call, or a raw `fetch()` in new code.

## ⏭ Always End With The Next Action

**Never end a turn on a summary, a findings list, or an open question alone.** The user must never have to ask "what now?". Every substantive turn ends with a **Next action** block built from the state on disk — not from memory, not invented.

**Read the state before proposing anything, in this order:**

| # | Source | What it tells you |
|---|--------|-------------------|
| 1 | `TODO.md` → `## Next (in order — one change + yes per step)` | this repo's open items, already ordered, each with its own gate |
| 2 | `specs/README.md` | which specs are **Final** (code gates open) vs **Draft** (code forbidden) vs Superseded |
| 3 | `specs/cutover-headline.md` → `Document Control` → `Next:` | where T0→T5 stands and what T2 waits on |
| 4 | The owning spec's `Document Control` → `Next:` | the next deliverable inside that spec, by `D-*` id |
| 5 | `## Cutover state` above | what is landed vs still direct-Supabase |

**The block MUST contain, in this order:**

1. **Action** — one imperative sentence. The single smallest next thing.
2. **Where** — `file:line`, or spec ID + the `DEC-*` / `D-*` / `ACC-*` that authorizes it.
3. **Who runs it** — **you or the USER.** Gates in this repo (`npm run lint`, `npx tsc --noEmit`, `npx vitest run`, browser/SSO checks) are the **USER's to run**; you write the code and give the exact command. Never run them yourself.
4. **Why now** — the gate it unblocks, or the gate currently blocking it.
5. **Blocked by** — upstream dependency by ID, or `nothing`. Cross-repo blockers are named here and repeated in line 1.
6. **Then** — the action after this one, so the user can see the shape of what remains.

**Hard rules for the block:**

- **One action, not a menu.** Alternatives belong *inside* a decision you route to the user; the block still names one recommended action.
- **Never vague.** Not "fix the types" — "`npx tsc --noEmit` in this repo; USER pastes the output; 2 pre-existing `lib/__tests__` errors are expected and are filed separately".
- **Never autopilot.** The block is a *proposal*. It authorizes nothing — the one-change rule and the no-autopilot rule above still gate execution.
- **An unpasted gate is the next action.** If the user owes a lint, typecheck, vitest, or browser result, that sits at the top of the block — ahead of any new feature or refactor.
- **Cross-repo blockers lead.** The backend's `CONSULT-FIG-001` gates all of T2. Until it is **Final and green**, T2 area re-pointing is blocked, and saying so in line 1 is more useful than any local suggestion.
- **Deferred ≠ forgotten.** Do not re-propose work the user deferred (reports, `/audit-logs`); say it is deferred and name what it waits on.
- **Never propose a refactor of a route that still has no working backend.** Re-pointing a `app/api/**` handler onto an endpoint the backend 403s or has not built moves a backend defect into a user-visible failure. Check the backend's served-route state before suggesting a T2 area.
- **If nothing is open,** say so plainly and name the next unstarted `D-*` rather than inventing work.
- **Verify before you name it.** A "next action" that is already done, Draft-blocked, or already covered by an unrun gate is worse than none.



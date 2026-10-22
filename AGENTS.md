# AGENTS.md — ACES

## Stack

- **Framework:** Next.js 16 (App Router), TypeScript, React 19
- **Styling:** Tailwind CSS 4, `@tailwindcss/postcss` plugin
- **Database:** Supabase PostgreSQL (schema in `supabase-schema.sql`)
- **Auth:** NextAuth v4, Credentials provider, JWT (bcryptjs)
- **Email:** Nodemailer (Gmail SMTP) via Vercel Workflows
- **PDF:** jsPDF + jspdf-autotable
- **Scheduling:** Vercel Workflows (`"workflow"` dep) for durable email delivery

## Commands

> **Note (H1):** These are for the **user to run** — never execute them yourself. Present them copy-paste ready, in **the user's platform's** shell syntax (see H1). The **`gate-and-commit` skill** is the one exception: it runs the gate and commits.

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
- **All database access goes through the repositories and the services — no Supabase change or setup beyond what already exists** (hard rule **H4**)

## Key Conventions

- **Double-click prevention:** all form buttons use `SubmitButton` (500ms guard via `useRef`)
- **House-style buttons:** interactive actions use `components/ui/IosButton.tsx` (`variant` = `primary` / `tinted` / `success` / `destructive` / `gray` / `plain`; `size` = `xs` / `sm` / `md`). `variant="plain"` is the text-link style, `loading` renders a spinner. Avoid hand-rolled `<button>` + Tailwind — it drifts from the design system and loses the hover/active scale.
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
- All tests in `lib/__tests__/` (65 test files, 2026-10-22 — the case count is the owner's run)
- Repositories mocked via `lib/repositories/factory.ts` module mock
- CI runs `npx vitest run` on push/PR to `main`

## Missing / Incomplete

- **Faculty Evaluation Module** (`eval` branch): ~18 items marked ❌ missing in `README.md` (pages, API routes, repositories, reports)
- **Sentiment analysis:** placeholders only (`lib/services/sentiment.ts`, API stubs)
- **Test coverage:** still light on repository/service integration tests — export-route tests mock the service, so a real Supabase query failure cannot surface in CI (see Lesson 7)

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

### 7. PostgREST URL Cap — `.in()` Must Be Chunked

- **Symptom:** Route returns 500 with no useful message. Supabase → Logs → API shows `GET | 400` on `/rest/v1/<table>?...&<col>=in.(...)`. ~1318 UUIDs ≈ 48KB URL.
- **Root cause:** PostgREST carries filters in the **query string**, so a large `.in()` list exceeds the ~8KB URL limit and answers **400**. Supabase-js surfaces that as an error you `throw`, which the route turns into a 500. Not a DB/data problem.
- **Fix:** Chunk at `IN_CHUNK_SIZE = 100`, `Promise.all` the chunks, then `flatMap` the rows.
- **Corollary — chunking is per-method, never per-line-range.** `eval-results-400-fix-checklist.md` Slice 4 ticked `evaluations.repository.ts:382-520` as done. That range *contains* `listSubmittedByPeriodAndEvaluatees`, but the method itself stayed unchunked and 500'd the export months later. **Enumerate every `.in(` call site explicitly** and grep for unchunked ones — never certify a slice by line span.
- **Corollary — empty guard:** return early on an empty id list; `.in.()` with zero values is itself a 400.

### 7b. PostgREST Row Cap — `db-max-rows` (1,000) Truncates Silently

- **Symptom:** a figure is wrong but **no request ever fails**. An average, a count or a "Total Responses" disagrees with the number of rows behind it, and a subject's Avg. Rating sometimes shows "—".
- **Why:** PostgREST applies `db-max-rows` (Supabase's default **1,000**) by adding `LIMIT 1000` to the SQL it generates. The request answers **HTTP 200** with the first 1,000 rows — **no error, no warning**. The client cannot tell "there are 1,000 rows" from "there are 2,700 and you kept the first 1,000". Without an `ORDER BY` the surviving subset is arbitrary, so two pages reading the same table with different id lists get **different** subsets.
- **Fix:** **page** the read — `.order(<total order>).range(offset, offset + 999)` in a loop until a page comes back short. The order **must be total**, or a page boundary can duplicate or skip a row: order by the table's `UNIQUE` columns (`evaluation_ratings` → `("evaluationId","itemId")`; `evaluations` → `id`).
- **The loop's contract:** a page is either **full** (1,000 rows — keep going) or **short** (the end of the set — stop). That works because the page size **equals** the cap, so a full page is never a truncated one. If `db-max-rows` were ever **below** the page size, a "full" page would be truncated and the loop would stop early — silently, again. The repo's page size is 1,000 throughout (`PAGE_SIZE` / `BATCH` / `RANGE`); keep it at the cap, and if the cap ever moves, move the page size with it.
- **Corollary — the two caps need opposite fixes.** The **URL** cap (Lesson 7) is **chunking**; the **row** cap is **paging**. Shrinking the chunk does **not** fix the row cap — it only makes more requests that each still truncate.
- **Corollary — the multiplier.** `evaluation_ratings` holds **one row per rubric statement** — **34** for the seeded rubric (8 criteria: 3 · 6 · 4 · 4 · 4 · 4 · 3 · 6) — so a chunk of 100 evaluations is 3,400 rows against a 1,000-row cap. A chunk sized for the URL budget is **not** sized for the row budget. ⚠️ **The rubric is data** (the app has a rubric editor), so the multiplier is not a constant of the repo — re-check it when the rubric changes.
- **Corollary — size the chunk so a chunk's rows fit under the row cap.** `OFFSET` paging **re-scans** the chunk's rows on every page, so a chunk that spills into three pages is read three times over. `lib/db/common.ts` reads the ratings in chunks of **29** evaluations: 29 × 34 = **986** rows, one page under the 1,000-row cap, so a chunk comes back in a **single** request and each rating is read **once**. The chunk is **derived** — `Math.floor(RATINGS_PAGE_SIZE / RUBRIC_STATEMENT_COUNT)` — so the relationship is stated once; `RUBRIC_STATEMENT_COUNT` is exported and the paging test asserts the invariant. Size the chunk for the **row** budget and the URL budget at the same time (29 ids ≈ 1.1KB, well under the ~8KB URL cap).
- **Corollary — a stale multiplier is a silent perf regression, not a wrong number.** The chunk was sized for **27** statements while the rubric had **34** — migrations 28/29 took it from 24 to 34, and the "27" was the *seed's* count, carried in the code, in the schema's comment and in the rubric group's description. The read stayed **correct** (the page loop pages until a short page), but every chunk spilled into a second page and its first 1,000 rows were read twice. ⭐ **Only a count of the live rubric caught it** — no test failed, no number moved, nothing errored. When a read's chunk is derived from a property of the data, **write the derivation down and assert it**, and treat the multiplier as a thing to re-check when the data changes.
- **Corollary — a paging fix multiplies the requests.** It multiplies the request count by `rows ÷ page size`. Measure the **rows**, not the requests: 201,717 rows was the defect, and 225 requests was just how they were being carried. **The cure is to move the group-by into Postgres (Lesson 7c) — and where that is not available, to read the rows once, per department, and cache them.**
- **Where the repo pages:** `features/evaluations/evaluations.repository.ts` (`countSubmittedByFacultySubjectIdsPaged`, `listSubmittedByPeriodAndEvaluatees`, `listSubmittedByPeriodAndFacultySubjectIds`, `listStatusByPeriodAndFacultySubjectIds`), `features/evaluation-results/evaluation-results.repository.ts` (`listSubmittedEvaluates`, `listSubmittedEvaluatesForFaculty`, `listFacultyFigures`, the student-breakdown's evaluations read), `features/admin-data/student-enrollment.repository.ts` (`countByFacultySubjectIdsPaged`), `features/users/users.repository.ts` (`listAll`), `features/admin-data/admin-data.service.ts`, `lib/db/common.ts` (`fetchRatingsWithCategories`).
- **Corollary — a read can break on the row cap with no `.in()` at all.** The student-breakdown's evaluations read filtered on a **two-id** `.in()` — no URL problem — and still truncated, because it asked for *every evaluation of these faculty*. **Enumerate the reads, not the `.in()` sites**: a read that asks for "everything about X" needs a page loop whatever its filters look like. (The URL-cap sweep and the row-cap sweep are two different lists.)
- **Corollary — a silently truncated read is a *wrong* figure, not a *missing* one.** It never surfaces as a 500, so it survives review: check the row count, not the status code.

### 7c. A Group-By That Spans a To-Many Cannot Be Expressed Through REST

- **The rule:** PostgREST can aggregate — `?select=amount.sum(),order_date` returns the sum **grouped by** `order_date` — but the group can only be the **top-level table's** columns (or a spread *to-one* embed). A group that spans a to-many — e.g. **ratings → items → categories** — cannot be expressed through the REST API at all, and the aggregate feature is **disabled by default** on Supabase (`db-aggregates-enabled`).
- **The options when the group-by is needed:**
  - **(a) A direct Postgres connection** — `pg` + `DATABASE_URL`, a plain parameterised query, **nothing created in the database** (no function, no view, no migration, no `exec_sql`). It has no row cap and no URL cap: `db-max-rows` (1,000) and the ~8KB limit are **PostgREST's**, not Postgres's. ⭐ **It needs a connection string from the Supabase dashboard's Connection panel**, so it is only available where that dashboard is reachable. ⭐ **No surface in this app uses it** (2026-10-21): the aggregate module and `lib/db/postgres.ts` are deleted. `pg` and `DATABASE_URL=` remain in the repo for `scripts/apply-schema.mjs` — the owner's manual schema runner — and nothing else.
  - **(b) The app's own `exec_sql`** — it runs as the **invoking** role (`service_role`), which has no `CREATE` on `public`, so the app cannot create a function ("permission denied for schema public"). ⭐ The same wall is why the admin **Reset Database** feature cannot create tables.
  - **(c) Read the rows and pool them in the app** — the rows cross the wire, so the cost is the **rows**, not the requests.
- **The repo's pattern (2026-10-21):** **(c), per department and per faculty, each cached.** The results list, the exports and the dean view read **one department** at a time (`listDepartmentFigures`); the report reads **one faculty** at a time (`listFacultyFigures`). Both are kept for **five minutes** (`features/evaluation-results/figure-cache.ts`), so the list, the exports and the dean's view share one read.
  - ⭐ **The read carries the weights.** A faculty's figures come back with the per-category **(sum, count)** as well as the averages, because a mean cannot be un-meaned: the department's figure is the **pool** of its faculty's totals (`poolCategoryTotals` → `computeCategoryAveragesFromTotals`) — the mean over the rating rows, not a mean of the faculty's means. Without the weights, the two grains cannot both come from one read.
  - The contract is `specs/evaluation-results-cache.md`; the handover is `docs/evaluation-results-handover.md`.
- **Teach — where the rules go.** The **scope** rules (the period, the submitted and enabled evaluations, the live-eval rule, the teacher's home department) live in the **repository**; the **display** rules (the labels, the remark ladder, the highest/lowest selection) stay in TypeScript (`CATEGORY_LABELS`, `getRemark`, `findHighestLowestRubrics`), so there is one home for each.
- **Corollary — a detail page stays live.** The drill-down's per-subject rows are read on demand, every time, and are **not** cached — a detail page is opened for a reason (rule 3 of the cache contract).

### 8. Diagnosing a 500: Vercel Logs Do Not Show the Response Body

- **Symptom:** Vercel log shows `Status: 500`, `Execution Duration`, and a GET count, but no cause. Easy to burn several deploy cycles guessing.
- **Why:** The Vercel invocation log reports status/duration/**request** metadata only. The failing **query** and the **response body** are both elsewhere.
- **How to actually diagnose, in order:**
  1. **Surface the error first** — catch and return `Failed to export: ${err.message}` so the toast/Response tab names the cause.
  2. **Supabase → Logs → API** — filters to `400`/`error` and shows the exact URL (though the displayed `event_message` is **truncated**, so you cannot count IDs from it).
  3. **Browser DevTools → Network → Response tab**, or the toast text.
- **Corollary:** a Vercel `Deployment ID` pins which build answered. Confirm it changed before reading anything else into a log — a stale ID means you are looking at pre-fix evidence (compare `Request ID` too; an identical ID means the same request, not a new attempt).

### 9. React 19: `ref` Is a Regular Prop — `forwardRef` Is Deprecated

- **Symptom:** a shared UI primitive (`IosButton`) cannot hold a ref, silently killing autofocus/focus-trap setup downstream.
- **Root cause:** React 19 passes `ref` to function components as an ordinary prop. `forwardRef` is deprecated for function components (still functional, but warns).
- **Fix:** declare `ref?: React.Ref<HTMLButtonElement>` on the props interface, destructure `ref` out (so it never lands in `...props`), and attach it to the element:

  ```tsx
  interface IosButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    ref?: React.Ref<HTMLButtonElement>
  }
  // ...<button {...props} ref={ref} ...>
  ```

- **Note:** a `querySelectorAll('button, …')`-based **focus trap is unaffected** — it matches the live DOM, and the primitive still renders a real `<button>`. Only explicit `ref.current?.focus()` breaks.

## Hard Rules

### H1. NEVER run CLI commands — except the `gate-and-commit` skill

- **Absolute rule:** Do NOT execute shell/CLI commands (build, test, lint, npm, git, etc.). Do not run them "just to verify."
- Instead, **provide copy-paste-ready commands** the user can paste into their terminal.
- ⭐ **Determine the platform first** — it decides the syntax, and guessing wrong makes the commands
  unrunnable. The environment states it; if it is unknown, ask. **Never mix two shells' syntax.**
  | Platform | Chaining | Env var | Copy | Replace |
  |---|---|---|---|---|
  | **bash / zsh** (Linux, macOS) | `cmd1 && cmd2` | `NAME="value" cmd` | `cp` | `sed` |
  | **PowerShell** (Windows) | `cmd1; if ($?) { cmd2 }` | `$env:NAME = "value"` | `Copy-Item` | `-replace` operator |
- Give the commands in **the user's** shell's syntax, in a fenced code block so they can copy them verbatim.
- ⭐ **The one exception:** the **`gate-and-commit` skill** (`.opencode/skills/gate-and-commit/SKILL.md`)
  is the owner's sanctioned exception — it runs the gate (`tsc` → `lint` → `vitest`) and commits when
  everything is green, **without pushing**. It exists because the owner asked for a workflow that
  verifies and commits in one go. Every other rule here still applies to it.

### H2. Calibrate, don't overthink

- **Avoid overthinking and analysis paralysis.** When a decision is needed, **calibrate with the user** instead of deciding solo or spiraling into research.
- Ask a short, concrete question with options (use the question tool when appropriate) rather than guessing or elaborating at length.
- One decision at a time; confirm before proceeding.

### H3. Decompose big tasks — offer tracking artifacts

- If a task is **too large or risky**, decompose it into **smaller sub-tasks** that can be:
  - **tracked individually**,
  - **delivered incrementally**, and
  - **verified not to break anything** before moving to the next.
- When decomposition is warranted, **offer to create a tracking file** (e.g. a checklist/markdown file in the repo) and/or frame the work as a **spike** (time-boxed investigation) or a **spec** (written design) before any implementation.
- Never attempt a large change in one shot.

### H4. NO Supabase change or setup — read and write only through the repositories and services

- **Absolute rule:** Do **not** change, create or drop anything in the database, and do **not** add
  any Supabase setup beyond what already exists. No new table, column, index, constraint,
  function, RPC, view, extension, bucket, policy or trigger; no `exec_sql`; no
  `CREATE OR REPLACE`; no edit to `supabase-schema.sql` — **unless the owner asks for that
  specific change, by name.**
- **The only way in or out of the data is the repository layer**: `features/*/*.repository.ts`
  (wired through `lib/repositories/factory.ts`) for the reads and the writes, and
  `features/*/*.service.ts` for the business rules. No `supabase` client call outside a repository,
  no raw SQL, no direct Postgres connection. (`pg` and `DATABASE_URL` exist in the repo for
  `scripts/apply-schema.mjs` — the owner's manual schema runner — and for nothing else.)
- **Why:** the schema is the owner's, applied by hand in the Supabase SQL Editor, and this
  environment is not the place to experiment. A change that needs a column is a change to the
  **schema file** *and* to the **repositories**, in that order, and only on the owner's word.
- **Corollary — a missing field is a code question first.** Before asking for a column, check
  whether the data is already there under another name: `evaluations` already carries
  `semesterId`, `evaluation_period_id`, `status` and `isDisabled`; the `isDisabled` flag already
  means "this response does not count"; `faculty_subjects.semesterId` exists (nullable, added by
  migration 24) even when it is empty. And check whether the rule can live in TypeScript instead —
  `lib/evaluation-utils.ts` is where the display and pooling rules live.
- **Corollary — a question the repositories cannot answer is the owner's to run.** Hand them a
  read-only `SELECT` to paste into the Supabase SQL Editor; do **not** add an RPC, a view or a
  function to get the answer. If the app needs the number, it needs a **repository method** — a
  read through the existing tables.

### H5. ALWAYS ask about the handover note after a task

- **After every task** — a slice, a fix, a session — **ask the owner whether a handover note is
  needed.** Do not write one unasked, and do not assume one is not needed.
- If a note is needed, **then ask what to do with the existing one**: **delete it** (the note is
  replaced) or **append to it** (the note grows). ⭐ **One handover at a time** — the old
  `docs/evaluation-results-handover.md` was folded into `docs/evaluation-export-handover.md`
  exactly this way, and the old file was **deleted**.
- ⭐ **The durable knowledge belongs in the specs**, not in the handover. A handover is the
  **entry point** — where the work stands, what is open, what not to redo — and it goes stale
  first. It **names** the specs; it does not repeat them.

## Behavioral Rules (from deleted `app/AGENT.md`)
- **Default mode: advisory** — analyze, explain, review, recommend, ask. Do not generate code unless explicitly asked.
- **Ask before assuming** — if uncertain, ambiguous, or requirements are incomplete, ask. Never guess or infer.
- **Explain before implementing** — what, why, where, risks, alternatives. Wait for approval.
- **One change rule** — perform exactly one requested change, then return to advisory mode. No adjacent refactoring or cleanup.
- **No autopilot** — prohibited unless requested: refactoring, renaming, restructuring, file movement/deletion, dependency install, arch changes, DB changes, API redesign, new features, cleanup, optimization, test gen, docs updates.
- **Code review first** — point to files, methods, root causes. Do not rewrite code immediately.
- **Proposal format** — for changes >20 lines: Understanding, Questions, Recommendation, Files Affected, Risks, then await approval.
- **Implementation checklist** — no unused imports, no `console.log`, no `any`, no `ts-ignore`, error handling present. Provide the user copy-paste commands to verify TypeScript/build/lint themselves, in their platform's shell syntax (per H1 — do not run them).



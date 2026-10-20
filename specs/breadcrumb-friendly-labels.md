# Friendly Breadcrumb Labels (Evaluation Results) — Spec

**Version:** 1.0
**Status:** Final (approved 2026-10-20)
**Last Updated:** 2026-10-20
**Scope:** `app/admin/evaluations/results/[departmentId]` and
`app/admin/evaluations/results/[departmentId]/[facultySubjectId]`, plus the
`app/dean/...` mirror of both (D1, resolved 2026-10-20).

---

## 1. Problem

The breadcrumb bar renders raw path segments. `components/layouts/NavigationBar.tsx`
splits `pathname` on `/` and labels each segment from a static `LABELS` map,
falling back to a capitalized segment. Dynamic route segments are UUIDs, so
the trail on the two routes in scope reads:

```
Admin / Evaluations / Results / 4f9c1b2e-… / 8a71d0c4-…
```

Three defects:

1. **GUIDs are unreadable.** A department UUID and a faculty-subject UUID sit
   side by side; neither identifies anything to a human reviewer.
2. **The department crumb is redundant on the detail page.** The department
   name and code are already rendered in the page header card
   (`[facultySubjectId]/page.tsx:170`), so the crumb adds a GUID instead of
   a label.
3. **Crumbs drop the query string.** The `results` crumb links to
   `/admin/evaluations/results` with no `evaluationPeriodId`, and the two
   UUID crumbs are rendered as non-link text — so the breadcrumb offers no
   navigation back to the department at all.

## 2. Where the breadcrumb actually lives

Two files carry the name; only one is live.

| File | Status |
|---|---|
| `components/layouts/NavigationBar.tsx` | **Live.** Rendered by `AppShell` (`components/layouts/AppShell.tsx:36`). Desktop only — the `<nav>` is `hidden lg:flex`. |
| `components/layouts/Breadcrumbs.tsx` | **Dead code.** Not imported anywhere (repo-wide grep: zero references). It carries its own duplicate `LABELS` map and its own mobile large-title bar. |

This spec targets the live file. `Breadcrumbs.tsx` is deliberately **not**
touched — deleting it is a separate cleanup (see §7, D4).

## 3. Options considered

**A. Extend the static `LABELS` map.** Impossible: the keys are runtime
UUIDs. Rejected.

**B. Let `NavigationBar` resolve IDs itself.** It would need
`evaluationPeriodId`, which lives in the query string, not the pathname.
Reading it with `useSearchParams()` inside the root layout opts every
static route into client-side rendering, and it duplicates the page's own
fetch of the same data. Rejected.

**C. Page-driven crumb registry.** The page that owns the data already has
the friendly names. It registers a label for its own route segment; the
breadcrumb bar renders whatever is registered and falls back to a shortened
GUID for anything unresolved. No new fetch, no query-string coupling, one
new shared context.

## 4. Decision

**Option C.**

- A new context (`lib/contexts/breadcrumb.tsx`) holds a map
  `segment value → { label, href? }`.
- A `useCrumb(segment, crumb)` hook lets a page register a label for a
  route segment it owns.
- `NavigationBar` resolves each segment against that map: registered label
  wins, otherwise a static `LABELS` entry, otherwise a shortened GUID.
- The `href` field lets a crumb link to a target that needs a query string
  (the department crumb on the detail page).

## 5. Pinned contracts

1. **No new API endpoint, no new fetch.** Both pages already receive every
   name they need from their existing response (`department.name/code`,
   `faculty.name`, `subject.code/name`). The breadcrumb adds zero requests.
2. **Pages own their labels; the bar stays a renderer.** `NavigationBar`
   gains no domain knowledge — no route names, no "department", no fetch.
3. **Fallback for an unresolved UUID is shortened, never a raw GUID** —
   first 8 characters + `…`, with the full GUID in the `title` attribute so
   an admin can still read it. Applies to any route with a UUID segment,
   not just the two in scope.
4. **A registered crumb without an `href` renders as text, not a link** —
   the current segment. A registered crumb *with* an `href` renders as a
   link, even for a UUID segment.
5. **The department crumb on the detail page must carry
   `evaluationPeriodId`.** The target route 400s without it
   (`app/api/admin/evaluation-results/departments/[departmentId]/route.ts:19`).
6. **React 19 `react-hooks/set-state-in-effect` compliance.** The registry
   write is deferred with `Promise.resolve().then(...)` — the workaround
   pinned in AGENTS.md Lesson 4. No synchronous `setState` in an effect body.
7. **The provider mounts in the root `Providers`**, so it is available to
   `AppShell` → `NavigationBar` without a route-group provider.
8. **Desktop only.** `NavigationBar` is `hidden lg:flex`; there is no mobile
   breadcrumb. The mobile orientation aid is the in-page back-link, which is
   relabelled to the department name on the admin detail page (same edit,
   §6 P5). The dean detail page has no back-link at all (see §8).
9. **Admin and dean ship together.** The dean routes are the same feature
   mirrored; the repo convention is "mirror routes are one unit — admin +
   dean wrappers ship together, never admin-only"
   (`specs/student-import-stepper/import-dedicated-page.md` §3.7). Both
   detail pages fetch the same payload shape from `/api/admin/…` and
   `/api/dean/…`, so the registration is identical apart from the route
   prefix.

## 6. Changes

| # | Change | Path |
|---|---|---|
| P1 | New context: `BreadcrumbProvider`, `useCrumb(segment, {label, href?})`, `useBreadcrumbs()` | `lib/contexts/breadcrumb.tsx` (new) |
| P2 | Mount `BreadcrumbProvider` around the app shell | `components/layouts/Providers.tsx` |
| P3 | Resolve each segment against the registry; shortened-GUID fallback; crumb `href` override; `title` carries the full GUID | `components/layouts/NavigationBar.tsx` |
| P4 | Register the department crumb (`name (code)`) | `app/admin/evaluations/results/[departmentId]/page.tsx` |
| P5 | Register the department crumb (label + href with `evaluationPeriodId`) and the faculty-subject crumb (`Faculty — CODE Subject`); relabel the back-link to the department name | `app/admin/evaluations/results/[departmentId]/[facultySubjectId]/page.tsx` |
| P6 | Register the department crumb (mirror of P4) | `app/dean/evaluations/results/[departmentId]/page.tsx` |
| P7 | Register the department + faculty-subject crumbs (mirror of P5; the dean detail page has **no back-link**, so the crumb link is the only way back) | `app/dean/evaluations/results/[departmentId]/[facultySubjectId]/page.tsx` |
| — | Out of scope | `components/layouts/Breadcrumbs.tsx` (dead code, D4) · faculty results route (D2) · `results` crumb query-string preservation (D3) · API routes · DB · `Sidebar` · mobile chrome |

## 7. Open decisions

| # | Question | Recommendation |
|---|---|---|
| D1 | **Dean mirror.** `app/dean/evaluations/results/[departmentId]` and `…/[facultySubjectId]` have the identical GUID breadcrumb. Include them in this change? | **RESOLVED 2026-10-20 — include.** The repo convention is "mirror routes are one unit — admin + dean wrappers ship together, never admin-only" (see `specs/student-import-stepper/import-dedicated-page.md` §3.7). The dean pages fetch the same payload shape, so the change is ~6 lines each. → P6, P7. |
| D2 | **Faculty route.** `app/faculty/evaluations/results/[facultySubjectId]` also renders a UUID segment (a faculty-subject id). In scope? | **RESOLVED 2026-10-20 — separate spec.** Different route family, different label semantics (no department crumb; the faculty's own results, not an admin review), and the faculty page fetches a different payload. |
| D3 | **The `results` crumb drops `evaluationPeriodId`.** It currently links to `/admin/evaluations/results`, which falls back to the *active* period — so a reviewer viewing a closed period loses their selection when they click back to the top. Fix here? | **DEFERRED** (out of scope for this change). It changes the meaning of an existing crumb on every route; it deserves its own decision, not a side effect of this one. |
| D4 | **`components/layouts/Breadcrumbs.tsx` is dead code** with a duplicate `LABELS` map and an unused mobile large-title bar. Delete it? | **DEFERRED** (out of scope for this change). Deleting shared components is its own cleanup, not a label fix. |

## 8. Risks

- **Global chrome change.** `NavigationBar` and `Providers` are shared by
  every role. A regression here breaks the breadcrumb everywhere. Mitigated
  by keeping P3 free of domain knowledge (contract §5.2) and by the fact
  that the change is additive: an unregistered segment behaves exactly as
  before, except that a raw GUID is now shortened.
- **Stale registrations.** The registry is keyed by segment value, so a
  label persists for the life of the session. Harmless: a label is only
  read when the segment appears in the current pathname, and UUIDs do not
  collide. The map is bounded by the number of distinct departments and
  faculty-subjects visited in a session.
- **Timing.** The label appears once the page's data lands. Between first
  paint and data arrival the crumb shows the shortened GUID — the same
  information as today, less noisy.
- **Hook-order risk.** `useCrumb` is a hook; it must be called before any
  conditional return. On the detail page the early returns for
  error/loading sit *after* the hook calls, so the registration must move
  above them.
- **The dean detail page has no back-link** (`app/dean/evaluations/results/
  [departmentId]/[facultySubjectId]/page.tsx:78-91` — it opens straight into
  the PDF button). Today the GUID crumb is inert text; after this change it
  becomes a working link back to the department. That is the intended
  effect, but it is a behaviour change on a page that previously offered no
  way back.

## 9. Verification (owner runs — H1)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

Browser (desktop viewport — the bar is `hidden lg:flex`):

- `/admin/evaluations/results?evaluationPeriodId=<id>` → trail reads
  `Admin / Evaluations / Results`.
- Drill into a department → trail reads
  `Admin / Evaluations / Results / Computer Science (BSCS)`.
- Drill into a faculty-subject → trail reads
  `… / Computer Science (BSCS) / Juan Dela Cruz — CS101 Introduction to CS`;
  the department crumb is a link that returns to the department page **with
  the period preserved** (no "periodId is required" error).
- Hovering a crumb shows the raw GUID in the tooltip.
- Unregistered UUID routes (e.g. a faculty results route) show a shortened
  GUID, not a full one.
- Dark mode unaffected; no layout shift on the other role dashboards.

Dean mirror (same expectations, `/dean/evaluations/results/…`):

- Department trail shows `Computer Science (BSCS)`.
- Detail trail shows the department crumb as a **clickable** link — the page
  has no back-link of its own — and the faculty-subject crumb as
  `Juan Dela Cruz — CS101 Introduction to CS`.
- Clicking the department crumb returns to the dean department page with the
  period preserved (no "periodId is required" error).

# Import on Its Own Page — Spec

**Version:** 1.0
**Status:** Approved 2026-10-10 (option A: link card, no sidebar change)
**Family:** [student-import-stepper.md](../student-import-stepper.md) ·
sibling [table-first-ui.md](table-first-ui.md)

Supersedes the unfiled *import-dedicated-page* draft: this version adds the
whole-page layout (chrome included) and the Quick-Add deferral.

---

## 1. Problem

The importer sits four levels deep — route
(`/admin/data/academic-infrastructure`, mirrored under `/dean/data/…`) →
`AcademicInfrastructurePage` mainTab → `FacultyLoadingTab` sub-tab →
`EnrollmentsTab` — sharing one viewport with Quick Add, the live ENROLLMENT
TABLE, and a modal, inside a collapsible that starts closed. Two
identical-looking tables (staged file vs live database) share one scroll.
The confusion is structural; Quick Add stays put (modal conversion deferred,
not dropped).

## 2. Decision

Two pages, one table each, nature labeled:

- **Page 1 — Enrollments** (existing route/tab): LIVE table + Quick Add +
  modal only. Importer collapsible deleted; `[+ Import →]` link card where it
  was. Tabs above, main-table collapsible (slice C) stay.
- **Page 2 — `/admin/data/student-import`** (+ `/dean/data/student-import`
  mirror): STAGED file workspace — `BulkStudentImport` verbatim
  (strip, toolbar, tally, preview, results, ledger, download, focus),
  filename + `[× new]` affordance, back-link `‹ Enrollments`, semester badge.

## 3. Pinned contracts

1. **Zero chrome changes.** Sidebar, NavigationBar, tabs untouched. No new
   sidebar entry — Page 2 is reached from Page 1.
2. **No sidebar highlight on Page 2.** `isActiveTab` matches by href; the new
   path matches no item. Orientation comes from breadcrumb + title +
   back-link (chosen, not overlooked).
3. **Breadcrumb label verified at implement** (`Breadcrumbs.tsx` LABELS or
   capitalized fallback — one-line LABELS addition if it reads raw).
4. **`semesterId` self-fetched** — same 3-line `useApiGet("/api/semesters")`
   + active-find `EnrollmentsTab` uses. No lifted state, no new data flow.
5. **No proxy change** — access is DB-driven (`getUserAccess` + ADMIN
   fallback); siblings' behavior transfers automatically.
6. **Freshness by construction** — `EnrollmentsTab.fetchData` runs on mount;
   back-navigation refetches. The importer's `beforeunload` guard already
   prevents mid-run navigation loss.
7. **Mirror routes are one unit** — admin + dean wrappers ship together,
   never admin-only.

## 4. Changes

| # | Change | Path |
|---|---|---|
| P1 | New shared client component: semester fetch + no-semester banner + `<BulkStudentImport semesterId/>` full-width + back-link | `features/admin-data/components/StudentImportPage.tsx` |
| P1 | Two 3-line server wrappers (+ `loading.tsx` only if siblings have one) | `app/admin/data/student-import/page.tsx`, `app/dean/data/student-import/page.tsx` |
| P2 | `EnrollmentsTab`: delete Importer collapsible + `showImport` + unused import; link card in its place | `features/admin-data/components/EnrollmentsTab.tsx` |
| — | Out of scope | Quick Add (stays, modal deferred) · mobile `m/upload` · `previewOnly` · Sidebar · importer internals · proxy |

## 5. Risks

- **One more click** to import — accepted; link card sits where the
  collapsible was.
- **Dean parity** — pinned by contract §3.7.
- **No-semester deep link** — proxy semester lock redirects first; the
  banner is belt-and-braces (same as today).
- **Group boundaries** — `loading`/`error` inherited from `admin|dean`
  trees; implement verifies.

## 6. Verification (owner runs — H1)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

Browser: link card → import page renders full workspace · run a panel ·
back-link → fresh table · direct URL as admin and dean · no-semester
redirect · collapsible gone, tab/table/modal otherwise identical.

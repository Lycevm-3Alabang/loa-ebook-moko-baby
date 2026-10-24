---
skill: plan-fix
story: "Admin → Evaluations → Coverage: a faculty card's subject row shows Enrolled/Participated/Disputed/Not Part. all zero (Completion '-'), but that row's Details drawer lists populated students (e.g. 17 participated / 14 not participated)."
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: "A — SCAN → VISUAL → APPROVE → BUILD"
decision: "One roster read + one classifier: the card's enrolled and four buckets are the lengths of the same lists the modal renders. Cache key v2 retires pre-fix snapshots."
status: implementing
pending: "slice-2"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| P0 | Use the last calibration (1A 2A 3A 4A 5A 6A)? | A — use it |
| P1 | Approve A / B / C? | Other — the card must tally the same student lists the modal shows; no separate aggregation. |
| P2 | Is this plan done? | A — Done |
| P3 | Run implement-fix with this file? | A — Yes |
| P4 | Who implements? | B — Code it |
| S1 | Apply slice 1 (one roster read)? | Applied — `RosterStudent` + `listRosterByFacultySubjectIds`; old id-only method delegates. |

## Pending

- Slice 2: one classifier (service).

## Decisions

- **Direction:** one roster read + one classifier. The card's `enrolled` and four buckets are the **lengths of the same four lists the modal renders**. The faculty chips are the distinct-student union of those same lists. No second tally path.
- **Read shape:** both surfaces call `listRosterByFacultySubjectIds(ids, semesterId)` — snapshot with all fs ids, Details with `[fsId]`. Same select (`id, faculty_subject_id, student:student_id(id, name, email)`), same 100-id chunk, same `.order("id")` + `.range()` pages, same dedupe. `listByFacultySubject` stays for `app/api/data/evaluation-mappings/route.ts:75` (it needs the richer embeds).
- **Tally:** extract `classifyRoster(roster, statusRows)` in the service and use it in both `getEvaluationStatus` and `getEvaluationStatusDetail`. Row bucket = list length; `enrolled` = distinct roster ids; chips union the same id sets.
- **Cache retirement:** version the snapshot and refresh-timestamp keys (`v2`) so a snapshot written by the old tally is a miss, not a stale read. This is migration, not the fix. A key-version bump must accompany any future change to the tally.
- **Layering order:** repository → types → service → client cache key → tests.
- **Gold paths to read:** `features/admin-data/student-enrollment.repository.ts:270-337`, `features/evaluations/evaluation-status.service.ts:99-139, 167-250`, `lib/types/evaluation.ts:432-450`.
- **Invariants:** API routes stay thin (routes unchanged); all Supabase access stays in the repository; no new query outside a repository; no role/access change; no new form action (Refresh is the existing `IosButton`).
- **Proof command:** `npm test` (plus the owner gate: `npx tsc --noEmit` → `npm run lint` → `npx vitest run`).

## Scan

Path:
- Card cells: `features/evaluations/components/CoveragePage.tsx:744-772` ← `SubjectRow.enrolled/participated/...` ← `evaluation-status.service.ts:241-249, 272-292`.
- Snapshot source: `CoveragePage.tsx:201-242`; cache hit returns at `:206-216` with no request; miss fetches at `:222` and writes at `:230`.
- Cache key: `CoveragePage.tsx:97-99` (no version); refresh timestamp key `:101-103`.
- Snapshot roster read: `evaluation-status.service.ts:171` → `student-enrollment.repository.ts:302-337`.
- Details: `CoveragePage.tsx:466-473` → `app/api/admin/evaluation-status/route.ts:16-19` → `evaluation-status.service.ts:99-139` → `student-enrollment.repository.ts:270-300`.
- Chips: `CoveragePage.tsx:689, 714-720` ← `evaluation-status.service.ts:353-394`.
- Export: `CoveragePage.tsx:441-464` reads the same snapshot.

Proof:
- `lib/__tests__/student-enrollment-repository.test.ts:54-72` — bulk roster read pages past 1,000 rows.
- `lib/__tests__/coverage-page-freshness.test.tsx:90-105` — a cache hit suppresses the status request.
- `lib/__tests__/evaluation-status-detail.test.ts:75-89` — Details dedupes to the student-set grain.
- No test feeds one fixture through both surfaces and asserts equal lists. That is the gap.
- Command: `npm test`.

Teach:
- What: the card and the modal are two renderings of a roster classification; today they read the roster through different repository methods and tally it in two places.
- Why: the modal reads one section with `listByFacultySubject`; the card reads all sections with `listStudentIdsByFacultySubjectIds`. Same semantics, different query, so a truncated/failed bulk read drifts while Details looks right.
- When: make the card and the modal consume the same roster read and the same classifier; then the card numbers are the modal list lengths by construction.
- Alternative: N+1 detail calls per subject row (guaranteed parity, but one request per row). Rejected — the bulk read is the efficient equivalent when it is the same read shape.

Lens:
- API routes stay thin — applies; routes unchanged.
- proxy.ts is the access-enforcement point — n/a; no route/access change.
- All Supabase access through repositories — applies; the shared roster read lives in the repository.
- Double-click prevention via SubmitButton — n/a; Refresh is the existing `IosButton` in the shared banner.
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — n/a; no role logic touched.

Root cause:
- The row and Details agree on key and filter but not on the read: the snapshot uses an id-only bulk method, Details uses an embedded single-section method. The pre-fix bulk read was truncated at the 1,000-row cap (paging now present), and the versionless cache keeps serving the truncated snapshot. The durable cure is one read + one tally, which the user asked for.

## Plan

### Slice 1 — one roster read

Files: `features/admin-data/student-enrollment.repository.ts`, `lib/types/evaluation.ts`

- Replace `listStudentIdsByFacultySubjectIds` with `listRosterByFacultySubjectIds(facultySubjectIds, semesterId): Promise<Map<string, RosterStudent[]>>`, where `RosterStudent = { id, name, email }` (add the type beside the enrollment types).
- Select `id, faculty_subject_id, student:student_id(id, name, email)`.
- Keep the 100-id `.in()` chunks, `.order("id", { ascending: true })`, `.range()` pages at `ENROLLMENT_PAGE_SIZE` (1,000), per-fs dedupe by student id, and the null-student skip.
- Update `IStudentEnrollmentRepository` in `lib/types/evaluation.ts:446`.
- Keep `listByFacultySubject` unchanged for `app/api/data/evaluation-mappings/route.ts:75`.

### Slice 2 — one classifier

File: `features/evaluations/evaluation-status.service.ts`

- Extract `classifyRoster(roster, statusRows)` returning `{ participated, notParticipated, disputed, inProgress }` as `StatusStudent[]`; it indexes status rows by evaluator, dedupes roster ids, and applies `bucketOf`.
- `getEvaluationStatusDetail`: read `listRosterByFacultySubjectIds([facultySubjectId], semesterId)`, take the fs entry, and return `classifyRoster(roster, statusRows)`.
- `getEvaluationStatus`: read the same map for all fs ids; per fs call `classifyRoster`; set `enrolled = distinct roster ids`, each bucket count = the corresponding list length, and build `studentIds`/`bucketed` from the same lists.
- Remove the duplicate inline classification (`byEvaluator` loop and the `bucketed` bookkeeping) so there is one tally path. The chip aggregation at `:353-394` unions the same `bucketed` sets — unchanged in meaning.

### Slice 3 — retire the pre-fix snapshot

File: `features/evaluations/components/CoveragePage.tsx`

- Add `COVERAGE_CACHE_VERSION = 2` and include it in `getCoverageCacheKey` and `getLastManualRefreshKey`.
- A snapshot written by the old tally becomes a miss; the first load fetches once and writes the new key. Comment that the constant must be bumped whenever the tally changes.

### Slice 4 — proof

Files: `lib/__tests__/student-enrollment-repository.test.ts`, `lib/__tests__/evaluation-status-aggregate.test.ts`, `lib/__tests__/evaluation-status-detail.test.ts`, `lib/__tests__/coverage-page-freshness.test.tsx`, new `lib/__tests__/evaluation-status-parity.test.ts`

- Repository: one-id and many-id calls against the same fixture return the same students; keep the >1,000-row paging case.
- Service parity: one fixture through `getEvaluationStatus` and `getEvaluationStatusDetail`; assert for every fs `row.enrolled === total detail students` and `row.participated === detail.participated.length` (and the other three buckets).
- Cache: old unversioned key is ignored (one request); v2 key is a hit (no request).
- Update mocks for the renamed repository method.
- Run `npm test`; owner gate `npx tsc --noEmit` → `npm run lint` → `npx vitest run`.

### Out of scope

- `countByFacultySubjectIdsPaged` (`student-enrollment.repository.ts:236`) and `countSubmittedByFacultySubjectIds` (`evaluations.repository.ts:629`) page without a total order; they affect `submitted/expected` on the department subtitle, not the row buckets. Propose separately.
- No DB/Supabase changes. No auto-refresh; explicit Refresh stays per `specs/evaluation-coverage-faculty-cache.md` §2.3.
- Optional spec note: one paragraph in `specs/evaluation-coverage-department-drilldown.md` §5 for the one-read/one-tally rule and the cache-version bump rule in `specs/evaluation-coverage-faculty-cache.md`.

### Risks

- The snapshot read now carries names/emails (~2k students): a modest payload increase that removes the divergence.
- The modal stays live: if enrollments change between page load and click, the modal shows the newer roster while the card waits for Refresh. Same contract as today; the tally logic is now identical.
- The cache version must be bumped on the next tally change; noted in code.

### Acceptance

- After a reload, the reported row's five numbers equal the modal list lengths.
- The parity test proves it for every section with one fixture.
- Loading a cached page still makes no status request.

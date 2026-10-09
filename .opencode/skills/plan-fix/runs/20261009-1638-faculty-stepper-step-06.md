---
skill: plan-fix
story: Faculty import stepper wizard — Step 6 faculty-users per specs/faculty-import-stepper.md + specs/faculty-import-stepper/step-06-faculty-users.md (create missing faculty, dummy dept-agnostic, off-domain never becomes user)
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "option-A rich items + deptCodeToId — approved"
status: implementing
pending: slice-4
---

# Plan — Faculty stepper Step 6 faculty-users

## Progress

| id | question | answer |
|----|----------|--------|
| story | What to plan | step-06-faculty-users.md + README.md check (2026-10-09) |
| calibration-1 | Discovery output | Other — reuse calibration (1C 2E 3B 4A 5A 6A, workflow A, per 20261009-1605 step-05 run) |
| visual | Approve visual proposal? | A — Approve (option-A rich items, updated with semesterId finding) |
| plan-done | Is this plan done? | Done |
| handoff-1 | Run /implement-fix with it? | Other — asks: should Step 6 only look up prerequisites since they were inserted earlier? (answered, re-awaiting Yes/No) |
| handoff-2 | Run /implement-fix with it? | Yes — run implement-fix on this file |
| who-implements | Implement this yourself, or should I code it? | B — Code it |
| slice-1 | Apply Slice 1 (service extract) to lib/services/etlEvaluation.ts? | Applied — importFacultyUsersStep + FacultyUserStepItem/Result; npm test 245/245 green |
| continue-2 | Say continue for Slice 2 (route discriminator)? | Continued |

| slice-2 | Apply Slice 2 (route discriminator) to app/api/import/faculties/route.ts? | Applied — faculty-users branch + import; npm test 245/245 green, tsc clean |
| continue-3 | Say continue for Slice 3 (client stepper call)? | Continued |

| slice-3 | Apply Slice 3 (client stepper call) to features/admin-data/components/FacultyLoadingTab.tsx? | Applied — handleStep6 + state/panel/trace/resets; tsc clean, npm test 245/245 green |
| continue-4 | Say continue for Slice 4 (tests)? | Continued |

## Pending

- id: slice-4
- prompt: Apply Slice 4 (tests) to lib/__tests__/etlEvaluation.test.ts?
- options: Apply this slice / Stop / Other.. type your thoughts

## Decisions

- specs/README.md checked 2026-10-09: Steps 02–05 Done, all other specs Not started, Next session = Step 6 faculty-users. No conflict with step-06 spec.
- Calibration reused from 20261009-1605-faculty-stepper-step-05.md: 1C 2E 3B 4A 5A 6A; workflow A (SCAN → VISUAL → APPROVE → BUILD); reuse per user Other answer 2026-10-09
- Gold paths read-first: specs/faculty-import-stepper.md §3-4/§6, specs/faculty-import-stepper/step-06-faculty-users.md, app/api/import/faculties/route.ts (departments/courses/sections/subjects branches L42-119), lib/services/etlEvaluation.ts (importSubjectsStep L243-277 + composed faculty-users block L506-529 + parse blank→dummy L312-317 + Excel-error narrow rule L324-337 + off-domain reject L343-346), features/admin-data/components/FacultyLoadingTab.tsx (IMPORT_STEPS L20-27, handleStep5 L540-574, resets L377-382/L738-744, doneCount L1160), features/admin-data/components/csv-helpers.ts (dummy + Unassigned Faculty L50-61), features/users/users.repository.ts (findManyByEmail L31-71 + createMany L106-150), lib/__tests__/etlEvaluation.test.ts (factory mocks L1-57 + helpers L62-80)

## Scan

Path: features/admin-data/components/FacultyLoadingTab.tsx handleStep6FacultyUsers (new, mirrors handleStep5 L540-574) → app/api/import/faculties/route.ts POST (new step === "faculty-users" branch, mirrors subjects L105-119) → lib/services/etlEvaluation.ts importFacultyUsersStep (new, extracts composed block L506-529; mirrors importSubjectsStep L243-277) → features/users/users.repository.ts findManyByEmail L31 + createMany L106 via lib/repositories/factory.ts → Supabase users + userrole

Proof: lib/__tests__/etlEvaluation.test.ts — composed-path regression must pass untouched (spec: existing importFacultySubjects assertions still pass). mockFindUsers/mockCreateUsers helpers already exist at L70-76. Command: npx tsc --noEmit → npm run lint → npx vitest run

Teach: what — Step 6 is the first step that WRITES to users and the first whose invalid axis is non-empty by design (off-domain never becomes a user); every prior step has invalid only for missing-map cases. why — creating a faculty account with a stray personal address would let that account see evaluation data, so the strict @lyceumalabang.edu.ph gate (valid for students: @itmlyceumalabang.onmicrosoft.com is NOT valid here) must survive decomposition. when — runs after Step 2 (needs deptCodeToId for departmentId stamping), produces facultyUserMap consumed by Step 7 mappings. alternative — posting O(rows) through the legacy path (rejected: 148 distinct + 1 dummy fit one request).

Key finding 1 — spec request shape vs server need mismatch: spec Request line says `items: string[] // distinct emails, lowercased`, but Server work needs `row?.name` and `row.departmentCode` per email plus `deptCodeToId` from Step 2 (Position: Depends on step 2). Composed code resolves both via mappableRows.find (L514) + deptCodeToId.get (L517). Client-held map pattern (courses L64-71 sends deptCodeToId back) means the Step 6 payload must carry richer items than bare strings — plan must decide the payload shape (see options).

Key finding 2 — dummy already normalized in two places the step must NOT duplicate: parseFacultySubjectCsv maps blank → DUMMY (L317) and chunked path maps blank → DUMMY (L388-391), both repairing Excel-error name → "Unassigned Faculty" (L326-327 / L393-396). Client parseFacultyCsv currently does NOT map blanks (FacultyLoadingTab L366 keeps email as-is) and deriveCsvFlags only FLAGS unassigned (csv-helpers L50-52) — so handleStep6 must map blank → DUMMY client-side, exactly once, before dedupe.

Key finding 3 — off-domain handling differs by layer and the step must pick one: parse layer REJECTS off-domain rows as parse errors (L343-346, never reach importFacultySubjects), but composed import DEFENSIVELY re-filters mappableRows (L507) and mapping loop re-rejects (L537). For the distinct-set step there are no rows — so off-domain emails in items[] must classify as invalid with reason `Email domain not allowed: <email>` (spec Classification table) and be EXCLUDED from createMany input. The dummy is exempt (synthesised, not uploaded).

Key finding 4 — reset/trace parity gap (same as Steps 2-5): handleCsvFile L377-382 and handleCsvReset L738-744 reset only steps 2-5; doneCount L1160 sums only steps 2-5 + footnote L1161 counts to 4. Slice for Step 6 must add setStep6Result(null) in both resets and include step6Result in doneCount/footnote, else the Faculty-users chip can never tick.

Lens:
- API routes stay thin: applies — discriminator branch only in route.ts, all domain/off-domain/dummy logic stays in service
- proxy.ts access-enforcement: applies — reuse requireAdmin guard (route.ts:20), no bypass
- Supabase via repositories/DI: applies — must go through userRepository.findManyByEmail + createMany via factory, no direct supabase.from in service
- SubmitButton double-click guard: applies — StepPanel run button disabled while running + Yes/No confirm + csvImporting guard, same as Steps 2-5
- Pipe-delimited role priority: n/a for writes (stamps FACULTY); read note — pre-existing non-FACULTY/DEAN/ADMIN found by email still counts existing, Step 7 gates them
- semesterId (user Other 2026-10-09): NOT needed by the service logic. Users are semester-agnostic (no semester column; departmentId comes from Step 2's deptCodeToId). Steps 2-5 precedent: route accepts semesterId in the envelope but never passes it to importDepartments/Courses/Sections/SubjectsStep; it is used only for audit/fileId uniformity. Step 6 follows the same rule — `importFacultyUsersStep(items, deptCodeToId)` takes no semesterId; route keeps reading semesterId/fileId for the audit line only. Step 7 mappings WILL need semesterId.
- Visual approved (option-A): rich items `{email, name, departmentCode}[]` + client-held `deptCodeToId`, no semesterId in service signature; off-domain → invalid (never created), dummy dept-agnostic preserved
- Post-implementation highlight requested (user 2026-10-09): after implement-fix codes the slices, surface the semesterId finding again in chat (envelope-only, service takes no semesterId, Step 7 will need it)
- Layering order for slices: Service extract → Route Handler discriminator → Client stepper call → Tests; userRepository unchanged
- Invariant preservation: thin routes — discriminator branch only in route.ts, domain/dummy logic stays in service; proxy — requireAdmin stays first line, no new unauthenticated path; repo-DI — service calls userRepository.findManyByEmail + createMany via factory, zero direct supabase.from in service; SubmitButton guard — StepPanel run button disabled while running + Yes/No confirm + csvImporting guard, same as Steps 2-5; pipe-role — n/a for writes (stamps FACULTY)
- Proof command: npx tsc --noEmit → npm run lint → npx vitest run (must stay green; composed tests untouched + new step-06 tests)
- Out of scope: step 7 mappings, student importer, Final promotion. Note: spec still Draft — Final bump + re-approval required before implement-fix writes code.
- Plan done per answer Done — filled Plan below from approved proposal, decision set, status ready-for-implement-fix
- Who implements: pending handoff answer (Yes → implement-fix on this same file; semesterId highlight to resurface after implementation per user ask)
- Handoff Other-1 (user 2026-10-09): "should Step 6 only look up prerequisites?" — YES, correct. Step 6 CREATES users but only LOOKS UP departments via client-held deptCodeToId (never creates departments); Step 7 (terminal, not Step 6) will CREATE mappings but only LOOK UP sections/subjects/users via the three maps (never re-creates them; miss → invalid). Ordering invariant from general spec §5/§8: a step asserts its dependency maps are present and never writes its dependencies. Step 6 is second-to-last; Step 7 mappings is the actual last step.

Open question resolved: payload = rich items (option-A approved); spec `string[]` line superseded by Server-work row context + Step 3 client-held-map precedent.

## Plan

Slice order follows layering (one file per implement-fix turn):
1. Service extract in lib/services/etlEvaluation.ts — importFacultyUsersStep(items: {email,name,departmentCode}[], deptCodeToId: Record<string,string>): lowercase/trim/dedupe, blank→DUMMY collapse to one entry (name Unassigned Faculty); off-domain→invalid `Email domain not allowed: <email>` (dummy exempt, excluded from createMany); findManyByEmail → createMany (role FACULTY, deptId = isPlaceholder ? undefined : deptCodeToId[deptCode]); inserted = created count, existing = mappable - created; returns StepResult + facultyUserMap (email→id). No semesterId param.
2. Route discriminator in app/api/import/faculties/route.ts — if body.step === "faculty-users": validate items array + deptCodeToId, call slice 1 (semesterId NOT passed, kept only for audit/fileId envelope), audit ETL_FACULTY_SUBJECT, return {...StepResult, facultyUserMap, fileId}; else legacy rows path byte-identical; requireAdmin stays first.
3. Client stepper call in features/admin-data/components/FacultyLoadingTab.tsx — handleStep6FacultyUsers derives rich distinct items from csvRows (blank→DUMMY once before dedupe; Excel-error name on dummy→Unassigned Faculty, not rejected), Step 6 StepPanel + StepperTrace count, disabled until step5Result (order) + step2Result (map), Yes/No confirm, guard + disable while running, invalid cap/scroll, resume re-reports 0 inserted; plus handleCsvFile/handleCsvReset setStep6Result(null) parity and doneCount/footnote include step6Result.
4. Tests in lib/__tests__/etlEvaluation.test.ts — creates-missing (FACULTY stamp), reuses-existing (no createMany), dummy dept-agnostic (undefined), off-domain flagged-not-created, 902-blanks→one-dummy, composed-path unchanged.
Proof: npx tsc --noEmit → npm run lint → npx vitest run. Out of scope: step 7, student importer, Final promotion. Post-implementation: resurface semesterId envelope-only finding in chat.

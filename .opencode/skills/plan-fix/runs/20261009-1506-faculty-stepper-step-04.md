---
skill: plan-fix
story: Faculty import stepper wizard — Step 4 sections per specs/faculty-import-stepper.md + step-04-sections.md (upsert sections, created-driven classification, missing-course flagging)
repo: regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: option-1 distinct-set step in existing route — approved
status: implementing
pending: slice-1
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | Faculty import stepper Step 4 sections | recorded 2026-10-09 from user text (stepper wizard + step-04 spec) |
| calibration-reuse | Use the last calibration (1C 2E 3B 4A 5A 6A)? | A — Use it |
| 1 | Output shape | C — A first. B only when the tree adds something the card does not |
| 2 | When you need to understand something | E — Combination, visual first |
| 3 | Agent explanations | B — Short explanation plus diagram |
| 4 | Workflow | A — SCAN → VISUAL → APPROVE → BUILD |
| 5 | During implementation | A — Step n/N and what changed, then wait |
| 6 | Teach or orient | A — Teach: why this code behaves this way, then the change |
| scan-pick | Pick step-04 approach | 1 — Distinct-set step in existing route |
| approve | Approve visual proposal? | A — Approve |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes |
| who-implements | Who implements? | B — Code it |
| slice-1 | Slice 1/4 service extract → lib/services/etlEvaluation.ts | applied; tsc clean, npm test 235/235 green (18 files) |
| continue-1 | Continue to slice-2? | A — Continue |
| slice-2 | Slice 2/4 route discriminator → app/api/import/faculties/route.ts | applied; tsc clean, npm test 235/235 green (18 files) |
| continue-2 | Continue to slice-3? | A — Continue |
| slice-3 | Slice 3/4 client stepper call → FacultyLoadingTab.tsx | applied; tsc clean, lint clean, npm test 235/235 green (18 files) |
| continue-3 | Continue to slice-4? | A — Continue |
| slice-4 | Slice 4/4 tests → lib/__tests__/etlEvaluation.test.ts | applied; tsc clean, lint clean, npm test 240/240 green (18 files, +5 new) |
| readme-update | specs/README.md → v1.4: Implementation Status step-04 Done, next = step-05-subjects | applied (spec Status left Draft; Final needs re-approval) |
| followup-step3-reset | FacultyLoadingTab.tsx: reset step3Result in handleCsvFile + handleCsvReset (was left stale) | applied; tsc clean, lint clean, npm test 240/240 green (18 files) |
| step5-calibration | Step 5 plan-fix calibration | locked: reuse 1C 2E 3B 4A 5A 6A, skip reuse question |

## Pending

- done (all 4 slices + step3-reset follow-up applied; tsc/lint clean, 240/240 green; specs/README.md v1.4 records step-04 Done with next = step-05-subjects; Step 5 calibration locked to reuse; uncommitted: etlEvaluation.ts, import/faculties route.ts, FacultyLoadingTab.tsx, etlEvaluation.test.ts, specs/README.md)

## Decisions

- repository.md read: Layering = Route Handler → Controller → Service → Repository → Supabase; tracker = user text only (using request text); proof command = npm test
- Gold paths read-first for this area: specs/faculty-import-stepper.md, specs/faculty-import-stepper/step-04-sections.md, app/api/import/faculties/route.ts, lib/services/etlEvaluation.ts, features/admin-data/components/FacultyLoadingTab.tsx, features/admin-data/components/FacultyImportStepper.tsx — re-read at build if invariant unclear; no new invariants added
- Prior calibration found in 20261009-1000-faculty-stepper-step-02.md (1C 2E 3B 4A 5A 6A) — reused per answer A
- Calibration complete 1C 2E 3B 4A 5A 6A; workflow A
- Tracker is user text only — using story text above, no issue-tracker fetch
- Discovery done pre-plan: Step 4 resolves 142 distinct sections via sectionRepository.upsertMany, created-driven inserted/existing split, program-miss → invalid, trim-before-split load-bearing
- Scan-pick option-1 approved: distinct-set step in existing route (spec section 4.3); visual approved per answer A
- Invariant preservation: thin routes — discriminator branch only in route.ts, no business logic moves into handler; proxy — requireAdmin stays first line, no new unauthenticated path; repo-DI — service calls sectionRepository.upsertMany via factory, zero direct supabase.from in service; SubmitButton guard — StepPanel run button disabled while running + Yes/No confirm + csvImporting guard, same as Steps 2-3; pipe-role — n/a, no role column touched
- Layering order for slices: Service extract → Route Handler discriminator → Client stepper call → Tests; repository unchanged
- Proof command: npx tsc --noEmit → npm run lint → npm test (must stay green; composed tests untouched + 5 new step-04 tests)
- Who implements: B — Code it (agent writes each slice only after Apply this slice)

## Scan

Path: features/admin-data/components/FacultyLoadingTab.tsx handleStep4Sections (new, mirrors handleStep3Courses L416-465) → app/api/import/faculties/route.ts POST (new step === "sections" branch, mirrors departments L42-56 / courses L57-80) → lib/services/etlEvaluation.ts importSectionsStep (new, extracts composed block L363-380; mirrors importDepartmentsStep L59-97 / importCoursesStep L118-163) → features/admin-data/section.repository.ts upsertMany L21 (fetch existing, insert missing, return {data, created}) via lib/repositories/factory.ts → Supabase sections
Proof: lib/__tests__/etlEvaluation.test.ts composed-path regression must pass untouched per spec section 8 (mockSectionUpsert helper L66-68 already mocks sectionRepository.upsertMany). Command: npm test
Teach: what — sections hang off a course, so Step 4 maps each distinct (name, program) through programToCourseId then calls a single upsertMany; why — today the block runs inside every chunk with no observable boundary and a course miss becomes a per-chunk row-0 error; when — runs after Step 3, produces sectionKeyToId for Step 7; alternative — chunked O(rows) posting through the legacy path (rejected: 142 distinct fit one request, avoiding 28,096 rows is the whole point)
Lens:
- API routes stay thin: applies — discriminator branch only in route.ts, business logic stays in service
- proxy.ts access-enforcement: applies — reuse requireAdmin guard (route.ts:20), no bypass
- Supabase via repositories/DI: applies — must go through sectionRepository.upsertMany via factory, no direct supabase.from in service
- SubmitButton double-click guard: applies — StepPanel run button disabled while running + Yes/No confirm, same guard as Steps 2-3
- Pipe-delimited role priority: n/a — sections carry no role column

## Plan

Slice order follows layering (one file per implement-fix turn):
1. Service extract in lib/services/etlEvaluation.ts — importSectionsStep(items, programToCourseId): trim + dedupe (name, program); courseId miss → invalid `No department course found for program "X"` (never inserted); hit → sectionItems; single sectionRepository.upsertMany; inserted = created, existing = sectionItems.length - created; returns StepResult + sectionKeyToId (`name|program` → id).
2. Route discriminator in app/api/import/faculties/route.ts — if body.step === "sections": validate items array + client-held programToCourseId, call slice 1, audit, return {...StepResult, fileId}; else legacy rows path byte-identical; requireAdmin stays first.
3. Client stepper call in features/admin-data/components/FacultyLoadingTab.tsx — handleStep4Sections derives distinct trimmed pairs (first-`-` else first-space; program "" sent for server-side invalid), Step 4 StepPanel + StepperTrace count, disabled until step3Result, Yes/No confirm, guard + disable while running, invalid cap/scroll, resume re-reports 0 inserted.
4. Tests in lib/__tests__/etlEvaluation.test.ts — upserts-all-distinct, created/existing split, course-miss flagged + never sent, whitespace trim, composed-path unchanged.
Proof: npx tsc --noEmit → npm run lint → npm test. Out of scope: steps 5-7, student importer, Final promotion. Note: spec still Draft — Final bump + re-approval required before implement-fix writes code.

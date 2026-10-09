---
skill: plan-fix
story: Faculty import stepper wizard — Step 5 subjects per specs/faculty-import-stepper.md + specs/faculty-import-stepper/step-05-subjects.md (resolve every subject code to an id, upserting missing; documents name = code fallback)
repo: regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "option-1 distinct-set step in existing route — approved"
status: ready-for-implement-fix
pending: handoff
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | Faculty import stepper Step 5 subjects | recorded 2026-10-09 from user text (stepper wizard + step-05 spec) |
| calibration-reuse | Use the last calibration (1C 2E 3B 4A 5A 6A)? | A — reused, per step5-calibration lock recorded in the step-04 run file |
| visual | Approve visual proposal? | A — Approve (option-1 distinct-set step, updated folded into existing) |
| plan-done | Is this plan done? | A — Done |
| who-implements | Implement this yourself, or should I code it? | B — Code it |

## Pending

- handoff: plan ready, awaiting Yes / No to run implement-fix

## Decisions

- repository.md read: Layering = Route Handler → Controller → Service → Repository → Supabase; tracker = user text only; proof command = npm test
- Calibration inherited from 20261009-1506-faculty-stepper-step-04.md: 1C 2E 3B 4A 5A 6A; workflow A (SCAN → VISUAL → APPROVE → BUILD); reuse question skipped per lock
- Deployment verified before planning (Step 4 "missing" report): 99a13b5 deployed to Production AND Preview, both state=success. Cause was a stale browser tab, not a missing deploy. No code or infra change needed.
- Visual approved (option-1): distinct-set step in existing route, `updated` folded into `existing` to match StepResult inserted/existing/invalid contract; client sends string[] codes, server does name=code fallback (2026-1 file all-blank)
- Gold paths read-first for this area: specs/faculty-import-stepper.md, specs/faculty-import-stepper/step-05-subjects.md, app/api/import/faculties/route.ts, lib/services/etlEvaluation.ts (importSectionsStep L185-225 + composed block L446-452), features/admin-data/components/FacultyLoadingTab.tsx, features/admin-data/subject.repository.ts L11-45, lib/__tests__/etlEvaluation.test.ts
- Layering order for slices: Service extract → Route Handler discriminator → Client stepper call → Tests; repository unchanged
- Invariant preservation: thin routes — discriminator branch only in route.ts, name-fallback stays in service; proxy — requireAdmin stays first line, no new unauthenticated path; repo-DI — service calls subjectRepository.upsertMany via factory, zero direct supabase.from in service; SubmitButton guard — StepPanel run button disabled while running + Yes/No confirm + csvImporting guard, same as Steps 2-4; pipe-role — n/a, no role column touched
- Proof command: npx tsc --noEmit → npm run lint → npm test (must stay green; composed tests untouched + new step-05 tests)
- Plan done per answer A — filled Plan below from approved proposal, decision set, status ready-for-implement-fix
- Who implements: B — Code it (agent writes each slice only after Apply this slice)

## Scan

Path: features/admin-data/components/FacultyLoadingTab.tsx handleStep5Subjects (new, mirrors handleStep4Sections L478-528) → app/api/import/faculties/route.ts POST (new step === "subjects" branch, mirrors sections L81-104) → lib/services/etlEvaluation.ts importSubjectsStep (new, extracts composed block L444-452; mirrors importSectionsStep L185-225) → features/admin-data/subject.repository.ts upsertMany L11 (select by code IN, insert missing, update renamed, return {data, created, updated}) via lib/repositories/factory.ts L57 → Supabase subjects

Proof: lib/__tests__/etlEvaluation.test.ts — composed-path regression at L711-721 must pass untouched (spec section 8). mockSubjectUpsert helper already exists at L62-64. Command: npm test

Teach: what — subjects have no FK dependency, so Step 5 is the first step that needs NO dependency map from a prior step; it is the only one whose client payload is plain string[]. why — every other step keys on a map returned by its predecessor, but subjects key on their own NOT NULL UNIQUE code, so upsertMany resolves existence in one shot. when — runs after Step 4, produces subjectCodeToId consumed by Step 7 mappings. alternative — chunked O(rows) posting through the legacy path (rejected: 315 distinct fit one request).

Key finding — subjectRepository.upsertMany differs from sectionRepository.upsertMany in three ways the plan must respect:
1. It returns THREE fields: { data, created, updated } (L45). sectionRepository returns two. The StepResult contract has no `updated` axis, so the plan must decide what to do with it (spec section 4.1 defines inserted/existing/invalid only).
2. It UPDATES names (L34-43) when an existing row's name differs. With the `name = code` fallback live on the 2026-1 file (all 315 subject names blank per spec), the first run inserts 315 rows named after their code. A LATER run after a real backfill, or a file that DOES carry subject names, will hit the update branch — and `updated` will be non-zero while `created` is 0.
3. It fetches existing by `.in("code", codes)` (L15) rather than scanning the whole table, so it is genuinely O(315), not O(table). Case-sensitive exact match via `.in()`; no case folding. This satisfies the spec edge case at step-05 line 71-73.

Client-side derivation: csvRows[].subjectCode is ALREADY cleaned by cleanSubjectCode() at parse time (FacultyLoadingTab.tsx:359, csv-utils.ts:87 strips quotes and balanced outer parens). So the Step 5 handler must trim + dedupe but must NOT re-clean or upper-case — step-05 line 71-73 forbids case folding, and departmentCode IS upper-cased at L362, so the two columns differ on purpose.

reset parity: handleCsvFile L368-390 and handleCsvReset L692+ both need setStep5Result(null) added — L372 and L697 currently reset steps 2-4 only.

Trace honesty: IMPORT_STEPS (L20-27) already advertises all 6 ids including "subjects" (L24), but doneCount (L1113) sums only step2/3/4Result, so the Subjects chip can never tick. Slice 3 must add step5Result to doneCount and to the footnote arithmetic at L1114.

Lens:
- API routes stay thin: applies — discriminator branch only in route.ts, all name-fallback logic stays in the service
- proxy.ts access-enforcement: applies — reuse requireAdmin guard (route.ts:20), no bypass
- Supabase via repositories/DI: applies — must go through subjectRepository.upsertMany via factory (L57), no direct supabase.from in service
- SubmitButton double-click guard: applies — StepPanel run button disabled while running + Yes/No confirm + csvImporting guard, same as Steps 2-4
- Pipe-delimited role priority: n/a — subjects carry no role column

Open question for the user: what to do with `updated` (see finding 2). Options below.

## Plan

Slice order follows layering (one file per implement-fix turn):
1. Service extract in lib/services/etlEvaluation.ts — importSubjectsStep(items: string[]): trim + skip empty + dedupe; subjectItems = distinct.map(code => ({code, name: code})); single subjectRepository.upsertMany; inserted = created, existing = subjectItems.length - created (updated folded); returns StepResult + subjectCodeToId (code → id).
2. Route discriminator in app/api/import/faculties/route.ts — if body.step === "subjects": validate items array, call slice 1, audit ETL_FACULTY_SUBJECT, return {...StepResult, fileId}; else legacy rows path byte-identical; requireAdmin stays first.
3. Client stepper call in features/admin-data/components/FacultyLoadingTab.tsx — handleStep5Subjects derives distinct trimmed codes from csvRows (already cleanSubjectCode-cleaned, no re-clean/uppercase), Step 5 StepPanel + StepperTrace count, disabled until step4Result, Yes/No confirm, guard + disable while running, invalid cap/scroll, resume re-reports 0 inserted; plus handleCsvFile/handleCsvReset setStep5Result(null) parity and doneCount/footnote include step5Result.
4. Tests in lib/__tests__/etlEvaluation.test.ts — upserts-all-distinct (315 items name===code), created/existing split, trim/dedupe, composed-path unchanged.
Proof: npx tsc --noEmit → npm run lint → npm test. Out of scope: steps 6-7, student importer, Final promotion. Note: spec still Draft — Final bump + re-approval required before implement-fix writes code.
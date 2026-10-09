---
skill: plan-fix
story: Faculty import stepper wizard — Step 7 mappings per specs/faculty-import-stepper.md + specs/faculty-import-stepper/step-07-mappings.md (terminal step, 903 existing·0 inserted on re-run, real-beats-dummy, real-vs-real refused)
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "option-A distinct-set + 3 client-held maps, UI Step 6 Faculty Loading — approved"
status: complete
pending: none
---

# Plan — Faculty stepper Step 6 Faculty Loading (= spec step-07 mappings)

## Progress

| id | question | answer |
|----|----------|--------|
| story | What to plan | step-07-mappings.md + README.md check (2026-10-09) |
| calibration-1 | Use last calibration (1C 2E 3B 4A 5A 6A)? | A — Use it (user: re-user calibration) |
| visual | Approve visual proposal? | A — Approve (Option-A distinct-set + 3 client-held maps) |
| numbering | Correct step numbering? | Other — UI Step 1 Departments, 2 Courses, 3 Sections, 4 Subjects, 5 Faculty Users, 6 Faculty Loading = spec step-07 mappings (terminal) |
| plan-done | Is this plan done? | A — Done |
| who-implements | Implement this yourself, or should I code it? | B — Code it |
| slice-1 | Apply Slice 1 (service extract) to lib/services/etlEvaluation.ts? | Applied — importMappingsStep + MappingStepItem/Result |
| continue-2 | Say continue for Slice 2 (route discriminator)? | Continued |
| slice-2 | Apply Slice 2 (route discriminator) to app/api/import/faculties/route.ts? | Applied — mappings branch + import |
| continue-3 | Say continue for Slice 3 (client stepper call)? | Continued |
| slice-3 | Apply Slice 3 (client stepper call) to features/admin-data/components/FacultyLoadingTab.tsx? | Applied — handleStep7Mappings + state/panel/trace/resets, panels renumbered 1-6 |
| continue-4 | Say continue for Slice 4 (tests)? | Continued |
| slice-4 | Apply Slice 4 (tests) to lib/__tests__/etlEvaluation.test.ts? | Applied — 9 mappings tests; tsc clean, lint clean, vitest 259/259 green |

## Pending

- none: all 4 slices applied (service → route → client → tests); UI Step 6 Faculty Loading complete

## Decisions

- specs/README.md checked 2026-10-09: spec Steps 02–06 Done (230→250 tests green), Next session = spec Step 07 mappings. UI numbering per user 2026-10-09: Step 1 Departments, 2 Courses, 3 Sections, 4 Subjects, 5 Faculty Users, 6 Faculty Loading (= spec step-07, terminal). No code yet for mappings.
- Calibration reused from 20261009-1638-faculty-stepper-step-06.md: 1C 2E 3B 4A 5A 6A; workflow A (SCAN → VISUAL → APPROVE → BUILD)
- Gold paths read-first: specs/faculty-import-stepper.md §registry/StepResult/state-machine, specs/faculty-import-stepper/step-07-mappings.md L47-78 pseudocode + L80-92 classification, lib/services/etlEvaluation.ts (step pattern L59-374 + composed mapping block L628-718 + DUMMY L18), app/api/import/faculties/route.ts (5 branches L42-146), features/admin-data/components/FacultyLoadingTab.tsx (IMPORT_STEPS L20-27, handlers L412-637, trace L1221-1227, panels L1228-1381, resets L386-392/L801-809), features/admin-data/components/FacultyImportStepper.tsx (StepperTrace/StepPanel), features/admin-data/faculty-subject.repository.ts (list/create/update/findBySubjectAndSection/findBySubjectSectionAndFaculty), supabase-schema.sql (UNIQUE L711 vs semester-scoped L1034), lib/__tests__/etlEvaluation.test.ts (mocks L3-80, composed L305-432, steps L436-895)
- Visual approved (Option-A): distinct-set items + 3 client-held maps + semesterId functional; supersedes parent chunked rows shape (:126); pre-checks + batch list + 23505 verbatim; dummyId from facultyUserMap[DUMMY]. UI label: Step 6 — Faculty Loading (stepId "mappings" unchanged in service/route); trace stays of 6, doneCount adds step6Result
- Invariant preservation: thin routes — discriminator branch only in route.ts, resolve/dedup/23505 stay in service; proxy — requireAdmin stays first, no new unauthenticated path; repo-DI — service calls facultySubjectRepository via factory only, zero direct supabase.from; SubmitButton guard — StepPanel disabled while running + Yes/No confirm + csvImporting guard; pipe-role — n/a (mapping only, no stamp)
- Layering order for slices: Service → Route Handler → Client stepper → Tests; faculty-subject.repository unchanged (methods already hardened)
- Proof command: npm test (full gate: npx tsc --noEmit → npm run lint → npx vitest run; must stay green, expect 258/258: 250 + 8)
- Out of scope: student importer, Final promotion (spec stays Draft until re-approval), legacy Import removal (stays until stepper complete)
- Who implements: B — Code it (each slice still needs explicit Apply this slice)

## Scan

Path: features/admin-data/components/FacultyLoadingTab.tsx handleStep6FacultyLoading (new, mirrors handleStep5 FacultyUsers L586-637) → app/api/import/faculties/route.ts POST (new step === "mappings" branch, mirrors faculty-users L120-146) → lib/services/etlEvaluation.ts importMappingsStep (new, extracts composed block L628-718; mirrors importFacultyUsersStep L302-374) → facultySubjectRepository (list/create/update/findBySubjectAndSection/findBySubjectSectionAndFaculty) via lib/repositories/factory.ts → Supabase faculty_subjects

Proof: lib/__tests__/etlEvaluation.test.ts — 8 spec tests required (fresh 903 / re-run 0+903 / 28k→903 collapse / real-beats-dummy / real-vs-real refused+unchanged / blank fallback / unresolved / composed unchanged). Command: npm test (full gate: npx tsc --noEmit → npm run lint → npx vitest run)

Teach: what — UI Step 6 Faculty Loading is the terminal step and the only one that WRITES faculty_subjects; every prior UI step only looked up or created its own entity, but Step 6 only LOOKS UP sections/subjects/users via three client-held maps and never re-creates them (miss → invalid). why — faculty_subjects is UNIQUE(subject_id, section_id) (base L711; semester-scoped L1034 if migration ran) with faculty_id NOT in the key, so one slot holds exactly one faculty; silently reassigning a real teacher would be a data-integrity bug with no audit trail — hence dummy→real auto-update is allowed but real-vs-real is a hard error. when — runs after UI Steps 3+4+5 (needs sectionKeyToId + subjectCodeToId + facultyUserMap), produces nothing downstream, 903 distinct slots from 28,096 rows in one request. alternative — posting O(rows) through legacy chunked path (rejected: 903 distinct triples fit one distinct-set request per parent spec §O(distinct)).

Lens:
- API routes stay thin: applies — discriminator branch only in route.ts, all resolve/dedup/23505 logic stays in service
- proxy.ts access-enforcement: applies — reuse requireAdmin guard (route.ts:20), no bypass
- Supabase via repositories/DI: applies — must go through facultySubjectRepository via factory, no direct supabase.from in service
- SubmitButton double-click guard: applies — StepPanel run button disabled while running + Yes/No confirm + csvImporting guard, same as Steps 2-6
- Pipe-delimited role priority: n/a for writes (no role stamping; mapping only)
- semesterId: APPLIES functionally here (unlike Steps 2-6 envelope-only) — combo key + create + list({semesterId}) all scope by semester; service signature takes semesterId

## Plan

Slice order follows layering (one file per implement-fix turn):
1. Service extract in lib/services/etlEvaluation.ts — MappingStepItem {subjectCode, sectionName, sectionProgram, facultyEmail} + MappingStepResult {stepId:"mappings", status:"done", inserted, existing, invalid}; importMappingsStep(items, {sectionKeyToId, subjectCodeToId, facultyUserMap}, semesterId?): trim codes (no fold), email lower/trim, "" → blank-fallback via findBySubjectAndSection; miss → invalid (Subject X not found / section TBD / Faculty X not found / X not assigned to SUBJ in SEC / No faculty assigned to SUBJ in SEC); candidate{faculty_id,subject_id,section_id,semesterId,rowNum=index+1,email} → comboMap key subject|section|semester??"" real-beats-dummy → batch list({semesterId})→existingByCombo → try create catch 23505 (same→existing "Already loaded — skipped" / dummy→real→update counts inserted / else→invalid "Already assigned — not overwritten (existing load kept)"). Lookup-only; dummyId = facultyUserMap[DUMMY_FACULTY_EMAIL].
2. Route discriminator in app/api/import/faculties/route.ts — if body.step === "mappings": validate items Array + 3 maps, map strings, pass semesterId functionally, audit ETL_FACULTY_SUBJECT, return {...StepResult, fileId}; else legacy rows path byte-identical; requireAdmin stays first. Records supersession of parent chunked rows shape.
3. Client stepper call in features/admin-data/components/FacultyLoadingTab.tsx — UI Step 6 Faculty Loading (vars step7Running/step7Result for continuity): handleStep6FacultyLoading derives 903 distinct {subjectCode,sectionName,sectionProgram,facultyEmail} from csvRows (section split dash/space precedent; email lower/trim, "" preserved), gates on UI Steps 3+4+5 + activeSemesterId, Step 6 StepPanel (disabledTitle, summary rows·distinct·inserted/existing/invalid, invalidKeyPrefix step7-inv, Yes/No confirm), StepperTrace doneCount + of 6 footnote, handleCsvFile/handleCsvReset setStep7Result(null) parity.
4. Tests in lib/__tests__/etlEvaluation.test.ts — extend vi.mock with findBySubjectAndSection/findBySubjectSectionAndFaculty; 8 tests: fresh inserted===903 / re-run 0+903 / 28k→903 combo collapse / real-beats-dummy update called / real-vs-real error + unchanged / blank fallback →dummy / unresolved invalid reasons / composed importFacultySubjects unchanged.
Proof: npx tsc --noEmit → npm run lint → npx vitest run (expect 258/258). Out of scope: student importer, Final promotion, legacy Import removal.

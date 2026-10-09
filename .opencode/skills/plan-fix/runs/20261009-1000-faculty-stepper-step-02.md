---
skill: plan-fix
story: Faculty import stepper wizard — Step 2 departments per specs/faculty-import-stepper.md + step-02-departments.md (create-if-absent, name=code, never discard row)
repo: regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: option-1 distinct-set step in existing route — approved
status: implementing
pending: done slice-4
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | Faculty import stepper Step 2 departments | recorded 2026-10-09 from user text (stepper wizard + step-02 spec) |
| calibration-reuse | Use the last calibration (1A 2B 3A 4D 5B 6Other)? | B — Re-ask from 1 |
| 1 | Output shape | C — A first. B only when the tree adds something the card does not |
| 2 | When you need to understand something | E — Combination, visual first |
| 3 | Agent explanations | B — Short explanation plus diagram |
| 4 | Workflow | A — SCAN → VISUAL → APPROVE → BUILD |
| 5 | During implementation | A — Step n/N and what changed, then wait |
| 6 | Teach or orient | A — Teach: why this code behaves this way, then the change |
| scan-pick | Pick step-02 approach | 1 — Distinct-set step in existing route |
| approve | Approve visual proposal? | A — Approve |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes |
| who-implements | Who implements? | B — Code it |
| slice-1 | Slice 1/4 service extract → lib/services/etlEvaluation.ts | applied; npm test 225/225 green (18 files) |
| continue-1 | Continue to slice-2? | continue |
| slice-2 | Slice 2/4 route discriminator → app/api/import/faculties/route.ts | applied; npm test 225/225 green (18 files) |
| continue-2 | Continue to slice-3? | continue |
| slice-3 | Slice 3/4 client stepper call → FacultyLoadingTab.tsx | applied; tsc clean, lint clean, npm test 225/225 green (18 files) |
| continue-3 | Continue to slice-4? | continue (typo "conitnue" read as continue) |
| slice-4 | Slice 4/4 tests → lib/__tests__/etlEvaluation.test.ts | applied; tsc clean, lint clean, npm test 230/230 green (18 files, +5 new) |

## Pending

- done (all 4 slices applied; uncommitted: etlEvaluation.ts, import/faculties route.ts, FacultyLoadingTab.tsx, etlEvaluation.test.ts; remaining: Final spec promotion, live upload verification, steps 3-7)

## Decisions

- repository.md read: Layering = Route Handler → Controller → Service → Repository → Supabase; tracker = user text only (using request text); proof command = npm test
- Gold paths read-first for this area: specs/faculty-import-stepper.md, specs/faculty-import-stepper/step-02-departments.md, app/api/import/faculties/route.ts, lib/services/etlEvaluation.ts, features/admin-data/components/FacultyLoadingTab.tsx — re-read at build if invariant unclear; no new invariants added
- Prior calibration found in 20261008-1620-chunked-etl-academic-infra.md (1A 2B 3A 4D 5B 6Other) — asked reuse, answer B re-ask from 1
- Calibration complete 1C 2E 3B 4A 5A 6A; workflow A
- Tracker is user text only — using story text above, no issue-tracker fetch
- Scan-pick option-1 approved: distinct-set step in existing route (spec §4.3); visual approved
- Invariant preservation: thin routes — discriminator branch only in route.ts, no business logic moves into handler; proxy — requireAdmin stays first line, no new unauthenticated path; repo-DI — service calls departmentRepository.findByCode/create via factory, zero direct supabase.from in service; SubmitButton guard — step button disabled while running + csvImportGuardRef pattern reused, no double-submit; pipe-role — n/a, no role column touched
- Layering order for slices: Service extract → Route Handler discriminator → Client stepper call → Tests; repository unchanged
- Proof command: npx tsc --noEmit → npm run lint → npm test (must stay green; 35 composed tests untouched + 5 new step-02 tests)

## Scan

Path: features/admin-data/components/FacultyLoadingTab.tsx handleCsvImport (chunked POST rows/chunkIndex/fileId) → app/api/import/faculties/route.ts POST (JSON rows path L35-49, calls L69) → lib/services/etlEvaluation.ts importFacultySubjects dept block L198-216 (findByCode → create name=code → 23505 re-read) → features/admin-data/department.repository.ts findByCode L14 / create L24 via lib/repositories/factory.ts → Supabase departments
Proof: lib/__tests__/etlEvaluation.test.ts (35 tests, composed-path regression must pass untouched per spec §8). Command: npm test
Teach: what — departments root the FK chain and step-02 extracts that block into a single distinct-set call (10 codes, 1 request); why — today the block runs inside every one of 281 chunks with no observable boundary, so admin never sees inserted/existing/invalid per phase; when — step-02 runs first, produces deptCodeToId for steps 3+6; alternative — report-only dry-run without create (safer but no stop/resume, rejected by spec purpose)
Lens:
- API routes stay thin: applies — step discriminator added in route.ts, business logic stays in service
- proxy.ts access-enforcement: applies — reuse requireAdmin guard (route.ts:20), no bypass
- Supabase via repositories/DI: applies — must go through departmentRepository.findByCode/create via factory, no direct supabase
- SubmitButton double-click guard: applies — wizard step button needs same guard + progress disable as FacultyLoadingTab chunk loop
- Pipe-delimited role priority: n/a — departments carry no role column

## Plan

Slice order follows layering (one file per implement-fix turn):
1. Service extract in lib/services/etlEvaluation.ts — importDepartmentsStep(items): findByCode → EXISTING; else create({name: code, code}) → INSERTED; catch 23505 → re-read → EXISTING else rethrow; blank trim()=="" → invalid "Department code is required"; returns StepResult + deptCodeToId for steps 3+6.
2. Route discriminator in app/api/import/faculties/route.ts — if body.step === "departments": validate items array + semesterId/fileId, call slice 1, return {...StepResult, fileId}; else legacy rows path byte-identical; requireAdmin stays first; audit on completion.
3. Client stepper call in features/admin-data/components/FacultyLoadingTab.tsx — single POST with distinct uppercased codes, render inserted/existing/invalid (cap/scroll long invalid[]), SubmitButton-style guard + disable while running, stop-at-boundary valid state, resume re-reports 0 inserted/N existing.
4. Tests in lib/__tests__/etlEvaluation.test.ts — creates-10, reuses-10 (create not called), blank-flagged (no empty create), 23505 re-read → existing, composed-path unchanged (35 green).
Proof: npx tsc --noEmit → npm run lint → npm test. Out of scope: steps 3-7, Setup Guide, Final promotion, seed/activation conflicts. Note: spec still Draft — Final bump + re-approval required before implement-fix writes code.

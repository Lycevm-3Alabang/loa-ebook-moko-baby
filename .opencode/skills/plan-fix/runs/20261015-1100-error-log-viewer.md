---
skill: plan-fix
story: Server error logs with stack traces surfaced in app/admin/system/audit-trail/ (detailed error log viewer)
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option C helper + all routes + viewer (SERVER_ERROR rows with capped stack; viewer badge + expandable pre)"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| option | Which option (A/B/C/Other)? | C — All routes |
| who-implements | Who implements Slice 1? | B — Code it |
| slice-1 | Apply Slice 1 (logServerError helper)? | Applied — helper with PostgrestError shaping + 8k cap; tests not run per H1 |
| slice-2 | Apply Slice 2 (15 eval-results catches)? | Applied — 15/15 files import + call verified; inactive-4xx excluded; details catch bound |
| slice-3 | Apply Slice 3 (11 files, 14 catches)? | Applied — 10 files / 14 calls verified (counts include grep path overlap); 400-paths + email callbacks excluded |
| slice-4 | Apply Slice 4 (viewer)? | Applied — SERVER_ERROR badge + expandable stack; structure verified |
| slice-5 | Student eval catches + create() race guard? | Applied — 4 catches wired + 23505 fallback in create() |

## Pending

- none (run closed; user verifies via tsc + vitest)

## Pending

- none (run closed; user verifies via tsc + vitest + live 500 check)

## Decisions

- repo refined: read repository.md (Layering Route Handler → Controller → Service → Repository → Supabase; tracker user text only)
- Calibration reused (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text: server error logs with stack traces surfaced in app/admin/system/audit-trail/. No issue fetch (tracker is user text only).
- Layering order for slices: Service (log helper) → Route Handler (wire catch blocks) → Page (viewer). Repository untouched (auditLogRepository.create/list already suffice). Gold paths: lib/services/audit.ts, features/audit/audit.repository.ts, app/api/admin/audit-logs/route.ts, catch blocks in evaluation-results routes.
- Proof command: npm test. Plus manual: trigger a failing request, see SERVER_ERROR row with stack in audit-trail. No new tests (no test covers audit viewer path).
- Option C approved: one logServerError() helper, wired into every API route catch block that console.errors today (~20 files, audited at build), plus viewer.
- Slices (layering order, one layer per build turn): Slice 1 Service — logServerError({ route, method, params, error }) in lib/services/audit.ts (action SERVER_ERROR; details = route + method + safe params + name/message + full stack, capped ~8k chars, no headers/cookies/tokens; fire-and-forget preserved); Slice 2 Routes batch 1 — evaluation-results admin + dean catches call it (the known 500s); Slice 3 Routes batch 2 — all remaining console.error catches; Slice 4 Page + proof — SERVER_ERROR badge, expandable <pre> stack row, full details on expand (CSV already exports full details), npm test + live 500 renders a row.
- Gold paths to re-read at build: lib/services/audit.ts, one wired catch (evaluation-results route), audit-trail/page.tsx:23-39 badge + :250 details cell.
- Risks: log volume on error storms (mitigated: filters + Clear All exist; cap length); stack text may include file paths (accepted: ADMIN-only viewer, same audience as Vercel logs).
- Invariant preservation: API thin — helper keeps routes thin (one call per catch); Supabase via repos + DI — log helper uses auditLogRepository (already the pattern), fire-and-forget so logging never breaks responses; proxy.ts — n/a (audit-trail already ADMIN-gated); SubmitButton — n/a (no forms); role priority — n/a (no gates touched).

## Scan

```text
Path: route catch (e.g. api/admin/evaluation-results/route.ts:74 console.error → 500) → logAuditEvent lib/services/audit.ts:3 (fire-and-forget, swallows errors) → auditLogRepository.create features/audit/audit.repository.ts:5 → audit_logs.details TEXT (schema:315-324, unbounded, fits stacks; no migration) → GET api/admin/audit-logs/route.ts:30 list → audit-trail/page.tsx:250 details truncated, no stack view, no SERVER_ERROR badge.
Proof: none — no test covers audit viewer/logging path. Command: npm test
Teach: details is already unbounded TEXT and the logger already swallows failures, so error logging needs no schema change and can never break the response it instruments — the work is a formatter helper + catch-block wiring + an expandable viewer.
Lens:
- API routes stay thin: applies + one logServerError() call per catch (lib/services/audit.ts)
- Supabase via repositories + DI: applies + auditLogRepository.create (features/audit/audit.repository.ts)
- proxy.ts access-enforcement: n/a + audit-trail + audit-logs already ADMIN-gated
- SubmitButton double-click prevention: n/a + no forms involved
- Role pipe-delimited priority: n/a + no role branching touched
```

## Plan

Slice 1 — Service (log helper): logServerError({ route, method, params, error }) in lib/services/audit.ts; action SERVER_ERROR; details = route + method + safe params + error name/message + full stack capped ~8k chars, no headers/cookies/tokens; fire-and-forget preserved via logAuditEvent.
Slice 2 — Routes batch 1 (the known 500s): evaluation-results admin + dean catch blocks call logServerError alongside existing console.error, passing route path + method + evaluationPeriodId/departmentId params.
Slice 3 — Routes batch 2 (the rest): all remaining console.error catch blocks wired the same way (audited at build; one call each, responses unchanged).
Slice 4 — Page + proof: SERVER_ERROR badge in ActionBadge; expandable row rendering full details in <pre>; npm test green; forced 500 produces a SERVER_ERROR row with stack.
Out: client-side errors, retention policy, alerts, schema migration.

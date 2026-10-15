---
skill: plan-fix
story: email-provider-domain-default (EMAIL_PROVIDER gmail|domain, default domain / noreply@lyceumalabang.edu.ph primary, gmail fallback discussion)
repo: regie-worktree
calibration: {1: "C", 2: "A", 3: "A", 4: "D", 5: "B", 6: "C"}
workflow: D
decision: Option 1 strict EMAIL_PROVIDER switch (default domain)
status: implementing
pending: "slice-1"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| story | Confirm target story is the email provider discussion? | yes — user: "we are discussing about the email right" |
| 1 | Output shape | C |
| 2 | When you need to understand something | A |
| 3 | Agent explanations | A |
| 4 | Workflow | D |
| 5 | During implementation | B |
| 6 | Teach or orient | C |
| plan-done | Is this plan done? | A Done |
| handoff | Plan file ready, run implement-fix? | A Yes |
| who-implements | Who implements? | B Code it |
| slice-1 | Slice 1 `lib/services/email.ts` | Applied |
| slice-2 | Slice 2 env/verify (user-owned) | In progress |

## Pending

- slice-2: guiding env/verify, no repo edit by agent

## Decisions

- Layering for this slice: Route Handler → Workflow (`lib/workflows/email-workflows.ts`) → Service (`lib/services/email.ts`) → SMTP (no Repository/Supabase touched).
- Gold paths read-first: `lib/services/email.ts`, `lib/workflows/email-workflows.ts`, `app/api/auth/activate/route.ts`, `app/api/auth/forgot-password/route.ts`, `features/appointments/appointments.controller.ts`, `features/appointments/appointments.notifications.ts`.
- Proof command: `npm test` (repository.md Tests). Existing cover is `lib/__tests__/email-templates.test.ts` (templates only, not transport).
- Invariants: API-thin preserved (selection stays in service, routes unchanged) — `app/api/auth/activate/route.ts`; proxy n/a (not auth); Supabase-DI n/a (SMTP, no DB); SubmitButton n/a (server mail); roles n/a (sender independent of recipient role).

## Scan

Path: `app/api/auth/activate/route.ts:33` → `sendActivationWorkflow` (`lib/workflows/email-workflows.ts:59`) → `sendActivationEmail` (`lib/services/email.ts:23`) → `transporter.sendMail` (`lib/services/email.ts:34` via `createTransport` at `:9-17` hardcoded `smtp.gmail.com:587`). Same funnel for forgot-password route, `appointments.controller.ts:127`, `appointments.notifications.ts:52,74,97`.
Proof: none for provider selection; `email-templates.test.ts` covers HTML only. Command: `npm test`.
Teach: transporter is built once at module load from `GMAIL_USER/GMAIL_APP_PASSWORD`; strict `EMAIL_PROVIDER` switch keeps 8 send fns unchanged and reads env per-send; alternative is try-primary-then-fallback-once on retryable SMTP codes.
Lens:
- API thin: applies + `app/api/auth/activate/route.ts` (keep selection in service)
- proxy access-enforcement: n/a (not auth)
- Supabase via DI: n/a (SMTP path)
- SubmitButton: n/a (server mail)
- role priority: n/a (sender independent of role)

Discovery:
- Problem: Gmail 500/day cap hit; need `noreply@lyceumalabang.edu.ph` via `mail.lyceumalabang.edu.ph:465` as default sender.
- Current: single Gmail transporter, `EMAIL_FEATURE_FLAG` gate, `From="ACES" <GMAIL_USER>`, fire-and-forget `.catch` in routes.
- Options: 1 strict `EMAIL_PROVIDER` switch (recommend), 2 primary+fallback-once, 6 Other.
- Blast radius: `lib/services/email.ts` only (8 send fns share transporter); workflows/routes unchanged; env docs + Vercel vars follow-up.
- Proof: `npm test`; manual `Test-NetConnection mail.lyceumalabang.edu.ph 465` by user.
- Out of scope: IMAP, SPF/DKIM DNS edits, queue/throttle, workflow retry changes, UI.

## Plan

- Goal: strict `EMAIL_PROVIDER` selection; unset/null/any-non-gmail → domain (`noreply@lyceumalabang.edu.ph`); `gmail` → existing Gmail path; same 8 send-fn signatures.
- Slice 1 — `lib/services/email.ts` only: select transporter + From per-send from env; keep `EMAIL_FEATURE_FLAG` gate; keep workflows/routes callers unchanged.
  - Preserves: API-thin (no route edits); no Supabase/proxy/SubmitButton/role impact.
  - Proof: `npm test`.
- Slice 2 — user-owned env/verify (no repo edit by agent): set `EMAIL_PROVIDER`, `DOMAIN_SMTP_PASS` (+ existing `GMAIL_*`) locally/in Vercel; user runs connectivity check.
  - Out of scope: IMAP, SPF/DKIM DNS, queue/throttle, workflow retries, UI.

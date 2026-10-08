# Imported-User Access & Activation Spec (2026-1)

Status: drafted · Scope: ETL-created users → first login (`/activate`,
`/forgot-password`, `/change-password`, NextAuth credentials)

## 1. Goal

Define exactly what happens to users created by the chunked academic-infrastructure
ETL (3,212 activatable students + 147 faculty for 2026-1): how they get in the
first time, what "activated" means in data, what forgot-password does for them,
and what blocks them — so support answers and admin runbooks are consistent.

## 2. Account states

| State | Data shape | Login (`lib/auth.ts`) |
|---|---|---|
| Imported, never activated | row in `users` + `userrole`, `passwordHash` NULL, `hasLoggedInBefore` false | rejected — `if (!user \|\| !user.passwordHash) return null` |
| Activated | `passwordHash` set (bcrypt, 12 rounds), `hasLoggedInBefore` true | allowed; stamps `hasLoggedInBefore: true`, `lastLoginAt` |
| Disabled | `isDisabled` true (admin action) | rejected by access layer |

There is no separate "activated" column: **`hasLoggedInBefore` is the
activation flag**, and it is set by `POST /api/auth/change-password`
(line 39), not only by first login.

## 3. Flows

**First access (`/activate` → email link → `/change-password?token=`):**
1. User enters school email. Client gates the domain first
   (`@itmlyceumalabang.onmicrosoft.com` students,
   `@lyceumalabang.edu.ph` faculty).
2. `POST /api/auth/activate`: 404 `NOT_FOUND` (unknown email) · 400
   `ALREADY_ACTIVATED` (`hasLoggedInBefore` true) · else creates a 32-byte
   hex token (15-minute expiry, single-use via `usedAt`) and emails
   `${NEXTAUTH_URL}/activate?token=…`.
3. The `/activate?token=` page redirects to `/change-password?token=…`;
   setting a password (min 6 chars) flips `hasLoggedInBefore` true.

**Forgot password (`/forgot-password`):**
- Unknown email → `NOT_FOUND` ("contact your department administrator").
- Known but never activated → `ACTIVATION_SENT`: an **activation** link is
  emailed instead of a reset link. There is no dead end.
- Activated → reset link to `/change-password?token=…` (same token table,
  same 15-minute single-use rules).

**Token/response contract** (`app/api/auth/*`): `{ success: true }` plus
optional `code` (`NOT_FOUND`, `ALREADY_ACTIVATED`, `ACTIVATION_SENT`,
`SERVER_ERROR`). Password emails are fire-and-forget (`.catch` logs only) —
see §5.

## 4. Domain rules (must match the ETL B-exclusions)

| Surface | Students | Faculty |
|---|---|---|
| ETL import (`studentImport.ts` `ALLOWED_DOMAINS`) | `@lyceumalabang.edu.ph`, `@itmlyceumalabang.onmicrosoft.com` | `@lyceumalabang.edu.ph` |
| `/activate` client gate | same two | `@lyceumalabang.edu.ph` |

An address the ETL excludes can never activate either — consistent by
construction. Do not loosen one side without the other.

## 5. ETL implications (2026-1, measured from the source CSVs)

| Group | Count | Access outcome |
|---|---|---|
| Distinct student emails, school domain | 3,212 | activatable via `/activate` |
| Distinct student emails, foreign domain | 90 | **no account** (excluded as wrong uploads) |
| Blank-email student rows | 189 rows / 18 names | **no account** (nothing to send to) |
| Distinct faculty emails (all school domain) | 147 | activatable via `/activate` |
| Blank-faculty faculty-file rows | 902 | **no mapping, no placeholder** (B-rule; listed in wrong uploads) |

Total activation-email demand if everyone activates at once: **3,359 mails**.
The 18 blank-email names and 90 foreign-domain addresses need corrected
source emails + re-upload — there is no in-app path for them.

## 6. Email-delivery dependency (the real gate)

Activation, reset, and password-changed mails go through Vercel Workflows
(`lib/workflows/email-workflows.ts`, `"use workflow"`) → Nodemailer Gmail
SMTP (`lib/services/email.ts`, sender from `GMAIL_USER`). Two consequences:

1. **Success is reported before delivery is known.** The activate/forgot
   routes return `{ success: true }` while the mail sends in the background;
   SMTP failure only lands in server logs + `EMAIL_FAILED` audit rows. The UI
   "Check Your Email" screen can therefore be wrong.
2. **Locally no mail leaves.** Verify delivery in the deployed environment,
   not `npm run dev`.

**Pre-upload verification (do this before the grand ETL):**
- Send one activation cycle end-to-end (import one test user → `/activate`
  → link → set password → login) and confirm receipt latency.
- Confirm `NEXTAUTH_URL` points at the public URL (links embed it).
- Resend discipline: 60s client cooldown; tokens live 15 minutes — tell
  users to click promptly, especially for a 3,359-recipient wave.

## 7. Admin runbook

- "No account found" → email not in `users` (wrong upload, typo, or wrong
  semester file). Fix source CSV, re-upload (idempotent: completed rows
  no-op, wrong rows re-reported).
- "Already activated, can't log in" → use `/forgot-password` (issues a
  reset link for activated accounts).
- "Link expired / already used" → request a fresh link; each request mints
  a new 15-minute single-use token (old ones stay invalid).
- Mass onboarding → point a cohort at `/activate`, not at `/login`; login
  rejects passwordless accounts by design.

## 8. Known TODOs / drift

- `forgot-password/page.tsx` handles a `NOT_ACTIVATED` code the server never
  sends (server uses `ACTIVATION_SENT`) — dead branch, harmless; align or
  remove.
- Consider surfacing `EMAIL_FAILED` audit rows to admins so silent SMTP
  outages don't present as "check your email".
- 15-minute token window is tight for a 3,359-recipient wave over slow
  inboxes; consider lengthening for activation tokens only.
- The 18 blank-email names need a source-data fix outside the app.

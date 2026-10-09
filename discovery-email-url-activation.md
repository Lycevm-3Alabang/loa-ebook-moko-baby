# Discovery — Email URL Activation & EMAIL_FEATURE_FLAG

## 1. Business Flow & User Interaction

- **Trigger:** User forgot password or account activation via `/api/auth/forgot-password` or `/api/auth/activate` API calls
- **Sequence:**
  1. Client sends POST with `{email}` (and optionally `{callbackUrl}`) to auth API
  2. Backend validates user exists and is not yet logged in (for activation) or exists (for forgot password)
  3. Random 32-byte hex token generated, expires in 15 minutes
  4. Activation URL constructed as `${NEXTAUTH_URL}/activate?token={token}` (optionally with `&callbackUrl=`)
  5. `sendActivationWorkflow` → `sendActivationEmail` called with URL
  6. If `EMAIL_FEATURE_FLAG=true`: email sent via Gmail SMTP with activation link
  7. If `EMAIL_FEATURE_FLAG=false`: URL logged to console (dev mode only)
  8. Audit event logged for email send success/failure

## 2. Architectural Context & Rationale ("Why")

- **Existing Patterns:** Vertical slice architecture — API routes in `app/api/auth/` call workflow functions in `lib/workflows/email-workflows.ts`, which call service functions in `lib/services/email.ts`
- **Constraints & Trade-offs:**
  - `EMAIL_FEATURE_FLAG` defaults to `false` (per CLAUDE.md) — emails are opt-in via env var
  - When flag is false, system falls back to console logging for development debugging
  - `NEXTAUTH_URL` must point to public URL; embeds links with it (per specs/student-access-activation.md)
  - Token is 32-byte hex, 15-minute expiry — tight for mass activation waves (3,359+ mails per specs/student-access-activation.md)

## 3. Defect / Gap Analysis

- **Problem:** No central enforcement of `EMAIL_FEATURE_FLAG` check before URL construction — the URL is always built regardless of the flag state
- **Root Cause:** `sendActivationWorkflow` receives `activationUrl` as a required parameter; the caller constructs the URL independently of whether email will actually be sent. The flag only gates the SMTP send in `sendActivationEmail`, not the URL construction or workflow invocation.

## 4. Surface Area & Blast Radius

- **In-Scope Touchpoints:**
  - `app/api/auth/forgot-password/route.ts:26` — constructs `activationUrl` with `NEXTAUTH_URL`
  - `app/api/auth/activate/route.ts:31` — constructs `activationUrl` with `NEXTAUTH_URL` and optional `callbackUrl`
  - `lib/services/email.ts:23-30` — `sendActivationEmail` gates on `isEmailEnabled()`
  - `lib/workflows/email-workflows.ts:59-73` — `sendActivationWorkflow` orchestrates the send
  - `.env` — `EMAIL_FEATURE_FLAG`, `NEXTAUTH_URL`, `GMAIL_USER` env vars

- **Out of Scope (Do Not Touch):**
  - `lib/services/email.ts` other email functions (they also check the flag but are separate concerns)
  - Password reset flow (`sendForgotPasswordWorkflow`) — different URL and purpose
  - NextAuth session management — `NEXTAUTH_URL` usage beyond activation link construction

- **Operational / Edge Case Risks:**
  - If `NEXTAUTH_URL` is misconfigured, activation links point to wrong host
  - If `EMAIL_FEATURE_FLAG` is accidentally set to `true` without GMAIL credentials, throws error
  - Mass activation (3,359+ emails) may hit rate limits or timeout; 15-minute token window is tight
  - When flag is `false`, no audit trail of actual email delivery (only dev console logs)

## 5. Proposed Solution Options

1. **Option A (Recommended):** Add `EMAIL_FEATURE_FLAG` check at the API route level before constructing and sending activation URL. If flag is false, skip URL construction and workflow call, return success without sending. This prevents unnecessary URL generation and workflow execution when emails are disabled.

2. **Option B:** Keep current flow but add guard in `sendActivationWorkflow` to check `isEmailEnabled()` internally and return early if disabled. This encapsulates the flag check within the workflow layer rather than requiring callers to manage it.

3. **Option C:** Remove the feature flag guard from `sendActivationEmail` entirely and always send emails (revert to always-send behavior). Only use flag to control whether the API routes invoke the workflow at all.

**Recommended:** Option A — gate at the API route level in both `forgot-password` and `activate` routes, checking `process.env.EMAIL_FEATURE_FLAG === "true"` before constructing the activation URL and calling the workflow. This aligns with the existing pattern where feature flags control whether API operations execute, and avoids passing unnecessary data when the feature is off.
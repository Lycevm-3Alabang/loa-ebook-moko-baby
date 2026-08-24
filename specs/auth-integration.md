# Auth Integration Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-08-24
**Cross-reference:** `assemblies/loa-consult-platform/consult-readiness.md` §3-5

---

# 1. Overview

The e-consultation app delegates authentication to the centralized loa-auth-platform. It does not issue JWT tokens, manage passwords, or handle user registration. It validates JWT tokens locally using a shared HMAC-SHA256 secret.

---

# 2. SSO Flow

```
1. User visits aces.lyceumalabang.edu.ph
2. No valid session → Frontend redirects to:
   https://auth.lyceumalabang.edu.ph/sso/login?redirect=https://aces.lyceumalabang.edu.ph
3. User authenticates on Auth Platform
4. Auth Platform encrypts JWT payload (AES-256-GCM)
5. Auth Platform redirects to:
   https://aces.lyceumalabang.edu.ph#payload=<encrypted_base64url>
6. Frontend JS extracts fragment
7. Frontend calls POST /api/auth/callback with encrypted payload
8. Backend decrypts, validates JWT locally, returns session tokens
9. Refresh token stored as httpOnly cookie (loa_connect_refresh)
```

---

# 3. Auth Endpoints (e-consultation)

## 3.1 `POST /api/auth/callback`

SSO callback — decrypts encrypted payload from loa-auth redirect, validates JWT locally.

| Field | Value |
|-------|-------|
| Rate limit | 10 requests/minute |
| Request body | `{ "payload": "<encrypted_base64url_string>" }` |
| Response 200 | `{ "access_token": "...", "user": { "id", "email", "name", "groups", "permissions" } }` |
| Response 400 | Missing/invalid payload, decryption failed, payload expired |
| Response 401 | User not found or disabled |
| Response 403 | Tenant mismatch |

**Implementation steps:**
1. Receive `{ payload }` from request body
2. Base64url-decode the payload string
3. Split decoded bytes: `nonce[12] + auth_tag[16] + ciphertext[...]`
4. AES-256-GCM decrypt using `ENCRYPTION_KEY`
5. Parse resulting JSON
6. Validate `exp` claim has not passed
7. Validate JWT access token locally using `JWT_SECRET` (HS256)
8. Validate `type === "access"`
9. Validate `tenant.slug === TENANT_SLUG`
10. Set httpOnly cookie with refresh token (`loa_connect_refresh`, 7-day TTL)
11. Return access token + user claims to frontend

## 3.2 `POST /api/auth/refresh`

Token refresh — reads refresh token from httpOnly cookie, proxies to loa-auth.

| Field | Value |
|-------|-------|
| Rate limit | 10 requests/minute |
| Request body | Empty (reads `loa_connect_refresh` cookie) |
| Response 200 | `{ "access_token": "..." }` |
| Response 204 | Cleared cookie (expired/revoked) |

**Implementation steps:**
1. Read `loa_connect_refresh` from httpOnly cookie
2. If missing/empty → return 204
3. Proxy `POST https://auth.lyceumalabang.edu.ph/api/v1/auth/refresh` with `{ "refresh_token": "<cookie_value>" }`
4. On success: set new httpOnly cookie from response, return new `access_token`
5. On failure (401/422): clear cookie, return 204

## 3.3 `POST /api/auth/logout`

Logout — clears refresh cookie, proxies revocation to loa-auth.

| Field | Value |
|-------|-------|
| Request body | Empty |
| Response 204 | Always |

**Implementation steps:**
1. Read `loa_connect_refresh` from httpOnly cookie
2. Best-effort proxy to `POST https://auth.lyceumalabang.edu.ph/api/v1/auth/logout` with `{ "refresh_token": "<cookie_value>" }`
3. Clear `loa_connect_refresh` cookie
4. Return 204

---

# 4. JWT Validation (Local)

All JWT validation happens locally using the shared `JWT_SECRET`. No HTTP call to loa-auth per request.

## 4.1 Token Extraction (`proxy.ts`)

1. Check `Authorization: Bearer <token>` header
2. Validate JWT signature with `JWT_SECRET` (HS256)
3. Verify `type === "access"`
4. Verify `exp` not exceeded
5. Verify `tenant.slug === TENANT_SLUG`
6. Set claims on request context

## 4.2 JWT Claims Structure

```json
{
  "sub": "user-uuid",
  "email": "user@lyceumalabang.edu.ph",
  "name": "User Name",
  "groups": ["Faculty", "CCS"],
  "permissions": [
    "read:/api/appointments",
    "write:/api/appointments/{id}",
    "users.view"
  ],
  "tenant": { "id": "tenant-uuid", "slug": "loa" },
  "type": "access",
  "iat": 1754000000,
  "exp": 1754000900
}
```

## 4.3 Level Hierarchy

| Level | Ordinal | Usage |
|-------|---------|-------|
| `deny` | -1 | Explicit block |
| `read` | 1 | View/list/download |
| `write` | 2 | Create/update/delete non-destructive |
| `admin` | 3 | Destructive/sensitive operations |

---

# 5. Endpoint Policy Enforcement

The consult app enforces endpoint-level access via a local `EndpointPolicyMiddleware` that reads permissions from the JWT.

## 5.1 Flow

1. Match request `method + path` against local endpoint catalog
2. If no match → check public allowlist → if not public → **403** (closed-by-default)
3. Extract `permissions` from JWT claims
4. Find matching permission by path pattern (`{param}` wildcards)
5. Compare ordinal: `grantedLevel >= requiredLevel` → allowed; else **403**
6. Store effective level on request context for downstream use

## 5.2 Wildcard Matching

Path parameters like `{id}` are treated as wildcards matching `[^/]+`. For example:
- Permission `write:/api/appointments/{id}` matches `write:/api/appointments/abc123`
- Permission `read:/api/appointments` matches `read:/api/appointments` (exact)

---

# 6. Shared Secrets

| Secret | Purpose | Format |
|--------|---------|--------|
| `JWT_SECRET` | HMAC-SHA256 for JWT signing/validation | Same value on Auth + Consult |
| `ENCRYPTION_KEY` | AES-256-GCM for SSO payload encryption | 64 hex chars or `base64:` prefix |

Both must be identical between loa-auth-platform and e-consultation.

---

# 7. Environment Variables

## New (add to `.env`)

```env
JWT_SECRET=<from loa-auth-platform>
AUTH_BASE_URL=https://auth.lyceumalabang.edu.ph
ENCRYPTION_KEY=<from loa-auth-platform>
TENANT_SLUG=loa
REFRESH_COOKIE=loa_connect_refresh
REFRESH_COOKIE_TTL=10080
```

## Remove (from `.env`)

```env
AUTH_SECRET=<old>
NEXTAUTH_SECRET=<old>
NEXTAUTH_URL=<old>
```

---

# 8. User Data Sync

After SSO login, the consult app upserts user data from JWT claims into its local `users` table.

## 8.1 Upsert Logic

1. Look up user by `email` in local `users` table
2. If exists: update `name` from JWT claims
3. If not exists: insert with `name`, `email`, default values for other fields
4. Application-specific fields (`departmentId`, `course`, `employeeNo`) are managed locally, not from JWT

## 8.2 Fields to Remove from Local `users` Table

| Field | Reason |
|-------|--------|
| `passwordHash` | Managed by loa-auth |
| `tokenVersion` | Managed by loa-auth refresh tokens |
| `hasLoggedInBefore` | Managed by loa-auth |

## 8.3 Fields to Keep

| Field | Source |
|-------|--------|
| `id` | Local |
| `name` | Synced from JWT |
| `email` | Synced from JWT |
| `departmentId` | Local |
| `course` | Local |
| `employeeNo` | Local |
| `isDisabled` | Local (application-level flag) |
| `createdAt`, `deletedAt` | Local |

---

## Document Control

- **Status:** Draft v1.0
- **Created:** 2026-08-24
- **Aligns with:** `consult-readiness.md` §3-5

# Migration Checklist Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-08-24
**Cross-reference:** `assemblies/loa-consult-platform/consult-readiness.md` §6-7

---

# 1. Migration Sequence

| Step | Owner | Action | Depends On |
|------|-------|--------|------------|
| 1 | Auth Platform | Create/update tenant `loa`, add redirect_origins | — |
| 2 | Auth Platform | Create user groups: ADMIN, DEAN, FACULTY, STUDENT | Step 1 |
| 3 | Auth Platform | Seed endpoint catalog (~143 entries) | Step 1 |
| 4 | Auth Platform | Configure group grants per `endpoint-catalog.md §5` | Step 2, 3 |
| 5 | Auth Platform | Share `JWT_SECRET` and `ENCRYPTION_KEY` | Step 1 |
| 6 | e-consultation | Add 3 auth endpoints (callback, refresh, logout) | Step 5 |
| 7 | e-consultation | Add endpoint catalog + EndpointPolicyMiddleware | Step 5 |
| 8 | e-consultation | Replace `proxy.ts` token extraction with local JWT validation | Step 5 |
| 9 | e-consultation | Replace `lib/auth.ts` with JWT-based session management | Step 6, 7, 8 |
| 10 | e-consultation | Update auth pages (login → SSO redirect) | Step 9 |
| 11 | e-consultation | Remove NextAuth, custom RBAC, bcryptjs | Step 9, 10 |
| 12 | e-consultation | Remove auth fields from users table, drop RBAC tables | Step 11 |
| 13 | Both | Integration test: SSO flow, refresh, logout, all access levels | Step 12 |
| 14 | Both | Deploy: auth platform first, then e-consultation | Step 13 |

---

# 2. Auth Platform Tasks

These are done in `D:\loa\loa-apache-server-apps`. Full details in `consult-readiness.md`.

- [ ] **Step 1:** Tenant `loa` exists with `aces.lyceumalabang.edu.ph` in redirect_origins
- [ ] **Step 2:** Groups `ADMIN`, `DEAN`, `FACULTY`, `STUDENT` created (tenant-scoped)
- [ ] **Step 3:** Endpoint catalog seeded (~143 entries from `endpoint-catalog.md`)
- [ ] **Step 4:** Group grants configured per `endpoint-catalog.md §5`
- [ ] **Step 5:** `JWT_SECRET` and `ENCRYPTION_KEY` shared with e-consultation team

---

# 3. e-consultation Tasks

These are done in `D:\loa\e-consultation`.

## 3.1 New Files to Create

- [ ] `app/api/auth/callback/route.ts` — SSO callback endpoint
- [ ] `app/api/auth/refresh/route.ts` — token refresh proxy
- [ ] `app/api/auth/logout/route.ts` — logout proxy
- [ ] `lib/endpoint-catalog.ts` — endpoint catalog (143 entries)
- [ ] `lib/endpoint-policy.ts` — EndpointPolicyMiddleware
- [ ] `lib/jwt.ts` — local JWT validation (HS256)
- [ ] `lib/auth-context.tsx` — JWT context provider (replaces SessionProvider)

## 3.2 Files to Modify

- [ ] `proxy.ts` — replace `getToken()` from next-auth with local JWT validation
- [ ] `app/(auth)/login/page.tsx` — replace `signIn("credentials")` with SSO redirect
- [ ] `components/layouts/Providers.tsx` — replace SessionProvider with JWT context
- [ ] `supabase-schema.sql` — remove auth fields from users table
- [ ] `lib/route-guard.ts` — replace with endpoint policy checks
- [ ] `.env.example` — add new env vars, remove old ones

## 3.3 Files to Remove

- [ ] `app/api/auth/[...nextauth]/route.ts`
- [ ] `app/api/auth/activate/route.ts`
- [ ] `app/api/auth/forgot-password/route.ts`
- [ ] `app/api/auth/change-password/route.ts`
- [ ] `app/api/auth/change-password/validate/route.ts`
- [ ] `lib/auth.ts` (replace entirely)
- [ ] `lib/access.ts` (replace with endpoint policy)
- [ ] `lib/default-access.ts` (replace with endpoint policy)
- [ ] `lib/utils/roles.ts` (replace with JWT groups claim)

## 3.4 Dependencies to Remove

- [ ] `next-auth` (from package.json)
- [ ] `bcryptjs` (from package.json)

## 3.5 Database Changes

- [ ] Drop column `passwordHash` from `users` table
- [ ] Drop column `tokenVersion` from `users` table
- [ ] Drop column `hasLoggedInBefore` from `users` table
- [ ] Drop table `group_access`
- [ ] Drop table `user_permissions`
- [ ] Drop table `role`
- [ ] Drop table `userrole`
- [ ] Drop table `password_reset_tokens`
- [ ] Drop table `accounts` (NextAuth OAuth, unused)
- [ ] Drop table `sessions` (NextAuth DB sessions, unused with JWT strategy)
- [ ] Drop table `verification_tokens` (NextAuth, unused)

## 3.6 Frontend Files to Update

Files using `useSession()` that need to switch to JWT context:

- [ ] `app/admin/page.tsx`
- [ ] `app/dean/page.tsx`
- [ ] `app/faculty/page.tsx`
- [ ] `app/student/page.tsx`
- [ ] `components/layouts/Sidebar.tsx`
- [ ] `components/layouts/Navbar.tsx`
- [ ] `components/ui/SubmitButton.tsx`
- [ ] `features/appointments/components/*.tsx`
- [ ] `features/evaluations/components/*.tsx`
- [ ] All other files importing from `next-auth/react`

---

# 4. Verification Checklist

## 4.1 Auth Platform Side

- [ ] Tenant `loa` exists with correct redirect_origins
- [ ] Groups created and tenant-scoped
- [ ] Endpoint catalog seeded (143 entries)
- [ ] Group grants configured per spec
- [ ] SSO login accepts redirect to `aces.lyceumalabang.edu.ph`
- [ ] `JWT_SECRET` and `ENCRYPTION_KEY` shared

## 4.2 e-consultation Side

- [ ] `POST /api/auth/callback` decrypts payload and validates JWT
- [ ] `POST /api/auth/refresh` proxies to loa-auth
- [ ] `POST /api/auth/logout` clears cookie and proxies to loa-auth
- [ ] `proxy.ts` validates JWT with `JWT_SECRET` (no next-auth)
- [ ] EndpointPolicyMiddleware enforces level-based access
- [ ] Login page redirects to loa-auth SSO
- [ ] `useSession()` replaced with JWT context
- [ ] NextAuth removed from dependencies
- [ ] bcryptjs removed from dependencies
- [ ] Auth fields removed from users table
- [ ] RBAC tables dropped
- [ ] All env vars updated

## 4.3 Integration Tests

- [ ] SSO redirect to auth platform works
- [ ] Encrypted payload decryption succeeds
- [ ] JWT validation with shared secret works
- [ ] Tenant slug validation works
- [ ] Refresh token rotation works
- [ ] Logout clears cookie and revokes token
- [ ] ADMIN group has full access
- [ ] DEAN group can read evaluations, cannot reset DB
- [ ] FACULTY can manage availability, view consultations
- [ ] STUDENT can book consultations, submit evaluations
- [ ] Closed-by-default: unknown endpoints return 403
- [ ] User override grants take precedence over group grants

---

# 5. Open Questions

| Question | Impact | Resolution |
|----------|--------|------------|
| How to migrate existing users to loa-auth? | Users can't login until migrated | Script to bulk-import via loa-auth admin API or direct DB |
| Multi-role users (`ADMIN\|FACULTY`)? | Group membership must match | Assign to both groups during migration |
| `isDisabled` in both systems? | Two sources of truth | Keep consult's as application-level; loa-auth's as auth-level |
| Email domain validation? | loa-auth may not enforce | Keep domain validation in consult app |
| Existing sessions during cut-over? | Users logged in with old system | Force re-login (cut over, no gradual migration) |

---

## Document Control

- **Status:** Draft v1.0
- **Created:** 2026-08-24
- **Aligns with:** `consult-readiness.md` §6-7

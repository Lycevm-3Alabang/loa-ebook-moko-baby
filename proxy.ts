import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt";
import { getUserAccess } from "@/lib/access"

const PUBLIC_PATHS = new Set([
  "/login", "/activate", "/forgot-password", "/change-password",
  "/setup-password", "/faq",
])

// `/api/v1` is the BFF passthrough (EC-API-001 D-1). It MUST stay public to
// this gate: its security is the Consult API's own `jwt.auth`/`jwt.endpoint`,
// applied upstream. Without it, a leftover legacy next-auth session (retired
// at T4) 403s every BFF call for non-admins via closed-by-default below —
// which silently breaks sign-in. EC-CUTOVER-001 DEC-6 deletes this gate at T3.
const PUBLIC_PREFIXES = ["/_next", "/api/auth", "/api/audit", "/api/bug-reports", "/api/v1", "/api/semesters/count-active", "/api/health"]

const SEMESTER_LOCKED_PATH = "/admin/data/academic-infrastructure"

async function activeSemesterCount(origin: string): Promise<number> {
  try {
    const res = await fetch(`${origin}/api/semesters/count-active`)
    if (!res.ok) return 1
    const { count } = await res.json()
    return count ?? 0
  } catch {
    return 1
  }
}

const ALLOWED_ON_LOCKED = new Set([
  SEMESTER_LOCKED_PATH,
  "/login", "/activate", "/forgot-password", "/change-password", "/setup-password",
])

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next()
  }

  if (pathname.includes(".")) return NextResponse.next()

  // T1-b: the client guard owns auth (JWT lives in memory, invisible
  // server-side). Legacy next-auth sessions still run the checks below
  // until T4; everyone else passes through to the client guard + backend
  // 403s. Revert: restore the /login redirect to return to legacy gating.
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  const token = await getToken({ req: request, secret })

  if (!token) {
    return NextResponse.next()
  }

  const rawRole = (token as Record<string, unknown>).role as string | undefined
  const userId = (token as Record<string, unknown>).id as string
  const isAdmin = rawRole?.includes('ADMIN')

  // Enforce exactly 1 active semester — only /admin/data/academic-infrastructure is accessible otherwise
  // API routes are exempt (they return JSON errors independently)
  if (!pathname.startsWith("/api/")) {
    const activeCount = await activeSemesterCount(request.nextUrl.origin)
    if (activeCount !== 1) {
      if (!ALLOWED_ON_LOCKED.has(pathname) && !pathname.startsWith(SEMESTER_LOCKED_PATH + "/")) {
        return NextResponse.redirect(new URL(SEMESTER_LOCKED_PATH, request.url))
      }
    }
  }

  const access = await getUserAccess(userId, rawRole ?? "GUEST")

  // Most specific path match first (longest url wins)
  function matchAccessUrl(pattern: string, p: string): boolean {
    if (p === pattern || p.startsWith(pattern + "/")) return true
    // Handle route parameter patterns like /api/appointments/[id]
    if (pattern.includes("[")) {
      const escaped = pattern.replace(/[.+?^${}()|\\]/g, "\\$&")
      const regex = new RegExp("^" + escaped.replace(/\[.*?\]/g, "[^/]+") + "(/.*)?$")
      if (regex.test(p)) return true
    }
    return false
  }

  const matched = [...access]
    .sort((a, b) => b.url.length - a.url.length)
    .find(a => matchAccessUrl(a.url, pathname))

  if (matched) {
    if (matched.access === "granted") return NextResponse.next()
    // Explicitly revoked
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({
        error: 'Forbidden',
        message: 'This route is locked in the access configuration.',
        path: pathname,
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    return NextResponse.next();
  }

  // ADMIN fallback: allow any path not explicitly tracked
  if (isAdmin) return NextResponse.next()

  // Closed-by-default: deny API; let UI pages through (LockedTab on client side)
  if (pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({
      error: 'Forbidden',
      message: 'Access is not configured for this route.',
      path: pathname,
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}

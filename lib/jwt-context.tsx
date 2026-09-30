"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { setAuthToken } from "@/lib/api/client"

// T1-b + EC-AUTH-001: Auth SSO source (frontend-transition.md DEC-3, cert
// FRONTEND-INTEGRATION pattern). Token lives in memory only; refresh rides the
// httpOnly refresh cookie the Consult API mints, forwarded same-origin through
// the BFF (EC-D2). Groups come from the JWT `groups` claim (Auth group names);
// UI labels map to legacy role names for display until T3 re-maps gating.
//
// EC-AUTH-001 CON-2: the cookie's name/attributes are the Consult API's
// (`auth-integration.md` v1.6 §3) — this module never sees them.

export interface JwtUser {
  id: string
  email: string
  name: string
  groups: string[]
}

type JwtStatus = "loading" | "authenticated" | "unauthenticated"

interface JwtSession {
  user: { id: string; email: string; name: string; role: string }
}

interface JwtContextValue {
  token: string | null
  user: JwtUser | null
  session: JwtSession | null
  status: JwtStatus
  primaryGroup: string | null
  hasGroup: (group: string) => boolean
  login: (payload: string) => Promise<void>
  logout: () => Promise<void>
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const LEGACY_LABEL: Record<string, string> = {
  "aces-admin": "ADMIN",
  "aces-dean": "DEAN",
  "aces-faculty": "FACULTY",
  "aces-user": "STUDENT",
}

const GROUP_PRIORITY = ["ADMIN", "DEAN", "FACULTY", "STUDENT", "GUEST"]

function primaryOf(labels: string[]): string | null {
  for (const p of GROUP_PRIORITY) if (labels.includes(p)) return p
  return labels[0] ?? null
}

function decodeGroups(token: string): string[] {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const claims = JSON.parse(atob(part)) as { groups?: unknown }
    return Array.isArray(claims.groups) ? claims.groups.filter((g): g is string => typeof g === "string") : []
  } catch {
    return []
  }
}

const JwtContext = createContext<JwtContextValue | null>(null)

const REFRESH_SKEW_MS = 60_000

// EC-API-001 DEC-1: the browser base is same-origin, so it is a constant
// rather than a configurable variable. `NEXT_PUBLIC_CONSULT_API_URL` was
// removed (EC-PLAT-001 DEC-6) — a public variable holding the API host is
// exactly what the BFF exists to prevent.
const API_BASE = "/api/v1"

interface CallbackData {
  access_token: string
  expires_in: number
  user: { id: string; email: string; name: string }
}

// The Consult API reports auth failures as `{ message }` (AuthCallbackController
// / AuthRefreshController), so surface that rather than a bare status.
class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "AuthError"
  }
}

async function postAuth(path: string, body?: unknown): Promise<CallbackData> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/auth/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new AuthError(0, `Auth ${path} unreachable`)
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    const message =
      (detail as { message?: string } | null)?.message ?? `Auth ${path} failed (${res.status})`
    throw new AuthError(res.status, message)
  }
  // logout answers 204 with no body; nothing to parse.
  if (res.status === 204) return { access_token: "", expires_in: 0, user: { id: "", email: "", name: "" } }
  const json = (await res.json()) as { status: string; data: CallbackData }
  return json.data
}

export function JwtProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<JwtUser | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [booted, setBooted] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshing = useRef<Promise<boolean> | null>(null)

  const applySession = useCallback((data: CallbackData) => {
    const groups = decodeGroups(data.access_token)
    setToken(data.access_token)
    setAuthToken(data.access_token)
    setUser({ id: data.user.id, email: data.user.email, name: data.user.name, groups })
    setExpiresAt(Date.now() + data.expires_in * 1000)
  }, [])

  const clearSession = useCallback(() => {
    setToken(null)
    setAuthToken(null)
    setUser(null)
    setExpiresAt(null)
  }, [])

  const login = useCallback(async (payload: string) => {
    const data = await postAuth("callback", { payload })
    Promise.resolve().then(() => applySession(data))
  }, [applySession])

  const silentRefresh = useCallback(async (): Promise<boolean> => {
    // EC-AUTH-001 CON-6: one in-flight attempt only. The boot effect and the
    // proactive timer can both reach for a refresh; a second concurrent call
    // would rotate the cookie twice and can bounce the session out.
    if (refreshing.current) return refreshing.current
    const attempt = (async () => {
      try {
        const data = await postAuth("refresh")
        applySession(data)
        return true
      } catch {
        clearSession()
        return false
      } finally {
        refreshing.current = null
      }
    })()
    refreshing.current = attempt
    return attempt
  }, [applySession, clearSession])

  const logout = useCallback(async () => {
    await postAuth("logout").catch(() => undefined)
    Promise.resolve().then(() => {
      clearSession()
      router.push("/login")
    })
  }, [clearSession, router])

  const apiFetch = useCallback((path: string, init?: RequestInit): Promise<Response> => {
    return fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { ...(init?.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
  }, [token])

  // Silent refresh on load (deferred per React 19 set-state-in-effect rule).
  // EC-AUTH-001 DEC-5: no configuration state in which this is skipped — the
  // base is same-origin, so there is nothing to bypass on.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      await silentRefresh()
      if (!cancelled) setBooted(true)
    })
    return () => { cancelled = true }
  }, [silentRefresh])

  // Proactive rotation before expiry.
  useEffect(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    if (!token || !expiresAt) return
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_SKEW_MS)
    refreshTimer.current = setTimeout(() => { Promise.resolve().then(() => silentRefresh()) }, delay)
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }
  }, [token, expiresAt, silentRefresh])

  const status: JwtStatus = !booted ? "loading" : user ? "authenticated" : "unauthenticated"

  const session: JwtSession | null = useMemo(() => {
    if (!user) return null
    const labels = user.groups.map((g) => LEGACY_LABEL[g] ?? g)
    return { user: { id: user.id, email: user.email, name: user.name, role: labels.join("|") } }
  }, [user])

  const value = useMemo<JwtContextValue>(() => ({
    token,
    user,
    session,
    status,
    primaryGroup: user ? primaryOf(user.groups.map((g) => LEGACY_LABEL[g] ?? g)) : null,
    hasGroup: (group: string) => user?.groups.includes(group) ?? false,
    login,
    logout,
    apiFetch,
  }), [token, user, session, status, login, logout, apiFetch])

  return <JwtContext.Provider value={value}>{children}</JwtContext.Provider>
}

export function useJwt(): JwtContextValue {
  const ctx = useContext(JwtContext)
  if (!ctx) throw new Error("useJwt must be used inside <JwtProvider>")
  return ctx
}

export function ssoLoginUrl(): string {
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.lyceumalabang.edu.ph"
  const redirect = typeof window !== "undefined" ? window.location.origin : ""
  return `${authUrl}/sso/login?redirect=${encodeURIComponent(redirect)}`
}

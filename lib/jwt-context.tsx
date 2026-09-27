"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { setAuthToken } from "@/lib/api/client"

// T1-b: Auth SSO source (frontend-transition.md DEC-3, cert FRONTEND-INTEGRATION
// §§1-6 pattern). Token lives in memory only; refresh rides the httpOnly
// `loa_connect_refresh` cookie (Option B direct + CORS → credentials:include).
// Groups come from the JWT `groups` claim (Auth group names like aces-admin);
// UI labels map to legacy role names for display until T3 re-maps gating.

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

const API_BASE = process.env.NEXT_PUBLIC_CONSULT_API_URL ?? ""
const REFRESH_SKEW_MS = 60_000

interface CallbackData {
  access_token: string
  expires_in: number
  user: { id: string; email: string; name: string }
}

async function postAuth(path: string, body?: unknown): Promise<CallbackData> {
  const res = await fetch(`${API_BASE}/api/v1/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Auth ${path} failed (${res.status})`)
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
    try {
      const data = await postAuth("refresh")
      applySession(data)
      return true
    } catch {
      clearSession()
      return false
    }
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
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (!API_BASE) {
        if (!cancelled) setBooted(true)
        return
      }
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

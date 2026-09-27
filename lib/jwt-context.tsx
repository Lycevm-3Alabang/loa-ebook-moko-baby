"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

// T1-a transition seam (frontend-transition.md DEC-3): JWT-shaped session
// context. The source is still next-auth (bridge below), so runtime behavior
// is unchanged; T1-b swaps the source to Auth SSO without touching the
// consumers again. Token stays null until T1-b delivers the callback flow.

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
  logout: () => Promise<void>
}

const GROUP_PRIORITY = ["ADMIN", "DEAN", "FACULTY", "STUDENT", "GUEST"]

function primaryOf(groups: string[]): string | null {
  for (const p of GROUP_PRIORITY) if (groups.includes(p)) return p
  return groups[0] ?? null
}

const JwtContext = createContext<JwtContextValue | null>(null)

const API_BASE = process.env.NEXT_PUBLIC_CONSULT_API_URL ?? ""

export function JwtProvider({ children }: { children: React.ReactNode }) {
  const { data: legacy, status: legacyStatus } = useSession()
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  const user: JwtUser | null = useMemo(() => {
    const u = legacy?.user as unknown as { id?: string; email?: string; name?: string; role?: string } | undefined
    if (!u?.id) return null
    const groups = (u.role ?? "").split("|").filter(Boolean)
    return { id: u.id, email: u.email ?? "", name: u.name ?? "", groups }
  }, [legacy])

  const status: JwtStatus = legacyStatus === "loading" ? "loading" : user ? "authenticated" : "unauthenticated"

  const session: JwtSession | null = useMemo(() => {
    if (!user) return null
    return { user: { id: user.id, email: user.email, name: user.name, role: user.groups.join("|") } }
  }, [user])

  const logout = useCallback(async () => {
    // T1-b completes this against Auth SSO (callback/refresh/logout trio).
    if (token && API_BASE) {
      await fetch(`${API_BASE}/api/v1/auth/logout`, { method: "POST" }).catch(() => {})
    }
    setToken(null)
    router.push("/login")
  }, [token, router])

  const value = useMemo<JwtContextValue>(() => ({
    token,
    user,
    session,
    status,
    primaryGroup: user ? primaryOf(user.groups) : null,
    hasGroup: (group: string) => user?.groups.includes(group) ?? false,
    logout,
  }), [token, user, session, status, logout])

  return <JwtContext.Provider value={value}>{children}</JwtContext.Provider>
}

export function useJwt(): JwtContextValue {
  const ctx = useContext(JwtContext)
  if (!ctx) throw new Error("useJwt must be used inside <JwtProvider>")
  return ctx
}

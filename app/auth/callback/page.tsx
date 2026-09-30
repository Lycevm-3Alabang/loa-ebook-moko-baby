"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useJwt } from "@/lib/jwt-context"

// SSO landing: Auth redirects here as origin#payload=<blob>.
// Extract the fragment (never sent to any server as a URL) and exchange it
// once via POST /api/v1/auth/callback, then enter the app.
// EC-AUTH-001 DEC-1: replaceState (not `location.hash = ""`) so the payload
// leaves no history entry for the back button to replay.
function CallbackRunner() {
  const router = useRouter()
  const { login, status } = useJwt()
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      const match = window.location.hash.match(/#payload=([^&]+)/)
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      if (!match) {
        if (!cancelled) setError("Missing SSO payload. Please sign in again.")
        return
      }
      try {
        await login(decodeURIComponent(match[1]))
        if (!cancelled) router.replace("/")
      } catch (e) {
        // Surface the Consult API's own reason (stale payload, tampered,
        // tenant mismatch) — a generic message sends people to retry blindly.
        const reason = e instanceof Error ? e.message : ""
        if (!cancelled) setError(reason || "Sign-in failed. Please try again.")
      }
    })
    return () => { cancelled = true }
  }, [login, router])

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12">
        <p className="text-sm text-tertiary">{error}</p>
        <Link href="/login" className="btn-ios-plain text-sm font-semibold mt-4">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <svg className="animate-spin ios-spinner w-6 h-6 text-gold-600" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="sr-only">Completing sign in… ({status})</span>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackRunner />
    </Suspense>
  )
}

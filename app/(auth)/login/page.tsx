"use client"

import SubmitButton from "@/components/ui/SubmitButton"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ssoLoginUrl, useJwt } from "@/lib/jwt-context"

// T1-b: password form replaced by Auth SSO. The button leaves to the Auth
// portal; the portal returns to /auth/callback#payload=<blob>.
function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { status } = useJwt()
  const [loading, setLoading] = useState(false)
  const error = searchParams.get("error")

  useEffect(() => {
    if (status === "authenticated") router.replace("/")
  }, [status, router])

  const handleSso = () => {
    if (loading) return
    setLoading(true)
    window.location.href = ssoLoginUrl()
  }

  return (
    <div className="min-h-dvh flex flex-col light-override">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <picture>
              <source srcSet="/logo-blk.webp" type="image/webp" />
              <img
                src="/logo-blk.png"
                alt="Lyceum of Alabang"
                width={244}
                height={112}
                fetchPriority="high"
                className="h-16 sm:h-20 object-contain"
              />
            </picture>
          </div>

          <h1 className="text-[34px] font-bold text-primary text-center tracking-tight leading-tight">Sign In</h1>
          <p className="text-base text-tertiary text-center mt-1">LOA Connect Hub</p>

          {error && (
            <div className="mt-6 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Your session expired. Please sign in again.
            </div>
          )}

          <SubmitButton type="button" onClick={handleSso} loading={loading} variant="ios-primary" className="w-full py-3 mt-6 text-base font-semibold">
            {loading ? "Redirecting..." : "Sign in with LOA"}
          </SubmitButton>

          <div className="text-center mt-6 space-y-4">
            <Link href="/forgot-password" className="btn-ios-plain text-sm font-semibold">
              Forgot password?
            </Link>
            <p className="text-sm text-tertiary font-medium">
              First time here?{" "}
              <Link href="/activate" className="text-brand-600 font-semibold hover:text-brand-700 transition-colors">
                Activate your account
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-tertiary"></p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm flex items-center justify-center py-12">
        <svg className="animate-spin ios-spinner w-6 h-6 text-gold-600" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

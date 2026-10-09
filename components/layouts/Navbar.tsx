"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"

export function Navbar() {
  const { data: session, status } = useSession()

  if (status === "loading" || session) {
    return null
  }

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gold-600 flex items-center justify-center shadow-md shadow-gold-100 group-hover:scale-[1.02] transition-transform">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-base font-bold text-primary tracking-tight font-display">ACES</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary text-xs px-3.5 py-1.5">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary text-xs px-3.5 py-1.5">
              Register
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

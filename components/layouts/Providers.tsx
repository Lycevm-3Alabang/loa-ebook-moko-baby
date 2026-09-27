"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { JwtProvider, useJwt } from "@/lib/jwt-context"
import { SWRConfig } from "swr"
import { fetcher, setUserRole } from "@/lib/api/client"
import { SidebarProvider } from "@/lib/contexts/sidebar"
import { PageTitleProvider } from "@/lib/contexts/page-title"
import ToastContainer from "@/components/ui/Toast"

function SessionRoleSetter({ children }: { children: React.ReactNode }) {
  const { session } = useJwt()
  useEffect(() => {
    setUserRole(((session?.user as Record<string, unknown> | undefined)?.role as string) ?? null)
  }, [session])
  return <>{children}</>
}

function RefreshListener({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    const handler = () => router.refresh()
    window.addEventListener("app:refresh", handler)
    return () => window.removeEventListener("app:refresh", handler)
  }, [router])
  return <>{children}</>
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <JwtProvider>
        <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>
          <SessionRoleSetter>
            <SidebarProvider>
              <PageTitleProvider>
                <RefreshListener>
                  {children}
                  <ToastContainer />
                </RefreshListener>
              </PageTitleProvider>
            </SidebarProvider>
          </SessionRoleSetter>
        </SWRConfig>
      </JwtProvider>
    </SessionProvider>
  )
}

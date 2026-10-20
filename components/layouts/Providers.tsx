"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SessionProvider, useSession } from "next-auth/react"
import { SWRConfig } from "swr"
import { fetcher, setUserRole } from "@/lib/api/client"
import { SidebarProvider } from "@/lib/contexts/sidebar"
import { PageTitleProvider } from "@/lib/contexts/page-title"
import { BreadcrumbProvider } from "@/lib/contexts/breadcrumb"
import ToastContainer from "@/components/ui/Toast"

function SessionRoleSetter({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
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
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>
        <SessionRoleSetter>
          <SidebarProvider>
            <PageTitleProvider>
              <BreadcrumbProvider>
                <RefreshListener>
                  {children}
                  <ToastContainer />
                </RefreshListener>
              </BreadcrumbProvider>
            </PageTitleProvider>
          </SidebarProvider>
        </SessionRoleSetter>
      </SWRConfig>
    </SessionProvider>
  )
}

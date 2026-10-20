"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export interface Crumb {
  label: string
  href?: string
}

interface BreadcrumbValue {
  crumbs: Record<string, Crumb>
  setCrumb: (segment: string, crumb: Crumb) => void
}

const BreadcrumbContext = createContext<BreadcrumbValue>({
  crumbs: {},
  setCrumb: () => {},
})

export function useBreadcrumbs() {
  return useContext(BreadcrumbContext).crumbs
}

/**
 * Registers a friendly label for a dynamic path segment (a department UUID,
 * a faculty-subject UUID, ...) so the breadcrumb bar shows a name/code
 * instead of the raw GUID. `href` overrides the generated link, which is
 * needed for segments whose target requires a query string.
 */
export function useCrumb(segment: string | undefined, crumb: Crumb | null | undefined) {
  const { setCrumb } = useContext(BreadcrumbContext)
  const label = crumb?.label ?? null
  const href = crumb?.href ?? null
  useEffect(() => {
    if (!segment || !label) return
    Promise.resolve().then(() => setCrumb(segment, { label, href: href ?? undefined }))
  }, [segment, label, href, setCrumb])
}

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Record<string, Crumb>>({})

  const setCrumb = useCallback((segment: string, crumb: Crumb) => {
    setCrumbs((prev) => {
      const current = prev[segment]
      if (current && current.label === crumb.label && current.href === crumb.href) return prev
      return { ...prev, [segment]: crumb }
    })
  }, [])

  const value = useMemo(() => ({ crumbs, setCrumb }), [crumbs, setCrumb])

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

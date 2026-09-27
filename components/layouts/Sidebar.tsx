"use client"

import { useJwt } from "@/lib/jwt-context"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useApiGet } from "@/lib/api/client"
import { getPrimaryRole } from "@/lib/utils/roles"
import { useSidebar } from "@/lib/contexts/sidebar"

interface NavItem {
  href?: string
  label: string
  icon?: string
  badge?: boolean
  children?: NavItem[]
}

function getReportChildren(role: string | null): NavItem[] {
  if (role === "ADMIN") {
    return [
      { href: "/admin/consultations", label: "All Consultations", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
      { href: "/admin/consultations/reports/health", label: "General Report", icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
      { href: "/admin/consultations/reports/backlog", label: "Backlog", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
      { href: "/admin/consultations/reports/coverage", label: "Coverage", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
      { href: "/admin/consultations/reports/demand", label: "Demand", icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" },
      { href: "/admin/consultations/reports/distribution", label: "Distribution Report", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
    ]
  }
  const base = "/dean"
  return [
    { href: `${base}/reports/health`, label: "General Report", icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { href: `${base}/reports/backlog`, label: "Backlog", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    { href: `${base}/reports/coverage`, label: "Coverage", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    { href: `${base}/reports/demand`, label: "Demand", icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" },
    { href: `${base}/reports/distribution`, label: "Distribution Report", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
  ]
}

const evalChartIcon = "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
const reportIcon = "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
function getEvaluationChildren(role: string | null): NavItem[] {
  if (role === "FACULTY") return []
  const items: NavItem[] = [
    { href: "/student/evaluations", label: "My Evaluation", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  ]
  if (role === "DEAN") {
    items.push({ href: "/dean/evaluations/results", label: "Results", icon: evalChartIcon })
    items.push({ href: "/dean/evaluations/rubrics", label: "Rubrics", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" })
    items.push({ href: "/dean/evaluations/reports", label: "Reports", icon: reportIcon })
  } else if (role === "ADMIN") {
    items.push({ href: "/admin/evaluations/results", label: "Results", icon: evalChartIcon })
    items.push({ href: "/admin/evaluations/periods", label: "Periods", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" })
    items.push({ href: "/admin/evaluations/rubrics", label: "Rubrics", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" })
    items.push({ href: "/admin/evaluations/disabled", label: "Invalidated", icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" })

  }
  return items
}

function getDataChildren(role: string | null): NavItem[] {
  const base = role === "DEAN" ? "/dean" : "/admin"
  return [
    { label: "Users", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", children: [
      { href: `${base}/data/users`, label: "Manage", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
      { href: `${base}/data/users/deleted`, label: "Deleted", icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" },
    ] },
    { href: `${base}/data/academic-infrastructure`, label: "Academic Configurations", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { href: "/dean/departments", label: "Departments", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { href: "/admin/data/maintenance", label: "Maintenance", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" },
  ]
}

function getSystemChildren(): NavItem[] {
  return [
    { href: "/admin/system/access-config", label: "Access Config", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94 1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    { href: "/admin/system/audit-trail", label: "Audit Trail", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { href: "/admin/system/reported-bugs", label: "Reported Bugs", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" },
    { href: "/faculty/availability", label: "Availability Rules", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    { href: "/faq", label: "FAQ", icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  ]
}

const hiddenHrefs = new Set(['/admin/consultations/reports', '/admin/evaluations', '/dean/reports', '/admin/system'])
const VALID_DASHBOARD_ROLES = ["ADMIN", "DEAN", "FACULTY", "STUDENT"] as const

export default function Sidebar() {
  const { session, status, logout } = useJwt()
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebar()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [popoverGroup, setPopoverGroup] = useState<string | null>(null)
  const [mobilePopoverGroup, setMobilePopoverGroup] = useState<string | null>(null)
  const [showMobileActions, setShowMobileActions] = useState(false)
  const [evalAvailable, setEvalAvailable] = useState<boolean | null>(null)
  const [manageUsersOpen, setManageUsersOpen] = useState(false)

  const { data: accessData } = useApiGet<{ access: { url: string; access: string; type: string }[] }>(
    session ? "/api/auth/access" : null
  )
  const allowedPages = accessData?.access?.filter(a => a.access === "granted" && a.type === "ui").map(a => a.url) ?? null

  const toggleGroup = useCallback((name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => { setPopoverGroup(null); setManageUsersOpen(false) })
  }, [pathname])

  useEffect(() => {
    Promise.resolve().then(() => { setMobilePopoverGroup(null); setShowMobileActions(false) })
  }, [pathname])

  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!popoverGroup) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverGroup(null)
      }
    }
    document.addEventListener("mousedown", handler, true)
    return () => document.removeEventListener("mousedown", handler, true)
  }, [popoverGroup])

  const mobilePopoverRef = useRef<HTMLDivElement>(null)
  const actionsPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mobilePopoverGroup) return
    const handler = (e: MouseEvent) => {
      if (mobilePopoverRef.current && !mobilePopoverRef.current.contains(e.target as Node)) {
        setMobilePopoverGroup(null)
      }
    }
    document.addEventListener("mousedown", handler, true)
    return () => document.removeEventListener("mousedown", handler, true)
  }, [mobilePopoverGroup])

  useEffect(() => {
    if (!showMobileActions) return
    const handler = (e: MouseEvent) => {
      if (actionsPopoverRef.current && !actionsPopoverRef.current.contains(e.target as Node)) {
        setShowMobileActions(false)
      }
    }
    document.addEventListener("mousedown", handler, true)
    return () => document.removeEventListener("mousedown", handler, true)
  }, [showMobileActions])

  useEffect(() => {
    Promise.resolve().then(async () => {
      try {
        const res = await fetch("/api/semesters")
        const { data: semesters } = await res.json()
        const active = Array.isArray(semesters) ? semesters.find((s: { isActive: boolean }) => s.isActive) : null
        if (!active?.evalStartDate) {
          setEvalAvailable(false)
          return
        }
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const [sy, sm, sd] = active.evalStartDate.split('-').map(Number)
        const start = new Date(sy, sm - 1, sd)
        start.setHours(0, 0, 0, 0)
        if (active.evalEndDate) {
          const [ey, em, ed] = active.evalEndDate.split('-').map(Number)
          const end = new Date(ey, em - 1, ed)
          end.setHours(23, 59, 59, 999)
          setEvalAvailable(today.getTime() >= start.getTime() && today.getTime() <= end.getTime())
        } else {
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          setEvalAvailable(
            start.getTime() === today.getTime() || start.getTime() === yesterday.getTime()
          )
        }
      } catch {
        setEvalAvailable(false)
      }
    })
  }, [])

  const su = session?.user as Record<string, unknown> | undefined
  const role = su?.role as string | null

  const primaryRole = role ? getPrimaryRole(role) : null
  const reportChildren = useMemo(() => getReportChildren(primaryRole), [primaryRole])
  const reportHrefs = useMemo(() => new Set(reportChildren.map((c) => c.href!)), [reportChildren])
  const reportsLabel = primaryRole === "ADMIN" ? "Consultations" : "Reports"
  const evaluationChildren = useMemo(() => getEvaluationChildren(primaryRole), [primaryRole])
  const evaluationHrefs = useMemo(() => new Set(evaluationChildren.map((c) => c.href!)), [evaluationChildren])
  const dataChildren = useMemo(() => getDataChildren(primaryRole), [primaryRole])
  const dataHrefs = useMemo(() => {
    const hrefs: string[] = []
    for (const c of dataChildren) {
      if (c.href) hrefs.push(c.href)
      if (c.children) c.children.forEach((gc) => { if (gc.href) hrefs.push(gc.href) })
    }
    return new Set(hrefs)
  }, [dataChildren])
  const systemChildren = useMemo(() => getSystemChildren(), [])
  const systemHrefs = useMemo(() => new Set(systemChildren.map((c) => c.href!)), [systemChildren])
  const dashHref = primaryRole ? `/${primaryRole.toLowerCase()}` : "/"
  const allRoles = role ? role.split("|") : []
  const DASHBOARD_ICON = "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
  const dashboardRoleSet = new Set<string>(VALID_DASHBOARD_ROLES)
  const dashboardRoles = allRoles.filter((r) => dashboardRoleSet.has(r))

  const dashboardChildren = useMemo<NavItem[]>(() => {
    const children: NavItem[] = dashboardRoles.map((r) => ({
      href: `/${r.toLowerCase()}`,
      label: `${r.charAt(0) + r.slice(1).toLowerCase()} Dashboard`,
      icon: DASHBOARD_ICON,
    }))
    if (allowedPages) {
      for (const p of allowedPages) {
        if (VALID_DASHBOARD_ROLES.some(r => p === `/${r.toLowerCase()}`) && !children.some(c => c.href === p)) {
          children.push({
            href: p,
            label: `${p.slice(1).charAt(0).toUpperCase() + p.slice(2)} Dashboard`,
            icon: DASHBOARD_ICON,
          })
        }
      }
    }
    return children
  }, [dashboardRoles, allowedPages])
  const visibleDashboardChildren = useMemo<NavItem[]>(
    () => dashboardChildren.filter((c) => allowedPages && allowedPages.includes(c.href!)),
    [dashboardChildren, allowedPages]
  )
  const singleDashboard = visibleDashboardChildren.length === 1 ? visibleDashboardChildren[0] : null
  const dashboardHrefs = useMemo(() => new Set(dashboardChildren.map((c) => c.href!)), [dashboardChildren])
  const isInDashboard = dashboardHrefs.has(pathname)
  const dashboardVisible = visibleDashboardChildren.length > 1
  const dashboardOpen = expandedGroups.has("dashboard") || isInDashboard

  const ALL_NAV_ITEMS = useMemo<(NavItem & { group?: string })[]>(() => {
    const items: (NavItem & { group?: string })[] = []
    if (!dashboardVisible) {
      items.push({ href: singleDashboard?.href ?? dashHref, label: "Dashboard", icon: DASHBOARD_ICON })
    }
    items.push(
      { href: "/student/meetings", label: "Consultations", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
      { href: "/student/history", label: "Timeline", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
    { href: "/faculty/meetings", label: "Meetings", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    )
    if (primaryRole === "FACULTY") {
      items.push(
        { href: "/faculty/evaluations/results", label: "Evaluation", icon: evalChartIcon },
        { href: "/faculty/evaluations/reports", label: "Reports", icon: reportIcon },
      )
    }
    return items
  }, [dashboardVisible, singleDashboard, dashHref, primaryRole])

  const flatItems = useMemo(() =>
    ALL_NAV_ITEMS.filter(
      (item) => (allowedPages && allowedPages.includes(item.href!)) && !reportHrefs.has(item.href!) && !evaluationHrefs.has(item.href!) && !dataHrefs.has(item.href!) && !systemHrefs.has(item.href!) && !hiddenHrefs.has(item.href!)
    ),
    [ALL_NAV_ITEMS, allowedPages, reportHrefs, evaluationHrefs, dataHrefs, systemHrefs]
  )

  const isInReports = pathname.startsWith("/admin/consultations") || pathname.startsWith("/dean/reports") || pathname.startsWith("/faculty/reports")
  const reportsVisible = reportChildren.some((c) => allowedPages && allowedPages.includes(c.href!))
  const reportsOpen = expandedGroups.has("reports") || isInReports

  const isInEvaluations = pathname.startsWith("/admin/evaluations") || pathname.startsWith("/faculty/evaluations") || pathname.startsWith("/student/evaluations")
  const evaluationsVisible = (evalAvailable !== false || isInEvaluations) && evaluationChildren.some((c) => {
    if (allowedPages && allowedPages.includes(c.href!)) {
      return !hiddenHrefs.has(c.href!)
    }
    return false
  })
  const evaluationsOpen = expandedGroups.has("evaluations") || isInEvaluations

  const isInData = pathname.startsWith("/admin/data") || pathname.startsWith("/dean/data") || pathname.startsWith("/admin/departments") || pathname.startsWith("/dean/departments")
  const dataVisible = dataChildren.some((c) => {
    if (allowedPages && allowedPages.includes(c.href!)) return true
    if (c.children) return c.children.some((gc) => allowedPages && allowedPages.includes(gc.href!))
    return false
  })
  const dataOpen = expandedGroups.has("data") || isInData

  const isInSystem = pathname.startsWith("/admin/system") || pathname.startsWith("/faculty/availability") || pathname === "/faq"
  const systemVisible = systemChildren.some((c) => allowedPages && allowedPages.includes(c.href!))
  const systemOpen = expandedGroups.has("system") || isInSystem

  const tabItems = useMemo(() => {
    const items = flatItems.slice(0, 4)
    if (dashboardVisible) {
      items.unshift({ href: "#dashboard", label: "Dashboard", icon: DASHBOARD_ICON })
    }
    if (dataVisible) {
      items.push({ href: "#data", label: "Data", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" })
    }
    if (systemVisible) {
      items.push({ href: "#system", label: "System", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" })
    }
    if (reportsVisible) {
      items.push({ href: "#reports", label: reportsLabel, icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" })
    }
    if (evaluationsVisible) {
      if (primaryRole === "STUDENT") {
        const studentEval = evaluationChildren.find((c) => c.href === "/student/evaluations")
        if (studentEval) {
          items.push({ href: studentEval.href!, label: "My Eval", icon: studentEval.icon! })
        }
      } else {
        items.push({ href: "#evaluations", label: "Evaluations", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" })
      }
    }
    return items
  }, [flatItems, dashboardVisible, dataVisible, systemVisible, reportsVisible, evaluationsVisible, primaryRole, evaluationChildren, reportsLabel])

  if (status === "loading" || !session || !allowedPages) {
    return (
      <>
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 h-14 ios-blur bg-tab-bar border-t border-default animate-pulse" />
        <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-800 flex-col animate-pulse">
          <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-800 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-slate-800" />
            <div className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-slate-800" />
              <div className="h-2 w-16 rounded bg-slate-800" />
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <div className="px-3 mb-3">
              <div className="h-2 w-16 rounded bg-slate-800" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 min-h-[44px] rounded-lg">
                <div className="w-4 h-4 rounded bg-slate-800 shrink-0" />
                <div className="h-3.5 w-28 rounded bg-slate-800" />
              </div>
            ))}
          </nav>
          <div className="p-4 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-800 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-24 rounded bg-slate-800" />
                <div className="h-2.5 w-14 rounded bg-slate-800" />
              </div>
            </div>
          </div>
        </aside>
      </>
    )
  }

  if (!role || !primaryRole) return null

  const isActiveTab = (href: string) => {
    if (href === "#dashboard") return isInDashboard
    if (href === "#system") return isInSystem
    if (href === "#reports") return isInReports
    if (href === "#evaluations") return isInEvaluations
    if (href === "#data") return isInData
    return pathname === href
  }

  return (
    <>
      {/* MOBILE: iOS 18+ Tab Bar */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 ios-blur bg-tab-bar border-t border-default pb-safe">
        <nav className="flex items-center justify-around h-14 px-1 max-w-lg mx-auto">
          {tabItems.map((item) => {
            const active = isActiveTab(item.href!)
            const isGroup = item.href?.startsWith("#")
            return isGroup ? (
              <button
                key={item.href}
                type="button"
                onClick={() => setMobilePopoverGroup(mobilePopoverGroup === item.href ? null : item.href ?? null)}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 ios-tab-item ${
                  active ? "text-gold-600" : "text-tertiary"
                }`}
              >
                <div className="relative flex items-center justify-center w-6 h-6">
                  <svg className="w-6 h-6 ios-tab-icon" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.2" : "1"} stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon!} />
                  </svg>
                </div>
                <span className={`flex items-center gap-1 text-[10px] leading-none transition-all duration-300 ${
                  active ? "font-semibold scale-100" : "font-medium scale-95 opacity-70"
                }`}>
                  {item.label}
                </span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 ios-tab-item ${
                  active ? "text-gold-600" : "text-tertiary"
                }`}
              >
                <div className="relative flex items-center justify-center w-6 h-6">
                  <svg className="w-6 h-6 ios-tab-icon" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.2" : "1"} stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon!} />
                  </svg>
                  {(item.href === "/student/evaluations") && evalAvailable === false && primaryRole === "STUDENT" && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-slate-400 rounded-full border-1.5 border-white dark:border-black" />
                  )}
                </div>
                <span className={`flex items-center gap-1 text-[10px] leading-none transition-all duration-300 ${
                  active ? "font-semibold scale-100" : "font-medium scale-95 opacity-70"
                }`}>
                  {item.label}
                  {(item.href === "/student/evaluations") && primaryRole === "STUDENT" && evalAvailable === true && (
                    <svg className="w-2.5 h-2.5 text-gold-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  )}
                  {(item.href === "/student/evaluations") && primaryRole === "STUDENT" && evalAvailable === false && (
                    <svg className="w-2.5 h-2.5 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  )}
                </span>
              </Link>
            )
          })}

          {/* MORE BUTTON */}
          <button
            type="button"
            onClick={() => { setShowMobileActions(!showMobileActions); setMobilePopoverGroup(null) }}
            className="relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 ios-tab-item text-tertiary"
          >
            <div className="relative flex items-center justify-center w-6 h-6">
              <svg className="w-6 h-6 ios-tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h.01M12 12h.01M18 12h.01" />
              </svg>
            </div>
            <span className="flex items-center gap-1 text-[10px] leading-none font-medium scale-95 opacity-70">More</span>
          </button>
        </nav>

        {showMobileActions && (
          <div
            ref={actionsPopoverRef}
            className="fixed bottom-16 inset-x-4 z-50 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl py-2"
          >
            <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-tertiary">Quick Actions</p>

            <button
              type="button"
              onClick={() => {
                const isDark = document.documentElement.classList.toggle("dark")
                localStorage.setItem("theme", isDark ? "dark" : "light")
                setShowMobileActions(false)
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-tertiary hover:bg-slate-800/50 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <span>Toggle Theme</span>
            </button>

            <button
              type="button"
              onClick={() => { localStorage.removeItem("eval_rubric_cache"); logout() }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        )}

        {mobilePopoverGroup && (
          <div
            ref={mobilePopoverRef}
            className="fixed bottom-16 inset-x-4 z-50 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl py-2"
          >
            <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-tertiary">
              {mobilePopoverGroup === "#dashboard" ? "Dashboard" : mobilePopoverGroup === "#data" ? "Data Management" : mobilePopoverGroup === "#system" ? "System" : mobilePopoverGroup === "#reports" ? reportsLabel : "Evaluations"}
            </p>
            {(mobilePopoverGroup === "#dashboard" ? visibleDashboardChildren : mobilePopoverGroup === "#data" ? dataChildren : mobilePopoverGroup === "#system" ? systemChildren : mobilePopoverGroup === "#reports" ? reportChildren : evaluationChildren)
              .filter((c) => {
                if (mobilePopoverGroup === "#dashboard") return (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!)
                if (c.children) return c.children.some((gc) => allowedPages && allowedPages.includes(gc.href!) && !hiddenHrefs.has(gc.href!))
                return (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!)
              })
              .flatMap((child) => [
                ...(child.href ? [child] : []),
                ...(child.children?.filter((gc) => (allowedPages && allowedPages.includes(gc.href!)) && !hiddenHrefs.has(gc.href!)) ?? []),
              ])
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href!}
                  onClick={() => setMobilePopoverGroup(null)}
                  className={`flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? "bg-gold-600/10 text-gold-400"
                      : "text-tertiary hover:bg-slate-800/50 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon!} />
                  </svg>
                  <span>{item.label}</span>
                </Link>
              ))}
          </div>
        )}
      </div>

      {/* DESKTOP: Sidebar */}
      <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-40 bg-slate-950 border-r border-slate-800 flex-col transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}>
        <div className={`flex items-center h-16 border-b border-slate-800 shrink-0 ${collapsed ? "justify-center" : "gap-3 px-6"}`}>
          <div className="w-9 h-9 rounded-xl bg-gold-600 flex items-center justify-center shadow-lg shadow-gold-500/20 shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-white tracking-tight">LOA Connect Hub</span>
              <p className="text-[10px] text-tertiary font-medium">Connect. Collaborate. Succeed.</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {!collapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-tertiary mb-2">Main Menu</p>}

          {/* DUPLICATE STUDENT-SPECIFIC TOP EVALUATIONS BLOCK REMOVED FROM HERE */}

          {dashboardVisible && !collapsed && (
            <div>
              <button
                onClick={() => toggleGroup("dashboard")}
                className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                  isInDashboard
                    ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                    : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={DASHBOARD_ICON} />
                </svg>
                <span className="flex-1 text-left">Dashboard</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${dashboardOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dashboardOpen && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                  {visibleDashboardChildren.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href!}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          pathname === child.href
                            ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                            : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                        </svg>
                        {child.label}
                      </Link>
                    ))}
                </div>
              )}
            </div>
          )}

          {dashboardVisible && collapsed && (
            <button
              type="button"
              onClick={() => setPopoverGroup(popoverGroup === "dashboard" ? null : "dashboard")}
              className={`flex items-center justify-center w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isInDashboard || popoverGroup === "dashboard"
                  ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              }`}
              title="Dashboard"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={DASHBOARD_ICON} />
              </svg>
            </button>
          )}

          {flatItems.map((link) => (
            <Link
              key={link.href}
              href={link.href!}
              className={`flex items-center min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              } ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
              title={collapsed ? link.label : undefined}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={link.icon!} />
              </svg>
              {!collapsed && link.label}
            </Link>
          ))}

          {dataVisible && !collapsed && (
            <div>
              <button
                onClick={() => toggleGroup("data")}
                className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                  isInData
                    ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                    : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <span className="flex-1 text-left">Data Management</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${dataOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dataOpen && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                  {dataChildren
                    .filter((c) => {
                      if (c.children) return c.children.some((gc) => allowedPages && allowedPages.includes(gc.href!) && !hiddenHrefs.has(gc.href!))
                      return (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!)
                    })
                    .map((child) => (
                    child.children ? (
                      <div key={child.label}>
                        <button
                          onClick={() => setManageUsersOpen((prev) => !prev)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            pathname.startsWith(child.href!)
                              ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                              : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                          </svg>
                          <span className="flex-1 text-left">{child.label}</span>
                          <svg
                            className={`w-3 h-3 transition-transform duration-200 ${manageUsersOpen ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {manageUsersOpen && (
                          <div className="ml-2 mt-0.5 space-y-0.5 border-l border-slate-700 pl-2">
                            {child.children
                              .filter((gc) => (allowedPages && allowedPages.includes(gc.href!)) && !hiddenHrefs.has(gc.href!))
                              .map((grandchild) => (
                              <Link
                                key={grandchild.href}
                                href={grandchild.href!}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  pathname === grandchild.href
                                    ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                                    : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                                }`}
                              >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d={grandchild.icon!} />
                                </svg>
                                {grandchild.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Link
                        key={child.href}
                        href={child.href!}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          pathname === child.href
                            ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                            : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                        </svg>
                        {child.label}
                      </Link>
                    )
                  ))}
                </div>
              )}
          </div>
        )}

        {dataVisible && collapsed && (
            <button
              type="button"
              onClick={() => setPopoverGroup(popoverGroup === "data" ? null : "data")}
              className={`flex items-center justify-center w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isInData || popoverGroup === "data"
                  ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              }`}
              title="Data Management"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </button>
          )}

          {systemVisible && !collapsed && (
            <div>
              <button
                onClick={() => toggleGroup("system")}
                className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                  isInSystem
                    ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                    : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="flex-1 text-left">System</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${systemOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {systemOpen && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                  {systemChildren
                    .filter((c) => (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!))
                    .map((child) => (
                    <Link
                      key={child.href}
                      href={child.href!}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        pathname === child.href
                          ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                          : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                      </svg>
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {systemVisible && collapsed && (
            <button
              type="button"
              onClick={() => setPopoverGroup(popoverGroup === "system" ? null : "system")}
              className={`flex items-center justify-center w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isInSystem || popoverGroup === "system"
                  ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              }`}
              title="System"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {reportsVisible && !collapsed && (
            <div>
              <button
                onClick={() => toggleGroup("reports")}
                className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                  isInReports
                    ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                    : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="flex-1 text-left">{reportsLabel}</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${reportsOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {reportsOpen && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                  {reportChildren
                    .filter((c) => (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!))
                    .map((child) => (
                      <Link
                        key={child.href}
                        href={child.href!}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          pathname === child.href
                            ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                            : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                        </svg>
                        {child.label}
                      </Link>
                    ))}
                </div>
              )}
            </div>
          )}

          {reportsVisible && collapsed && (
            <button
              type="button"
              onClick={() => setPopoverGroup(popoverGroup === "reports" ? null : "reports")}
              className={`flex items-center justify-center w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isInReports || popoverGroup === "reports"
                  ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              }`}
              title={reportsLabel}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          )}

          {/* SINGLE TARGET EVALUATIONS BLOCK */}
          {evaluationsVisible && !collapsed && (
            <div>
              {primaryRole === "STUDENT" ? (
                evaluationChildren
                  .filter((c) => (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!))
                  .map((child) => (
                    <Link
                      key={child.href}
                      href={child.href!}
                      className={`flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                        pathname === child.href
                          ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                          : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                      </svg>
                      <span className="flex items-center gap-1.5 flex-1">
                        {child.label}
                        {child.href === "/student/evaluations" && evalAvailable === true && (
                          <svg className="w-3 h-3 text-gold-400 animate-pulse shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                          </svg>
                        )}
                        {child.href === "/student/evaluations" && evalAvailable === false && (
                          <svg className="w-3 h-3 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        )}
                      </span>
                    </Link>
                  ))
              ) : (
                <>
                  <button
                    onClick={() => toggleGroup("evaluations")}
                    className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                      isInEvaluations
                        ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                        : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span className="flex-1 text-left">Evaluations</span>
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${evaluationsOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {evaluationsOpen && (
                    <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                      {evaluationChildren
                        .filter((c) => (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!))
                        .map((child) => (
                          <Link
                            key={child.href}
                      href={child.href!}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              pathname === child.href
                                ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                                : "text-tertiary hover:bg-slate-800/50 hover:text-white border border-transparent"
                            }`}
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                            </svg>
                            <span className="flex items-center gap-1.5">
                              {child.label}
                              {child.href === "/student/evaluations" && evalAvailable === true && (
                                <svg className="w-3 h-3 text-gold-400 animate-pulse shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                </svg>
                              )}
                              {child.href === "/student/evaluations" && evalAvailable === false && (
                                <svg className="w-3 h-3 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                              )}
                            </span>
                          </Link>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {evaluationsVisible && collapsed && (
            <>
              {primaryRole === "STUDENT" ? (
                evaluationChildren
                  .filter((c) => (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!))
                  .map((child) => (
                    <Link
                      key={child.href}
                      href={child.href!}
                      className={`flex items-center justify-center w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                        pathname === child.href
                          ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                          : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
                      }`}
                      title={child.label}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={child.icon!} />
                      </svg>
                    </Link>
                  ))
              ) : (
                <button
                  type="button"
                  onClick={() => setPopoverGroup(popoverGroup === "evaluations" ? null : "evaluations")}
                  className={`flex items-center justify-center w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                    isInEvaluations || popoverGroup === "evaluations"
                      ? "bg-gold-600/10 text-gold-400 border border-gold-500/20"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
                  }`}
                  title="Evaluations"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </button>
              )}
            </>
          )}
        </nav>

        {collapsed && popoverGroup && (
          <div
            ref={popoverRef}
            className="fixed left-16 top-24 z-50 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl py-2 min-w-48"
          >
            <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-tertiary">
              {popoverGroup === "dashboard" ? "Dashboard" : popoverGroup === "data" ? "Data Management" : popoverGroup === "system" ? "System" : popoverGroup === "reports" ? reportsLabel : "Evaluations"}
            </p>
            {(popoverGroup === "dashboard" ? visibleDashboardChildren : popoverGroup === "data" ? dataChildren : popoverGroup === "system" ? systemChildren : popoverGroup === "reports" ? reportChildren : evaluationChildren)
              .filter((c) => {
                if (popoverGroup === "dashboard") return (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!)
                if (c.children) return c.children.some((gc) => allowedPages && allowedPages.includes(gc.href!) && !hiddenHrefs.has(gc.href!))
                return (allowedPages && allowedPages.includes(c.href!)) && !hiddenHrefs.has(c.href!)
              })
              .flatMap((child) => [
                ...(child.href ? [child] : []),
                ...(child.children?.filter((gc) => (allowedPages && allowedPages.includes(gc.href!)) && !hiddenHrefs.has(gc.href!)) ?? []),
              ])
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href!}
                  onClick={() => setPopoverGroup(null)}
                  className={`flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? "bg-gold-600/10 text-gold-400"
                      : "text-tertiary hover:bg-slate-800/50 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon!} />
                  </svg>
                  <span className="flex items-center gap-1.5">
                    {item.label}
                    {item.href === "/student/evaluations" && primaryRole === "STUDENT" && evalAvailable === true && (
                      <svg className="w-3 h-3 text-gold-400 animate-pulse shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    )}
                    {item.href === "/student/evaluations" && primaryRole === "STUDENT" && evalAvailable === false && (
                      <svg className="w-3 h-3 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    )}
                  </span>
                </Link>
              ))}
          </div>
        )}

        <div className={`border-t border-slate-800 shrink-0 space-y-1 ${collapsed ? "p-2" : "p-4"}`}>
          <button
            type="button"
            onClick={toggle}
            className={`flex items-center min-h-[44px] rounded-lg text-xs font-medium text-tertiary hover:text-white hover:bg-slate-800/50 transition-colors border border-slate-800 ${
              collapsed ? "justify-center w-full p-0" : "justify-center gap-2 px-3 w-full"
            }`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              )}
            </svg>
            {!collapsed && "Collapse"}
          </button>
          <button
            onClick={() => logout()}
            className={`flex items-center min-h-[44px] rounded-lg text-xs font-medium text-tertiary hover:text-white hover:bg-slate-800/50 transition-colors border border-slate-800 ${
              collapsed ? "justify-center w-full p-0" : "justify-center gap-2 px-3 w-full"
            }`}
            title={collapsed ? "Sign out" : undefined}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>
    </>
  )
}
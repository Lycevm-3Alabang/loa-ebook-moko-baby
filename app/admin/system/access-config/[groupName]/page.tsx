"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Skeleton from "@/components/ui/Skeleton"
import SubmitButton from "@/components/ui/SubmitButton"
import ErrorState from "@/components/ui/ErrorState"
import ErrorBoundary from "@/components/ui/ErrorBoundary"
import { useApiGet, invalidate } from "@/lib/api/client"
import { getDefaultUIPages } from "@/lib/default-access"
import type { PageApiEntry } from "@/lib/page-api-map"

interface GroupAccess {
  groupName: string
  pages: string[]
  api_overrides: Record<string, Record<string, boolean>>
}

interface CatalogItem {
  path: string
  label: string
  description: string
  section: string
}

interface Catalog {
  pages: Record<string, CatalogItem[]>
}

const SECTION_ORDER = ["Root", "Dashboard", "Evaluations", "Data", "Reports", "Hidden"] as const

const badgeColors: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-700",
  DEAN: "bg-amber-100 text-amber-700",
  FACULTY: "bg-emerald-100 text-emerald-700",
  STUDENT: "bg-blue-100 text-blue-700",
  GUEST: "bg-surface text-secondary",
}

const ALWAYS_LOCKED_PAGES = new Set(["/faq", "/403", "/student/evaluations/thank-you"])
const ADMIN_MIRROR_STUBS = new Set([
  "/dean/data/users",
  "/dean/data/users/deleted",
  "/dean/data/academic-infrastructure",

  "/dean/reports",
  "/dean/reports/health",
  "/dean/reports/demand",
  "/dean/reports/responsiveness",
  "/dean/reports/backlog",
  "/dean/reports/coverage",
  "/dean/reports/distribution",
  "/dean/evaluations/rubrics",
  "/dean/evaluations/reports",
])

type OverrideMap = Record<string, Record<string, boolean>>

export default function EditAccessGroupPage() {
  const params = useParams()
  const router = useRouter()
  const groupName = params.groupName as string

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [overrides, setOverrides] = useState<OverrideMap>({})
  const [search, setSearch] = useState("")

  const { data: accessData, isLoading: accessLoading } = useApiGet<{ groups: GroupAccess[]; catalog: Catalog; pageApiMap: Record<string, PageApiEntry> }>("/api/admin/access-config")
  const { data: meData, isLoading: meLoading } = useApiGet<{ user: { role: string } }>("/api/auth/me")

  const group = useMemo(() => {
    const g = (accessData?.groups ?? []).find((grp: GroupAccess) => grp.groupName === groupName) ?? null
    return g
  }, [accessData, groupName])

  const catalog = accessData?.catalog ?? null
  const pageApiMap = accessData?.pageApiMap ?? null
  const readOnly = useMemo(() => !meData?.user?.role?.split("|").includes("ADMIN"), [meData])

  const loading = accessLoading || meLoading

  useEffect(() => {
    if (!group) return
    Promise.resolve().then(() => {
      const isApiPath = (p: string) => p.startsWith("/api/")
      const defaults = new Set(getDefaultUIPages(group.groupName))
      setSelectedPages((group.pages || []).filter((p: string) => !isApiPath(p) && !defaults.has(p)))
      setOverrides(group.api_overrides || {})
    })
  }, [group])

  const defaultPageSet = useMemo(() => group ? new Set(getDefaultUIPages(group.groupName)) : new Set<string>(), [group])

  const isLockedPage = (p: string) =>
    defaultPageSet.has(p) || (group?.groupName === "ADMIN" && (p === "/admin/system/access-config" || p === "/admin/system/user-permissions")) || ALWAYS_LOCKED_PAGES.has(p)

  const togglePage = (path: string) => {
    if (readOnly || isLockedPage(path)) return
    setSelectedPages((prev) => {
      const on = prev.includes(path)
      if (on) {
        // Per-API overrides are independent — unchecking the page no longer wipes them.
        return prev.filter((p) => p !== path)
      }
      return [...prev, path]
    })
  }

  const toggleApiOverride = (pagePath: string, apiPath: string) => {
    if (readOnly) return
    setOverrides((prev) => {
      const pageOverrides = { ...(prev[pagePath] || {}) }
      const current = pageOverrides[apiPath]
      if (current === true) {
        delete pageOverrides[apiPath]
      } else if (current === false) {
        pageOverrides[apiPath] = true
      } else {
        pageOverrides[apiPath] = false
      }
      const next = { ...prev }
      if (Object.keys(pageOverrides).length === 0) {
        delete next[pagePath]
      } else {
        next[pagePath] = pageOverrides
      }
      return next
    })
  }

  const isApiEffective = (pagePath: string, apiPath: string): boolean => {
    const o = overrides[pagePath]?.[apiPath]
    if (o === true) return true
    if (o === false) return false
    return selectedPages.includes(pagePath)
  }

  const isApiOverridden = (pagePath: string, apiPath: string): "granted" | "denied" | null => {
    const o = overrides[pagePath]?.[apiPath]
    if (o === true) return "granted"
    if (o === false) return "denied"
    return null
  }

  const getSharedPages = (apiPath: string, currentPage: string): string[] => {
    if (!pageApiMap) return []
    const pages: string[] = []
    for (const [page, entry] of Object.entries(pageApiMap)) {
      if (page !== currentPage && entry.apis.includes(apiPath)) {
        pages.push(entry.label)
      }
    }
    return pages
  }

  const normalizePath = (p: string) => p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p

  const handleSave = async () => {
    if (!group) return
    setSaving(true)
    setSaved(false)
    let deduped = [...new Set(selectedPages.map(normalizePath))]
    if (group.groupName === "ADMIN") {
      deduped = deduped.filter((p) => p !== "/admin/system/access-config" && p !== "/admin/system/user-permissions")
    }
    // Strip irrevocable defaults before sending (they are never stored in DB)
    deduped = deduped.filter((p) => !defaultPageSet.has(p))

    try {
      const res = await fetch("/api/admin/access-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupName: group.groupName,
          pages: deduped,
          api_overrides: overrides,
        }),
      })

      if (res.ok) {
        invalidate("/api/auth/access")
        invalidate("/api/admin/access-config")
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        const data = await res.json()
        setErrorMessage(data.error || "Failed to save")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!group || readOnly) return
    const confirmed = window.confirm(`Delete group "${group.groupName}"? This cannot be undone.`)
    if (!confirmed) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/access-config?groupName=${encodeURIComponent(group.groupName)}`, {
        method: "DELETE",
      })
      if (res.ok) {
        invalidate("/api/auth/access")
        invalidate("/api/admin/access-config")
        router.push("/admin/system/access-config")
      } else {
        const data = await res.json()
        setErrorMessage(data.error || "Failed to delete group")
      }
    } finally {
      setDeleting(false)
    }
  }

  const norm = (a: string[]) => [...new Set(a.map(normalizePath))].sort()
  const isApiPath = (p: string) => p.startsWith("/api/")
  const hasChanges =
    group &&
    (JSON.stringify(norm(selectedPages)) !== JSON.stringify(norm((group.pages || []).filter((p) => !isApiPath(p) && !defaultPageSet.has(p)))) ||
      JSON.stringify(overrides) !== JSON.stringify(group.api_overrides || {}))

  const catalogSections = useMemo(() => {
    if (!catalog) return []

    const bySection = new Map<string, CatalogItem[]>()
    for (const items of Object.values(catalog.pages)) {
      for (const item of items) {
        const section = item.section || "Other"
        if (!bySection.has(section)) bySection.set(section, [])
        bySection.get(section)!.push(item)
      }
    }

    const entries: { section: string; items: CatalogItem[] }[] = []
    for (const s of SECTION_ORDER) {
      let items = bySection.get(s)
      if (!items) continue
      if (group?.groupName === "ADMIN") {
        items = items.filter((item) => !ADMIN_MIRROR_STUBS.has(item.path))
      }
      // Filter out irrevocable defaults — they are shown in a separate section on top
      items = items.filter((item) => !defaultPageSet.has(item.path))
      if (items.length > 0) entries.push({ section: s, items })
    }

    return entries
  }, [catalog, group, defaultPageSet])

  const defaultCatalogItems = useMemo(() => {
    if (!catalog || defaultPageSet.size === 0) return []
    const items: CatalogItem[] = []
    for (const arr of Object.values(catalog.pages)) {
      for (const item of arr) {
        if (defaultPageSet.has(item.path)) items.push(item)
      }
    }
    return items
  }, [catalog, defaultPageSet])

  if (loading) {
    return (
      <div className="w-full space-y-8 pb-12">
        <Skeleton variant="card" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="w-full space-y-8 pb-12">
        <Link href="/admin/system/access-config" className="text-xs text-gold-600 hover:underline">&larr; Back to groups</Link>
        <p className="text-sm text-tertiary text-center py-8">Group not found.</p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="w-full pb-12">
        <ErrorState message={errorMessage} onRetry={() => setErrorMessage("")} />
      </div>
    )
  }

  const badgeColor = badgeColors[group.groupName] || "bg-surface text-secondary"

  const rolePrefixes = ["/admin/", "/dean/", "/faculty/", "/student/"]
  const displayPath = (p: string) => {
    for (const prefix of rolePrefixes) {
      if (p.startsWith(prefix)) return p.slice(prefix.length)
    }
    return p
  }

  interface TreeNode {
    path: string
    label: string
    children: TreeNode[]
  }

  interface TreeRow {
    path: string
    label: string
    depth: number
    isLast: boolean
    connectors: boolean[]
  }

  const buildTree = (items: CatalogItem[]): TreeNode[] => {
    const map = new Map<string, TreeNode>()
    const sorted = [...items].sort((a, b) => {
      const aDepth = a.path.split("/").length
      const bDepth = b.path.split("/").length
      if (aDepth !== bDepth) return aDepth - bDepth
      return a.path.localeCompare(b.path)
    })
    const roots: TreeNode[] = []
    for (const item of sorted) {
      const node: TreeNode = { path: item.path, label: item.label, children: [] }
      map.set(item.path, node)
      const slashIdx = item.path.lastIndexOf("/")
      const parentPath = slashIdx > 0 ? item.path.substring(0, slashIdx) : ""
      const parent = map.get(parentPath)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  }

  const flattenTree = (nodes: TreeNode[], conn: boolean[] = []): TreeRow[] => {
    const rows: TreeRow[] = []
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const isLast = i === nodes.length - 1
      rows.push({ path: node.path, label: node.label, depth: conn.length, isLast, connectors: conn })
      if (node.children.length > 0) {
        rows.push(...flattenTree(node.children, [...conn, !isLast]))
      }
    }
    return rows
  }

  return (
    <ErrorBoundary>
    <div className="w-full space-y-8 pb-12">
      <div>
        <Link href="/admin/system/access-config" className="text-xs text-gold-600 hover:underline">&larr; Back to groups</Link>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${badgeColor}`}>
            {group.groupName}
          </span>
          <span className="text-xs text-tertiary">Access Group</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {catalog && pageApiMap && (() => {
                const allPagePaths = catalogSections.flatMap((s) =>
                  s.items.map((i) => i.path).filter((p) => !isApiPath(p)),
                )
                const visiblePagePaths = allPagePaths.filter((p) => {
                  if (!search.trim()) return true
                  const q = search.toLowerCase()
                  const entry = pageApiMap[p]
                  const labelMatch = entry?.label.toLowerCase().includes(q)
                  const pathMatch = p.toLowerCase().includes(q)
                  const apiMatch = entry?.apis.some((a) => a.toLowerCase().includes(q))
                  return labelMatch || pathMatch || apiMatch
                })
                const toggleable = visiblePagePaths.filter((p) => !isLockedPage(p) && !readOnly)
                if (toggleable.length === 0) return null
                const allSelected = toggleable.every((p) => selectedPages.includes(p))
                return (
                  <button
                    onClick={() => {
                      if (allSelected) {
                        setSelectedPages((prev) => prev.filter((p) => !toggleable.includes(p)))
                      } else {
                        setSelectedPages((prev) => {
                          const next = new Set(prev)
                          for (const p of toggleable) next.add(p)
                          return Array.from(next)
                        })
                      }
                    }}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-surface text-amber-600 hover:bg-surface-hover border border-strong transition-colors"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                )
              })()}
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter pages..."
              className="input text-xs w-48 px-3 py-1.5 rounded-lg border border-strong"
            />
          </div>

          {defaultCatalogItems.length > 0 && (
            <div className="space-y-3 mb-8">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Irrevocable Defaults</p>
              <div className="space-y-0.5">
                {(() => {
                  const tree = buildTree(defaultCatalogItems)
                  const rows = flattenTree(tree)
                  return rows.map((row) => {
                    const entry = pageApiMap?.[row.path]
                    const apis = entry?.apis ?? []
                    return (
                      <div key={row.path} className="rounded-lg border border-amber-300 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-700 opacity-80">
                        <div className="flex items-center gap-2 px-3 py-2">
                          {row.depth > 0 && (
                            <span className="text-[10px] text-slate-300 dark:text-slate-600 font-mono shrink-0 whitespace-pre select-none">
                              {row.connectors.map((c) => c ? "│   " : "    ").join("")}
                              {row.isLast ? "└── " : "├── "}
                            </span>
                          )}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={true}
                              disabled={true}
                              className="rounded border-strong text-amber-600 shrink-0 opacity-60"
                            />
                            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">{row.label}</span>
                            <span className="text-[10px] text-tertiary font-mono">{displayPath(row.path)}</span>
                            <span className="text-[10px] text-amber-600 font-semibold">(irrevocable)</span>
                          </div>
                        </div>
                        {apis.length > 0 && (
                          <div className="px-3 pb-2 space-y-0.5">
                            {apis.map((apiPath) => (
                              <label key={apiPath} className="flex items-center gap-2 py-0.5 rounded text-xs opacity-60">
                                <input type="checkbox" checked={true} disabled={true} className="rounded border-strong text-amber-600 shrink-0" />
                                <span className="font-mono text-[10px] text-amber-700 dark:text-amber-300">{apiPath}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {apis.length === 0 && (
                          <div className="px-3 pb-1.5">
                            <p className="text-[10px] text-tertiary italic">No API</p>
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {catalogSections.length === 0 && defaultCatalogItems.length === 0 && (
            <p className="text-sm text-tertiary text-center py-8">No pages found.</p>
          )}

          {catalogSections.length > 0 && (
            <div className="space-y-6">
              {catalogSections.map(({ section, items }) => {
                const pageItems = items.filter((i) => !isApiPath(i.path))
                const filteredPages = pageItems.filter((item) => {
                  if (!pageApiMap) return true
                  if (!search.trim()) return true
                  const q = search.toLowerCase()
                  const entry = pageApiMap[item.path]
                  const labelMatch = entry?.label.toLowerCase().includes(q)
                  const pathMatch = item.path.toLowerCase().includes(q)
                  const apiMatch = entry?.apis.some((a) => a.toLowerCase().includes(q))
                  return labelMatch || pathMatch || apiMatch
                })
                if (filteredPages.length === 0) return null

                const sectionColors: Record<string, string> = {
                  Root: "text-slate-500", Dashboard: "text-purple-500", Data: "text-blue-500",
                  Reports: "text-amber-500", Evaluations: "text-emerald-500", Hidden: "text-red-400",
                }

                return (
                  <div key={section}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${sectionColors[section] || "text-tertiary"} mb-2`}>
                      {section}
                    </p>
                    <div className="space-y-0.5">
                      {(() => {
                        const tree = buildTree(filteredPages)
                        const rows = flattenTree(tree)
                        return rows.map((row) => {
                          const locked = isLockedPage(row.path)
                          const isDefault = defaultPageSet.has(row.path)
                          const pageOn = isDefault || selectedPages.includes(row.path)
                          const entry = pageApiMap?.[row.path]
                          const apis = entry?.apis ?? []
                          const ctrlId = `page-${row.path.replace(/\//g, "-")}`
                          return (
                            <div key={row.path} className={`rounded-lg border transition-all duration-200 ${
                              pageOn
                                ? "border-amber-300 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-700"
                                : "border-slate-200 dark:border-slate-700 bg-surface"
                            } ${locked ? "opacity-60" : ""}`}>
                              <div className="flex items-center gap-2 px-3 py-2">
                                {row.depth > 0 && (
                                  <span className="text-[10px] text-slate-300 dark:text-slate-600 font-mono shrink-0 whitespace-pre select-none">
                                    {row.connectors.map((c) => c ? "│   " : "    ").join("")}
                                    {row.isLast ? "└── " : "├── "}
                                  </span>
                                )}
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <input
                                    id={ctrlId}
                                    type="checkbox"
                                    checked={pageOn}
                                    onChange={() => togglePage(row.path)}
                                    disabled={locked || readOnly}
                                    className="rounded border-strong text-amber-600 focus:ring-amber-500 shrink-0"
                                  />
                                  <span className={`text-sm font-semibold ${pageOn ? "text-amber-800 dark:text-amber-200" : "text-primary"}`}>
                                    {row.label}
                                  </span>
                                  <span className="text-[10px] text-tertiary font-mono">{displayPath(row.path)}</span>
                                  {locked && <span className="text-[10px] text-tertiary">(required)</span>}
                                </div>
                              </div>
                              {apis.length > 0 && (
                                <div className="px-3 pb-2 space-y-0.5">
                                  {apis.map((apiPath) => {
                                    const effective = isApiEffective(row.path, apiPath)
                                    const overrideState = isApiOverridden(row.path, apiPath)
                                    const sharedWith = getSharedPages(apiPath, row.path)
                                    return (
                                      <label
                                        key={apiPath}
                                        className="flex items-center gap-2 py-0.5 rounded cursor-pointer text-xs group"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={effective}
                                          onChange={() => toggleApiOverride(row.path, apiPath)}
                                          disabled={readOnly}
                                          className={`rounded border-strong text-amber-600 focus:ring-amber-500 ${
                                            overrideState === "granted" ? "ring-2 ring-amber-400" : ""
                                          } ${overrideState === "denied" ? "opacity-50" : ""}`}
                                        />
                                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                          <span className={`font-mono text-[10px] ${
                                            effective ? "text-amber-700 dark:text-amber-300" : "text-tertiary"
                                          }`}>
                                            {apiPath}
                                          </span>
                                          {overrideState && (
                                            <span className={`text-[9px] font-bold px-1 py-px rounded ${
                                              overrideState === "granted"
                                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                            }`}>
                                              {overrideState === "granted" ? "ON" : "OFF"}
                                            </span>
                                          )}
                                          {sharedWith.length > 0 && (
                                            <span className="text-[9px] text-tertiary truncate" title={`Also used by: ${sharedWith.join(", ")}`}>
                                              (also {sharedWith.slice(0, 2).join(", ")}{sharedWith.length > 2 ? ` +${sharedWith.length - 2}` : ""})
                                            </span>
                                          )}
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                              {apis.length === 0 && (
                                <div className="px-3 pb-1.5">
                                  <p className="text-[10px] text-tertiary italic">No API</p>
                                </div>
                              )}
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-[10px] text-tertiary mt-2">Tree branches indicate page hierarchy.</p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1 border-t border-default">
          {!readOnly && group?.groupName !== "ADMIN" && group?.groupName !== "DEAN" && group?.groupName !== "FACULTY" && group?.groupName !== "STUDENT" && group?.groupName !== "GUEST" && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 transition-colors"
            >
              {deleting ? "Deleting\u2026" : "Delete Group"}
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            {saved && (
              <span className="text-xs font-semibold text-emerald-600">Saved</span>
            )}
            <SubmitButton
              onClick={handleSave}
              variant="primary"
              className="text-xs font-semibold px-4 py-2 rounded-lg"
              disabled={saving || !hasChanges || readOnly}
            >
              {saving ? "Saving\u2026" : "Save Changes"}
            </SubmitButton>
          </div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}

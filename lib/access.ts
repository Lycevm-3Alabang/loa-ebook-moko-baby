import { getPrimaryRole } from "@/lib/utils/roles"
import { getDefaultPages } from "@/lib/default-access"

interface GroupAccessEntry {
  pages: string[]
}

export const DEFAULT_CONFIG: Record<string, GroupAccessEntry> = {
  ADMIN: {
    pages: ["/", "/admin", "/admin/data/maintenance", "/admin/data/users/deleted", "/admin/system/access-config", "/admin/system/user-permissions", "/admin/data/users", "/admin/data/academic-infrastructure", "/admin/consultations", "/admin/consultations/reports/health", "/admin/consultations/reports/demand", "/admin/consultations/reports/backlog", "/admin/consultations/reports/coverage", "/admin/consultations/reports/distribution", "/admin/evaluations", "/admin/evaluations/results", "/admin/evaluations/rubrics", "/admin/evaluations/disabled", "/admin/system/audit-trail", "/admin/system/reported-bugs", "/faculty/availability", "/faq"],
  },
  DEAN: {
    pages: ["/", "/dean", "/dean/upload", "/dean/departments", "/dean/reports", "/dean/evaluations", "/dean/evaluations/results", "/dean/data/users", "/dean/data/academic-infrastructure", "/faculty/meetings", "/faculty/availability", "/faculty/reports", "/api/dean/evaluation-results", "/api/dean/evaluation-results/details", "/api/evaluation-periods"],
  },
  FACULTY: {
    pages: ["/", "/faculty", "/faculty/meetings", "/faculty/availability", "/faculty/upload", "/faculty/evaluations", "/faculty/evaluations/results", "/admin/consultations/reports/health"],
  },
  STUDENT: {
    pages: ["/", "/student", "/student/book", "/student/meetings", "/student/history", "/student/evaluations", "/evaluate", "/api/semesters", "/api/users/primary", "/api/users/attendees"],
  },
  GUEST: {
    pages: [],
  },
}

export interface AccessEntry {
  url: string
  access: "granted" | "revoked"
  type: "ui" | "api"
}

let configCache: { data: Record<string, GroupAccessEntry>; ts: number } | null = null
const CONFIG_CACHE_TTL = 60_000

const accessCache = new Map<string, { entries: AccessEntry[]; ts: number }>()
const ACCESS_CACHE_TTL = 60_000

export function clearAccessConfigCache() {
  configCache = null
  accessCache.clear()
}

export async function loadAccessConfig(): Promise<Record<string, GroupAccessEntry>> {
  if (configCache && Date.now() - configCache.ts < CONFIG_CACHE_TTL) {
    return configCache.data
  }

  try {
    const { supabase } = await import("@/lib/supabase")
    const { data, error } = await supabase.from("group_access").select("*")
    if (error) throw error

    const ALWAYS_SAFE = new Set(["/", "/admin", "/admin/system/access-config", "/admin/system/user-permissions", "/admin/system/reported-bugs", "/faculty/availability"])

    const map: Record<string, GroupAccessEntry> = { ...DEFAULT_CONFIG }
    for (const row of data || []) {
      const pages = Array.isArray(row.pages) ? row.pages.filter((page: unknown): page is string => typeof page === "string") : []
      if (row.groupName === "ADMIN") {
        const dbPages = new Set<string>(pages)
        for (const p of ALWAYS_SAFE) dbPages.add(p)
        map.ADMIN = { pages: Array.from(dbPages) }
      } else {
        map[row.groupName] = { pages }
      }
    }

    configCache = { data: map, ts: Date.now() }
    return map
  } catch (err) {
    console.error("[access] Failed to load from DB, using defaults:", (err as { message?: string })?.message)
    return DEFAULT_CONFIG
  }
}

export function userGroup(role: string): string {
  return getPrimaryRole(role)
}

export async function hasPageAccess(role: string, path: string): Promise<boolean> {
  const topRole = userGroup(role)
  const config = await loadAccessConfig()
  const entry = config[topRole]
  const defaultPages = getDefaultPages(topRole)
  const hasDefault = defaultPages.some((p: string) => path === p || path.startsWith(p + "/"))
  if (hasDefault) return true
  if (!entry) return false
  return entry.pages.some((p: string) => path === p || path.startsWith(p + "/"))
}

function pathType(url: string): "ui" | "api" {
  return url.startsWith("/api/") ? "api" : "ui"
}

const HIDDEN_DEFAULTS: Record<string, string[]> = {
  FACULTY: ["/faculty/evaluations/reports"],
}

export async function getUserAccess(userId: string, role: string): Promise<AccessEntry[]> {
  const cached = accessCache.get(userId)
  if (cached && Date.now() - cached.ts < ACCESS_CACHE_TTL) return cached.entries

  const config = await loadAccessConfig()
  const isAdmin = role?.includes("ADMIN")
  const topRole = role ? getPrimaryRole(role) : "GUEST"
  const defaultPaths = getDefaultPages(topRole).filter((p) => !(HIDDEN_DEFAULTS[topRole] ?? []).includes(p))

  const allPaths = new Map<string, "ui" | "api">()
  for (const group of Object.values(config)) {
    for (const p of group.pages) {
      if (!allPaths.has(p)) allPaths.set(p, pathType(p))
    }
  }
  for (const p of defaultPaths) {
    if (!allPaths.has(p)) allPaths.set(p, pathType(p))
  }

  const entries = new Map<string, AccessEntry>()

  if (isAdmin) {
    // ADMIN: only grant RBAC-configured pages (sidebar visibility).
    // Middleware fallback (proxy.ts) allows ADMIN to navigate unconfigured paths.
    const adminPages = config["ADMIN"]?.pages ?? []
    for (const url of adminPages) {
      const t = allPaths.get(url) ?? pathType(url)
      entries.set(url, { url, access: "granted", type: t })
    }
  } else {
    // Grant irrevocable defaults first (can't be overridden)
    for (const url of defaultPaths) {
      const t = allPaths.get(url) ?? pathType(url)
      entries.set(url, { url, access: "granted", type: t })
    }

    // Grant additional pages from RBAC config
    const rbacPages = config[topRole]?.pages ?? []
    for (const url of rbacPages) {
      const t = allPaths.get(url) ?? pathType(url)
      entries.set(url, { url, access: "granted", type: t })
    }
  }

  try {
    const { supabase } = await import("@/lib/supabase")
    const { data: perms } = await supabase
      .from('user_permissions')
      .select('grants, denies, resource_path')
      .eq('user_id', userId)

    if (perms) {
      const defaultSet = new Set(defaultPaths)
      for (const p of perms as { grants: string[]; denies: string[]; resource_path: string }[]) {
        // Irrevocable defaults cannot be overridden by user_permissions
        if (defaultSet.has(p.resource_path)) continue

        const existing = entries.get(p.resource_path) ?? {
          url: p.resource_path,
          access: "revoked",
          type: pathType(p.resource_path)
        }
        if (p.denies?.includes('access')) {
          // ADMIN cannot be denied on /admin/ paths (mandatory)
          if (isAdmin && p.resource_path.startsWith('/admin/')) {
            // skip deny — admin paths are mandatory
          } else {
            existing.access = "revoked"
            entries.set(p.resource_path, existing)
          }
        } else if (p.grants?.includes('access')) {
          existing.access = "granted"
          entries.set(p.resource_path, existing)
        }
      }
    }
  } catch {}

  const result = Array.from(entries.values())
  accessCache.set(userId, { entries: result, ts: Date.now() })
  return result
}

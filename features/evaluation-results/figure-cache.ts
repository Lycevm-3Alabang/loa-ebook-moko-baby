import { evaluationResultRepository } from "@/lib/repositories/factory"
import type { DepartmentFigures, FacultyFigures } from "@/lib/types"

/**
 * The cache for the figures.
 *
 * Reading figures is expensive: a department's or a faculty's ratings are tens
 * of thousands of rows, and the read has to walk them. The results list asks
 * for each department's figures, and the report asks for the faculty's — so
 * those figures are kept for five minutes and their surfaces read the same
 * numbers.
 *
 * ⭐ The exports do NOT read this cache. A ZIP is a download, and a workbook
 * needs the raw ratings, comments and statement averages — not the pooled
 * figures. Both export routes re-read their departments live; this cache is
 * the list's and the report's.
 *
 * The cache lives in the module, so it belongs to the warm instance: a cold
 * instance reads once and then serves from its own copy. The five minutes are
 * a freshness window, not a promise of sharing.
 */

/** How long a figure is kept. */
export const FIGURES_TTL_MS = 5 * 60 * 1000

export interface CachedFigures {
  figures: DepartmentFigures
  /** When the numbers were read from the database. */
  readAt: number
}

export interface CachedFacultyFigures {
  figures: FacultyFigures
  /** When the numbers were read from the database. */
  readAt: number
}

/**
 * One cache of figures, keyed by a string: a freshness window and an in-flight
 * dedupe, so two callers never read the same key twice.
 *
 * The key namespaces the two kinds of figures, so a department's entry and a
 * faculty's entry can never collide.
 */
function makeFiguresCache<T>() {
  const entries = new Map<string, { figures: T; readAt: number }>()
  const inflight = new Map<string, Promise<{ figures: T; readAt: number }>>()

  return {
    /**
     * The figures for a key, from the cache when they are still fresh.
     * `force` reads them again — the manual refresh.
     */
    async get(
      key: string,
      read: () => Promise<T>,
      force = false,
    ): Promise<{ figures: T; readAt: number }> {
      const entry = entries.get(key)
      if (!force && entry && Date.now() - entry.readAt < FIGURES_TTL_MS) return entry

      const pending = inflight.get(key)
      if (pending) return pending

      const promise = read()
        .then((figures) => {
          const value = { figures, readAt: Date.now() }
          entries.set(key, value)
          return value
        })
        .finally(() => {
          inflight.delete(key)
        })
      inflight.set(key, promise)
      return promise
    },

    clear(): void {
      entries.clear()
    },
  }
}

/** The departments' figures — the results list, the exports and the dean view read these. */
const departmentCache = makeFiguresCache<DepartmentFigures>()
/** The faculty's figures — the report reads these, and a department is their pool. */
const facultyCache = makeFiguresCache<FacultyFigures>()

function departmentKey(evaluationPeriodId: string, departmentId: string): string {
  return `department:${evaluationPeriodId}:${departmentId}`
}

function facultyKey(evaluationPeriodId: string, facultyId: string): string {
  return `faculty:${evaluationPeriodId}:${facultyId}`
}

/**
 * A department's figures, from the cache when they are still fresh.
 * `force` reads them again — the manual refresh.
 */
export async function getCachedDepartmentFigures(
  departmentId: string,
  evaluationPeriodId: string,
  force = false,
): Promise<CachedFigures> {
  return departmentCache.get(
    departmentKey(evaluationPeriodId, departmentId),
    () => evaluationResultRepository.listDepartmentFigures(departmentId, evaluationPeriodId),
    force,
  )
}

/**
 * One faculty's figures, from the cache when they are still fresh.
 * `force` reads them again — the manual refresh.
 */
export async function getCachedFacultyFigures(
  facultyId: string,
  evaluationPeriodId: string,
  force = false,
): Promise<CachedFacultyFigures> {
  return facultyCache.get(
    facultyKey(evaluationPeriodId, facultyId),
    () => evaluationResultRepository.listFacultyFigures(facultyId, evaluationPeriodId),
    force,
  )
}

/** Drop every cached figure — the manual refresh, before the re-read. */
export function clearDepartmentFiguresCache(): void {
  departmentCache.clear()
}

import { evaluationResultRepository } from "@/lib/repositories/factory"
import type { DepartmentFigures } from "@/lib/types"

/**
 * The cache for a department's figures.
 *
 * Reading a department's figures is expensive: its ratings are tens of
 * thousands of rows, and the read has to walk them. The list asks for every
 * department, the export asks for them again, and the report asks for them a
 * third time — so the figures are kept for five minutes and every surface
 * reads the same numbers.
 *
 * The cache lives in the module, so it belongs to the warm instance: a cold
 * instance reads once and then serves from its own copy. The five minutes are
 * a freshness window, not a promise of sharing.
 */

/** How long a department's figures are kept. */
export const FIGURES_TTL_MS = 5 * 60 * 1000

export interface CachedFigures {
  figures: DepartmentFigures
  /** When the numbers were read from the database. */
  readAt: number
}

const cache = new Map<string, CachedFigures>()
/** The reads in flight, so two callers never read the same department twice. */
const inflight = new Map<string, Promise<CachedFigures>>()

function key(evaluationPeriodId: string, departmentId: string): string {
  return `${evaluationPeriodId}:${departmentId}`
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
  const cacheKey = key(evaluationPeriodId, departmentId)
  const entry = cache.get(cacheKey)
  if (!force && entry && Date.now() - entry.readAt < FIGURES_TTL_MS) return entry

  const pending = inflight.get(cacheKey)
  if (pending) return pending

  const promise = evaluationResultRepository
    .listDepartmentFigures(departmentId, evaluationPeriodId)
    .then((figures) => {
      const value: CachedFigures = { figures, readAt: Date.now() }
      cache.set(cacheKey, value)
      return value
    })
    .finally(() => {
      inflight.delete(cacheKey)
    })
  inflight.set(cacheKey, promise)
  return promise
}

/** Drop every cached figure — the manual refresh, before the re-read. */
export function clearDepartmentFiguresCache(): void {
  cache.clear()
}

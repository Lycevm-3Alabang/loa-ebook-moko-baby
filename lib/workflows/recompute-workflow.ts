import { evaluationResultRepository } from "@/lib/repositories/factory"

// Burst window: floated calls within this age of the last successful
// compute are skipped. Tune after observing deadline traffic.
const RECOMPUTE_COALESCE_MS = 90_000

export type RecomputeMode = "burst" | "immediate"

export async function recomputeResultsWorkflow(evaluationPeriodId: string, mode: RecomputeMode = "burst") {
  "use workflow"

  if (!evaluationPeriodId) return
  await recomputeResultsStep(evaluationPeriodId, mode)
}

async function recomputeResultsStep(evaluationPeriodId: string, mode: RecomputeMode) {
  "use step"

  // Fail open: any read problem converges on computing.
  if (mode !== "immediate") {
    let latest: string | null = null
    try {
      latest = await evaluationResultRepository.getLatestComputedAt(evaluationPeriodId)
    } catch {
      latest = null
    }
    if (latest) {
      const ageMs = Date.now() - new Date(latest).getTime()
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < RECOMPUTE_COALESCE_MS) return
    }
  }
  await evaluationResultRepository.computeAll(evaluationPeriodId)
}

import { auth } from "@/lib/auth"
import { departmentRepository } from "@/lib/repositories/factory"
import CoveragePage from "@/features/evaluations/components/CoveragePage"

export default async function DeanEvaluationCoveragePage() {
  const session = await auth()
  const userId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined
  const dept = userId ? await departmentRepository.findByDeanId(userId) : null
  // The dean always lands on their own department — there is no list to pick from.
  return (
    <CoveragePage
      statusBase="/api/dean/evaluation-status"
      departmentId={dept?.id ?? null}
    />
  )
}

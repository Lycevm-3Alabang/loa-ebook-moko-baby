import { NextResponse } from "next/server"
import { logServerError } from "@/lib/services/audit"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { submitEvaluation, getEvaluationIfOwner } from "@/features/evaluations/evaluations.service"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "STUDENT")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const userId = (session.user as Record<string, unknown>).id as string
  const { id } = await params
  try {
    const evaluation = await getEvaluationIfOwner(id, userId)
    if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const submitted = await submitEvaluation(id)
    return NextResponse.json({ evaluation: submitted })
  } catch (e) {
    console.error("Submit evaluation error:", e)
    await logServerError({
      route: "/api/evaluations/[id]/submit",
      method: _request.method,
      params: Object.fromEntries(new URL(_request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to submit evaluation" }, { status: 500 })
  }
}

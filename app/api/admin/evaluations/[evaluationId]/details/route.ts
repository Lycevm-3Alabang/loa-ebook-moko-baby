import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { supabase } from "@/lib/db"
import { logServerError } from "@/lib/services/audit"

export async function GET(request: NextRequest, { params }: { params: Promise<{ evaluationId: string }> }) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { evaluationId } = await params
    if (!evaluationId) return NextResponse.json({ error: "evaluationId is required" }, { status: 400 })

    const { data: evaluation, error: eErr } = await supabase
      .from("evaluations")
      .select("id, evaluatorId, submittedAt, isDisabled")
      .eq("id", evaluationId)
      .single()
    if (eErr) throw eErr
    if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 })

    const { data: ratingRows, error: rErr } = await supabase
      .from("evaluation_ratings")
      .select("evaluationId, rating, itemId")
      .eq("evaluationId", evaluationId)
    if (rErr) throw rErr

    const itemIds = [...new Set((ratingRows || []).map((r) => r.itemId))]
    const { data: itemRows, error: iErr } = await supabase
      .from("rubric_items")
      .select("id, categoryId, text, displayOrder")
      .in("id", itemIds)
    if (iErr) throw iErr

    const categoryIds = [...new Set((itemRows || []).map((i) => i.categoryId))]
    const { data: catRows, error: cErr } = await supabase
      .from("rubric_categories")
      .select("id, name, displayOrder")
      .in("id", categoryIds)
    if (cErr) throw cErr

    const catById = new Map((catRows || []).map((c) => [c.id, c]))
    const itemMap = new Map((itemRows || []).map((i) => [i.id, i]))

    const grouped = new Map<string, { name: string; displayOrder: number; items: { text: string; rating: number }[] }>()
    for (const r of ratingRows || []) {
      const item = itemMap.get(r.itemId)
      if (!item) continue
      const cat = catById.get(item.categoryId)
      const catName = cat?.name ?? "Uncategorized"
      const catOrder = cat?.displayOrder ?? 0
      if (!grouped.has(catName)) grouped.set(catName, { name: catName, displayOrder: catOrder, items: [] })
      grouped.get(catName)!.items.push({ text: item.text, rating: r.rating })
    }

    const categories = [...grouped.values()]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => ({ categoryName: c.name, items: c.items }))

    const { data: commentRow, error: cErr2 } = await supabase
      .from("evaluation_comments")
      .select("comment, sentimentLabel, sentimentScore")
      .eq("evaluationId", evaluationId)
      .maybeSingle()
    if (cErr2) throw cErr2

    let evaluatorName = ""
    if (evaluation.evaluatorId) {
      const { data: evaluator } = await supabase
        .from("users")
        .select("name")
        .eq("id", evaluation.evaluatorId)
        .single()
      evaluatorName = evaluator?.name ?? ""
    }

    return NextResponse.json({
      evaluationId: evaluation.id,
      submittedAt: evaluation.submittedAt ?? null,
      evaluatorName,
      categories,
      comment: commentRow?.comment ?? null,
      sentimentLabel: commentRow?.sentimentLabel ?? null,
      sentimentScore: commentRow?.sentimentScore ?? null,
      isDisabled: !!evaluation.isDisabled,
    })
  } catch (e) {
    console.error("Evaluation details error:", e)
    await logServerError({
      route: "/api/admin/evaluations/[evaluationId]/details",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to load evaluation details" }, { status: 500 })
  }
}

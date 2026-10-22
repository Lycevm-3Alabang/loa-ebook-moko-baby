import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
vi.mock("@/lib/db/common", () => ({ fetchRatingsWithCategories: vi.fn() }))

import { evaluationRepository } from "@/features/evaluations/evaluations.repository"

interface Captured { orders: string[] }

function makeChain(captured: Captured) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn((column: string) => {
      captured.orders.push(column)
      return chain
    }),
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled),
  }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("listSubmittedByPeriodAndEvaluateeAndFS — the order", () => {
  it("orders by (createdAt, id), so every row has a defined place", async () => {
    const captured: Captured = { orders: [] }
    mockSupabase.from.mockImplementation(() => makeChain(captured))

    await evaluationRepository.listSubmittedByPeriodAndEvaluateeAndFS("p1", "f1", "fs1")

    // ⭐ "createdAt" is NOT NULL and id is the primary key — the pair is a
    // TOTAL order, so two exports of the same data print the same rows in the
    // same order. The old ("submittedAt" alone) left the NULL submittedAt's
    // unordered, and nothing ever failed.
    expect(captured.orders).toEqual(["createdAt", "id"])
  })
})

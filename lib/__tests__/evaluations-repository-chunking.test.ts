import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
vi.mock("@/lib/db/common", () => ({ fetchRatingsWithCategories: vi.fn() }))

import { evaluationRepository } from "@/features/evaluations/evaluations.repository"

interface Captured { inCalls: string[][]; fromCalls: number }

function makeChain(resolveValue: unknown, captured: Captured) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn((_column: string, ids: string[]) => {
      captured.inCalls.push(ids)
      return chain
    }),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
  }
  return chain
}

function row(id: string, evaluatorId: string) {
  return {
    id,
    evaluatorId,
    status: "SUBMITTED",
    isDisabled: false,
    submittedAt: "2026-01-01T00:00:00Z",
    facultySubjectId: id,
  }
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `fs-${String(i).padStart(4, "0")}`)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("listStatusByPeriodAndFacultySubjectIds — PostgREST URL budget", () => {
  it("makes no query for an empty list", async () => {
    await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", [])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("sends a single query when the list fits in one chunk", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makeChain({ data: [row("fs-1", "stu-1")], error: null }, captured)
    })

    const result = await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ids(40))

    expect(captured.fromCalls).toBe(1)
    expect(captured.inCalls[0]).toHaveLength(40)
    expect(result).toHaveLength(1)
  })

  it("splits a 250-id list into 3 chunked queries, each within the URL budget", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const n = captured.inCalls.length
      return makeChain({ data: [row(`fs-${n}`, "stu-1")], error: null }, captured)
    })

    await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ids(250))

    // 250 ids / 100 per chunk = 3 requests, not one oversized .in()
    expect(captured.fromCalls).toBe(3)
    expect(captured.inCalls.map((c) => c.length)).toEqual([100, 100, 50])
    for (const chunk of captured.inCalls) {
      expect(chunk.length).toBeLessThanOrEqual(100)
    }
  })

  it("dedupes repeated ids before chunking", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makeChain({ data: [], error: null }, captured)
    })

    const dupes = [...ids(60), ...ids(60)]
    await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", dupes)

    expect(captured.fromCalls).toBe(1)
    expect(captured.inCalls[0]).toHaveLength(60)
    expect(new Set(captured.inCalls[0]).size).toBe(60)
  })

  it("merges rows returned from every chunk", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const n = captured.inCalls.length
      return makeChain({ data: [row(`a-${n}`, "s1"), row(`b-${n}`, "s2")], error: null }, captured)
    })

    const result = await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ids(250))

    expect(result).toHaveLength(6)
    expect(result.map((r) => r.id)).toEqual(["a-0", "b-0", "a-1", "b-1", "a-2", "b-2"])
  })

  it("throws when any chunk returns an error", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const n = captured.inCalls.length
      return makeChain({ data: null, error: { message: n === 0 ? "boom" : null } }, captured)
    })

    await expect(evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ids(250))).rejects.toEqual({ message: "boom" })
  })

  it("normalises missing isDisabled to false and casts status", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makeChain(
        {
          data: [{ id: "e1", evaluatorId: "stu-1", status: "INVALID", submittedAt: null, facultySubjectId: "fs-1" }],
          error: null,
        },
        captured,
      )
    })

    const result = await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ["fs-1"])

    expect(result[0]).toEqual({
      id: "e1",
      evaluatorId: "stu-1",
      status: "INVALID",
      isDisabled: false,
      submittedAt: null,
      facultySubjectId: "fs-1",
    })
  })
})

describe("listSubmittedByPeriodAndEvaluatees — PostgREST URL budget", () => {
  it("makes no query for an empty evaluatee list", async () => {
    await evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", [])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("chunks a whole department of faculty instead of one oversized .in()", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makeChain({ data: [], error: null }, captured)
    })

    // A department's faculty list is the real input size here — this is what
    // overflowed PostgREST's ~8KB URL cap and 500'd the export route.
    await evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(250))

    expect(captured.fromCalls).toBe(3)
    for (const chunk of captured.inCalls) {
      expect(chunk.length).toBeLessThanOrEqual(100)
    }
  })

  it("merges rows across chunks", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const n = captured.inCalls.length
      return makeChain({ data: [{ id: `e-${n}`, evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null }], error: null }, captured)
    })

    const result = await evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(250))

    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual(["e-0", "e-1", "e-2"])
  })

  it("throws when any chunk errors", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const n = captured.inCalls.length
      return makeChain({ data: null, error: n === 0 ? { message: "url too long" } : null }, captured)
    })

    await expect(evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(250))).rejects.toEqual({ message: "url too long" })
  })
})
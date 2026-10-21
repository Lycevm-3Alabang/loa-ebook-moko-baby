import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
vi.mock("@/lib/db/common", () => ({ fetchRatingsWithCategories: vi.fn() }))

import { evaluationRepository } from "@/features/evaluations/evaluations.repository"

interface Captured { inCalls: string[][]; fromCalls: number; ranges: number[][]; orders?: string[] }

function makeChain(resolveValue: unknown, captured: Captured) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn((_column: string, ids: string[]) => {
      captured.inCalls.push(ids)
      return chain
    }),
    order: vi.fn((column: string) => {
      captured.orders?.push(column)
      return chain
    }),
    range: vi.fn((from: number, to: number) => {
      captured.ranges.push([from, to])
      return chain
    }),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
  }
  return chain
}

/**
 * A chain that answers one page at a time. The page cursor lives on the
 * CLIENT, not on the chain: the repository calls `from()` inside its page
 * loop, so a per-chain cursor would restart at page 1 on every request — a
 * real client advances the offset in the `Range` header instead, and that is
 * what this models.
 */
function makePagedChain(nextPage: () => { data: unknown[] | null; error: unknown }, captured: Captured) {
  let pending = { data: [] as unknown[] | null, error: null as unknown }
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn((_column: string, ids: string[]) => {
      captured.inCalls.push(ids)
      return chain
    }),
    order: vi.fn((column: string) => {
      captured.orders?.push(column)
      return chain
    }),
    range: vi.fn((from: number, to: number) => {
      captured.ranges.push([from, to])
      // The request is issued here, so the page is chosen here.
      pending = nextPage()
      return chain
    }),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(pending).then(onFulfilled),
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

/** The client-level page cursor: page 1, page 2, … then empty. */
function pageSource(pages: { data: unknown[] | null; error: unknown }[]) {
  let cursor = 0
  return () => pages[cursor++] ?? { data: [], error: null }
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
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
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
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
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
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
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
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
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
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const n = captured.inCalls.length
      return makeChain({ data: null, error: { message: n === 0 ? "boom" : null } }, captured)
    })

    await expect(evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ids(250))).rejects.toEqual({ message: "boom" })
  })

  it("normalises missing isDisabled to false and casts status", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
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

describe("listSubmittedByPeriodAndFacultySubjectIds — PostgREST row cap", () => {
  /** A faculty's response rows: one per student per subject. */
  function responseRows(n: number, offset = 0) {
    return Array.from({ length: n }, (_, i) => ({
      id: `e-${String(offset + i).padStart(4, "0")}`,
      evaluatorId: "stu-1",
      submittedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      facultySubjectId: "fs-1",
    }))
  }

  it("asks for another page when a page comes back full", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    const nextPage = pageSource([
      { data: responseRows(1000), error: null },
      { data: responseRows(3, 1000), error: null },
    ])
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(nextPage, captured)
    })

    const result = await evaluationRepository.listSubmittedByPeriodAndFacultySubjectIds("p1", ["fs-1"])

    // 1,000 rows came back full, so the loop must have asked for the next page.
    expect(captured.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(result).toHaveLength(1003)
  })

  it("orders by (submittedAt, id), so the pages cannot skip a row", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [], orders: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(pageSource([{ data: responseRows(5), error: null }]), captured)
    })

    await evaluationRepository.listSubmittedByPeriodAndFacultySubjectIds("p1", ["fs-1"])

    // `id` breaks the ties `submittedAt` leaves, so the order is total — and
    // the visible order is the one the routes already render.
    expect(captured.orders).toEqual(["submittedAt", "id"])
  })

  it("stops on a short page instead of asking again", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(pageSource([{ data: responseRows(5), error: null }]), captured)
    })

    const result = await evaluationRepository.listSubmittedByPeriodAndFacultySubjectIds("p1", ["fs-1"])

    expect(captured.ranges).toEqual([[0, 999]])
    expect(result).toHaveLength(5)
  })

  it("chunks the faculty-subject list, so the .in() stays within the URL budget", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(pageSource([{ data: [], error: null }]), captured)
    })

    await evaluationRepository.listSubmittedByPeriodAndFacultySubjectIds("p1", ids(250))

    expect(captured.inCalls.map((c) => c.length)).toEqual([100, 100, 50])
  })

  it("throws when a page errors", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(pageSource([{ data: null, error: { message: "boom" } }]), captured)
    })

    await expect(
      evaluationRepository.listSubmittedByPeriodAndFacultySubjectIds("p1", ["fs-1"]),
    ).rejects.toEqual({ message: "boom" })
  })
})

describe("listStatusByPeriodAndFacultySubjectIds — PostgREST row cap", () => {
  it("stops on a short page instead of asking again", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    const nextPage = pageSource([
      { data: [row("e-0", "stu-1")], error: null },
      { data: [row("e-1", "stu-2")], error: null },
    ])
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(nextPage, captured)
    })

    const result = await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ["fs-1"])

    // A short page is the end of the set, so the first page here stops the
    // loop — the second page is never asked for.
    expect(captured.ranges).toEqual([[0, 999]])
    expect(result).toHaveLength(1)
  })

  it("asks for another page when a page comes back full", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    const full = Array.from({ length: 1000 }, (_, i) => row(`e-${i}`, "stu-1"))
    const nextPage = pageSource([
      { data: full, error: null },
      { data: [row("e-last", "stu-2")], error: null },
    ])
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(nextPage, captured)
    })

    const result = await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ["fs-1"])

    expect(captured.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(result).toHaveLength(1001)
  })

  it("orders by id, so the pages cannot skip a row", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [], orders: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(pageSource([{ data: [row("e-0", "stu-1")], error: null }]), captured)
    })

    await evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ["fs-1"])

    expect(captured.orders).toEqual(["id"])
  })

  it("throws when a page errors", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(pageSource([{ data: null, error: { message: "boom" } }]), captured)
    })

    await expect(
      evaluationRepository.listStatusByPeriodAndFacultySubjectIds("p1", ["fs-1"]),
    ).rejects.toEqual({ message: "boom" })
  })
})

describe("listSubmittedByPeriodAndEvaluatees — PostgREST URL budget", () => {
  it("makes no query for an empty evaluatee list", async () => {
    await evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", [])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("chunks a whole department of faculty instead of one oversized .in()", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
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
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
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
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const n = captured.inCalls.length
      return makeChain({ data: null, error: n === 0 ? { message: "url too long" } : null }, captured)
    })

    await expect(evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(250))).rejects.toEqual({ message: "url too long" })
  })
})

describe("listSubmittedByPeriodAndEvaluatees — PostgREST row cap", () => {
  function evalRows(n: number, offset = 0) {
    return Array.from({ length: n }, (_, i) => ({
      id: `e-${String(offset + i).padStart(4, "0")}`,
      evaluateeId: "f1",
      facultySubjectId: "fs1",
      submittedAt: null,
    }))
  }

  /** The client-level page cursor: page 1, page 2, … then empty. */
  function pageSource(pages: { data: unknown[] | null; error: unknown }[]) {
    let cursor = 0
    return () => pages[cursor++] ?? { data: [], error: null }
  }

  it("asks for another page when a page comes back full", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    const nextPage = pageSource([
      { data: evalRows(1000), error: null },
      { data: evalRows(3, 1000), error: null },
    ])
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(nextPage, captured)
    })

    const result = await evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(1))

    // 1,000 rows came back full, so the loop must have asked for the next page.
    expect(captured.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(result).toHaveLength(1003)
  })

  it("merges the pages in order, losing nothing", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    // The first page must be FULL — a short page is the end of the set, so a
    // short first page would correctly stop the loop after one page.
    const nextPage = pageSource([
      { data: evalRows(1000), error: null },
      { data: evalRows(400, 1000), error: null },
    ])
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(nextPage, captured)
    })

    const result = await evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(1))

    expect(result).toHaveLength(1400)
    expect(result[0].id).toBe("e-0000")
    expect(result[999].id).toBe("e-0999")
    // The seam: no gap and no overlap between the two pages.
    expect(result[1000].id).toBe("e-1000")
    expect(result[1399].id).toBe("e-1399")
  })

  it("stops on a short page instead of asking again", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    const nextPage = pageSource([{ data: evalRows(5), error: null }])
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(nextPage, captured)
    })

    const result = await evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(1))

    expect(captured.ranges).toEqual([[0, 999]])
    expect(result).toHaveLength(5)
  })

  it("throws when a page errors", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0, ranges: [] }
    const nextPage = pageSource([{ data: null, error: { message: "boom" } }])
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makePagedChain(nextPage, captured)
    })

    await expect(evaluationRepository.listSubmittedByPeriodAndEvaluatees("p1", ids(1))).rejects.toEqual({ message: "boom" })
  })
})
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))
const mockFetchRatings = vi.hoisted(() => vi.fn())

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
// The ratings read is chunked and paged already (lib/db/common.ts) — it is
// not what this suite is about.
vi.mock("@/lib/db/common", () => ({ fetchRatingsWithCategories: mockFetchRatings }))
vi.mock("@/lib/repositories/factory", () => ({
  semesterRepository: { findActive: vi.fn() },
  userRepository: { listByRole: vi.fn(), listByIds: vi.fn() },
}))

import { getStudentBreakdownsForFaculty } from "@/features/evaluation-results/evaluation-results.repository"

interface Captured {
  /** Every .in() call, with the table it was on. */
  inCalls: { table: string; ids: string[] }[]
  /** The page windows asked for. */
  ranges: number[][]
  orders: string[]
}

function makePagedChain(
  nextPage: () => { data: unknown[] | null; error: unknown },
  captured: Captured,
  table: string,
) {
  let pending = { data: [] as unknown[] | null, error: null as unknown }
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn((_column: string, ids: string[]) => {
      captured.inCalls.push({ table, ids })
      return chain
    }),
    not: vi.fn(() => chain),
    order: vi.fn((column: string) => {
      captured.orders.push(column)
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

/**
 * The comments read does NOT page — it is a plain chunked `.in()`. So its
 * chain answers with the rows the query asked for, and the answer does not
 * depend on a `.range()` ever being called.
 */
function makeCommentsChain(
  rows: { evaluationId: string }[],
  captured: Captured,
  table: string,
) {
  let asked: string[] | null = null
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn((_column: string, ids: string[]) => {
      captured.inCalls.push({ table, ids })
      asked = ids
      return chain
    }),
    not: vi.fn(() => chain),
    order: vi.fn((column: string) => {
      captured.orders.push(column)
      return chain
    }),
    range: vi.fn((from: number, to: number) => {
      captured.ranges.push([from, to])
      return chain
    }),
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({
        // PostgREST answers with the rows that match the filter.
        data: rows.filter((r) => !asked || asked.includes(r.evaluationId)),
        error: null,
      }).then(onFulfilled),
  }
  return chain
}

/** The client-level page cursor: page 1, page 2, … then empty. */
function pageSource(pages: { data: unknown[] | null; error: unknown }[]) {
  let cursor = 0
  return () => pages[cursor++] ?? { data: [], error: null }
}

function evalRows(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e-${String(offset + i).padStart(4, "0")}`,
    evaluateeId: "f1",
  }))
}

function commentRows(evaluationIds: string[]) {
  return evaluationIds.map((evaluationId, i) => ({
    id: `c-${i}`,
    evaluationId,
    comment: `comment ${i}`,
    sentimentLabel: "Positive",
    sentimentScore: 0.5,
  }))
}

/** Answers the two tables the breakdown reads. */
function respondWith(
  captured: Captured,
  evals: { data: unknown[] | null; error: unknown }[],
  comments: { data: unknown[] | null; error: unknown },
) {
  const evalPage = pageSource(evals)
  mockSupabase.from.mockImplementation((table: string) => {
    return table === "evaluations"
      ? makePagedChain(evalPage, captured, table)
      : makeCommentsChain((comments.data ?? []) as { evaluationId: string }[], captured, table)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchRatings.mockResolvedValue([])
})

describe("getStudentBreakdownsForFaculty", () => {
  it("returns one row per evaluation, with its comment", async () => {
    const captured: Captured = { inCalls: [], ranges: [], orders: [] }
    respondWith(
      captured,
      [{ data: evalRows(3), error: null }],
      { data: commentRows(["e-0000", "e-0001", "e-0002"]), error: null },
    )

    const rows = await getStudentBreakdownsForFaculty("p1", "f1")

    expect(rows).toHaveLength(3)
    expect(rows[0].comment).toBe("comment 0")
    expect(rows[0].sentimentLabel).toBe("Positive")
  })

  it("chunks the comments read, so the .in() stays within the URL budget", async () => {
    const captured: Captured = { inCalls: [], ranges: [], orders: [] }
    const evaluations = Array.from({ length: 250 }, (_, i) => `e-${String(i).padStart(4, "0")}`)
    respondWith(
      captured,
      [{ data: evalRows(250), error: null }],
      { data: commentRows(evaluations), error: null },
    )

    await getStudentBreakdownsForFaculty("p1", "f1")

    const commentCalls = captured.inCalls.filter((c) => c.table === "evaluation_comments")
    // 250 ids / 100 per chunk = 3 requests, not one oversized .in()
    expect(commentCalls.map((c) => c.ids.length)).toEqual([100, 100, 50])
    for (const call of commentCalls) {
      expect(call.ids.length).toBeLessThanOrEqual(100)
    }
  })

  it("pages the evaluations read past the 1,000-row cap", async () => {
    const captured: Captured = { inCalls: [], ranges: [], orders: [] }
    respondWith(
      captured,
      [
        { data: evalRows(1000), error: null },
        { data: evalRows(3, 1000), error: null },
      ],
      { data: [], error: null },
    )

    const rows = await getStudentBreakdownsForFaculty("p1", "f1")

    // 1,000 rows came back full, so the loop must have asked for the next page.
    expect(captured.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(rows).toHaveLength(1003)
  })

  it("orders the evaluations by id, so the pages cannot skip a row", async () => {
    const captured: Captured = { inCalls: [], ranges: [], orders: [] }
    respondWith(captured, [{ data: evalRows(2), error: null }], { data: [], error: null })

    await getStudentBreakdownsForFaculty("p1", "f1")

    expect(captured.orders).toEqual(["id"])
  })

  it("returns nothing when the faculty has no evaluations", async () => {
    const captured: Captured = { inCalls: [], ranges: [], orders: [] }
    respondWith(captured, [{ data: [], error: null }], { data: [], error: null })

    const rows = await getStudentBreakdownsForFaculty("p1", "f1")

    expect(rows).toEqual([])
  })
})

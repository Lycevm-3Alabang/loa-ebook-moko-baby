import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))

import { fetchRatingsWithCategories, RUBRIC_STATEMENT_COUNT } from "@/lib/db/common"

/** The mocked client, in the shape the helper takes. */
const client = mockSupabase as never

/** PostgREST's db-max-rows — and the page size the repository asks for. */
const PAGE = 1000

interface Captured {
  ranges: number[][]
  orders: string[]
  inCalls: string[][]
  /** The columns each read asked for, in the order the reads were made. */
  selects?: string[]
}

interface Page {
  data: unknown[] | null
  error: unknown
}

/**
 * A chain that answers one page at a time. The page cursor lives on the
 * CLIENT, not on the chain: the repository calls `from()` inside its page
 * loop, so a per-chain cursor would restart at page 1 on every request — a
 * real client advances the offset in the `Range` header instead, and that is
 * what this models.
 */
function makeChain(captured: Captured, staticResponse: Page, nextPage: () => Page) {
  let pending = staticResponse
  const chain = {
    select: vi.fn((columns: string) => {
      captured.selects?.push(columns)
      return chain
    }),
    in: vi.fn((_column: string, ids: string[]) => {
      captured.inCalls.push(ids)
      return chain
    }),
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

function ratingsRows(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    evaluationId: `e-${String(offset + i).padStart(4, "0")}`,
    rating: ((offset + i) % 5) + 1,
    itemId: `item-${(offset + i) % RUBRIC_STATEMENT_COUNT}`,
  }))
}

const ITEM_IDS = Array.from({ length: RUBRIC_STATEMENT_COUNT }, (_, i) => `item-${i}`)

function installClient(pages: Page[], captured: Captured) {
  let cursor = 0
  const nextPage = () => pages[cursor++] ?? { data: [], error: null }
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "evaluation_ratings") {
      return makeChain(captured, { data: [], error: null }, nextPage)
    }
    if (table === "rubric_items") {
      return makeChain(
        captured,
        {
          data: ITEM_IDS.map((id) => ({
            id,
            categoryId: "cat-1",
            text: `Statement ${id}`,
            displayOrder: 1,
          })),
          error: null,
        },
        nextPage,
      )
    }
    if (table === "rubric_categories") {
      return makeChain(
        captured,
        { data: [{ id: "cat-1", name: "Professional Manner", displayOrder: 1 }], error: null },
        nextPage,
      )
    }
    return makeChain(captured, { data: [], error: null }, nextPage)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("fetchRatingsWithCategories — PostgREST row cap", () => {
  it("asks for another page when a page comes back full", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    installClient(
      [
        { data: ratingsRows(PAGE), error: null },
        { data: ratingsRows(3, PAGE), error: null },
      ],
      captured,
    )

    const result = await fetchRatingsWithCategories(client, ["e-0000"])

    // 1,000 rows came back full, so the loop must have asked for the next page.
    expect(captured.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(result).toHaveLength(PAGE + 3)
  })

  it("merges the pages in order, losing nothing", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    // The first page must be FULL — a short page is the end of the set, so a
    // short first page would correctly stop the loop after one page.
    installClient(
      [
        { data: ratingsRows(PAGE), error: null },
        { data: ratingsRows(400, PAGE), error: null },
      ],
      captured,
    )

    const result = await fetchRatingsWithCategories(client, ["e-0000"])

    expect(result).toHaveLength(PAGE + 400)
    expect(result[0].evaluationId).toBe("e-0000")
    expect(result[PAGE - 1].evaluationId).toBe("e-0999")
    // The seam: no gap and no overlap between the two pages.
    expect(result[PAGE].evaluationId).toBe("e-1000")
    expect(result[PAGE + 399].evaluationId).toBe("e-1399")
  })

  it("stops on a short page instead of asking again", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    installClient([{ data: ratingsRows(10), error: null }], captured)

    const result = await fetchRatingsWithCategories(client, ["e-0000"])

    expect(captured.ranges).toEqual([[0, 999]])
    expect(result).toHaveLength(10)
  })

  it("throws when a page errors", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    installClient([{ data: null, error: { message: "boom" } }], captured)

    await expect(fetchRatingsWithCategories(client, ["e-0000"])).rejects.toEqual({
      message: "boom",
    })
  })

  it("makes no query for an empty id list", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    installClient([], captured)

    const result = await fetchRatingsWithCategories(client, [])

    expect(result).toEqual([])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("orders by the (evaluationId, itemId) pair — a total order, so the pages cannot overlap", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    installClient([{ data: ratingsRows(3), error: null }], captured)

    await fetchRatingsWithCategories(client, ["e-0000"])

    // evaluation_ratings is UNIQUE("evaluationId","itemId"), so this pair is a
    // total order. A single column would not be: many rows share one
    // evaluationId, and those could straddle a page boundary.
    expect(captured.orders).toEqual(["evaluationId", "itemId"])
  })

  it("still chunks the ids for the URL budget", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    installClient([{ data: [], error: null }], captured)

    await fetchRatingsWithCategories(
      client,
      Array.from({ length: 250 }, (_, i) => `e-${String(i).padStart(4, "0")}`),
    )

    // A chunk's ratings must fit under PostgREST's 1,000-row cap in ONE
    // request, so the chunk is sized from the rubric's statement count:
    // floor(1000 / 34) = 29 evaluations, and 29 x 34 = 986 rows. The ~8KB URL
    // cap still holds (29 ids ≈ 1.1KB). Each chunk pages from its own offset 0.
    const chunkSize = captured.inCalls[0].length
    expect(chunkSize).toBe(Math.floor(1000 / RUBRIC_STATEMENT_COUNT))
    expect(chunkSize * RUBRIC_STATEMENT_COUNT).toBeLessThan(1000)

    const chunkCount = Math.ceil(250 / chunkSize)
    expect(captured.ranges).toEqual(Array.from({ length: chunkCount }, () => [0, 999]))
    // The reads after the ratings (the rubric) are not chunks of evaluations.
    for (const chunk of captured.inCalls.slice(0, chunkCount)) {
      expect(chunk.length).toBeLessThanOrEqual(chunkSize)
    }
  })
})

/**
 * The rubric item's identity has to survive the read.
 *
 * The category grain was enough until the export's form: its column I holds one
 * value per *statement*, so the item's id, text and order have to arrive with
 * the rating — the read used to select `itemId` and then drop it.
 */
describe("fetchRatingsWithCategories — the rubric item comes through", () => {
  it("carries the item's id, text and order, and the criterion's order", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    installClient([{ data: ratingsRows(2), error: null }], captured)

    const result = await fetchRatingsWithCategories(client, ["e-0000"])

    expect(result[0].itemId).toBe("item-0")
    expect(result[0].rubric_items.id).toBe("item-0")
    expect(result[0].rubric_items.text).toBe("Statement item-0")
    expect(result[0].rubric_items.displayOrder).toBe(1)
    expect(result[0].rubric_items.rubric_categories.name).toBe("Professional Manner")
    expect(result[0].rubric_items.rubric_categories.displayOrder).toBe(1)
  })

  it("asks the rubric for the columns the form needs", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [], selects: [] }
    installClient([{ data: ratingsRows(1), error: null }], captured)

    await fetchRatingsWithCategories(client, ["e-0000"])

    expect(captured.selects).toContain("id, categoryId, text, displayOrder")
    expect(captured.selects).toContain("id, name, displayOrder")
  })

  it("keeps an unresolvable item in the error bucket rather than dropping the rating", async () => {
    const captured: Captured = { ranges: [], orders: [], inCalls: [] }
    // The rubric answers with nothing for this item, so it cannot be named.
    installClient([{ data: [{ evaluationId: "e-0000", rating: 4, itemId: "ghost" }], error: null }], captured)

    const result = await fetchRatingsWithCategories(client, ["e-0000"])

    expect(result).toHaveLength(1)
    expect(result[0].rating).toBe(4)
    expect(result[0].itemId).toBe("ghost")
    expect(result[0].rubric_items.categoryId).toBe("")
    expect(result[0].rubric_items.rubric_categories.name).toBe("")
  })
})

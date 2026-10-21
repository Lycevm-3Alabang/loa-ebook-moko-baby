import { describe, it, expect } from "vitest"
import {
  computeItemAverages,
  computeCategoryAverages,
  computeGeneralRating,
  type ItemRatingRow,
} from "@/lib/evaluation-utils"

/** A rating row for one rubric item. */
const row = (over: {
  itemId: string
  rating: number
  text?: string
  displayOrder?: number
  categoryId?: string
  categoryName?: string
  categoryDisplayOrder?: number
}): ItemRatingRow => ({
  rating: over.rating,
  itemId: over.itemId,
  rubric_items: {
    id: over.itemId,
    categoryId: over.categoryId ?? "c1",
    text: over.text ?? "Statement",
    displayOrder: over.displayOrder ?? 1,
    rubric_categories: {
      id: over.categoryId ?? "c1",
      name: over.categoryName ?? "Professional Manner",
      displayOrder: over.categoryDisplayOrder ?? 1,
    },
  },
})

describe("computeItemAverages", () => {
  it("averages the ratings per item", () => {
    const result = computeItemAverages([
      row({ itemId: "i1", rating: 4, displayOrder: 1 }),
      row({ itemId: "i1", rating: 5, displayOrder: 1 }),
      row({ itemId: "i2", rating: 3, displayOrder: 2 }),
    ])

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ itemId: "i1", avg: 4.5, count: 2 })
    expect(result[1]).toMatchObject({ itemId: "i2", avg: 3, count: 1 })
  })

  it("carries the statement's text, order and criterion", () => {
    const [item] = computeItemAverages([
      row({
        itemId: "i1",
        rating: 4,
        text: "The professor has always dressed appropriately and is well groomed.",
        displayOrder: 2,
        categoryId: "c3",
        categoryName: "Student Engagement",
        categoryDisplayOrder: 3,
      }),
    ])

    expect(item).toEqual({
      itemId: "i1",
      text: "The professor has always dressed appropriately and is well groomed.",
      displayOrder: 2,
      categoryId: "c3",
      categoryName: "Student Engagement",
      categoryDisplayOrder: 3,
      avg: 4,
      count: 1,
    })
  })

  it("orders by the criterion's order, then the statement's own", () => {
    const result = computeItemAverages([
      row({ itemId: "b", rating: 4, displayOrder: 2, categoryDisplayOrder: 1 }),
      row({ itemId: "a", rating: 4, displayOrder: 1, categoryDisplayOrder: 1 }),
      row({ itemId: "c", rating: 4, displayOrder: 1, categoryDisplayOrder: 2 }),
    ])

    expect(result.map((i) => i.itemId)).toEqual(["a", "b", "c"])
  })

  it("leaves the mean raw — the caller rounds", () => {
    const result = computeItemAverages([
      row({ itemId: "i1", rating: 1 }),
      row({ itemId: "i1", rating: 2 }),
      row({ itemId: "i1", rating: 2 }),
    ])

    expect(result[0].avg).toBe(5 / 3)
  })

  it("keeps a statement whose criterion does not resolve in the error bucket", () => {
    const result = computeItemAverages([
      row({ itemId: "i1", rating: 4, categoryId: "", categoryName: "" }),
    ])

    expect(result[0].categoryName).toBe("")
    expect(result[0].avg).toBe(4)
  })

  it("skips a row with no item — it cannot be attributed", () => {
    const result = computeItemAverages([
      { ...row({ itemId: "i1", rating: 4 }), itemId: "" },
      row({ itemId: "i2", rating: 5 }),
    ])

    expect(result.map((i) => i.itemId)).toEqual(["i2"])
  })

  it("returns nothing for no ratings", () => {
    expect(computeItemAverages([])).toEqual([])
  })
})

/**
 * The two grains must describe the same numbers.
 *
 * A submitted response rates EVERY statement — the submit button is disabled
 * until they are all answered — so each statement of a criterion carries
 * exactly one rating per response. That makes a criterion's mean over its
 * rating rows EQUAL to the mean of its statement means, which is why the
 * export's form and the legacy workbook's FINAL RATING agree.
 */
describe("the statement grain and the criterion grain agree", () => {
  const responses = [
    { i1: 5, i2: 4, i3: 3 },
    { i1: 5, i2: 3, i3: 4 },
  ]
  const rows: ItemRatingRow[] = []
  for (const r of responses) {
    rows.push(row({ itemId: "i1", rating: r.i1, displayOrder: 1, categoryId: "c1", categoryName: "Professional Manner", categoryDisplayOrder: 1 }))
    rows.push(row({ itemId: "i2", rating: r.i2, displayOrder: 2, categoryId: "c1", categoryName: "Professional Manner", categoryDisplayOrder: 1 }))
    rows.push(row({ itemId: "i3", rating: r.i3, displayOrder: 1, categoryId: "c2", categoryName: "Time Management", categoryDisplayOrder: 2 }))
  }

  /** The mean of each criterion's statement means — the criterion grain, rebuilt. */
  function criterionMeansFromItems(items: ReturnType<typeof computeItemAverages>) {
    const byCategory = new Map<string, number[]>()
    for (const i of items) {
      if (!byCategory.has(i.categoryName)) byCategory.set(i.categoryName, [])
      byCategory.get(i.categoryName)!.push(i.avg)
    }
    return [...byCategory.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length)
  }

  it("a criterion's mean over its rating rows equals the mean of its statement means", () => {
    const byCategory = computeCategoryAverages(rows)
    const byItem = computeItemAverages(rows)
    const pm = byItem.filter((i) => i.categoryName === "Professional Manner")
    const pmMeanOfMeans = pm.reduce((s, i) => s + i.avg, 0) / pm.length

    // The rating rows of "Professional Manner" are 5, 4, 5, 3 → 4.25.
    expect(byCategory["Professional Manner"]).toBe(4.25)
    // Its statement means are 5 and 3.5 → 4.25.
    expect(pmMeanOfMeans).toBe(4.25)
  })

  it("the general rating is the same from either grain", () => {
    const byCategory = computeCategoryAverages(rows)
    const byItem = computeItemAverages(rows)

    // From the criterion grain: (4.25 + 3.5) / 2 = 3.875 → 3.88.
    expect(computeGeneralRating(byCategory)).toBe(3.88)
    // From the statement grain: the same two criterion means.
    const means = criterionMeansFromItems(byItem)
    expect(means).toEqual([4.25, 3.5])
    expect(Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 100) / 100).toBe(3.88)
  })
})

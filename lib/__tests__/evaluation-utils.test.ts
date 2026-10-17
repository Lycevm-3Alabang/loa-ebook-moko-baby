import { describe, it, expect } from "vitest"
import {
  computeCategoryAverages,
  computeGeneralRating,
  mapCategoryAveragesToColumns,
  findHighestLowestRubrics,
  getRemark,
  computeSentimentScore,
  CATEGORY_NAMES,
  getRemarkColor,
} from "@/lib/evaluation-utils"
import type { RatingRow } from "@/lib/evaluation-utils"

const row = (cat: string, rating: number): RatingRow => ({
  rating,
  rubric_items: { categoryId: "c1", rubric_categories: { name: cat } },
})

describe("computeCategoryAverages", () => {
  it("averages ratings per category", () => {
    const ratings = [row("Professional Manner", 4), row("Professional Manner", 5), row("Time Management", 3)]
    expect(computeCategoryAverages(ratings)).toEqual({
      "Professional Manner": 4.5,
      "Time Management": 3,
    })
  })
  it("returns empty object for no ratings", () => {
    expect(computeCategoryAverages([])).toEqual({})
  })
})

describe("computeGeneralRating", () => {
  it("rounds the mean of category averages to 2dp", () => {
    expect(computeGeneralRating({ a: 4, b: 5 })).toBe(4.5)
    expect(computeGeneralRating({ a: 1, b: 2, c: 3 })).toBe(2)
  })
  it("returns null for empty", () => {
    expect(computeGeneralRating({})).toBeNull()
  })
  it("rounds 4.333... to 4.33 (two-stage contract)", () => {
    expect(computeGeneralRating({ a: 4, b: 4, c: 5 })).toBe(4.33)
  })
})

describe("mapCategoryAveragesToColumns", () => {
  it("maps known categories to columns, rounded", () => {
    const cols = mapCategoryAveragesToColumns({ "Professional Manner": 4.3333, "Communication with Students": 3.5 })
    expect(cols.professionalManner).toBe(4.33)
    expect(cols.communicationWithStudent).toBe(3.5)
  })
  it("leaves unknown categories null", () => {
    const cols = mapCategoryAveragesToColumns({ "Made Up Category": 4 })
    expect(cols.professionalManner).toBeNull()
  })
  it("all eight keys present even when empty", () => {
    const cols = mapCategoryAveragesToColumns({})
    expect(Object.keys(cols)).toHaveLength(8)
    expect(Object.values(cols).every((v) => v === null)).toBe(true)
  })
})

describe("CATEGORY_NAMES aliases", () => {
  it("maps both experiential-learning wordings", () => {
    expect(CATEGORY_NAMES["Experiential Learning Provided to Students"]).toBe("experientialLearning")
    expect(CATEGORY_NAMES["Experiential Learning"]).toBe("experientialLearning")
  })
  it("maps both respect wordings", () => {
    expect(CATEGORY_NAMES["Respect the Uniqueness of the Students"]).toBe("respectUniqueness")
    expect(CATEGORY_NAMES["Respect for Uniqueness"]).toBe("respectUniqueness")
  })
})

describe("findHighestLowestRubrics", () => {
  it("returns categories at max and min of rounded scores", () => {
    const r = findHighestLowestRubrics({ professionalManner: 4.5, timeManagement: 3, studentEngagement: 4.5 })
    expect(r.highest.map((x) => x.key)).toEqual(["professionalManner", "studentEngagement"])
    expect(r.lowest.map((x) => x.key)).toEqual(["timeManagement"])
  })
  it("returns empty arrays when all null", () => {
    expect(findHighestLowestRubrics({ professionalManner: null })).toEqual({ highest: [], lowest: [] })
  })
  it("single category is both highest and lowest", () => {
    const r = findHighestLowestRubrics({ professionalManner: 4 })
    expect(r.highest).toHaveLength(1)
    expect(r.lowest).toHaveLength(1)
    expect(r.highest[0].key).toBe("professionalManner")
  })
})

describe("getRemark", () => {
  it("bands correctly", () => {
    expect(getRemark(4.5)).toBe("Outstanding")
    expect(getRemark(4.49)).toBe("Very Satisfactory")
    expect(getRemark(3.5)).toBe("Very Satisfactory")
    expect(getRemark(2.5)).toBe("Satisfactory")
    expect(getRemark(1.5)).toBe("Unsatisfactory")
    expect(getRemark(1.49)).toBe("Poor")
    expect(getRemark(0)).toBe("Poor")
  })
  it("returns null for null", () => {
    expect(getRemark(null)).toBeNull()
  })
})

describe("computeSentimentScore", () => {
  it("averages non-null scores, rounded 2dp", () => {
    expect(computeSentimentScore([{ sentimentScore: 0.5 }, { sentimentScore: 0.25 }, { sentimentScore: null }])).toBe(0.38)
  })
  it("returns null when no scored comments", () => {
    expect(computeSentimentScore([{ sentimentScore: null }])).toBeNull()
    expect(computeSentimentScore([])).toBeNull()
  })
})

describe("getRemarkColor", () => {
  it("returns a class string for known remarks", () => {
    expect(getRemarkColor("Outstanding")).toContain("success")
    expect(getRemarkColor(null)).toContain("surface-tertiary")
  })
})

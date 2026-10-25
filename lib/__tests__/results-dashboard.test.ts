import { describe, expect, it } from "vitest"
import {
  buildResultsDashboard,
  type ResultsDashboardRow,
  type ResultsDashboardRubric,
} from "@/features/evaluation-results/results-dashboard"
import { getRemark } from "@/lib/evaluation-utils"

function makeRow(
  departmentId: string,
  avgRating: number | null,
  overrides: Partial<ResultsDashboardRow> = {},
): ResultsDashboardRow {
  return {
    departmentId,
    departmentName: `Department ${departmentId}`,
    departmentCode: departmentId.toUpperCase(),
    avgRating,
    remarks: avgRating === null ? null : getRemark(avgRating),
    lowestRubrics: [],
    ...overrides,
  }
}

function rubric(
  key: string,
  label: string,
  score: number,
): ResultsDashboardRubric {
  return { key, label, score }
}

describe("buildResultsDashboard", () => {
  it("excludes null averages from the mean and counts them as unrated", () => {
    const model = buildResultsDashboard(
      [makeRow("a", 4.5), makeRow("b", 3.5), makeRow("c", null)],
      {},
      [],
    )

    expect(model.mean).toBe(4)
    expect(model.meanRemark).toBe("Very Satisfactory")
    expect(model.departmentBars.map((bar) => bar.avgRating)).toEqual([4.5, 3.5, null])
    expect(model.counts).toEqual({
      departmentCount: 3,
      loadedCount: 3,
      missingCount: 0,
      ratedCount: 2,
      unratedCount: 1,
    })
  })

  it("rounds the mean half-up to hundredths", () => {
    const model = buildResultsDashboard(
      [makeRow("a", 4.2), makeRow("b", 4.3)],
      {},
      [],
    )

    expect(model.mean).toBe(4.25)
    expect(model.meanRemark).toBe("Very Satisfactory")
  })

  it("builds one bar per loaded department, ranked with no-rating rows last", () => {
    const model = buildResultsDashboard(
      [
        makeRow("a", 3.5, { departmentName: "Alpha", departmentCode: "A" }),
        makeRow("b", 4.5, { departmentName: "Beta", departmentCode: "B" }),
        makeRow("c", null, { departmentName: "Gamma", departmentCode: "C" }),
        makeRow("d", 4.5, { departmentName: "Delta", departmentCode: "D" }),
        makeRow("e", 4.8, { departmentName: "Epsilon", departmentCode: "E" }),
      ],
      {},
      ["e"],
    )

    expect(model.departmentBars.map((bar) => bar.departmentId)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ])
    expect(model.departmentBars[0]).toEqual({
      departmentId: "b",
      label: "Beta (B)",
      avgRating: 4.5,
      remark: "Outstanding",
    })
    expect(model.departmentBars[3]).toEqual({
      departmentId: "c",
      label: "Gamma (C)",
      avgRating: null,
      remark: null,
    })
    expect(model.counts).toEqual({
      departmentCount: 5,
      loadedCount: 4,
      missingCount: 1,
      ratedCount: 3,
      unratedCount: 1,
    })
  })

  it("keeps the exact remark the table prints on each bar", () => {
    const model = buildResultsDashboard(
      [
        makeRow("p", 1.2, { remarks: "Poor" }),
        makeRow("u", 2.1, { remarks: "Unsatisfactory" }),
      ],
      {},
      [],
    )

    expect(model.departmentBars.map((bar) => bar.departmentId)).toEqual(["u", "p"])
    expect(model.departmentBars.find((bar) => bar.departmentId === "p")?.remark).toBe("Poor")
    expect(model.departmentBars.find((bar) => bar.departmentId === "u")?.remark).toBe(
      "Unsatisfactory",
    )
  })

  it("takes attention departments from the page's map, not from lowestRubrics", () => {
    const low = rubric("timeManagement", "Time Management", 1.2)
    const model = buildResultsDashboard(
      [
        makeRow("a", 4.0, { lowestRubrics: [low] }),
        makeRow("b", 3.0, { lowestRubrics: [low] }),
        makeRow("c", 2.0, { lowestRubrics: [low] }),
      ],
      { a: [low], b: [low] },
      [],
    )

    expect(model.attentionDepartments).toEqual([
      { departmentId: "b", label: "Department b (B)" },
      { departmentId: "a", label: "Department a (A)" },
    ])
  })

  it("sorts attention departments by average, with no-rating rows last", () => {
    const low = rubric("timeManagement", "Time Management", 1.2)
    const model = buildResultsDashboard(
      [makeRow("a", 4.0), makeRow("b", null), makeRow("c", 3.0)],
      { a: [low], b: [low], c: [low] },
      [],
    )

    expect(model.attentionDepartments.map((department) => department.departmentId)).toEqual([
      "c",
      "a",
      "b",
    ])
  })

  it("counts a flagged department once even when it has several critical rubrics", () => {
    const first = rubric("timeManagement", "Time Management", 1.2)
    const second = rubric("learningMaterials", "Learning Materials", 1.1)
    const model = buildResultsDashboard(
      [makeRow("a", 4.0, { lowestRubrics: [first, second] })],
      { a: [first, second] },
      [],
    )

    expect(model.attentionDepartments).toHaveLength(1)
  })

  it("separates a missing department from a loaded department with no rating", () => {
    const model = buildResultsDashboard(
      [makeRow("a", 4.0), makeRow("b", null), makeRow("c", 4.5)],
      {},
      ["c"],
    )

    expect(model.mean).toBe(4)
    expect(model.departmentBars.map((bar) => bar.departmentId)).toEqual(["a", "b"])
    expect(
      model.departmentBars.find((bar) => bar.departmentId === "b")?.avgRating,
    ).toBeNull()
    expect(model.counts).toEqual({
      departmentCount: 3,
      loadedCount: 2,
      missingCount: 1,
      ratedCount: 1,
      unratedCount: 1,
    })
  })

  it("counts a tied weakest criterion once per department and reports the population", () => {
    const timeManagement = rubric("timeManagement", "Time Management", 3.0)
    const learningMaterials = rubric("learningMaterials", "Learning Materials", 3.0)
    const model = buildResultsDashboard(
      [
        makeRow("a", 4.0, {
          lowestRubrics: [timeManagement, learningMaterials],
        }),
        makeRow("b", 3.0, {
          lowestRubrics: [rubric("timeManagement", "Time Management", 2.5)],
        }),
      ],
      {},
      [],
    )

    expect(model.weaknessPopulation).toBe(2)
    expect(model.weakest).toEqual([
      { key: "timeManagement", label: "Time Management", count: 2 },
      { key: "learningMaterials", label: "Learning Materials", count: 1 },
    ])
  })

  it("returns the top three weakest criteria by count, then label", () => {
    const timeManagement = rubric("timeManagement", "Time Management", 3.0)
    const learningMaterials = rubric("learningMaterials", "Learning Materials", 3.0)
    const studentEngagement = rubric("studentEngagement", "Student Engagement", 3.0)
    const experientialLearning = rubric("experientialLearning", "Experiential Learning", 3.0)
    const model = buildResultsDashboard(
      [
        makeRow("a", 4.0, {
          lowestRubrics: [timeManagement, learningMaterials],
        }),
        makeRow("b", 4.0, {
          lowestRubrics: [timeManagement, learningMaterials],
        }),
        makeRow("c", 4.0, {
          lowestRubrics: [timeManagement, studentEngagement],
        }),
        makeRow("d", 4.0, {
          lowestRubrics: [timeManagement, studentEngagement, experientialLearning],
        }),
      ],
      {},
      [],
    )

    expect(model.weaknessPopulation).toBe(4)
    expect(model.weakest).toEqual([
      { key: "timeManagement", label: "Time Management", count: 4 },
      { key: "learningMaterials", label: "Learning Materials", count: 2 },
      { key: "studentEngagement", label: "Student Engagement", count: 2 },
    ])
  })

  it("returns an empty model for no rows", () => {
    expect(buildResultsDashboard([], {}, [])).toEqual({
      mean: null,
      meanRemark: null,
      departmentBars: [],
      attentionDepartments: [],
      weakest: [],
      weaknessPopulation: 0,
      counts: {
        departmentCount: 0,
        loadedCount: 0,
        missingCount: 0,
        ratedCount: 0,
        unratedCount: 0,
      },
    })
  })
})

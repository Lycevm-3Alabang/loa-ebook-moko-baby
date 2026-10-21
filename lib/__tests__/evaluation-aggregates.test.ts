import { describe, it, expect, vi, beforeEach } from "vitest"

const mockQuery = vi.hoisted(() => vi.fn())
vi.mock("@/lib/db/postgres", () => ({ query: mockQuery }))

import {
  ATTRIBUTION_WARNINGS_SQL,
  DEPARTMENT_SENTIMENT_SQL,
  DEPARTMENT_TOTALS_SQL,
  fetchAttributionWarnings,
  fetchDepartmentSentiment,
  fetchDepartmentTotals,
} from "@/features/evaluation-results/evaluation-aggregates"

/**
 * The rules the aggregate carries live in SQL now, so the TypeScript suite
 * cannot exercise them by feeding it rows. These guard the query bodies
 * instead: the rule is pinned where it now lives.
 */
describe("the aggregate queries carry the app's rules", () => {
  it("scope to the period, the submitted and the enabled evaluations", () => {
    expect(DEPARTMENT_TOTALS_SQL).toContain("e.evaluation_period_id = $1")
    expect(DEPARTMENT_TOTALS_SQL).toContain("e.status = 'SUBMITTED'")
    expect(DEPARTMENT_TOTALS_SQL).toContain('e."isDisabled" = false')
    expect(DEPARTMENT_TOTALS_SQL).toContain('e."facultySubjectId" is not null')
  })

  it("drop an evaluation whose assignment no longer belongs to its evaluatee", () => {
    // The live-eval rule: a reassigned assignment leaves the old evaluation
    // behind, and it must not count.
    expect(DEPARTMENT_TOTALS_SQL).toContain('fs.faculty_id = e."evaluateeId"')
    expect(DEPARTMENT_SENTIMENT_SQL).toContain('fs.faculty_id = e."evaluateeId"')
  })

  it("attribute an assignment to the teacher's own department", () => {
    expect(DEPARTMENT_TOTALS_SQL).toContain('u."departmentId"')
    expect(DEPARTMENT_SENTIMENT_SQL).toContain('u."departmentId"')
  })

  it("group the ratings by the rubric category, in the database", () => {
    expect(DEPARTMENT_TOTALS_SQL).toContain("sum(r.rating)")
    expect(DEPARTMENT_TOTALS_SQL).toContain("count(*)::int")
    expect(DEPARTMENT_TOTALS_SQL).toContain("rubric_categories rc")
    expect(DEPARTMENT_TOTALS_SQL).toContain("group by")
  })

  it("count as int, not bigint — node-postgres hands a bigint back as a string", () => {
    expect(DEPARTMENT_TOTALS_SQL).toContain("count(distinct s.id)::int")
    expect(DEPARTMENT_SENTIMENT_SQL).not.toContain("::bigint")
  })

  it("pool the sentiment over the comments, not per faculty average", () => {
    expect(DEPARTMENT_SENTIMENT_SQL).toContain("sum(s.score)::double precision as sentiment_sum")
    expect(DEPARTMENT_SENTIMENT_SQL).toContain("count(*)::int as sentiment_count")
  })

  it("carry the facts the attribution warnings are classified from", () => {
    // The semester (to spot an assignment from another term) and the teacher's
    // home department (null = unattributed).
    expect(ATTRIBUTION_WARNINGS_SQL).toContain('fs."semesterId"')
    expect(ATTRIBUTION_WARNINGS_SQL).toContain('u."departmentId"')
    expect(ATTRIBUTION_WARNINGS_SQL).toContain("select distinct")
  })
})

describe("the aggregates are plain queries over the direct connection", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockQuery.mockResolvedValue([])
  })

  it("create nothing in the database", () => {
    for (const sql of [DEPARTMENT_TOTALS_SQL, DEPARTMENT_SENTIMENT_SQL, ATTRIBUTION_WARNINGS_SQL]) {
      expect(sql).not.toContain("create ")
      expect(sql).not.toContain("p_period_id")
    }
  })

  it("pass the period as a bound parameter, not as text", async () => {
    await fetchDepartmentTotals("p1")
    expect(mockQuery).toHaveBeenCalledWith(DEPARTMENT_TOTALS_SQL, ["p1"])
  })

  it("pass the period as a bound parameter to every aggregate", async () => {
    await fetchDepartmentSentiment("p2")
    expect(mockQuery).toHaveBeenCalledWith(DEPARTMENT_SENTIMENT_SQL, ["p2"])

    await fetchAttributionWarnings("p3")
    expect(mockQuery).toHaveBeenCalledWith(ATTRIBUTION_WARNINGS_SQL, ["p3"])
  })

  it("returns the rows the query gave", async () => {
    mockQuery.mockResolvedValue([{ faculty_subject_id: "fs1", respondent_count: 2 }])
    const rows = await fetchDepartmentTotals("p1")
    expect(rows).toHaveLength(1)
    expect(rows[0].faculty_subject_id).toBe("fs1")
  })
})

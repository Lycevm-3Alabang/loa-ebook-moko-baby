import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
vi.mock("@/lib/db/common", () => ({ fetchRatingsWithCategories: vi.fn() }))

import { evaluationRepository } from "@/features/evaluations/evaluations.repository"

interface Captured {
  /** Every write, with the table and the payload it set. */
  updates: { table: string; payload: Record<string, unknown> }[]
  /** Every filter, as [table, column, value]. */
  filters: [string, string, string][]
}

function makeChain(resolveValue: unknown, captured: Captured, table: string) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      captured.filters.push([table, column, String(value)])
      return chain
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      captured.filters.push([table, column, `in(${values.length})`])
      return chain
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      captured.filters.push([table, column, `not.${operator}.${String(value)}`])
      return chain
    }),
    is: vi.fn((column: string, value: unknown) => {
      captured.filters.push([table, column, `is.${String(value)}`])
      return chain
    }),
    single: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    update: vi.fn((payload: Record<string, unknown>) => {
      captured.updates.push({ table, payload })
      return chain
    }),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
  }
  return chain
}

/** Each table answers with its own rows, so the test reads like the data. */
function respondWith(captured: Captured, rows: Record<string, { data: unknown; error: unknown }>) {
  mockSupabase.from.mockImplementation((table: string) =>
    makeChain(rows[table] ?? { data: [], error: null }, captured, table),
  )
}

function captured(): Captured {
  return { updates: [], filters: [] }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("evaluationRepository.bulkDisableByPeriod", () => {
  it("writes the state with the flag, so every figure's own filter excludes it", async () => {
    const c = captured()
    respondWith(c, {})

    await evaluationRepository.bulkDisableByPeriod("p1", { facultyId: "f1" })

    const update = c.updates.find((u) => u.table === "evaluations")
    expect(update?.payload).toEqual({ isDisabled: true, status: "INVALID" })
  })

  it("still targets the submitted rows", async () => {
    const c = captured()
    respondWith(c, {})

    await evaluationRepository.bulkDisableByPeriod("p1", { facultySubjectId: "fs1" })

    // The WHERE clause reads the row's state, not the one being written.
    expect(c.filters).toContainEqual(["evaluations", "status", "SUBMITTED"])
    expect(c.filters).toContainEqual(["evaluations", "facultySubjectId", "fs1"])
  })
})

describe("evaluationRepository.restoreByIds", () => {
  it("puts a submitted row back to SUBMITTED and clears the flag", async () => {
    const c = captured()
    respondWith(c, {})

    await evaluationRepository.restoreByIds(["e1"])

    expect(c.updates[0].payload).toEqual({ isDisabled: false, status: "SUBMITTED" })
    // The submitted rows are the ones with a submittedAt.
    expect(c.filters).toContainEqual(["evaluations", "submittedAt", "not.is.null"])
  })

  it("puts a never-submitted row back to DRAFT — it was never a response", async () => {
    const c = captured()
    respondWith(c, {})

    await evaluationRepository.restoreByIds(["e2"])

    expect(c.updates[1].payload).toEqual({ isDisabled: false, status: "DRAFT" })
    expect(c.filters).toContainEqual(["evaluations", "submittedAt", "is.null"])
  })

  it("does nothing for an empty list", async () => {
    const c = captured()
    respondWith(c, {})

    await evaluationRepository.restoreByIds([])

    expect(c.updates).toEqual([])
  })
})

describe("the stale-mapping path", () => {
  it("writes the state with the flag when a subject changed teacher", async () => {
    const c = captured()
    respondWith(c, {
      student_enrollments: {
        data: [{ faculty_subject_id: "fs1", section_id: "sec1", semesterId: "s1" }],
        error: null,
      },
      evaluation_periods: { data: { semesterId: "s1" }, error: null },
      // The student's existing response is for the OLD teacher.
      evaluations: {
        data: [{ id: "e1", facultySubjectId: "fs1", evaluateeId: "f-old", isDisabled: false }],
        error: null,
      },
      // The dummy lookup finds nobody.
      users: { data: null, error: null },
      faculty_subjects: {
        data: [{ id: "fs1", faculty_id: "f-new", subject_id: "sub1", semesterId: "s1", section_id: "sec1" }],
        error: null,
      },
    })

    await evaluationRepository.findPending("stu-1", "p1", "s1")

    const update = c.updates.find((u) => u.table === "evaluations")
    expect(update?.payload).toEqual({ isDisabled: true, status: "INVALID" })
  })
})

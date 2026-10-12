import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  supabase: mockSupabase,
}))

import { studentEnrollmentRepository } from "@/features/admin-data/student-enrollment.repository"

function chainable(resolveValue: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
  }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
})

const ITEM_2026_1 = {
  student_id: "stu-1",
  section_id: "sec-1",
  faculty_subject_id: "fs-1",
  semesterId: "sem-2026-1",
}

// ── D2: semesterId must be part of the idempotency key ───────────

describe("addEnrollments — semesterId in the dedupe key", () => {
  it("INSERTs when the same file is re-imported for a second semester", async () => {
    // The 2026-1 import already persisted this row. Re-importing the identical
    // file under 2026-2 is a different constraint tuple, so it must insert.
    const existing = [{ student_id: "stu-1", faculty_subject_id: "fs-1", semesterId: "sem-2026-1" }]

    const selectChain = chainable({ data: existing, error: null })
    mockSupabase.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(chainable({ data: null, error: null }))

    const result = await studentEnrollmentRepository.addEnrollments([
      { ...ITEM_2026_1, semesterId: "sem-2026-2" },
    ])

    expect(result.inserted).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.skippedItems).toEqual([])
  })

  it("skips and attributes per-row when the same semester is re-imported", async () => {
    const existing = [{ student_id: "stu-1", faculty_subject_id: "fs-1", semesterId: "sem-2026-1" }]

    mockSupabase.from
      .mockReturnValueOnce(chainable({ data: existing, error: null }))

    const result = await studentEnrollmentRepository.addEnrollments([ITEM_2026_1])

    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(1)
    // D3 precondition: without per-row attribution ALREADY_PERSISTED cannot be
    // written into the ledger.
    expect(result.skippedItems).toEqual([
      { student_id: "stu-1", faculty_subject_id: "fs-1", section_id: "sec-1" },
    ])
  })

  it("inserts only the semester rows that are genuinely new", async () => {
    const existing = [{ student_id: "stu-1", faculty_subject_id: "fs-1", semesterId: "sem-2026-1" }]

    mockSupabase.from
      .mockReturnValueOnce(chainable({ data: existing, error: null }))
      .mockReturnValueOnce(chainable({ data: null, error: null }))

    const result = await studentEnrollmentRepository.addEnrollments([
      ITEM_2026_1,
      { student_id: "stu-2", section_id: "sec-1", faculty_subject_id: "fs-2", semesterId: "sem-2026-1" },
    ])

    expect(result.inserted).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.skippedItems).toHaveLength(1)
    expect(result.skippedItems[0].student_id).toBe("stu-1")
  })

  it("treats a NULL semester as its own tuple, matching findExisting", async () => {
    const existing = [{ student_id: "stu-1", faculty_subject_id: "fs-1", semesterId: null }]
    const selectChain = chainable({ data: existing, error: null })

    mockSupabase.from.mockReturnValueOnce(selectChain)

    const result = await studentEnrollmentRepository.addEnrollments([
      { ...ITEM_2026_1, semesterId: null },
    ])

    expect(result.skipped).toBe(1)
    expect(selectChain.is).toHaveBeenCalledWith("semesterId", null)
  })
})

// ── The read must be scoped, not the whole table ─────────────────

describe("addEnrollments — scoped idempotency read", () => {
  it("selects semesterId and filters by semester, not by section", async () => {
    const selectChain = chainable({ data: [], error: null })
    mockSupabase.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(chainable({ data: null, error: null }))

    await studentEnrollmentRepository.addEnrollments([ITEM_2026_1])

    // semesterId must reach the select or the key cannot be built.
    expect(selectChain.select).toHaveBeenCalledWith(
      expect.stringContaining("semesterId"),
    )
    // Semester must constrain the read: a fresh term reads ~0 rows instead of
    // re-reading every enrollment accumulated across the run.
    expect(selectChain.eq).toHaveBeenCalledWith("semesterId", "sem-2026-1")
    // student_id bounds the read to this chunk's students.
    expect(selectChain.in).toHaveBeenCalledWith("student_id", ["stu-1"])
    expect(selectChain.in).toHaveBeenCalledWith("faculty_subject_id", ["fs-1"])
    expect(selectChain.in).not.toHaveBeenCalledWith("section_id", expect.anything())
  })

  it("makes no database call for empty input", async () => {
    const result = await studentEnrollmentRepository.addEnrollments([])

    expect(result).toEqual({ inserted: 0, skipped: 0, skippedItems: [] })
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("throws on fetch error", async () => {
    mockSupabase.from.mockReturnValueOnce(chainable({ data: null, error: { message: "DB error" } }))

    await expect(
      studentEnrollmentRepository.addEnrollments([ITEM_2026_1]),
    ).rejects.toThrow("DB error")
  })
})

// ── Headcount per faculty_subject, tallied in the application ───

describe("countByFacultySubjectIds", () => {
  it("tallies enrollments per faculty_subject and ignores NULL keys", async () => {
    const chain = chainable({
      data: [
        { faculty_subject_id: "fs-1" },
        { faculty_subject_id: "fs-1" },
        { faculty_subject_id: "fs-2" },
        { faculty_subject_id: null },
      ],
      error: null,
    })
    mockSupabase.from.mockReturnValueOnce(chain)

    const counts = await studentEnrollmentRepository.countByFacultySubjectIds(["fs-1", "fs-2"], "sem-1")

    expect(counts).toEqual({ "fs-1": 2, "fs-2": 1 })
    expect(chain.select).toHaveBeenCalledWith("faculty_subject_id")
    expect(chain.in).toHaveBeenCalledWith("faculty_subject_id", ["fs-1", "fs-2"])
    expect(chain.eq).toHaveBeenCalledWith("semesterId", "sem-1")
  })

  it("skips the semester filter when none is given", async () => {
    const chain = chainable({ data: [], error: null })
    mockSupabase.from.mockReturnValueOnce(chain)

    await studentEnrollmentRepository.countByFacultySubjectIds(["fs-1"])

    expect(chain.eq).not.toHaveBeenCalledWith("semesterId", expect.anything())
  })

  it("makes no database call for empty input", async () => {
    const counts = await studentEnrollmentRepository.countByFacultySubjectIds([])

    expect(counts).toEqual({})
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("chunks large id sets so no single `in=(...)` filter is oversized", async () => {
    const chains: ReturnType<typeof chainable>[] = []
    mockSupabase.from.mockImplementation(() => {
      const chain = chainable({ data: [], error: null })
      chains.push(chain)
      return chain
    })
    const ids = Array.from({ length: 250 }, (_, i) => `fs-${i}`)

    const counts = await studentEnrollmentRepository.countByFacultySubjectIds(ids, "sem-1")

    expect(counts).toEqual({})
    expect(mockSupabase.from).toHaveBeenCalledTimes(3)
    expect(chains).toHaveLength(3)
    expect(chains[0].in).toHaveBeenCalledWith("faculty_subject_id", ids.slice(0, 100))
    expect(chains[1].in).toHaveBeenCalledWith("faculty_subject_id", ids.slice(100, 200))
    expect(chains[2].in).toHaveBeenCalledWith("faculty_subject_id", ids.slice(200, 250))
  })
})

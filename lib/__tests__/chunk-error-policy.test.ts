import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  supabase: mockSupabase,
}))

import { studentEnrollmentRepository } from "@/features/admin-data/student-enrollment.repository"
import { isRetryableChunkError } from "@/features/admin-data/components/useChunkedImport"

beforeEach(() => {
  vi.resetAllMocks()
})

const DUP = {
  code: "23505",
  details: "Key (student_id, faculty_subject_id, \"semesterId\")=(a95f…, e630c…, e000…) already exists.",
  message: "duplicate key value violates unique constraint \"student_enrollments_student_id_faculty_subject_id_key\"",
}

describe("isRetryableChunkError — Postgres errors are never retryable", () => {
  it("does not retry a 23505 unique violation", () => {
    // The observed production failure: this error has no HTTP `status`, so it fell
    // through to `status === undefined → true` and the doomed chunk was retried
    // twice — 46s spent failing three times.
    expect(isRetryableChunkError(DUP)).toBe(false)
  })

  it("does not retry any integrity-constraint class (23xxx)", () => {
    expect(isRetryableChunkError({ code: "23503" })).toBe(false) // foreign key violation
    expect(isRetryableChunkError({ code: "23502" })).toBe(false) // not-null violation
    expect(isRetryableChunkError({ code: "23514" })).toBe(false) // check violation
  })

  it("still retries genuine transport failures, which carry no code", () => {
    expect(isRetryableChunkError(new TypeError("Failed to fetch"))).toBe(true)
    expect(isRetryableChunkError(new Error("socket closed"))).toBe(true)
  })

  it("still retries HTTP 408/425/429/5xx and not 400", () => {
    const withStatus = (status: number) => Object.assign(new Error("http"), { status })
    expect(isRetryableChunkError(withStatus(408))).toBe(true)
    expect(isRetryableChunkError(withStatus(425))).toBe(true)
    expect(isRetryableChunkError(withStatus(429))).toBe(true)
    expect(isRetryableChunkError(withStatus(503))).toBe(true)
    expect(isRetryableChunkError(withStatus(400))).toBe(false)
  })

  it("does not blindly retry a 504, while 503 still retries", () => {
    const withStatus = (status: number) => Object.assign(new Error("http"), { status })
    // S1 (spec §4.2, F3): a 504 exhausted maxDuration on this exact work —
    // retrying the same size cannot succeed. Halving lands in S3/S4.
    expect(isRetryableChunkError(withStatus(504))).toBe(false)
    expect(isRetryableChunkError(withStatus(503))).toBe(true)
  })

  it("never retries a user abort", () => {
    expect(isRetryableChunkError(new DOMException("Aborted", "AbortError"))).toBe(false)
  })
})

// ── The real 23505 path: duplicate rows in one insert ────────────

describe("addEnrollments — duplicate rows in one request", () => {
  it("inserts ONE row when the file repeats the same student+topic, so Postgres cannot 23505", async () => {
    const items = [
      { student_id: "stu-1", section_id: "sec-1", faculty_subject_id: "fs-1", semesterId: "sem-1" },
      { student_id: "stu-1", section_id: "sec-1", faculty_subject_id: "fs-1", semesterId: "sem-1" },
      { student_id: "stu-1", section_id: "sec-1", faculty_subject_id: "fs-1", semesterId: "sem-1" },
    ]
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled),
    }
    mockSupabase.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
      })
      .mockReturnValueOnce(insertChain)

    const result = await studentEnrollmentRepository.addEnrollments(items)

    // Defence in depth: the service already dedupes, but the repository must never
    // hand Postgres two copies of one key in a single INSERT.
    expect(insertChain.insert).toHaveBeenCalledTimes(1)
    expect(insertChain.insert).toHaveBeenCalledWith([
      { student_id: "stu-1", section_id: "sec-1", faculty_subject_id: "fs-1", semesterId: "sem-1" },
    ])
    expect(result.inserted).toBe(1)
    // 2 collapsed in-request duplicates are accounted for in `skipped`…
    expect(result.skipped).toBe(2)
    // …but NOT in skippedItems, which means "already in the database". A repeated
    // CSV row is a different reason; D3 gives it its own ledger code.
    expect(result.skippedItems).toHaveLength(0)
  })
})

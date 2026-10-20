import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))

import { facultySubjectRepository } from "@/features/admin-data/faculty-subject.repository"
import { subjectRepository } from "@/features/admin-data/subject.repository"

interface Captured { inCalls: string[][]; fromCalls: number }

function makeChain(resolveValue: unknown, captured: Captured) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn((_column: string, ids: string[]) => {
      captured.inCalls.push(ids)
      return chain
    }),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
  }
  return chain
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `id-${String(i).padStart(4, "0")}`)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("findByIds — PostgREST URL budget", () => {
  it("makes no query for an empty list", async () => {
    await facultySubjectRepository.findByIds([])
    await subjectRepository.findByIds([])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it("sends a single query when the list fits in one chunk", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makeChain({ data: [], error: null }, captured)
    })

    await facultySubjectRepository.findByIds(ids(40))

    expect(captured.fromCalls).toBe(1)
    expect(captured.inCalls[0]).toHaveLength(40)
  })

  it("chunks a list that would overflow the URL cap", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makeChain({ data: [], error: null }, captured)
    })

    await facultySubjectRepository.findByIds(ids(250))

    expect(captured.fromCalls).toBe(3)
    expect(captured.inCalls.map((c) => c.length)).toEqual([100, 100, 50])
    expect(captured.inCalls.every((c) => c.length <= 100)).toBe(true)
  })

  it("chunks the subject list too", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      return makeChain({ data: [], error: null }, captured)
    })

    await subjectRepository.findByIds(ids(150))

    expect(captured.fromCalls).toBe(2)
    expect(captured.inCalls.map((c) => c.length)).toEqual([100, 50])
  })

  it("keeps every row across the chunks", async () => {
    const captured: Captured = { inCalls: [], fromCalls: 0 }
    let call = 0
    mockSupabase.from.mockImplementation(() => {
      captured.fromCalls++
      const batch = call++
      return makeChain({ data: [{ id: `row-${batch}` }], error: null }, captured)
    })

    const rows = await facultySubjectRepository.findByIds(ids(250))

    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.id)).toEqual(["row-0", "row-1", "row-2"])
  })
})

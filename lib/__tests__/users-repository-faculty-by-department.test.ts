import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
// The repository writes an audit line on its write paths; the read under test
// does not, and the audit service pulls in the whole factory.
vi.mock("@/lib/services/audit", () => ({ logAuditEvent: vi.fn() }))

import { userRepository } from "@/features/users/users.repository"

function makeChain(resolveValue: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
  }
  return chain
}

function respondWith(rows: unknown[]) {
  const chain = makeChain({ data: rows, error: null })
  mockSupabase.from.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("userRepository.listFacultyByDepartment", () => {
  it("filters on the role AND the department in the query", async () => {
    const chain = respondWith([
      { id: "f1", name: "Ana", email: "ana@x", departmentId: "d1", userrole: [{ roleName: "FACULTY" }] },
    ])

    const faculty = await userRepository.listFacultyByDepartment("d1")

    // Both filters are the database's job: the department's students must
    // never cross the wire, and the school-wide faculty list must not either.
    expect(chain.eq).toHaveBeenCalledWith("userrole.roleName", "FACULTY")
    expect(chain.eq).toHaveBeenCalledWith("departmentId", "d1")
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining("userrole!inner(roleName)"))
    expect(faculty.map((f) => f.id)).toEqual(["f1"])
    expect(faculty[0].role).toBe("FACULTY")
  })

  it("leaves out the soft-deleted by default, and keeps them on request", async () => {
    const chain = respondWith([])

    await userRepository.listFacultyByDepartment("d1")
    expect(chain.is).toHaveBeenCalledWith("deletedAt", null)

    vi.resetAllMocks()
    const chain2 = respondWith([])
    await userRepository.listFacultyByDepartment("d1", { includeDeleted: true })
    expect(chain2.is).not.toHaveBeenCalled()
  })

  it("claims nobody when the role table is missing", async () => {
    mockSupabase.from.mockImplementation(() => {
      throw new Error('relation "userrole" does not exist')
    })

    // Without the role table nobody can be known to be faculty — the same
    // answer listByRole gives.
    const faculty = await userRepository.listFacultyByDepartment("d1")
    expect(faculty).toEqual([])
  })
})

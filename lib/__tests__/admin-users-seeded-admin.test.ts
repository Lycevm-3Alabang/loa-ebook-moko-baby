import { beforeEach, describe, expect, it, vi } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockUserRepository = vi.hoisted(() => ({
  findById: vi.fn(),
  listByRole: vi.fn(),
  update: vi.fn(),
}))
const mockLogAuditEvent = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/repositories/factory", () => ({
  userRepository: mockUserRepository,
  departmentRepository: {},
}))
vi.mock("@/features/users/users.service", () => ({
  bulkPreviewUsers: vi.fn(),
  bulkUpsertUsers: vi.fn(),
}))
vi.mock("@/lib/services/audit", () => ({ logAuditEvent: mockLogAuditEvent }))

import { PATCH } from "@/app/api/admin/users/route"

const SEEDED_ADMIN_ID = "a0000000-0000-0000-0000-000000000001"

function patch(payload: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }) as never
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockAuth.mockResolvedValue({ user: { id: "operator-id" } })
  mockUserRepository.findById.mockResolvedValue({
    id: SEEDED_ADMIN_ID,
    email: "admin@lyceumalabang.edu.ph",
    role: "ADMIN",
    isDisabled: false,
  })
  mockUserRepository.listByRole.mockResolvedValue([
    { id: SEEDED_ADMIN_ID, role: "ADMIN", isDisabled: false },
  ])
  mockUserRepository.update.mockResolvedValue({ id: SEEDED_ADMIN_ID, isDisabled: true })
  mockLogAuditEvent.mockResolvedValue(undefined)
})

describe("PATCH /api/admin/users seeded admin disable guard", () => {
  it("refuses to disable the seeded admin when there is no other enabled admin", async () => {
    const response = await PATCH(patch({ userId: SEEDED_ADMIN_ID, isDisabled: true }))

    expect(response.status).toBe(409)
    expect(mockUserRepository.update).not.toHaveBeenCalled()
  })

  it("allows disabling the seeded admin when another enabled admin exists", async () => {
    mockUserRepository.listByRole.mockResolvedValue([
      { id: SEEDED_ADMIN_ID, role: "ADMIN", isDisabled: false },
      { id: "backup-admin", role: "FACULTY|ADMIN", isDisabled: false },
    ])

    const response = await PATCH(patch({ userId: SEEDED_ADMIN_ID, isDisabled: true }))

    expect(response.status).toBe(200)
    expect(mockUserRepository.update).toHaveBeenCalledWith(SEEDED_ADMIN_ID, { isDisabled: true })
  })

  it("does not treat a disabled admin as the required backup", async () => {
    mockUserRepository.listByRole.mockResolvedValue([
      { id: SEEDED_ADMIN_ID, role: "ADMIN", isDisabled: false },
      { id: "disabled-admin", role: "ADMIN", isDisabled: true },
    ])

    const response = await PATCH(patch({ userId: SEEDED_ADMIN_ID, isDisabled: true }))

    expect(response.status).toBe(409)
    expect(mockUserRepository.update).not.toHaveBeenCalled()
  })

  it("allows re-enabling the seeded admin even when it is the only admin", async () => {
    mockUserRepository.update.mockResolvedValue({ id: SEEDED_ADMIN_ID, isDisabled: false })

    const response = await PATCH(patch({ userId: SEEDED_ADMIN_ID, isDisabled: false }))

    expect(response.status).toBe(200)
    expect(mockUserRepository.listByRole).not.toHaveBeenCalled()
  })

  it("does not treat a non-admin account with the seeded email as the protected admin", async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: "ordinary-user",
      email: "admin@lyceumalabang.ph",
      role: "FACULTY",
      isDisabled: false,
    })
    mockUserRepository.update.mockResolvedValue({ id: "ordinary-user", isDisabled: true })

    const response = await PATCH(patch({ userId: "ordinary-user", isDisabled: true }))

    expect(response.status).toBe(200)
    expect(mockUserRepository.listByRole).not.toHaveBeenCalled()
  })
})

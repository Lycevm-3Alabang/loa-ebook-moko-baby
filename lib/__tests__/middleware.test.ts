import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetToken = vi.hoisted(() => vi.fn())
const mockGetUserAccess = vi.hoisted(() => vi.fn())

vi.mock("next-auth/jwt", () => ({
  getToken: mockGetToken,
}))

vi.mock("@/lib/access", () => ({
  getUserAccess: mockGetUserAccess,
}))

import { proxy } from "@/proxy"

function mockRequest(pathname: string, extra: Record<string, unknown> = {}): Request {
  const url = new URL(`https://app.test${pathname}`)
  return {
    url: url.href,
    nextUrl: url,
    headers: new Headers(),
    ...extra,
  } as unknown as Request
}

function isRedirect(res: Response): boolean {
  return res.status >= 300 && res.status < 400
}

function isForbidden(res: Response): boolean {
  return res.status === 403
}

describe("proxy middleware", () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    mockGetUserAccess.mockResolvedValue([])
  })

  it("allows public paths without token", async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await proxy(mockRequest("/login"))
    expect(isRedirect(res)).toBe(false)
    expect(isForbidden(res)).toBe(false)
  })

  it("allows public prefixes without token", async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await proxy(mockRequest("/api/auth/session"))
    expect(isRedirect(res)).toBe(false)
    expect(isForbidden(res)).toBe(false)
  })

  it("redirects unauthenticated requests to login", async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await proxy(mockRequest("/faculty/meetings"))
    expect(res.status).toBe(307)
  })

  it("allows root path without token", async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await proxy(mockRequest("/"))
    expect(res.status).toBe(200)
  })

  it("allows API routes in user access", async () => {
    mockGetToken.mockResolvedValue({ role: "FACULTY", id: "user-1" })
    mockGetUserAccess.mockResolvedValue([
      { url: "/api/appointments", access: "granted", type: "api" },
    ])
    const res = await proxy(mockRequest("/api/appointments"))
    expect(res.status).toBe(200)
  })

  it("blocks admin API routes for non-admin users", async () => {
    mockGetToken.mockResolvedValue({ role: "FACULTY", id: "user-1" })
    const res = await proxy(mockRequest("/api/admin/users"))
    expect(res.status).toBe(403)
  })

  it("allows admin API routes for admin users", async () => {
    mockGetToken.mockResolvedValue({ role: "ADMIN|FACULTY", id: "admin-1" })
    mockGetUserAccess.mockResolvedValue([
      { url: "/api/admin/users", access: "granted", type: "api" },
    ])
    const res = await proxy(mockRequest("/api/admin/users"))
    expect(res.status).toBe(200)
  })

  it("passes through page access when not granted (LockedTab on client)", async () => {
    mockGetToken.mockResolvedValue({ role: "STUDENT", id: "user-1" })
    const res = await proxy(mockRequest("/admin"))
    expect(res.status).toBe(200)
  })

  it("allows page access when granted", async () => {
    mockGetToken.mockResolvedValue({ role: "STUDENT", id: "user-1" })
    mockGetUserAccess.mockResolvedValue([
      { url: "/student/meetings", access: "granted", type: "ui" },
    ])
    const res = await proxy(mockRequest("/student/meetings"))
    expect(res.status).toBe(200)
  })

  it("passes through revoked UI pages (LockedTab on client)", async () => {
    mockGetToken.mockResolvedValue({ role: "STUDENT", id: "user-1" })
    mockGetUserAccess.mockResolvedValue([
      { url: "/student", access: "revoked", type: "ui" },
    ])
    const res = await proxy(mockRequest("/student"))
    expect(res.status).toBe(200)
  })

  // EC-API-001 ACC-4b / CON-12: the BFF path is exempt from this gate.
  // Without the exemption, a leftover legacy session on a non-admin account
  // hits closed-by-default below and 403s every sign-in call — the BFF's
  // security is the Consult API's own middleware, applied upstream.
  it("exempts the BFF path from closed-by-default for non-admins with a legacy session", async () => {
    mockGetToken.mockResolvedValue({ role: "FACULTY", id: "user-1" })
    const res = await proxy(mockRequest("/api/v1/appointments"))
    expect(isForbidden(res)).toBe(false)
    expect(res.status).toBe(200)
  })

  it("exempts the BFF callback path from closed-by-default", async () => {
    mockGetToken.mockResolvedValue({ role: "STUDENT", id: "user-1" })
    const res = await proxy(mockRequest("/api/v1/auth/callback"))
    expect(isForbidden(res)).toBe(false)
  })
})

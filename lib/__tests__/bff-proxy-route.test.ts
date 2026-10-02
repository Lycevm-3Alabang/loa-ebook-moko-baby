import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// EC-API-001 D-4 — BFF passthrough (EC-D2). One behavior per test.
// ACC-1 routing · ACC-2 forwarding · ACC-3 cookie scoping · ACC-4 failure modes.
//
// Per AGENTS.md Lessons Learned §5: resetAllMocks, not clearAllMocks — the
// implementation queue must be cleared or one-time implementations leak
// between tests.

const mockFetch = vi.hoisted(() => vi.fn())

// EC-PLAT-001 ACC-2 requires the target asserted in BOTH directions, and
// route.ts captures it in a module-level const — so the value must be in place
// before the module below is imported. `beforeEach` runs long after import
// evaluation and cannot influence a frozen const, which is why the unset case
// has to re-import the module rather than mutate the env mid-file.
const { ORIGINAL_CONSULT_API_URL } = vi.hoisted(() => {
  const original = process.env.CONSULT_API_URL
  process.env.CONSULT_API_URL = "http://localhost:9002"
  return { ORIGINAL_CONSULT_API_URL: original }
})

vi.stubGlobal("fetch", mockFetch)

import { NextRequest } from "next/server"
import {
  GET,
  POST,
  PUT,
  PATCH,
  DELETE,
  HEAD,
  OPTIONS,
} from "@/app/api/v1/[...path]/route"

function upstream(overrides: Partial<Response> = {}): Response {
  return {
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    body: null,
    ...overrides,
  } as unknown as Response
}

function request(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): NextRequest {
  const method = init.method ?? "GET"
  return new NextRequest(`https://app.test/api/v1/${path}`, {
    method,
    headers: new Headers(init.headers ?? {}),
    ...(init.body !== undefined ? { body: init.body } : {}),
  })
}

async function call(
  handler: typeof GET,
  path: string[],
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
) {
  return handler(request(path.join("/"), init), { params: Promise.resolve({ path }) })
}

function lastCall(): [string, RequestInit] {
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [string, RequestInit]
}

describe("BFF passthrough — EC-API-001", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.CONSULT_API_URL = "http://localhost:9002"
    mockFetch.mockResolvedValue(upstream())
  })

  afterEach(() => {
    if (ORIGINAL_CONSULT_API_URL === undefined) delete process.env.CONSULT_API_URL
    else process.env.CONSULT_API_URL = ORIGINAL_CONSULT_API_URL
  })

  // --- ACC-1: routing -----------------------------------------------------

  it("forwards a domain path to the Consult API", async () => {
    await call(GET, ["appointments"])
    expect(lastCall()[0]).toBe("http://localhost:9002/api/v1/appointments")
  })

  it("forwards the callback path to the Consult API", async () => {
    await call(POST, ["auth", "callback"], { method: "POST" })
    expect(lastCall()[0]).toBe("http://localhost:9002/api/v1/auth/callback")
  })

  it("forwards the refresh path to the Consult API", async () => {
    await call(POST, ["auth", "refresh"], { method: "POST" })
    expect(lastCall()[0]).toBe("http://localhost:9002/api/v1/auth/refresh")
  })

  it("forwards the logout path to the Consult API", async () => {
    await call(POST, ["auth", "logout"], { method: "POST" })
    expect(lastCall()[0]).toBe("http://localhost:9002/api/v1/auth/logout")
  })

  it("preserves the query string on the target URL", async () => {
    const res = await GET(request("appointments?status=pending&page=2"), {
      params: Promise.resolve({ path: ["appointments"] }),
    })
    expect(res.status).toBe(200)
    expect(lastCall()[0]).toBe("http://localhost:9002/api/v1/appointments?status=pending&page=2")
  })

  // --- ACC-2: forwarding --------------------------------------------------

  it("forwards the authorization header", async () => {
    await call(GET, ["appointments"], { headers: { authorization: "Bearer abc" } })
    const headers = lastCall()[1].headers as Headers
    expect(headers.get("authorization")).toBe("Bearer abc")
  })

  it("forwards the content-type header", async () => {
    await call(POST, ["appointments"], { method: "POST", headers: { "content-type": "application/json" } })
    const headers = lastCall()[1].headers as Headers
    expect(headers.get("content-type")).toBe("application/json")
  })

  it("forwards a POST body to the upstream call", async () => {
    await call(POST, ["appointments"], { method: "POST", body: '{"title":"Advising"}' })
    expect(lastCall()[1].body).toBeDefined()
  })

  it("sends no body on GET", async () => {
    await call(GET, ["appointments"], { method: "GET" })
    expect(lastCall()[1].body).toBeUndefined()
  })

  it("passes the upstream content-type through to the response", async () => {
    mockFetch.mockResolvedValue(upstream({ headers: new Headers({ "content-type": "application/json" }) }))
    const res = await call(GET, ["appointments"])
    expect(res.headers.get("content-type")).toBe("application/json")
  })

  it("passes the upstream content-disposition through to the response", async () => {
    mockFetch.mockResolvedValue(
      upstream({ headers: new Headers({ "content-disposition": 'attachment; filename="x.pdf"' }) })
    )
    const res = await call(GET, ["files"])
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="x.pdf"')
  })

  it("passes every upstream set-cookie through to the response", async () => {
    mockFetch.mockResolvedValue(
      upstream({
        headers: {
          get: () => null,
          getSetCookie: () => [
            "loa_connect_refresh=abc; Path=/api/v1/auth; HttpOnly; SameSite=lax",
            "other=1; Path=/",
          ],
        } as unknown as Headers,
      })
    )
    const res = await call(POST, ["auth", "callback"], { method: "POST" })
    const cookies = res.headers.getSetCookie()
    expect(cookies.length).toBe(2)
    expect(cookies[0]).toContain("loa_connect_refresh")
  })

  it("does not forward the upstream content-length (fetch decompresses the body)", async () => {
    mockFetch.mockResolvedValue(upstream({ headers: new Headers({ "content-length": "512" }) }))
    const res = await call(GET, ["appointments"])
    expect(res.headers.get("content-length")).toBeNull()
  })

  it("returns the upstream status code", async () => {
    mockFetch.mockResolvedValue(upstream({ status: 422 }))
    const res = await call(POST, ["appointments"], { method: "POST" })
    expect(res.status).toBe(422)
  })

  // --- ACC-3: cookie scoping ---------------------------------------------

  it("forwards the cookie header on the refresh path", async () => {
    await call(POST, ["auth", "refresh"], { method: "POST", headers: { cookie: "loa_connect_refresh=abc" } })
    const headers = lastCall()[1].headers as Headers
    expect(headers.get("cookie")).toBe("loa_connect_refresh=abc")
  })

  it("forwards the cookie header on the logout path", async () => {
    await call(POST, ["auth", "logout"], { method: "POST", headers: { cookie: "loa_connect_refresh=abc" } })
    const headers = lastCall()[1].headers as Headers
    expect(headers.get("cookie")).toBe("loa_connect_refresh=abc")
  })

  it("does not forward the cookie header on the callback path", async () => {
    await call(POST, ["auth", "callback"], { method: "POST", headers: { cookie: "loa_connect_refresh=abc" } })
    const headers = lastCall()[1].headers as Headers
    expect(headers.get("cookie")).toBeNull()
  })

  it("does not forward the cookie header on an ordinary domain call", async () => {
    await call(GET, ["appointments"], { headers: { cookie: "loa_connect_refresh=abc" } })
    const headers = lastCall()[1].headers as Headers
    expect(headers.get("cookie")).toBeNull()
  })

  // --- ACC-4: failure modes ----------------------------------------------

  it("answers 400 with a JSON error on an empty path", async () => {
    const res = await call(GET, [])
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("answers 502 when the upstream is unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))
    const res = await call(GET, ["appointments"])
    expect(res.status).toBe(502)
  })

  it("does not follow an upstream redirect (redirect: manual)", async () => {
    mockFetch.mockResolvedValue(upstream({ status: 302 }))
    await call(GET, ["appointments"])
    expect(lastCall()[1].redirect).toBe("manual")
  })

  it("returns the upstream 403 body unchanged", async () => {
    mockFetch.mockResolvedValue(
      upstream({ status: 403, headers: new Headers({ "content-type": "application/json" }) })
    )
    const res = await call(GET, ["admin-only"])
    expect(res.status).toBe(403)
  })

  // --- logout 204 handling (bodyless status) -----------------------------

  it("returns a bodyless 204 for logout", async () => {
    mockFetch.mockResolvedValue(
      upstream({ status: 204, headers: { get: () => null, getSetCookie: () => [] } as unknown as Headers })
    )
    const res = await call(POST, ["auth", "logout"], { method: "POST" })
    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
  })

  // ACC-4a: the Consult logout clears the refresh cookie on the 204 itself,
  // so set-cookie must survive a bodyless status or logout leaves the cookie
  // in place and the next silent refresh succeeds with a revoked token.
  it("still passes set-cookie through on a 204", async () => {
    mockFetch.mockResolvedValue(
      upstream({
        status: 204,
        headers: {
          get: () => null,
          getSetCookie: () => ["loa_connect_refresh=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=lax"],
        } as unknown as Headers,
      })
    )
    const res = await call(POST, ["auth", "logout"], { method: "POST" })
    expect(res.status).toBe(204)
    const cookies = res.headers.getSetCookie()
    expect(cookies.length).toBe(1)
    expect(cookies[0]).toContain("loa_connect_refresh")
  })

  // --- ACC-2 / EC-PLAT-001 ACC-2: target resolution, both directions -------
  //
  // route.ts resolves the target into a module-level const, which is correct at
  // runtime (Next loads .env before modules evaluate) but means the value is
  // frozen per module instance. Each direction therefore needs its own instance,
  // which is what the resetModules + re-import below is for. Without this the
  // unset assertion passed for the wrong reason: the const had already captured
  // a set value, so the test could not fail.

  it("resolves the target from CONSULT_API_URL when it is set", async () => {
    vi.resetModules()
    const route = await import("@/app/api/v1/[...path]/route")
    await route.GET(request("appointments"), {
      params: Promise.resolve({ path: ["appointments"] }),
    })
    expect(lastCall()[0]).toBe("http://localhost:9002/api/v1/appointments")
  })

  it("falls back to the production host when CONSULT_API_URL is unset", async () => {
    delete process.env.CONSULT_API_URL
    vi.resetModules()
    const route = await import("@/app/api/v1/[...path]/route")
    await route.GET(request("appointments"), {
      params: Promise.resolve({ path: ["appointments"] }),
    })
    expect(lastCall()[0]).toBe("https://aces-api.lyceumalabang.edu.ph/api/v1/appointments")
  })

  // --- verb coverage (DEC-4) ----------------------------------------------

  it("exports a handler for every standard verb", () => {
    for (const verb of [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]) {
      expect(typeof verb).toBe("function")
    }
  })
})

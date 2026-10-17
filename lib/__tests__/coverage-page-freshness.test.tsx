import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"

const mockUseApiGet = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/api/client", () => ({
  useApiGet: mockUseApiGet,
  useApiMutate: vi.fn(),
  invalidate: vi.fn(),
  dispatchToast: vi.fn(),
  dispatch403: vi.fn(),
  downloadFromApi: vi.fn(),
}))

import CoveragePage from "@/features/evaluations/components/CoveragePage"

const PERIODS = [{ id: "p1", name: "Midterm", semesterTitle: "SY 2026-2027", isActive: true }]

function routeApi() {
  return (url: string | null) => {
    if (!url) return { data: undefined, error: undefined }
    if (url.startsWith("/api/evaluation-periods")) return { data: { periods: PERIODS }, error: undefined }
    return { data: { departments: [], subjects: [] }, error: undefined }
  }
}

/** The config object the component passed for a given url fragment. */
function configFor(fragment: string): unknown {
  return callFor(fragment)?.[1]
}

/** The raw useApiGet call for a given url fragment. */
function callFor(fragment: string): [string | null, unknown] | undefined {
  return mockUseApiGet.mock.calls.find(([url]) => String(url ?? "").includes(fragment)) as
    | [string | null, unknown]
    | undefined
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseApiGet.mockImplementation(routeApi())
})

describe("CoveragePage SWR freshness", () => {
  it("opts the status query into focus revalidation and a 30s poll", async () => {
    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)
    await waitFor(() => expect(configFor("evaluation-status")).toBeTruthy())

    expect(configFor("evaluation-status")).toEqual(
      expect.objectContaining({ revalidateOnFocus: true, refreshInterval: 30_000 }),
    )
  })

  it("leaves the periods query on the global default", async () => {
    render(<CoveragePage statusBase="/api/admin/evaluation-status" />)
    // wait for the periods hook to have been called at all
    await waitFor(() => expect(callFor("evaluation-periods")).toBeTruthy())

    // no config arg = inherit SWRConfig (revalidateOnFocus:false). Must stay absent:
    // this hook is shared by every page and must not gain polling.
    expect(configFor("evaluation-periods")).toBeUndefined()
  })

  it("applies the same freshness config on the dean surface", async () => {
    render(<CoveragePage statusBase="/api/dean/evaluation-status" />)
    await waitFor(() => expect(configFor("/api/dean/evaluation-status")).toBeTruthy())

    expect(configFor("/api/dean/evaluation-status")).toEqual(
      expect.objectContaining({ revalidateOnFocus: true, refreshInterval: 30_000 }),
    )
  })
})
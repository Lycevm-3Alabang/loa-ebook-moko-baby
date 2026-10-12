import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import BulkStudentImport from "@/features/users/components/bulk-import/BulkStudentImport"

const REF_PAYLOAD = {
  subjects: [],
  sections: [],
  users: [],
  facultySubjects: [],
  departments: [{ id: "dept-1", code: "CCS" }],
  departmentCourses: [],
}

function mockFetchPending() {
  let resolveRef!: (v: { ok: boolean; json: () => Promise<unknown> }) => void
  const gate = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((r) => { resolveRef = r })
  global.fetch = vi.fn().mockImplementation((url: unknown) =>
    String(url).includes("/reference") ? gate : Promise.reject(new Error(`unexpected fetch ${url}`)),
  )
  return () => resolveRef({ ok: true, json: async () => REF_PAYLOAD })
}

const pickFile = () => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, {
    target: { files: [new File(["name,email,subject code,section,faculty email,department code"], "s.csv", { type: "text/csv" })] },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("BulkStudentImport — reference readiness gate", () => {
  it("locks upload while reference loads", () => {
    mockFetchPending()
    render(<BulkStudentImport semesterId="sem-1" />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByText("Loading reference data…")).toBeTruthy()
  })

  it("unlocks upload once reference resolves", async () => {
    const resolveRef = mockFetchPending()
    render(<BulkStudentImport semesterId="sem-1" />)
    resolveRef()

    await waitFor(() => {
      expect((document.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(false)
    })
    expect(screen.queryByText("Loading reference data…")).toBeNull()
  })

  it("refuses a preview picked before reference resolves — no null-stamped rows", async () => {
    const resolveRef = mockFetchPending()
    render(<BulkStudentImport semesterId="sem-1" />)
    pickFile()

    expect(await screen.findByText(/still loading/)).toBeTruthy()
    expect(screen.queryByText(/Step 1 — Ensure student records/)).toBeNull()

    resolveRef()
    await waitFor(() => {
      expect((document.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(false)
    })
  })
})

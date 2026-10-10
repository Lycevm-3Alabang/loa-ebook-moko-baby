import { describe, it, expect } from "vitest"
import { getChunkFailureMessage } from "@/features/admin-data/components/useChunkedImport"

const meta = { chunkIndex: 2, totalChunks: 8 }

const withStatus = (status: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error("Chunk request failed"), { status, ...extra })

describe("getChunkFailureMessage — U1 (F1, F2, F7)", () => {
  it("returns the 400 reason verbatim", () => {
    const err = withStatus(400, { serverMessage: "More than one semester is active. Deactivate all but one before importing." })
    expect(getChunkFailureMessage(err, meta)).toBe(
      "More than one semester is active. Deactivate all but one before importing."
    )
  })

  it("never renders [object Object] for a non-string 400 reason", () => {
    const err = withStatus(400, { serverMessage: { error: { nested: true } } })
    const message = getChunkFailureMessage(err, meta)
    expect(message).not.toContain("[object Object]")
    expect(message).not.toContain("(400)")
  })

  it("maps 504 without a status code or body", () => {
    const html = "<html><head><title>504 Gateway Timeout</title></head><body>FUNCTION_INVOCATION_TIMEOUT</body></html>"
    const err = Object.assign(new Error(html), { status: 504 })
    const message = getChunkFailureMessage(err, meta)
    expect(message).toContain("ran out of time")
    expect(message).toContain("chunk 3 of 8")
    expect(message).not.toContain("504")
    expect(message).not.toContain(html)
    expect(message).not.toContain("<html")
  })

  it("maps other 5xx generically with no body", () => {
    const err = Object.assign(new Error("<html>proxy error page</html>"), { status: 503 })
    const message = getChunkFailureMessage(err, meta)
    expect(message).toContain("chunk 3 of 8")
    expect(message).not.toContain("503")
    expect(message).not.toContain("<html")
  })

  it("treats 2xx-non-JSON as a server error, never the body", () => {
    const err = Object.assign(new Error("<div>not json</div>"), { status: 200 })
    const message = getChunkFailureMessage(err, meta)
    expect(message).toContain("could not be saved")
    expect(message).not.toContain("<div>")
  })

  it("honours Retry-After on 429, generic without it", () => {
    const withHint = withStatus(429, { retryAfterMs: 5000 })
    expect(getChunkFailureMessage(withHint, meta)).toContain("waiting 5s")
    const bare = withStatus(429)
    const bareMessage = getChunkFailureMessage(bare, meta)
    expect(bareMessage).toContain("Too many requests")
    expect(bareMessage).not.toContain("429")
  })

  it("maps a Postgres-coded error generically, never table details", () => {
    const err = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "student_enrollments_student_id_faculty_subject_id_key"',
    }
    const message = getChunkFailureMessage(err, meta)
    expect(message).toContain("could not be saved")
    expect(message).not.toContain("23505")
    expect(message).not.toContain("student_enrollments")
  })

  it("keeps the network fallback when there is no status", () => {
    const message = getChunkFailureMessage(new TypeError("Failed to fetch"), meta)
    expect(message).toContain("Could not reach the server")
  })
})

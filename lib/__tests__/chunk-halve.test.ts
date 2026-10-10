import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import {
  useChunkedImport,
  CHUNK_MIN_SIZE,
  type ChunkMeta,
} from "@/features/admin-data/components/useChunkedImport"

function withStatus(status: number) {
  return Object.assign(new Error(`http ${status}`), { status })
}

async function runWith(
  postChunk: (chunk: number[], meta: ChunkMeta) => Promise<{ saved: number }>,
  rows: number[],
  chunkSize: number,
) {
  const { result } = renderHook(() => useChunkedImport<number, { saved: number }>())
  let out!: Awaited<ReturnType<typeof result.current.run>>
  await act(async () => {
    out = await result.current.run(rows, {
      chunkSize,
      restMs: 0,
      postChunk: (chunk, meta) => postChunk(chunk, meta),
      summarizeResult: (r) => ({ saved: r.saved, issues: 0 }),
    })
  })
  return { out, history: result.current.history, progress: result.current.progress }
}

describe("504 shrink-on-timeout (spec §4.3)", () => {
  it("retries the 504 chunk once at half size and persists the smaller size", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => i)
    const seen: { len: number; offset: number }[] = []
    let calls = 0
    const { out, history, progress } = await runWith(async (chunk, meta) => {
      calls++
      seen.push({ len: chunk.length, offset: meta.rowOffset })
      if (calls === 1) throw withStatus(504)
      return { saved: chunk.length }
    }, rows, 100)
    expect(seen.map((s) => s.len)).toEqual([100, 50, 50, 50, 50, 50])
    expect(seen.map((s) => s.offset)).toEqual([0, 0, 50, 100, 150, 200])
    expect(out.failedChunks).toHaveLength(0)
    expect(out.results).toHaveLength(5)
    expect(out.stoppedEarly).toBe(false)
    expect(history.filter((h) => h.ok).map((h) => h.rows)).toEqual([50, 50, 50, 50, 50])
    expect(progress.doneRows).toBe(250)
  })

  it("halves again on a repeated 504, down to the floor", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => i)
    const seen: number[] = []
    let calls = 0
    const { out } = await runWith(async (chunk) => {
      calls++
      seen.push(chunk.length)
      if (calls <= 2) throw withStatus(504)
      return { saved: chunk.length }
    }, rows, 100)
    expect(seen).toEqual([100, 50, 25, 25, 25, 25, 25, 25, 25, 25])
    expect(Math.min(...seen.slice(1))).toBe(CHUNK_MIN_SIZE)
    expect(out.failedChunks).toHaveLength(0)
    expect(out.results).toHaveLength(8)
  })

  it("fails fast at the floor with the 504 message and actual rows recorded", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => i)
    const seen: number[] = []
    let calls = 0
    const { out, history } = await runWith(async (chunk) => {
      calls++
      seen.push(chunk.length)
      if (calls <= 2) throw withStatus(504)
      return { saved: chunk.length }
    }, rows, 30)
    expect(seen).toEqual([30, 25, 25, 10])
    expect(out.failedChunks).toHaveLength(1)
    const failed = out.failedChunks[0]
    expect(failed?.attempts).toBe(1)
    expect(failed?.error).toMatch(/ran out of time/)
    expect(history.find((h) => !h.ok)?.rows).toBe(25)
  })

  it("keeps retrying non-504 errors with the existing backoff", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => i)
    const seen: number[] = []
    let calls = 0
    const { out } = await runWith(async (chunk) => {
      calls++
      seen.push(chunk.length)
      if (calls === 1) throw withStatus(503)
      return { saved: chunk.length }
    }, rows, 100)
    expect(seen).toEqual([100, 100])
    expect(out.failedChunks).toHaveLength(0)
  })
})

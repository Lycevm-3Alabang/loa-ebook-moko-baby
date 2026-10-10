"use client"

import { useCallback, useRef, useState } from "react"

export interface ChunkMeta {
  chunkIndex: number
  totalChunks: number
  fileId: string
  isLast: boolean
  rowOffset: number
}

export interface ChunkProgress {
  doneChunks: number
  totalChunks: number
  doneRows: number
  totalRows: number
}

export interface ChunkHistoryEntry {
  chunkIndex: number
  rows: number
  ok: boolean
  saved: number
  skipped: number
  issues: number
  error?: string
}

export interface FailedChunk {
  meta: ChunkMeta
  error: string
  attempts: number
}

export type PostChunkFn<TRow, TChunkResult> = (
  chunk: TRow[],
  meta: ChunkMeta,
  signal: AbortSignal
) => Promise<TChunkResult>

// Errors thrown by postChunk may carry HTTP retry hints. Supabase signals
// rate limiting with 429 + Retry-After / X-RateLimit-Reset (seconds).
export interface ChunkErrorHints {
  status?: number
  retryAfterMs?: number
}

export function withRetryHints<T extends Error>(
  err: T,
  res: Pick<Response, "status" | "headers">,
): T & ChunkErrorHints {
  const hinted = err as T & ChunkErrorHints
  hinted.status = res.status
  const raw = res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset")
  if (raw !== null && raw !== "") {
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) hinted.retryAfterMs = seconds * 1000
  }
  return hinted
}

// Supabase-aligned retry policy: exponential base 1s ×2, capped, jittered,
// Retry-After honored when the server sends one. Matches Supabase docs
// ("exponential backoff on 429, wait Retry-After / X-RateLimit-Reset").
export const CHUNK_RETRY_BASE_MS = 1000
export const CHUNK_RETRY_CAP_MS = 30000
export const CHUNK_RETRY_JITTER_MS = 250

// Spec §4.3 floor for shrink-on-timeout: a pathological file degrades to many
// small requests rather than one row per request.
export const CHUNK_MIN_SIZE = 25

// Spec §4.4: just above the route ceiling (maxDuration = 60), so the
// platform's 504 stays authoritative and the client stops narrating stale.
export const CHUNK_TIMEOUT_MS = 70000

export function isRetryableChunkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false
  // A database error carrying a Postgres SQLSTATE is deterministic, not a transport
  // failure: class 23 (integrity constraint violation, e.g. 23505 unique violation)
  // reproduces exactly on every retry. Such an error has no HTTP status, so without
  // this branch it fell through to `status === undefined → true` and the doomed chunk
  // was retried twice — 3x the work, 46s, for the same guaranteed failure.
  const pgCode = (err as { code?: unknown } | null)?.code
  if (typeof pgCode === "string" && pgCode.length > 0) return false
  const status = (err as ChunkErrorHints | null)?.status
  if (status === undefined) return true
  if (status === 504) return false
  return status === 408 || status === 425 || status === 429 || status >= 500
}

export function chunkRetryDelayMs(err: unknown, attempt: number, baseMs: number = CHUNK_RETRY_BASE_MS): number {
  const hinted = (err as ChunkErrorHints | null)?.retryAfterMs
  const base = hinted !== undefined && hinted >= 0 ? hinted : baseMs * 2 ** (attempt - 1)
  return Math.min(CHUNK_RETRY_CAP_MS, base) + Math.random() * CHUNK_RETRY_JITTER_MS
}

// U1 — status → plain-language message. Never emits a status code or a response
// body. The 400 branch returns the caller's safe verbatim reason; every other
// branch ignores err.message entirely.
// U4 — safety invariant + correlation key on mapper-authored branches. A call
// carrying fileId gains the suffix; server-authored verbatim stays pure; a
// keyless call renders the legacy bytes exactly (U1 tests pin this).
export interface ChunkFailureHints extends ChunkErrorHints {
  serverMessage?: unknown
}

export function getChunkFailureMessage(
  err: unknown,
  meta: Pick<ChunkMeta, "chunkIndex" | "totalChunks"> & { fileId?: string; saved?: number },
): string {
  const chunkLabel = `chunk ${meta.chunkIndex + 1} of ${meta.totalChunks}`
  const suffix = meta.fileId
    ? ` Nothing was lost — ${meta.saved ?? 0} rows are already saved. Press Import to resume. Reference: ${meta.fileId}`
    : ""
  if (err instanceof DOMException && err.name === "AbortError") return "Import cancelled."
  const hints = (err as ChunkFailureHints | null) ?? null
  const pgCode = (err as { code?: unknown } | null)?.code
  if (typeof pgCode === "string" && pgCode.length > 0) return `Chunk ${chunkLabel} could not be saved.${suffix}`
  const status = hints?.status
  if (status === 400) {
    const serverMessage = hints?.serverMessage
    if (typeof serverMessage === "string" && serverMessage.trim() !== "") return serverMessage
    return `Chunk ${chunkLabel} was rejected. Check the import requirements and try again.${suffix}`
  }
  if (status === 429) {
    const waitMs = hints?.retryAfterMs
    if (typeof waitMs === "number" && Number.isFinite(waitMs) && waitMs >= 0) {
      const seconds = Math.max(1, Math.round(waitMs / 1000))
      return `Too many requests — waiting ${seconds}s before retrying ${chunkLabel}.${suffix}`
    }
    return `Too many requests — retrying ${chunkLabel}.${suffix}`
  }
  if (status === 504) return `The server ran out of time on ${chunkLabel}.${suffix}`
  if (status !== undefined) return `Chunk ${chunkLabel} could not be saved.${suffix}`
  return `Could not reach the server. Check your connection and try again.${suffix}`
}

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

export function chunkRows<TRow>(rows: TRow[], size: number): TRow[][] {
  const chunkSize = Math.floor(size)
  if (chunkSize <= 0) throw new Error("Chunk size must be a positive integer")
  const chunks: TRow[][] = []
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize))
  }
  return chunks
}

export async function decodeCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    const strictUtf8 = new TextDecoder("utf-8", { fatal: true })
    return strictUtf8.decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

export function useChunkedImport<TRow, TChunkResult>() {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<ChunkProgress>({
    doneChunks: 0,
    totalChunks: 0,
    doneRows: 0,
    totalRows: 0,
  })
  const abortRef = useRef<AbortController | null>(null)
  const [history, setHistory] = useState<ChunkHistoryEntry[]>([])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const run = useCallback(
    async (
      rows: TRow[],
      options: {
        chunkSize?: number
        fileId?: string
        postChunk: PostChunkFn<TRow, TChunkResult>
        onProgress?: (p: ChunkProgress) => void
        // Fired as each chunk succeeds, before progress advances. Lets a caller
        // accumulate fields the generic history cannot carry (e.g. how many
        // departments/courses a chunk inserted) without widening the hook.
        onChunkResult?: (result: TChunkResult, meta: ChunkMeta) => void
        summarizeResult?: (result: TChunkResult) => { saved: number; skipped?: number; issues: number }
        restMs?: number
        chunkTimeoutMs?: number
        maxRetries?: number
        retryBaseMs?: number
      }
    ): Promise<{ results: TChunkResult[]; cancelled: boolean; failedChunks: FailedChunk[]; stoppedEarly: boolean }> => {
      const initialSize = Math.floor(options.chunkSize ?? 500)
      if (initialSize <= 0) throw new Error("Chunk size must be a positive integer")
      const restMs = options.restMs ?? 750
      const chunkTimeoutMs = options.chunkTimeoutMs ?? CHUNK_TIMEOUT_MS
      const maxRetries = options.maxRetries ?? 2
      const retryBaseMs = options.retryBaseMs ?? CHUNK_RETRY_BASE_MS
      const fileId =
        options.fileId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const controller = new AbortController()
      abortRef.current = controller
      setIsRunning(true)
      setHistory([])
      // Total is an estimate, not a promise: done + ceil(remaining / size). It
      // grows when a 504 halves the size mid-run — that growth IS the shrink
      // signal (visible in progress + history, no console needed).
      const estimateTotal = (doneCount: number, from: number, sizeNow: number) =>
        doneCount + Math.ceil((rows.length - from) / sizeNow)
      setProgress({ doneChunks: 0, totalChunks: estimateTotal(0, 0, initialSize), doneRows: 0, totalRows: rows.length })
      const results: TChunkResult[] = []
      const failedChunks: FailedChunk[] = []
      let consecutiveFailures = 0
      let savedTotal = 0
      let stoppedEarly = false
      // Size + offset replace the pre-split array: every chunk derives from
      // (offset, size), so a 504 can shrink the REMAINDER without invalidating
      // anything already sent.
      let size = initialSize
      let offset = 0
      let done = 0
      const callChunk = async (chunk: TRow[], meta: ChunkMeta): Promise<TChunkResult> => {
        const attemptController = new AbortController()
        const onParentAbort = () => attemptController.abort()
        if (controller.signal.aborted) attemptController.abort()
        else controller.signal.addEventListener("abort", onParentAbort, { once: true })
        try {
          return await new Promise<TChunkResult>((resolve, reject) => {
            const timer = setTimeout(() => {
              attemptController.abort()
              reject(new Error(`Chunk ${meta.chunkIndex + 1} timed out after ${chunkTimeoutMs}ms`))
            }, chunkTimeoutMs)
            options.postChunk(chunk, meta, attemptController.signal).then(
              (result) => { clearTimeout(timer); resolve(result) },
              (err) => { clearTimeout(timer); reject(err) },
            )
          })
        } finally {
          controller.signal.removeEventListener("abort", onParentAbort)
        }
      }
      try {
        while (offset < rows.length) {
          if (controller.signal.aborted) return { results, cancelled: true, failedChunks, stoppedEarly }
          const len = Math.min(size, rows.length - offset)
          const chunk = rows.slice(offset, offset + len)
          const meta: ChunkMeta = {
            chunkIndex: done,
            totalChunks: estimateTotal(done, offset, size),
            fileId,
            isLast: offset + len >= rows.length,
            rowOffset: offset,
          }
          let attempt = 0
          let settled = false
          while (!settled) {
            try {
              const result = await callChunk(chunk, meta)
              results.push(result)
              options.onChunkResult?.(result, meta)
              const summary = options.summarizeResult?.(result) ?? { saved: 0, skipped: 0, issues: 0 }
              savedTotal += summary.saved
              setHistory((h) => [...h, { chunkIndex: done, rows: chunk.length, ok: true, saved: summary.saved, skipped: summary.skipped ?? 0, issues: summary.issues }])
              consecutiveFailures = 0
              offset += len
              done += 1
              const next: ChunkProgress = {
                doneChunks: done,
                totalChunks: estimateTotal(done, offset, size),
                doneRows: offset,
                totalRows: rows.length,
              }
              setProgress(next)
              options.onProgress?.(next)
              settled = true
            } catch (err) {
              if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err
              // Spec §4.3: a 504 says this size cannot fit under maxDuration —
              // shrink once and retry the SAME offset at the smaller size. Each
              // 504 halves once more down to CHUNK_MIN_SIZE, then fails fast.
              if ((err as ChunkErrorHints | null)?.status === 504 && size > CHUNK_MIN_SIZE) {
                size = Math.max(CHUNK_MIN_SIZE, Math.floor(size / 2))
                settled = true
              } else if (!isRetryableChunkError(err) || attempt >= maxRetries) {
                const message = getChunkFailureMessage(err, { ...meta, saved: savedTotal })
                setHistory((h) => [...h, { chunkIndex: done, rows: chunk.length, ok: false, saved: 0, skipped: 0, issues: 0, error: message }])
                failedChunks.push({ meta, error: message, attempts: attempt + 1 })
                if (++consecutiveFailures >= 3) {
                  stoppedEarly = true
                  return { results, cancelled: false, failedChunks, stoppedEarly }
                }
                offset += len
                done += 1
                settled = true
              } else {
                attempt++
                await sleepAbortable(chunkRetryDelayMs(err, attempt, retryBaseMs), controller.signal)
              }
            }
          }
          if (offset < rows.length && restMs > 0) {
            await sleepAbortable(restMs, controller.signal)
          }
        }
        return { results, cancelled: false, failedChunks, stoppedEarly }
      } finally {
        abortRef.current = null
        setIsRunning(false)
      }
    },
    []
  )

  return { isRunning, progress, history, run, cancel }
}

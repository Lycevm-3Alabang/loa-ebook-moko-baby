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

export function isRetryableChunkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false
  const status = (err as ChunkErrorHints | null)?.status
  if (status === undefined) return true
  return status === 408 || status === 425 || status === 429 || status >= 500
}

export function chunkRetryDelayMs(err: unknown, attempt: number, baseMs: number = CHUNK_RETRY_BASE_MS): number {
  const hinted = (err as ChunkErrorHints | null)?.retryAfterMs
  const base = hinted !== undefined && hinted >= 0 ? hinted : baseMs * 2 ** (attempt - 1)
  return Math.min(CHUNK_RETRY_CAP_MS, base) + Math.random() * CHUNK_RETRY_JITTER_MS
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
      const chunkSize = options.chunkSize ?? 500
      const restMs = options.restMs ?? 750
      const chunkTimeoutMs = options.chunkTimeoutMs ?? 120000
      const maxRetries = options.maxRetries ?? 2
      const retryBaseMs = options.retryBaseMs ?? CHUNK_RETRY_BASE_MS
      const chunks = chunkRows(rows, chunkSize)
      const fileId =
        options.fileId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const controller = new AbortController()
      abortRef.current = controller
      setIsRunning(true)
      setHistory([])
      setProgress({ doneChunks: 0, totalChunks: chunks.length, doneRows: 0, totalRows: rows.length })
      const results: TChunkResult[] = []
      const failedChunks: FailedChunk[] = []
      let consecutiveFailures = 0
      let stoppedEarly = false
      try {
        for (let i = 0; i < chunks.length; i++) {
          if (controller.signal.aborted) return { results, cancelled: true, failedChunks, stoppedEarly }
          const meta: ChunkMeta = {
            chunkIndex: i,
            totalChunks: chunks.length,
            fileId,
            isLast: i === chunks.length - 1,
            rowOffset: i * chunkSize,
          }
          const callChunk = async (): Promise<TChunkResult> => {
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
                options.postChunk(chunks[i], meta, attemptController.signal).then(
                  (result) => { clearTimeout(timer); resolve(result) },
                  (err) => { clearTimeout(timer); reject(err) },
                )
              })
            } finally {
              controller.signal.removeEventListener("abort", onParentAbort)
            }
          }

          let attempt = 0
          for (;;) {
            try {
              const result = await callChunk()
              results.push(result)
              options.onChunkResult?.(result, meta)
              const summary = options.summarizeResult?.(result) ?? { saved: 0, skipped: 0, issues: 0 }
              setHistory((h) => [...h, { chunkIndex: i, rows: chunks[i].length, ok: true, saved: summary.saved, skipped: summary.skipped ?? 0, issues: summary.issues }])
              consecutiveFailures = 0
              const next: ChunkProgress = {
                doneChunks: i + 1,
                totalChunks: chunks.length,
                doneRows: Math.min(rows.length, (i + 1) * chunkSize),
                totalRows: rows.length,
              }
              setProgress(next)
              options.onProgress?.(next)
              break
            } catch (err) {
              if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err
              if (!isRetryableChunkError(err) || attempt >= maxRetries) {
                const message = (err as Error).message
                setHistory((h) => [...h, { chunkIndex: i, rows: chunks[i].length, ok: false, saved: 0, skipped: 0, issues: 0, error: message }])
                failedChunks.push({ meta, error: message, attempts: attempt + 1 })
                if (++consecutiveFailures >= 3) {
                  stoppedEarly = true
                  return { results, cancelled: false, failedChunks, stoppedEarly }
                }
                break
              }
              attempt++
              await sleepAbortable(chunkRetryDelayMs(err, attempt, retryBaseMs), controller.signal)
            }
          }
          if (i < chunks.length - 1 && restMs > 0) {
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

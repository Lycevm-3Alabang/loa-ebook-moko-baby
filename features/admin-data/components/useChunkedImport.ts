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

export type PostChunkFn<TRow, TChunkResult> = (
  chunk: TRow[],
  meta: ChunkMeta,
  signal: AbortSignal
) => Promise<TChunkResult>

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
      }
    ): Promise<{ results: TChunkResult[]; cancelled: boolean }> => {
      const chunkSize = options.chunkSize ?? 500
      const chunks = chunkRows(rows, chunkSize)
      const fileId =
        options.fileId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const controller = new AbortController()
      abortRef.current = controller
      setIsRunning(true)
      setProgress({ doneChunks: 0, totalChunks: chunks.length, doneRows: 0, totalRows: rows.length })
      const results: TChunkResult[] = []
      try {
        for (let i = 0; i < chunks.length; i++) {
          if (controller.signal.aborted) return { results, cancelled: true }
          const meta: ChunkMeta = {
            chunkIndex: i,
            totalChunks: chunks.length,
            fileId,
            isLast: i === chunks.length - 1,
            rowOffset: i * chunkSize,
          }
          const result = await options.postChunk(chunks[i], meta, controller.signal)
          results.push(result)
          const next: ChunkProgress = {
            doneChunks: i + 1,
            totalChunks: chunks.length,
            doneRows: Math.min(rows.length, (i + 1) * chunkSize),
            totalRows: rows.length,
          }
          setProgress(next)
          options.onProgress?.(next)
        }
        return { results, cancelled: false }
      } finally {
        abortRef.current = null
        setIsRunning(false)
      }
    },
    []
  )

  return { isRunning, progress, run, cancel }
}

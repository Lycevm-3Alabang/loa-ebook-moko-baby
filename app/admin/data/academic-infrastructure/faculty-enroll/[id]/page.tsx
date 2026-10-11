"use client"

import { useParams } from "next/navigation"
import { useMemo } from "react"
import Link from "next/link"
import { useApiGet } from "@/lib/api/client"
import { FacultySubjectDetail } from "@/features/admin-data/components/FacultySubjectDetail"
import type { FacultyMapping } from "@/features/admin-data/components/types"

export default function FacultySubjectDetailPage() {
  const params = useParams()
  const id = params.id as string

  const { data, error, isLoading } = useApiGet<{ data: FacultyMapping[] }>("/api/data/evaluation-mappings?type=faculty")

  const mapping = useMemo(() => {
    if (!data?.data) return null
    return data.data.find((m) => m.id === id) ?? null
  }, [data, id])

  if (isLoading) return <div className="p-6 text-center text-sm text-tertiary">Loading...</div>
  if (error) return <div className="p-6 text-center text-sm text-red-600">Failed to load data.</div>
  if (!mapping) return <div className="p-6 text-center text-sm text-tertiary">Faculty-subject mapping not found.</div>

  return (
    <div className="w-full min-h-[calc(100dvh-var(--app-shell-header-height,64px))] px-4 py-6 space-y-4 animate-ios-slide-in">
      <Link
        href="/admin/data/academic-infrastructure?tab=faculty_enroll&sub=faculty"
        className="inline-flex items-center gap-1 text-xs text-tertiary hover:text-secondary transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Faculty Loading
      </Link>

      <div className="flex flex-col rounded-2xl border border-default bg-white dark:bg-surface-dim shadow-sm min-h-0 flex-1">
        <div className="px-6 py-4 border-b border-default shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-secondary">{mapping.subject.code} - {mapping.subject.name}</p>
            <p className="text-xs text-tertiary">{mapping.section.program}-{mapping.section.name} · {mapping.faculty.name}</p>
          </div>
        </div>
        <div className="p-4 flex-1 overflow-y-auto min-h-0">
          <FacultySubjectDetail mapping={mapping} />
        </div>
      </div>
    </div>
  )
}

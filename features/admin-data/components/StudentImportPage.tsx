"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useApiGet } from "@/lib/api/client"
import type { SemesterData } from "@/lib/types"
import BulkStudentImport from "@/features/users/components/bulk-import/BulkStudentImport"

/**
 * Import-dedicated page (table-first follow-up): the staged-file workspace
 * on its own route. `BulkStudentImport` moves verbatim — it only ever
 * needed `semesterId`, fetched here with the same trio EnrollmentsTab uses.
 */
export function StudentImportPage({ backHref }: { backHref: string }) {
  const { data: semestersData } = useApiGet<{ data: SemesterData[] }>("/api/semesters")
  const activeSemester = useMemo(
    () => semestersData?.data?.find((s) => s.isActive) ?? null,
    [semestersData],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-xs font-semibold text-secondary hover:underline"
        >
          ‹ Enrollments
        </Link>
        {activeSemester && (
          <span className="text-[11px] font-semibold text-tertiary">
            Semester: {activeSemester.title}
          </span>
        )}
      </div>
      {!activeSemester && (
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
          <span>⚠️</span>
          <span>No active semester. Set one as active before importing.</span>
        </div>
      )}
      <BulkStudentImport semesterId={activeSemester?.id ?? null} />
    </div>
  )
}

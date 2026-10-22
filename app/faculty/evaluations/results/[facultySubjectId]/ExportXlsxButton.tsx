"use client"

import { useState } from "react"
import IosButton from "@/components/ui/IosButton"
import { downloadEvaluationWorkbook } from "@/lib/eval-export"

export function ExportXlsxButton({
  facultySubjectId,
  evaluationPeriodId,
  subjectCode,
  facultyName,
}: {
  facultySubjectId: string
  evaluationPeriodId: string
  subjectCode: string
  facultyName: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      await downloadEvaluationWorkbook(
        "faculty",
        null,
        facultySubjectId,
        evaluationPeriodId,
        subjectCode,
        facultyName,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <IosButton variant="tinted" size="sm" loading={loading} onClick={onClick}>
        Export Excel
      </IosButton>
      {error && <span className="text-xs text-danger-text">{error}</span>}
    </div>
  )
}

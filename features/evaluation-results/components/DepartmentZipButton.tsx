"use client"

import { useCallback, useState } from "react"
import IosButton from "@/components/ui/IosButton"
import { downloadFromApi, dispatchToast } from "@/lib/api/client"
import ExportConfirmationModal from "./ExportConfirmationModal"

interface DepartmentZipButtonProps {
  evaluationPeriodId: string
  departmentIds: string[]
  /** the selected members; empty = the whole department */
  facultyIds?: string[]
  /** the go button is off until a member is selected (D36) */
  disabled?: boolean
  exportApiBase: string
  label?: string
}

/**
 * One seam for every department-ZIP call site: both department pages. Owns the
 * URL build, the filename, the downloadFromApi call, the loading state and the
 * local guards. Never assembles anything on the client — the route does all the
 * work.
 */
export default function DepartmentZipButton({
  evaluationPeriodId,
  departmentIds,
  facultyIds,
  disabled = false,
  exportApiBase,
  label = "Download Excel (ZIP)",
}: DepartmentZipButtonProps) {
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const startExport = useCallback(async () => {
    setLoading(true)
    setIsModalOpen(false)
    try {
      const params = new URLSearchParams()
      params.set("evaluationPeriodId", evaluationPeriodId)
      if (departmentIds.length > 0) {
        params.set("departmentIds", departmentIds.join(","))
      }
      if (facultyIds && facultyIds.length > 0) params.set("facultyIds", facultyIds.join(","))
      const url = `${exportApiBase}?${params.toString()}`
      const filename = `evaluation-results-excel-${evaluationPeriodId}.zip`
      await downloadFromApi(url, filename)
    } finally {
      setLoading(false)
    }
  }, [evaluationPeriodId, departmentIds, facultyIds, exportApiBase])

  const handleClick = useCallback(() => {
    if (disabled) return
    if (!evaluationPeriodId) {
      dispatchToast("Select an evaluation period before exporting.")
      return
    }

    setIsModalOpen(true)
  }, [disabled, evaluationPeriodId])

  return (
    <>
      <IosButton variant="tinted" size="sm" onClick={handleClick} loading={loading} disabled={disabled}>
        {label}
      </IosButton>
      <ExportConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={startExport}
        facultyCount={facultyIds?.length ?? 0}
      />
    </>
  )
}

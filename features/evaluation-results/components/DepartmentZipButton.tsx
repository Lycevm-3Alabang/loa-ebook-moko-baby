"use client"

import { useCallback, useState } from "react"
import IosButton from "@/components/ui/IosButton"
import { downloadFromApi, dispatchToast } from "@/lib/api/client"
import ExportConfirmationModal from "./ExportConfirmationModal"

interface DepartmentZipButtonProps {
  evaluationPeriodId: string
  departmentIds: string[]
  totalDepartments?: number
  facultyId?: string
  exportApiBase: string
  label?: string
}

/**
 * One seam for every department-ZIP call site: the list page, both department
 * pages and the faculty card. Owns the URL build, the filename, the
 * downloadFromApi call, the loading state and the local guards. Never assembles
 * anything on the client — the route does all the work.
 */
export default function DepartmentZipButton({
  evaluationPeriodId,
  departmentIds,
  totalDepartments,
  facultyId,
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
      if (facultyId) params.set("facultyId", facultyId)
      const url = `${exportApiBase}?${params.toString()}`
      const filename = `evaluation-results-excel-${evaluationPeriodId}.zip`
      await downloadFromApi(url, filename)
    } finally {
      setLoading(false)
    }
  }, [evaluationPeriodId, departmentIds, facultyId, exportApiBase])

  const handleClick = useCallback(() => {
    if (!evaluationPeriodId) {
      dispatchToast("Select an evaluation period before exporting.")
      return
    }

    setIsModalOpen(true)
  }, [evaluationPeriodId])

  return (
    <>
      <IosButton variant="tinted" size="sm" onClick={handleClick} loading={loading}>
        {label}
      </IosButton>
      <ExportConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={startExport}
        departmentCount={departmentIds.length}
        totalDepartments={totalDepartments}
        isFacultyExport={!!facultyId}
      />
    </>
  )
}

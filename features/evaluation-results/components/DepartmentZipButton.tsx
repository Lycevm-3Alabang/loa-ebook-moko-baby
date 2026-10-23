"use client"

import { useCallback, useState } from "react"
import IosButton from "@/components/ui/IosButton"
import { downloadFromApi, dispatchToast } from "@/lib/api/client"

interface DepartmentZipButtonProps {
  evaluationPeriodId: string
  departmentIds: string[]
  facultyId?: string
  exportApiBase: string
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
  facultyId,
  exportApiBase,
}: DepartmentZipButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = useCallback(async () => {
    if (!evaluationPeriodId) {
      dispatchToast("Select an evaluation period before exporting.")
      return
    }
    if (departmentIds.length === 0) {
      dispatchToast("Select at least one department before exporting.")
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("evaluationPeriodId", evaluationPeriodId)
      params.set("departmentIds", departmentIds.join(","))
      if (facultyId) params.set("facultyId", facultyId)
      const url = `${exportApiBase}?${params.toString()}`
      const filename = `evaluation-results-excel-${evaluationPeriodId}.zip`
      await downloadFromApi(url, filename)
    } finally {
      setLoading(false)
    }
  }, [evaluationPeriodId, departmentIds, facultyId, exportApiBase])

  return (
    <IosButton variant="tinted" size="sm" onClick={handleClick} loading={loading}>
      Download Excel (ZIP)
    </IosButton>
  )
}

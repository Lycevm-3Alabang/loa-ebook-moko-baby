/** The client-side download of a subject's evaluation workbook. */
export async function downloadEvaluationWorkbook(
  role: "admin" | "dean" | "faculty",
  departmentId: string | null,
  facultySubjectId: string,
  evaluationPeriodId: string,
  subjectCode: string,
  facultyName: string,
): Promise<void> {
  const base =
    role === "admin"
      ? `/api/admin/evaluation-results/departments/${encodeURIComponent(departmentId!)}/groups/${encodeURIComponent(facultySubjectId)}/export`
      : role === "dean"
        ? `/api/dean/evaluation-results/departments/${encodeURIComponent(departmentId!)}/groups/${encodeURIComponent(facultySubjectId)}/export`
        : `/api/faculty/evaluation-results/subjects/${encodeURIComponent(facultySubjectId)}/export`

  const url = `${base}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Failed to export (${res.status})`)
  }
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = `${subjectCode.replace(/[^a-zA-Z0-9_-]/g, "_")}_${facultyName.replace(/[^a-zA-Z0-9_-]/g, "_")}_evaluation.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(href)
}

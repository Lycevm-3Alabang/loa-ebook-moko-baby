"use client"

import { useState, useEffect, useRef } from "react"
import { useApiGet, invalidate } from "@/lib/api/client"

const INVALIDATE_KEYS = ["/api/semesters", "/api/semesters/count-active"]
import { SkeletonTable } from "@/components/ui/Skeleton"
import IosButton from "@/components/ui/IosButton"
import LockedTab from "@/components/ui/LockedTab"
import type { SemesterData } from "@/lib/types"

interface Impacts {
  facultySubjects: number
  enrollments: number
  evaluations: number
  results: number
  sections: number
}

interface ApplyPreview {
  semesterTitle: string
  total: number
  alreadyActive: number
  willUpdate: number
  willSkip: number
  skippedSample: { id: string; label: string }[]
}

export function SemestersTab() {
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const showSuccessMessage = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 4000)
  }

  const [newTitle, setNewTitle] = useState("")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [saving, setSaving] = useState(false)

  const [activateTarget, setActivateTarget] = useState<string | null>(null)
  const [impacts, setImpacts] = useState<Impacts | null>(null)
  const [loadingImpacts, setLoadingImpacts] = useState(false)

  const [applyOpen, setApplyOpen] = useState(false)
  const [applyPreview, setApplyPreview] = useState<ApplyPreview | null>(null)
  const [applyLoading, setApplyLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  const { data: semestersData, isLoading: semestersLoading, error: semestersErr } = useApiGet<{ data: SemesterData[] }>("/api/semesters")

  const semesters = semestersData?.data ?? []
  const activeCount = semesters.filter((s) => s.isActive).length
  const loading = semestersLoading
  const fetchError = semestersErr
  const locked = (fetchError?.message?.includes("Forbidden") || fetchError?.message?.includes("API endpoint requires")) ? "/api/semesters" : ""

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle) return
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/semesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed") }
      setNewTitle("")
      showSuccessMessage("Semester created!")
      invalidate(...INVALIDATE_KEYS)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleUpdate = async (id: string) => {
    if (!editTitle) return
    setSaving(true); setError("")
    try {
      const res = await fetch(`/api/semesters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed") }
      setEditingId(null)
      showSuccessMessage("Semester updated!")
      invalidate(...INVALIDATE_KEYS)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleActivate = async (id: string) => {
    setSaving(true); setError(""); setActivateTarget(null); setImpacts(null)
    try {
      const res = await fetch(`/api/semesters/${id}`, { method: "POST" })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed") }
      showSuccessMessage("Semester activated!")
      invalidate(...INVALIDATE_KEYS)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleDeactivate = async (id: string) => {
    if (activeCount <= 1) return
    setSaving(true); setError("")
    try {
      const res = await fetch(`/api/semesters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed") }
      showSuccessMessage("Semester deactivated!")
      invalidate(...INVALIDATE_KEYS)
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const promptActivate = async (id: string) => {
    if (activeCount === 0) {
      await handleActivate(id)
      return
    }
    setActivateTarget(id)
    setImpacts(null)
    setLoadingImpacts(true)
    try {
      const res = await fetch(`/api/semesters/${id}/impacts`)
      if (res.ok) {
        const data = await res.json()
        setImpacts(data)
      }
    } catch { /* ignore */ }
    setLoadingImpacts(false)
  }

  const openApplySemester = async () => {
    setError("")
    setApplyLoading(true)
    try {
      const res = await fetch("/api/admin/faculty-subjects/apply-semester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Failed to preview")
      setApplyPreview(d)
      setApplyOpen(true)
    } catch (err) { setError((err as Error).message) }
    finally { setApplyLoading(false) }
  }

  const confirmApplySemester = async () => {
    setApplying(true); setError("")
    try {
      const res = await fetch("/api/admin/faculty-subjects/apply-semester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Failed to apply")
      showSuccessMessage(
        `Applied "${d.semesterTitle}" to ${d.updated} mapping${d.updated === 1 ? "" : "s"}.` +
        (d.skipped > 0 ? ` ${d.skipped} skipped due to conflicting rows.` : ""),
      )
      invalidate("/api/data/evaluation-mappings?type=faculty")
      setApplyOpen(false); setApplyPreview(null)
    } catch (err) { setError((err as Error).message) }
    finally { setApplying(false) }
  }

  const isEditing = editingId !== null
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isEditing) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setEditingId(null) }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) return
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setEditingId(null)
    }
    document.addEventListener("mousedown", handler, true)
    return () => document.removeEventListener("mousedown", handler, true)
  }, [isEditing])

  if (loading) return <div className="p-6"><SkeletonTable rows={4} cols={5} /></div>

  return (
    <div className="space-y-6">
      {locked && <LockedTab endpoint={locked} />}
      {!locked && (fetchError || error) && <p className="text-xs font-medium text-red-600 bg-red-50 p-3 rounded-lg">{(fetchError || error)?.message || (fetchError || error)}</p>}
      {success && <p className="text-xs font-medium text-green-600 bg-green-50 p-3 rounded-lg">{success}</p>}

      <form onSubmit={handleCreate} className="card p-6 bg-surface space-y-4">
        <h2 className="text-sm font-bold text-secondary">Add New Academic Semester</h2>
        <div>
          <label className="block text-xs font-semibold text-tertiary mb-1">Semester Name</label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="e.g. 1st Semester A.Y. 2025-2026"
            required
          />
        </div>
        <p className="text-[11px] text-tertiary">
          New semesters start as inactive. Activate a semester to make it the current active semester.
        </p>
        <div><IosButton type="submit" loading={saving} variant="primary">Create Semester</IosButton></div>
      </form>

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div ref={modalRef} className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-primary">Edit Semester</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-tertiary mb-1">Semester Name</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" required />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <IosButton variant="gray" onClick={() => setEditingId(null)}>Cancel</IosButton>
              <IosButton type="button" loading={saving} variant="primary" onClick={() => handleUpdate(editingId!)}>Save Changes</IosButton>
            </div>
          </div>
        </div>
      )}

      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-primary">Activate Semester</h2>
            </div>
            <div className="space-y-3 text-xs text-tertiary">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="font-semibold text-amber-800">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700">
                  <li>Set all other active semesters as inactive</li>
                  <li>Set this semester as the active semester</li>
                </ul>
              </div>
              <p className="font-medium text-primary">Proceed with caution.</p>
              <p>This change affects everything that depends on the active semester — consultations, reports, and dashboards will switch to reference this semester. No data will be deleted.</p>
              {loadingImpacts ? (
                <p className="text-tertiary">Loading related data counts...</p>
              ) : impacts ? (
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                  <p className="font-semibold text-primary">Affected data in this semester:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="text-tertiary">Faculty-Subject mappings:</span><span className="font-semibold text-right">{impacts.facultySubjects}</span>
                    <span className="text-tertiary">Student Enrollments:</span><span className="font-semibold text-right">{impacts.enrollments}</span>
                    <span className="text-tertiary">Sections:</span><span className="font-semibold text-right">{impacts.sections}</span>
                    <span className="text-tertiary">Evaluations:</span><span className="font-semibold text-right">{impacts.evaluations}</span>
                    <span className="text-tertiary">Released Results:</span><span className="font-semibold text-right">{impacts.results}</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <IosButton variant="gray" onClick={() => { setActivateTarget(null); setImpacts(null) }}>Cancel</IosButton>
              <IosButton type="button" loading={saving} variant="primary" onClick={() => handleActivate(activateTarget)}>Confirm Activation</IosButton>
            </div>
          </div>
        </div>
      )}

      {applyOpen && applyPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-primary">Apply Semester to All Mappings</h2>
            </div>
            <div className="space-y-3 text-xs text-tertiary">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="font-semibold text-amber-800">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700">
                  <li>Set every conflict-free faculty-subject mapping to <span className="font-semibold">{applyPreview.semesterTitle}</span></li>
                  <li>Overwrite prior semester values — <span className="font-semibold">no undo</span> (the audit log keeps the before-state)</li>
                  <li>Leave conflicting rows untouched so no unique constraint is violated</li>
                </ul>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                <p className="font-semibold text-primary">Preview:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-tertiary">Total mappings:</span><span className="font-semibold text-right">{applyPreview.total}</span>
                  <span className="text-tertiary">Already on this semester:</span><span className="font-semibold text-right">{applyPreview.alreadyActive}</span>
                  <span className="text-tertiary">Will update:</span><span className="font-semibold text-right text-green-600">{applyPreview.willUpdate}</span>
                  <span className="text-tertiary">Will skip:</span><span className="font-semibold text-right text-amber-600">{applyPreview.willSkip}</span>
                </div>
              </div>
              {applyPreview.willSkip > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                  <p className="font-semibold text-primary">Skipped — another mapping already exists for these subject + section pairs:</p>
                  <ul className="space-y-0.5">
                    {applyPreview.skippedSample.map((s) => (
                      <li key={s.id} className="font-mono text-[11px]">{s.label}</li>
                    ))}
                  </ul>
                  {applyPreview.willSkip > applyPreview.skippedSample.length && (
                    <p className="text-[11px]">…and {applyPreview.willSkip - applyPreview.skippedSample.length} more</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <IosButton variant="gray" onClick={() => { setApplyOpen(false); setApplyPreview(null) }}>Cancel</IosButton>
              <IosButton type="button" loading={applying} variant="primary" onClick={confirmApplySemester}>Apply Semester</IosButton>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-default bg-surface flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-primary">Semesters Directory</h3>
          <IosButton
            variant="tinted" size="sm"
            loading={applyLoading}
            disabled={activeCount !== 1 || applying}
            title={activeCount !== 1 ? "Activate exactly one semester first" : "Set the active semester on every conflict-free faculty-subject mapping"}
            onClick={openApplySemester}
          >
            Apply Semester to All Mappings
          </IosButton>
        </div>
        {semesters.length === 0 ? (
          <p className="text-xs text-tertiary p-6">No semesters configured yet.</p>
        ) : (
          <>
            <div className="desktop-only tbl">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {semesters.map((semester) => (
                    <tr key={semester.id}>
                      <td className="font-medium">{semester.title}</td>
                      <td>
                        <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-full ${semester.isActive ? "bg-green-50 text-green-600 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                          {semester.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 space-x-3 text-center">
                        <IosButton variant="plain" size="xs" onClick={() => { setEditTitle(semester.title); setEditingId(semester.id) }}>Edit</IosButton>
                        {semester.isActive ? (
                          <IosButton
                            variant="plain" size="xs"
                            disabled={activeCount <= 1}
                            onClick={() => handleDeactivate(semester.id)}
                            className={activeCount <= 1 ? "!text-tertiary/40" : "!text-red-500"}
                          >
                            Disable
                          </IosButton>
                        ) : (
                          <IosButton variant="plain" size="xs" onClick={() => promptActivate(semester.id)} className="!text-green-600">
                            Enable
                          </IosButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-only space-y-2 p-3">
              {semesters.map((semester) => (
                <div key={semester.id} className={`p-4 rounded-xl border ${semester.isActive ? 'border-green-300 bg-green-50/50' : 'border-red-300 bg-red-50/50'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div><p className="text-sm font-bold text-primary">{semester.title}</p><p className="text-xs font-mono font-semibold text-tertiary">{semester.id}</p></div>
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${semester.isActive ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                      {semester.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-2 flex-wrap">
                    <IosButton variant="tinted" size="sm" onClick={() => { setEditTitle(semester.title); setEditingId(semester.id) }} className="flex-1">Edit</IosButton>
                    {semester.isActive ? (
                      <IosButton
                        variant="destructive" size="sm"
                        disabled={activeCount <= 1}
                        onClick={() => handleDeactivate(semester.id)}
                        className="flex-1"
                      >
                        Disable
                      </IosButton>
                    ) : (
                      <IosButton variant="success" size="sm" onClick={() => promptActivate(semester.id)} className="flex-1">
                        Enable
                      </IosButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

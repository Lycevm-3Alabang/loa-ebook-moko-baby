"use client"

import { useState } from "react"
import { useApiGet, invalidate } from "@/lib/api/client"
import { SkeletonTable, SkeletonCard } from "@/components/ui/Skeleton"
import IosButton from "@/components/ui/IosButton"
import LockedTab from "@/components/ui/LockedTab"
import BulkDepartmentsCoursesImport from "@/features/users/components/bulk-import/BulkDepartmentsCoursesImport"
import { SegmentedControl } from "./shared"
import type { DepartmentData, UserData } from "@/lib/types"
import type { InfraTab, DepartmentCourse } from "./types"

export function DepartmentsCoursesTab() {
  const [infraTab, setInfraTab] = useState<InfraTab>("departments")
  const [showImport, setShowImport] = useState(false)
  const [showAddDept, setShowAddDept] = useState(false)
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const showSuccessMessage = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 4000)
  }

  const [newDeptName, setNewDeptName] = useState("")
  const [newDeptCode, setNewDeptCode] = useState("")
  const [newDeptDeanId, setNewDeptDeanId] = useState("")
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editDeptName, setEditDeptName] = useState("")
  const [editDeptCode, setEditDeptCode] = useState("")
  const [editDeptDeanId, setEditDeptDeanId] = useState("")
  const [newCourseDeptId, setNewCourseDeptId] = useState("")
  const [newCourseName, setNewCourseName] = useState("")
  const [newCourseCode, setNewCourseCode] = useState("")
  const [saving, setSaving] = useState(false)

  const { data: coursesData, isLoading: coursesLoading, error: coursesErr } = useApiGet<DepartmentCourse[]>("/api/admin/department-courses")
  const { data: usersData, isLoading: usersLoading, error: usersErr } = useApiGet<{ users: UserData[] }>("/api/admin/users")
  const { data: deptsData, isLoading: deptsLoading, error: deptsErr } = useApiGet<DepartmentData[]>("/api/admin/departments")

  const courses = coursesData ?? []
  const departments = deptsData ?? []
  const users = usersData?.users ?? []
  const loading = coursesLoading || usersLoading || deptsLoading
  const fetchError = coursesErr || usersErr || deptsErr
  const locked = fetchError?.message?.includes("Forbidden") || fetchError?.message?.includes("API endpoint requires")
    ? "/api/admin/department-courses"
    : ""

  const refresh = () => {
    invalidate("/api/admin/department-courses", "/api/admin/users", "/api/admin/departments")
  }

  const deans = users.filter((u) => u.role.split("|").includes("DEAN"))
  const editDeanOptions = editingDeptId
    ? deans.filter((d) => d.departmentId === editingDeptId || d.id === editDeptDeanId)
    : deans
  const addDeanOptions = deans.filter((d) => !d.departmentId)

  const grouped = departments.map((dept) => ({
    ...dept,
    courses: courses.filter((c) => c.departmentId === dept.id),
  }))

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeptName || !newDeptCode) return
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeptName, code: newDeptCode, deanId: newDeptDeanId || null }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to add department") }
      setNewDeptName(""); setNewDeptCode(""); setNewDeptDeanId("")
      showSuccessMessage("Department successfully created!")
      await refresh()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleEditDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDeptId || !editDeptName || !editDeptCode) return
    setSaving(true); setError("")
    try {
      const res = await fetch(`/api/admin/departments/${editingDeptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDeptName, code: editDeptCode, deanId: editDeptDeanId || null }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to update department") }
      setEditingDeptId(null)
      showSuccessMessage("Department successfully updated!")
      await refresh()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleToggleStatus = async (dept: DepartmentData) => {
    setError("")
    try {
      const res = await fetch(`/api/admin/departments/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDisabled: !dept.isDisabled }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to update status") }
      showSuccessMessage(`Department is now ${!dept.isDisabled ? "disabled" : "enabled"}!`)
      await refresh()
    } catch (err) { setError((err as Error).message) }
  }

  const startEditing = (dept: DepartmentData) => {
    setEditingDeptId(dept.id)
    setEditDeptName(dept.name)
    setEditDeptCode(dept.code)
    setEditDeptDeanId(dept.deanId || "")
  }

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCourseDeptId || !newCourseName || !newCourseCode) return
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/admin/department-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: newCourseDeptId, name: newCourseName, code: newCourseCode }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to add course") }
      setNewCourseDeptId(""); setNewCourseName(""); setNewCourseCode("")
      showSuccessMessage("Course successfully added to department!")
      await refresh()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleDeleteCourse = async (id: string) => {
    if (!confirm("Remove this course?")) return
    try {
      const res = await fetch(`/api/admin/department-courses/${id}`, { method: "DELETE" })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to delete") }
      showSuccessMessage("Course successfully removed!")
      await refresh()
    } catch (err) { setError((err as Error).message) }
  }

  if (loading) {
    return <div className="p-6 space-y-6"><SkeletonTable rows={6} cols={4} /><SkeletonCard count={2} /></div>
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {locked && <LockedTab endpoint={locked} />}
      {!locked && (fetchError?.message || error) && (
        <p className="text-xs font-medium text-red-600 bg-red-50 p-3 rounded-lg">{fetchError?.message || error}</p>
      )}
      {success && <p className="text-xs font-medium text-green-600 bg-green-50 p-3 rounded-lg">{success}</p>}

      {/* Sub-tabs */}
      <SegmentedControl
        options={[{ key: "departments" as const, label: "Departments Management" }, { key: "courses" as const, label: "Courses Mapping" }]}
        selected={infraTab}
        onSelect={(key) => { setInfraTab(key); setError("") }}
      />

      {/* Collapsible Import */}
      <div className="border border-default rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => { setShowImport((s) => !s); setError("") }}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
        >
          <span>Importer: Departments &amp; Courses</span>
          <span className="text-tertiary">{showImport ? "▲" : "▼"}</span>
        </button>
        {showImport && (
          <div className="border-t border-default px-3 pb-3">
            <BulkDepartmentsCoursesImport onImportComplete={() => { refresh(); setShowImport(false) }} />
          </div>
        )}
      </div>

      {/* ── Departments Sub-tab ──────────────────────────────────────────── */}
      {infraTab === "departments" && (
        <div className="space-y-8">
          {editingDeptId ? (
            <form onSubmit={handleEditDeptSubmit} className="card p-6 bg-surface space-y-4 border border-amber-300">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-amber-700">Edit Department Details</h2>
                <IosButton variant="gray" size="sm" onClick={() => setEditingDeptId(null)}>Cancel Edit</IosButton>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-tertiary mb-1">Department Name</label>
                  <input value={editDeptName} onChange={(e) => setEditDeptName(e.target.value)} className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="e.g. College of Engineering" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-tertiary mb-1">Code</label>
                  <input value={editDeptCode} onChange={(e) => setEditDeptCode(e.target.value.toUpperCase())} maxLength={10} className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="e.g. COE" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-tertiary mb-1">Assigned Dean</label>
                  <select value={editDeptDeanId} onChange={(e) => setEditDeptDeanId(e.target.value)} className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <option value="">Unassigned</option>
                    {editDeanOptions.map((d) => (<option key={d.id} value={d.id}>{d.name} ({d.email})</option>))}
                  </select>
                  {editDeanOptions.length === 0 && (
                    <p className="text-[11px] text-tertiary mt-1">No deans belong to this department — assign users to it via Users first.</p>
                  )}
                </div>
              </div>
              <div><IosButton type="submit" loading={saving} variant="primary">Save Changes</IosButton></div>
            </form>
          ) : (
            <div className="border border-default rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAddDept((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
              >
                <span>Add Department</span>
                <span className="text-tertiary">{showAddDept ? "▲" : "▼"}</span>
              </button>
              {showAddDept && (
                <div className="border-t border-default px-3 pb-3">
                  <form onSubmit={handleAddDept} className="space-y-4 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-tertiary mb-1">Department Name</label>
                        <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="e.g. College of Liberal Arts" required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-tertiary mb-1">Code</label>
                        <input value={newDeptCode} onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())} maxLength={10} className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="e.g. CLA" required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-tertiary mb-1">Assigned Dean (Optional)</label>
                        <select value={newDeptDeanId} onChange={(e) => setNewDeptDeanId(e.target.value)} className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400">
                          <option value="">Select Dean...</option>
                          {addDeanOptions.map((d) => (<option key={d.id} value={d.id}>{d.name} ({d.email})</option>))}
                        </select>
                        <p className="text-[11px] text-tertiary mt-1">Only deans without a home department are listed — set home departments via Users first.</p>
                      </div>
                    </div>
                    <div><IosButton type="submit" loading={saving} variant="primary">Create Department</IosButton></div>
                  </form>
                </div>
              )}
            </div>
          )}

          <div className="card bg-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-default bg-surface"><h3 className="text-sm font-bold text-primary">Departments Directory</h3></div>
            {departments.length === 0 ? (
              <p className="text-xs text-tertiary p-6">No departments configured yet.</p>
            ) : (
              <>
                <div className="desktop-only tbl">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Department Name</th>
                        <th>Dean Assigned</th>
                        <th>Status</th>
                    <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((dept) => {
                        const assignedDean = users.find((u) => u.id === dept.deanId)
                        return (
                          <tr key={dept.id}>
                            <td className="font-mono text-xs font-bold text-secondary">{dept.code}</td>
                            <td className="text-primary font-medium">{dept.name}</td>
                            <td className="text-secondary">
                              {assignedDean ? (
                                <div><p className="font-semibold text-primary">{assignedDean.name}</p><p className="text-xs text-tertiary">{assignedDean.email}</p></div>
                              ) : (<span className="text-xs italic text-tertiary">No dean assigned</span>)}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-full ${dept.isDisabled ? "bg-red-50 text-red-600 border border-red-200" : "bg-green-50 text-green-600 border border-green-200"}`}>
                                {dept.isDisabled ? "Disabled" : "Active"}
                              </span>
                            </td>
                      <td className="px-6 py-4 space-x-3 text-center">
                              <IosButton variant="plain" size="xs" onClick={() => startEditing(dept)}>Edit</IosButton>
                              <IosButton variant="plain" size="xs" onClick={() => handleToggleStatus(dept)} className={dept.isDisabled ? "!text-green-600" : "!text-red-500"}>
                                {dept.isDisabled ? "Enable" : "Disable"}
                              </IosButton>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mobile-only space-y-2 p-3">
                  {departments.map((dept) => {
                    const assignedDean = users.find((u) => u.id === dept.deanId)
                    return (
                      <div key={dept.id} className="p-4 rounded-xl bg-surface border border-default space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div><p className="text-sm font-bold text-primary">{dept.name}</p><p className="text-xs font-mono font-semibold text-tertiary">{dept.code}</p></div>
                          <span className={`shrink-0 inline-flex px-2 py-1 text-[10px] font-bold rounded-full ${dept.isDisabled ? "bg-red-50 text-red-600 border border-red-200" : "bg-green-50 text-green-600 border border-green-200"}`}>
                            {dept.isDisabled ? "Disabled" : "Active"}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-tertiary">Dean: </span>
                          {assignedDean ? (<span className="text-secondary">{assignedDean.name} <span className="text-tertiary">({assignedDean.email})</span></span>) : (<span className="italic text-tertiary">Not assigned</span>)}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <IosButton variant="tinted" size="sm" onClick={() => startEditing(dept)} className="flex-1">Edit</IosButton>
                          <IosButton variant={dept.isDisabled ? "success" : "destructive"} size="sm" onClick={() => handleToggleStatus(dept)} className="flex-1">
                            {dept.isDisabled ? "Enable" : "Disable"}
                          </IosButton>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Courses Sub-tab ──────────────────────────────────────────────── */}
      {infraTab === "courses" && (
        <div className="space-y-8">
          <div className="border border-default rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAddCourse((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
            >
              <span>Add Course to Department</span>
              <span className="text-tertiary">{showAddCourse ? "▲" : "▼"}</span>
            </button>
            {showAddCourse && (
              <div className="border-t border-default px-3 pb-3">
                <form onSubmit={handleAddCourse} className="space-y-4 pt-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-tertiary mb-1">Department</label>
                      <select value={newCourseDeptId} onChange={(e) => setNewCourseDeptId(e.target.value)} className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" required>
                        <option value="">Select department...</option>
                        {departments.filter((d) => !d.isDisabled).map((d) => (<option key={d.id} value={d.id}>{d.name} ({d.code})</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-tertiary mb-1">Course Name</label>
                      <input value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="e.g. Bachelor of Science in IT" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-tertiary mb-1">Course Code</label>
                      <input value={newCourseCode} onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())} maxLength={10} className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="e.g. BSIT" required />
                    </div>
                  </div>
                  <div><IosButton type="submit" loading={saving} variant="primary">Add Course</IosButton></div>
                </form>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {grouped.map((dept) => (
              <div key={dept.id} className={`card bg-surface ${dept.isDisabled ? "opacity-60" : ""}`}>
                <div className="px-4 sm:px-6 py-4 border-b border-default flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-slate-50/50">
                  <h3 className="text-sm font-bold text-primary">{dept.name} ({dept.code})</h3>
                  {dept.isDisabled && (<span className="self-start sm:self-auto text-xs text-red-500 font-semibold bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Dept Disabled</span>)}
                </div>
                {dept.courses.length === 0 ? (
                  <p className="text-xs text-tertiary px-6 py-4">No courses configured.</p>
                ) : (
                  <>
                    <div className="desktop-only tbl">
                      <table>
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th className="w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dept.courses.map((c) => (
                            <tr key={c.id}>
                              <td className="font-mono text-xs font-semibold text-secondary">{c.code}</td>
                              <td className="text-secondary">{c.name}</td>
                              <td>
                                <IosButton variant="plain" size="xs" onClick={() => handleDeleteCourse(c.id)} className="!text-red-500">Remove</IosButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mobile-only space-y-2 p-3">
                      {dept.courses.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-default">
                          <div><p className="text-xs font-semibold text-secondary font-mono">{c.code}</p><p className="text-xs text-secondary">{c.name}</p></div>
                          <IosButton variant="plain" size="xs" onClick={() => handleDeleteCourse(c.id)} className="!text-red-500">Remove</IosButton>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react"
import { useJwt } from "@/lib/jwt-context"
import IosButton from "@/components/ui/IosButton"
import { useApiGet, invalidate } from "@/lib/api/client"
import LockedTab from "@/components/ui/LockedTab"
import ErrorState from "@/components/ui/ErrorState"
import ErrorBoundary from "@/components/ui/ErrorBoundary"
import type { DepartmentData } from "@/lib/types"
import type { DepartmentCourse } from "@/features/admin-data/components/types"

export default function DeanDepartmentsPage() {
  const { session } = useJwt();
  const [error, setError] = useState("")
  const [newName, setNewName] = useState("")
  const [newCode, setNewCode] = useState("")
  const [saving, setSaving] = useState(false)
  const [lockedEndpoint, setLockedEndpoint] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const userId = (session?.user as Record<string, unknown>)?.id as string

  const { data: usersData, isLoading: usersLoading, error: usersError } = useApiGet<{ users: unknown[]; departments: DepartmentData[] }>(
    session ? "/api/admin/users" : null
  )

  const { data: allCourses, isLoading: coursesLoading, error: coursesError } = useApiGet<DepartmentCourse[]>(
    session ? "/api/admin/department-courses" : null
  )

  const loading = usersLoading || coursesLoading

  useEffect(() => {
    Promise.resolve().then(() => {
      const api403 = [usersError, coursesError].find(
        (e) => e?.message?.includes("403") || e?.message?.includes("Forbidden")
      )
      if (api403) {
        setLockedEndpoint("/api/admin/users")
      } else if (usersError || coursesError) {
        setErrorMessage(usersError?.message || coursesError?.message || "Failed to load data")
      }
    })
  }, [usersError, coursesError])

  const department = usersData?.departments?.find((d: DepartmentData) => d.deanId === userId) ?? null
  const courses = department && allCourses ? allCourses.filter((c) => c.departmentId === department.id) : []

  const refresh = () => {
    invalidate("/api/admin/users", "/api/admin/department-courses")
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!department || !newName || !newCode) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/admin/department-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: department.id, name: newName, code: newCode }),
      })
      if (res.status === 403) { setLockedEndpoint("/api/admin/department-courses"); return }
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to add course")
      }
      setNewName("")
      setNewCode("")
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this course?")) return
    try {
      const res = await fetch(`/api/admin/department-courses/${id}`, { method: "DELETE" })
      if (res.status === 403) { setLockedEndpoint(`/api/admin/department-courses/${id}`); return }
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to delete")
      }
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!session) return null

  if (loading) {
    return <div className="text-sm text-tertiary p-8">Loading...</div>
  }

  if (!department) {
    return (
      <div className="w-full space-y-8 pb-12">
        <h1 className="text-2xl font-bold text-primary">My Department</h1>
        <div className="card p-8 bg-surface text-center">
          <p className="text-sm text-tertiary">No department assigned to your account.</p>
        </div>
      </div>
    )
  }

  if (lockedEndpoint) {
    return <LockedTab endpoint={lockedEndpoint} />
  }

  if (errorMessage) {
    return (
      <ErrorBoundary>
        <ErrorState message={errorMessage} onRetry={() => { setErrorMessage(""); refresh() }} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <div className="w-full space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-primary">My Department: {department.name}</h1>
        <p className="text-sm text-tertiary mt-1">Manage courses for {department.name} ({department.code}). These courses are available when importing students.</p>
      </div>

      {error && <p className="text-xs font-medium text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      {/* Add Course Form */}
      <form onSubmit={handleAdd} className="card p-6 bg-surface space-y-4">
        <h2 className="text-sm font-bold text-secondary">Add Course</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-tertiary mb-1">Course Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
              placeholder="e.g. Bachelor of Science in Information Technology"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-tertiary mb-1">Course Code (max 10 chars)</label>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              maxLength={10}
              className="w-full text-sm border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
              placeholder="e.g. BSIT"
              required
            />
          </div>
        </div>
        <IosButton type="submit" loading={saving} variant="primary">Add Course</IosButton>
      </form>

      {/* Department Courses List */}
      <div className="card bg-surface">
        <div className="px-6 py-4 border-b border-default">
          <h3 className="text-sm font-bold text-primary">Courses</h3>
        </div>
        {courses.length === 0 ? (
          <p className="text-xs text-tertiary px-6 py-4">No courses configured yet. Add one above.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="desktop-only tbl-container tbl">
              <table>
                <thead>
                  <tr >
                    <th>Code</th>
                    <th>Name</th>
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id} >
                      <td className="font-mono text-xs font-semibold text-secondary">{c.code}</td>
                      <td className="text-secondary">{c.name}</td>
                      <td>
                        <IosButton variant="plain" size="xs" className="!text-red-500" onClick={() => handleDelete(c.id)}>
                          Remove
                        </IosButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mobile-only space-y-2 p-3">
              {courses.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-default">
                  <div>
                    <p className="text-xs font-semibold text-secondary font-mono">{c.code}</p>
                    <p className="text-xs text-secondary">{c.name}</p>
                  </div>
                  <IosButton variant="plain" size="xs" className="!text-red-500" onClick={() => handleDelete(c.id)}>
                    Remove
                  </IosButton>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </ErrorBoundary>
  )
}

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository, evaluationRepository } from "@/lib/repositories/factory"
import { getDepartmentTeachingFaculty } from "@/features/evaluation-results/evaluation-results.service"
import Link from "next/link"

export default async function DeanEvaluationsPage() {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN"))
    redirect("/login")

  const userId = (session.user as Record<string, unknown>).id as string
  const dept = await departmentRepository.findByDeanId(userId)

  if (!dept) {
    return (
      <div className="w-full space-y-6 pb-12">
        <h1 className="text-xl font-bold text-primary">Department Evaluation Dashboard</h1>
        <p className="text-sm text-tertiary">You are not assigned to any department.</p>
      </div>
    )
  }

  // The faculty who teach in this department this term — the same rule the
  // results pages use, not the people merely homed here.
  const facultyUsers = await getDepartmentTeachingFaculty(dept.id)
  const facultyCount = facultyUsers.length
  const facultyIds = facultyUsers.map((u) => u.id)

  const { total: evalCount, distinctEvaluatees: evaluatedFaculty } =
    await evaluationRepository.countDistinctSubmittedEvaluateesByFacultyIds(facultyIds)

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold text-primary">Department Evaluation Dashboard</h1>
        <p className="text-sm text-tertiary mt-1">{dept.name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-tertiary uppercase tracking-wider">Faculty Teaching</p>
          <p className="text-2xl font-bold text-primary mt-1">{facultyCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-tertiary uppercase tracking-wider">Evaluated</p>
          <p className="text-2xl font-bold text-primary mt-1">{evaluatedFaculty}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-tertiary uppercase tracking-wider">Total Submissions</p>
          <p className="text-2xl font-bold text-primary mt-1">{evalCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-primary mb-4">Quick Links</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/dean/evaluations/results" className="block rounded-lg border border-slate-200 p-4 hover:border-blue-200 hover:shadow-sm transition-all">
            <h4 className="text-sm font-bold text-primary">Evaluation Results</h4>
            <p className="text-xs text-tertiary mt-1">View detailed ratings per faculty</p>
          </Link>
          <Link href="/dean/evaluations/reports" className="block rounded-lg border border-slate-200 p-4 hover:border-blue-200 hover:shadow-sm transition-all">
            <h4 className="text-sm font-bold text-primary">Reports</h4>
            <p className="text-xs text-tertiary mt-1">Analytics and export tools</p>
          </Link>
        </div>
      </div>

      {facultyUsers && facultyUsers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-primary">Teaching Roster</h3>
            <p className="text-xs text-tertiary mt-0.5">Faculty with a section in {dept.name} this term</p>
          </div>
          <div className="divide-y divide-slate-100">
            {facultyUsers.map((u) => (
              <div key={u.id} className="px-5 py-3 flex items-center justify-between">
                <span className="text-sm text-primary">{u.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

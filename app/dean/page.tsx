import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { listFacultyAppointments } from "@/features/appointments/appointments.service"
import { userRepository, departmentRepository, reportsRepository } from "@/lib/repositories/factory"
import { getDepartmentTeachingFaculty } from "@/features/evaluation-results/evaluation-results.service"
import { OnboardingWalkthrough } from "@/features/users/components/OnboardingWalkthrough"
import FacultyDeanDashboard from "@/features/appointments/components/FacultyDeanDashboard"
import { SkeletonCard } from "@/components/ui/Skeleton"

async function DeanOnboardingSection({ userId }: { userId: string }) {
  const dbUser = await userRepository.findById(userId)
  if (dbUser?.onboardingVersion === 0) {
    return <OnboardingWalkthrough role="DEAN" userId={userId} />
  }
  return null
}

async function DeanMainSection({ userId }: { userId: string }) {
  const [dbUser, department] = await Promise.all([
    userRepository.findById(userId),
    departmentRepository.findByDeanId(userId),
  ])

  const { data: appointments } = await listFacultyAppointments(userId)

  let departmentStats:
    | { facultyCount: number; facultyLabel?: string; total: number; pending: number; completed: number }
    | undefined

  if (department) {
    const [teachingFaculty, workload] = await Promise.all([
      getDepartmentTeachingFaculty(department.id),
      reportsRepository.getWorkloadDistribution(department.id),
    ])
    departmentStats = {
      facultyCount: teachingFaculty.length,
      facultyLabel: "Teaching",
      total: workload.departmentTotal,
      pending: workload.entries.reduce((s, e) => s + e.pending, 0),
      completed: workload.entries.reduce((s, e) => s + e.completed, 0),
    }
  }

  return (
    <FacultyDeanDashboard
      userName={dbUser?.name || "Dean"}
      role="DEAN"
      appointments={appointments}
      departmentName={department?.name}
      departmentStats={departmentStats}
    />
  )
}

export default async function DeanDashboard() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const deanId = (session.user as Record<string, unknown>).id as string

  return (
    <>
      <Suspense fallback={null}>
        <DeanOnboardingSection userId={deanId} />
      </Suspense>
      <Suspense fallback={<SkeletonCard count={3} />}>
        <DeanMainSection userId={deanId} />
      </Suspense>
    </>
  )
}

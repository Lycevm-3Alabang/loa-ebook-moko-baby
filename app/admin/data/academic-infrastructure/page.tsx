"use client"

import { Suspense } from "react"
import AcademicInfrastructurePage from "@/features/admin-data/components/AcademicInfrastructurePage"

export default function AdminAcademicInfrastructure() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-tertiary">Loading...</div>}>
      <AcademicInfrastructurePage />
    </Suspense>
  )
}

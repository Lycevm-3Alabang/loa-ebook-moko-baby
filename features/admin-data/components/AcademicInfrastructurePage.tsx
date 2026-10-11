"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { SegmentedControl } from "@/features/admin-data/components/shared"
import { SemestersTab } from "@/features/admin-data/components/SemestersTab"
import { DepartmentsCoursesTab } from "@/features/admin-data/components/DepartmentsCoursesTab"
import { SubjectsSectionsTab } from "@/features/admin-data/components/SubjectsSectionsTab"
import { FacultyLoadingTab } from "@/features/admin-data/components/FacultyLoadingTab"
import { useApiGet } from "@/lib/api/client"
import type { MainTab } from "@/features/admin-data/components/types"

const allTabs: { key: MainTab; label: string }[] = [
  { key: "semesters", label: "Semesters" },
  { key: "departments", label: "Departments & Courses" },
  { key: "subjects", label: "Subjects & Sections" },
  { key: "faculty_enroll", label: "Faculty Loading & Enrollments" },
]

const setupSteps = [
  { step: 1, label: "Semesters", detail: "Create semesters and activate exactly one.", requires: null },
  { step: 2, label: "Departments", detail: "Add departments (e.g. CCS, CAS).", requires: null },
  { step: 3, label: "Courses", detail: "Add courses under each department.", requires: "Departments" },
  { step: 4, label: "Subjects", detail: "Add subject codes and names.", requires: null },
  { step: 5, label: "Sections", detail: "Add sections under each course.", requires: "Courses" },
  { step: 6, label: "Faculty Loading", detail: "Assign faculty to subject + section.", requires: "Subjects + Sections" },
  { step: 7, label: "Enrollments", detail: "Enroll students into sections.", requires: "Sections" },
]

export default function AcademicInfrastructurePage() {
  const searchParams = useSearchParams()
  // Deep-link support (e.g. "Back to Faculty Loading" lands on the
  // faculty_enroll tab): unknown values fall back to semesters.
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    const tab = searchParams.get("tab")
    return allTabs.some((t) => t.key === tab) ? (tab as MainTab) : "semesters"
  })
  const [showGuide, setShowGuide] = useState(false)
  const { data: countData } = useApiGet<{ count: number }>("/api/semesters/count-active")
  const semesterLocked = (countData?.count ?? 1) !== 1

  // A deep link must not render a gated tab behind the semester lock.
  const effectiveTab = semesterLocked && mainTab !== "semesters" ? "semesters" : mainTab

  const tabs = semesterLocked
    ? allTabs.map((t) => ({ ...t, disabled: t.key !== "semesters" }))
    : allTabs

  return (
    <div className="w-full space-y-6 pb-12 px-4 sm:px-0 animate-ios-slide-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-primary">Academic Configurations</h1>
        <p className="text-xs sm:text-sm text-tertiary mt-0.5 sm:mt-1">
          Manage departments, courses, subjects, sections, faculty mappings, student enrollments, and semesters.
        </p>
        {semesterLocked && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-semibold">
            No active semester or multiple active semesters detected. Please set exactly one semester as active before accessing other modules.
          </p>
        )}
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Note: This module is intended for administrative configuration purposes only and is not meant to replace any internal application used by the institution.
        </p>
      </div>

      <div className="border border-default rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowGuide((s) => !s)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Setup Guide — What depends on what?
          </span>
          <span className="text-tertiary">{showGuide ? "▲" : "▼"}</span>
        </button>
        {showGuide && (
          <div className="border-t border-default px-4 py-4 space-y-4">
            <p className="text-xs text-tertiary">
              Follow this order when setting up the system for the first time. Tabs that have no dependencies can be configured in parallel.
            </p>

            <div className="space-y-0">
              {setupSteps.map((s, i) => (
                <div key={s.step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-gold-700 dark:text-gold-400">{s.step}</span>
                    </div>
                    {i < setupSteps.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-0.5" />}
                  </div>
                  <div className="pb-3">
                    <p className="text-xs font-semibold text-primary">{s.label}</p>
                    <p className="text-[11px] text-tertiary">{s.detail}</p>
                    {s.requires && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                        Requires: {s.requires}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-secondary">Dependency chain</p>
              <p className="text-[11px] text-tertiary font-mono leading-relaxed">
                Semesters → (gates all tabs)
              </p>
              <p className="text-[11px] text-tertiary font-mono leading-relaxed">
                Departments → Courses → Sections
              </p>
              <p className="text-[11px] text-tertiary font-mono leading-relaxed">
                Subjects (independent)
              </p>
              <p className="text-[11px] text-tertiary font-mono leading-relaxed">
                Faculty Loading → Users + Subjects + Sections + Active Semester
              </p>
              <p className="text-[11px] text-tertiary font-mono leading-relaxed">
                Enrollments → Users + Sections
              </p>
            </div>
          </div>
        )}
      </div>

      <SegmentedControl
        options={tabs}
        selected={effectiveTab}
        onSelect={(key) => setMainTab(key)}
      />

      {effectiveTab === "semesters" && <SemestersTab />}
      {effectiveTab === "departments" && <DepartmentsCoursesTab />}
      {effectiveTab === "subjects" && <SubjectsSectionsTab />}
      {effectiveTab === "faculty_enroll" && <FacultyLoadingTab />}
    </div>
  )
}

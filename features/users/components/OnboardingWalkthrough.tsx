"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"

interface Step {
  icon: string
  title: string
  description: string
}

const stepsByRole: Record<string, Step[]> = {
  STUDENT: [
    {
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
      title: "Welcome to ACES!",
      description:
        "This platform lets you book one-on-one consultations with faculty members. We'll walk you through the basics in just a few steps.",
    },
    {
      icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      title: "Book a Consultation",
      description:
        "Go to 'Book Consultation' from the sidebar. Pick a faculty member, choose an available time slot, add a title and description, then submit. Your request will be sent to the faculty for approval.",
    },
    {
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
      title: "Track Your Appointments",
      description:
        "View all your consultations under 'Consultations' in the sidebar. You can see the status — Pending, Approved, Completed, or Cancelled — at a glance.",
    },
    {
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      title: "You're All Set!",
      description:
        "You're ready to book your first consultation. If you need help, contact your department or the admin team. Enjoy using ACES!",
    },
  ],
  FACULTY: [
    {
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
      title: "Welcome to ACES!",
      description:
        "This platform manages student consultations and internal faculty meetings. Here's a quick tour of what you can do.",
    },
    {
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      title: "Manage Consultations",
      description:
        "Under 'Meetings' in the sidebar, you'll see all your consultations. Accept or decline pending requests, join via Teams, and mark appointments as complete with action notes.",
    },
    {
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      title: "Set Your Availability",
      description:
        "Go to 'Availability Rules' in the sidebar to set when you're available for consultations. You can customize hours per day and block off dates.",
    },
    {
      icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      title: "You're All Set!",
      description:
        "You're ready to manage consultations and meetings. If you need help, check with your dean or the admin team.",
    },
  ],
  DEAN: [
    {
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
      title: "Welcome to the Dean Dashboard!",
      description:
        "Your dean dashboard gives you oversight of your department's consultation activity. Here's a quick tour of your tools.",
    },
    {
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      title: "Department Reports",
      description:
        "Visit 'Department Reports' in the sidebar to view consultation statistics by faculty, completion rates, and timelines. You can filter by date range and export to CSV.",
    },
    {
      icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
      title: "Import Users",
      description:
        "Use 'Import Users' in the sidebar to bulk-upload faculty, students, and staff via CSV. The system will create accounts and send activation emails.",
    },
    {
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      title: "You're All Set!",
      description:
        "You're ready to manage your department. Explore the dashboard, run reports, and import users as needed.",
    },
  ],
}

interface OnboardingWalkthroughProps {
  role: string
  userId: string
}

export function OnboardingWalkthrough({ role, userId }: OnboardingWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const steps = stepsByRole[role] || stepsByRole.STUDENT
  const isLastStep = currentStep === steps.length - 1

  const complete = useCallback(async () => {
    setLoading(true)
    try {
      await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      setDismissed(true)
      router.refresh()
    } catch {
      setDismissed(true)
      router.refresh()
    }
  }, [userId, router])

  const next = useCallback(() => {
    if (isLastStep) {
      complete()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [isLastStep, complete])

  if (dismissed) return null

  const step = steps[currentStep]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {}}
      />

      <div className="relative w-full max-w-lg mx-4 bg-surface rounded-3xl shadow-2xl border border-default/80 overflow-hidden transition-all duration-300">
        <div className="h-1.5 bg-gradient-to-r from-gold-500 to-amber-500" />

        <div className="p-8">
          <div className="flex items-center gap-1.5 mb-8">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? "w-8 bg-gold-600"
                    : i < currentStep
                    ? "w-4 bg-gold-300"
                    : "w-4 bg-slate-200"
                }`}
              />
            ))}
            <span className="ml-auto text-xs text-tertiary font-medium">
              {currentStep + 1} / {steps.length}
            </span>
          </div>

          <div className="w-14 h-14 rounded-2xl bg-gold-50 border border-gold-200/60 flex items-center justify-center mb-5">
            <svg
              className="w-7 h-7 text-gold-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-primary mb-2">{step.title}</h2>
          <p className="text-sm text-tertiary leading-relaxed">{step.description}</p>

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-default">
            <button
              onClick={complete}
              className="text-sm font-medium text-tertiary hover:text-secondary transition-colors"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="px-4 py-2 rounded-xl border border-default text-sm font-semibold text-secondary hover:bg-surface-hover transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-gold-600 text-white text-sm font-semibold hover:bg-gold-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm disabled:opacity-50"
              >
                {loading
                  ? "Finishing..."
                  : isLastStep
                  ? "Got it!"
                  : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

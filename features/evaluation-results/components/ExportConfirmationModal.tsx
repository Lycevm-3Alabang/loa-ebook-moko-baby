"use client"

import { useEffect, useCallback } from "react"
import IosButton from "@/components/ui/IosButton"

interface ExportConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  /** how many faculty the export is limited to; 0 = the whole department */
  facultyCount?: number
  /**
   * ⭐ What the download contains. The consolidated export names its workbook
   * here; when absent the modal keeps the subject-ZIP wording.
   */
  description?: string
}

export default function ExportConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  facultyCount = 0,
  description,
}: ExportConfirmationModalProps) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKey)
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.removeEventListener("keydown", handleKey)
      document.body.style.overflow = ""
    }
  }, [isOpen, handleKey])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface rounded-3xl shadow-ios-xl animate-fade-in overflow-hidden border border-default">
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-primary mb-2">Confirm Export</h3>
          <p className="text-sm text-secondary leading-relaxed">
            {facultyCount && facultyCount > 0 ? (
              <>
                You are about to export results for{" "}
                <span className="font-bold text-primary">
                  {facultyCount} selected faculty member{facultyCount !== 1 ? "s" : ""}
                </span>
                .{" "}
                {description ??
                  "The download contains their subject workbooks, one summary, and one consolidated workbook each."}
              </>
            ) : description ? (
              <>
                You are about to export the{" "}
                <span className="font-bold text-primary">whole department</span>. {description}
              </>
            ) : (
              <>
                You are about to export the{" "}
                <span className="font-bold text-primary">whole department</span>: every faculty member,
                subject section, summary, and consolidated workbook.
              </>
            )}
          </p>
          <div className="mt-4 p-3 bg-surface-tertiary rounded-xl text-left">
            <p className="text-[11px] text-tertiary">
              <span className="font-bold uppercase mr-1">Note:</span> 
              The download will start automatically once the server has finished assembling the ZIP archive. 
              Do not close this page during the process.
            </p>
          </div>
        </div>
        <div className="flex p-4 gap-3 bg-surface-secondary border-t border-default">
          <IosButton variant="gray" className="flex-1" onClick={onClose}>
            Cancel
          </IosButton>
          <IosButton variant="primary" className="flex-1" onClick={onConfirm}>
            Start Export
          </IosButton>
        </div>
      </div>
    </div>
  )
}

"use client"

import IosButton from "@/components/ui/IosButton"

interface CachedDataRefreshBannerProps {
  lastManualRefreshAt: string | null
  isRefreshing: boolean
  onRefresh: () => void | Promise<void>
  disabled?: boolean
  contextLabel?: string
  statusMessage?: string
}

export default function CachedDataRefreshBanner({
  lastManualRefreshAt,
  isRefreshing,
  onRefresh,
  disabled = false,
  contextLabel,
  statusMessage,
}: CachedDataRefreshBannerProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
      <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
        Displayed figures are cached and may be stale. Click Refresh to fetch current figures.
      </span>
      <span className="text-[11px] text-amber-700 dark:text-amber-300">
        {lastManualRefreshAt
          ? `Last button refresh: ${new Date(lastManualRefreshAt).toLocaleString()}`
          : "Not manually refreshed yet"}
        {contextLabel ? ` • ${contextLabel}` : ""}
      </span>
      <IosButton
        variant="primary"
        size="sm"
        onClick={onRefresh}
        disabled={disabled || isRefreshing}
        loading={isRefreshing}
        title="Fetch the latest figures"
        className="ml-auto shrink-0 shadow-sm"
      >
        Refresh
      </IosButton>
      {statusMessage && (
        <span className="text-[11px] text-amber-800 dark:text-amber-300">
          {statusMessage}
        </span>
      )}
    </div>
  )
}

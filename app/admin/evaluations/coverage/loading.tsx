import { SkeletonMetricGrid } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <div className="h-7 w-48 bg-surface-dim rounded animate-pulse-soft" />
        <div className="h-4 w-72 bg-surface-dim rounded animate-pulse-soft mt-2" />
      </div>
      <SkeletonMetricGrid count={4} />
      <div className="h-64 bg-surface-dim rounded-xl animate-pulse-soft" />
    </div>
  )
}

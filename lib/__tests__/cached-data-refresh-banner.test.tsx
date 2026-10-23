import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import CachedDataRefreshBanner from "@/components/ui/CachedDataRefreshBanner"

describe("CachedDataRefreshBanner", () => {
  it("shows the stale warning, fallback timestamp, context, and status message", () => {
    render(
      <CachedDataRefreshBanner
        lastManualRefreshAt={null}
        isRefreshing={false}
        onRefresh={vi.fn()}
        contextLabel="department scope"
        statusMessage="Some rows are still loading."
      />,
    )

    expect(screen.getByText(/Displayed figures are cached and may be stale/i)).toBeTruthy()
    expect(screen.getByText(/Not manually refreshed yet/i)).toBeTruthy()
    expect(screen.getByText(/department scope/i)).toBeTruthy()
    expect(screen.getByText("Some rows are still loading.")).toBeTruthy()
  })

  it("shows the manual refresh timestamp and invokes the refresh callback", () => {
    const onRefresh = vi.fn()
    const refreshedAt = "2026-10-24T00:00:00.000Z"

    render(
      <CachedDataRefreshBanner
        lastManualRefreshAt={refreshedAt}
        isRefreshing={false}
        onRefresh={onRefresh}
      />,
    )

    expect(screen.getByText(`Last button refresh: ${new Date(refreshedAt).toLocaleString()}`)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("disables refresh while loading or when explicitly disabled", () => {
    const { rerender } = render(
      <CachedDataRefreshBanner
        lastManualRefreshAt={null}
        isRefreshing
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled")).toBe(true)

    rerender(
      <CachedDataRefreshBanner
        lastManualRefreshAt={null}
        isRefreshing={false}
        disabled
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled")).toBe(true)
  })
})

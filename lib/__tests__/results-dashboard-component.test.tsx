import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import ResultsDashboard from "@/features/evaluation-results/components/ResultsDashboard"
import {
  type ResultsDashboardRow,
  type ResultsDashboardRubric,
} from "@/features/evaluation-results/results-dashboard"
import { getRemark } from "@/lib/evaluation-utils"

const timeManagement: ResultsDashboardRubric = {
  key: "timeManagement",
  label: "Time Management",
  score: 1.2,
}

function makeRow(
  departmentId: string,
  avgRating: number | null,
  overrides: Partial<ResultsDashboardRow> = {},
): ResultsDashboardRow {
  return {
    departmentId,
    departmentName: `Department ${departmentId}`,
    departmentCode: departmentId.toUpperCase(),
    avgRating,
    remarks: avgRating === null ? null : getRemark(avgRating),
    lowestRubrics: [],
    ...overrides,
  }
}

describe("ResultsDashboard", () => {
  it("renders the skeleton until the figures settle", () => {
    render(
      <ResultsDashboard
        rows={[makeRow("a", 4.5)]}
        attentionByDept={{}}
        settled={false}
        missingDepartmentIds={[]}
      />,
    )

    expect(screen.getByTestId("results-dashboard-skeleton")).toBeTruthy()
    expect(screen.queryByText("Mean of department averages")).toBeNull()
  })

  it("renders the tiles, the ranked bars, and the weakest criteria", () => {
    render(
      <ResultsDashboard
        rows={[
          makeRow("a", 4.5, { lowestRubrics: [timeManagement] }),
          makeRow("b", 3.5, { lowestRubrics: [timeManagement] }),
          makeRow("c", null),
        ]}
        attentionByDept={{ a: [timeManagement] }}
        settled
        missingDepartmentIds={[]}
      />,
    )

    const meanTile = screen.getByTestId("dashboard-mean-tile")
    expect(within(meanTile).getByText("4.00")).toBeTruthy()
    expect(within(meanTile).getByText("Very Satisfactory")).toBeTruthy()
    expect(within(meanTile).getByText("Across 2 of 3 departments")).toBeTruthy()

    const attentionTile = screen.getByTestId("dashboard-attention-tile")
    expect(within(attentionTile).getByText("1")).toBeTruthy()
    expect(within(attentionTile).getByText("Department a (A)")).toBeTruthy()

    const coverageTile = screen.getByTestId("dashboard-coverage-tile")
    expect(within(coverageTile).getByText("2")).toBeTruthy()
    expect(within(coverageTile).getByText("of 3")).toBeTruthy()
    expect(within(coverageTile).getByText("1 with no rating")).toBeTruthy()

    const chart = screen.getByTestId("dashboard-chart")
    const chartList = within(chart).getByRole("list", {
      name: "Average rating by department: 2 rated, 1 with no results",
    })
    const chartRows = within(chartList).getAllByRole("listitem")
    expect(chartRows.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Department a (A): 4.50, Outstanding",
      "Department b (B): 3.50, Very Satisfactory",
      "Department c (C): no results",
    ])

    const firstFill = within(chartRows[0]).getByTestId("dashboard-bar-fill")
    expect(firstFill.style.width).toBe("90%")
    expect(firstFill.className).toContain("bg-success")
    expect(firstFill.getAttribute("aria-hidden")).toBe("true")
    expect(within(chartRows[0]).getByTestId("dashboard-bar-track").getAttribute("aria-hidden")).toBe(
      "true",
    )
    expect(chartRows[0].getAttribute("title")).toBe(
      "Department a (A): 4.50, Outstanding",
    )

    const secondFill = within(chartRows[1]).getByTestId("dashboard-bar-fill")
    expect(secondFill.style.width).toBe("70%")
    expect(secondFill.className).toContain("bg-info")

    expect(within(chartRows[2]).queryByTestId("dashboard-bar-fill")).toBeNull()
    expect(within(chartRows[2]).getByText("No results")).toBeTruthy()

    const weakest = screen.getByTestId("dashboard-weakest")
    expect(within(weakest).getByText("Across 2 rated departments \u00b7 ties counted")).toBeTruthy()
    expect(within(weakest).getByText("Time Management")).toBeTruthy()
    expect(within(weakest).getByText("2 of 2")).toBeTruthy()
    const weakestBar = within(weakest).getByTestId("dashboard-weakest-bar")
    expect(weakestBar.style.width).toBe("100%")
    expect(weakestBar.getAttribute("aria-hidden")).toBe("true")

    expect(screen.queryByText(/Total Respondents/i)).toBeNull()
    expect(screen.queryByText(/Sentiment/i)).toBeNull()
    expect(screen.queryByText(/Faculty/i)).toBeNull()
  })

  it("maps each remark band to its semantic fill token", () => {
    render(
      <ResultsDashboard
        rows={[
          makeRow("a", 4.6),
          makeRow("b", 4.0),
          makeRow("c", 3.0),
          makeRow("d", 2.0),
          makeRow("e", 1.0),
        ]}
        attentionByDept={{}}
        settled
        missingDepartmentIds={[]}
      />,
    )

    const chart = screen.getByTestId("dashboard-chart")
    const chartList = within(chart).getByRole("list", {
      name: /Average rating by department/,
    })
    const chartRows = within(chartList).getAllByRole("listitem")
    const fills = chartRows.map((row) => within(row).getByTestId("dashboard-bar-fill"))

    expect(fills[0].className).toContain("bg-success")
    expect(fills[1].className).toContain("bg-info")
    expect(fills[2].className).toContain("bg-warning")
    expect(fills[3].className).toContain("bg-danger")
    expect(fills[4].className).toContain("bg-danger")
    expect(chartRows[3].getAttribute("aria-label")).toContain("Unsatisfactory")
    expect(chartRows[4].getAttribute("aria-label")).toContain("Poor")
  })

  it("warns about missing figures and excludes them from the mean and the chart", () => {
    render(
      <ResultsDashboard
        rows={[makeRow("a", 4.5), makeRow("b", 3.0)]}
        attentionByDept={{}}
        settled
        missingDepartmentIds={["b"]}
      />,
    )

    const meanTile = screen.getByTestId("dashboard-mean-tile")
    expect(within(meanTile).getByText("4.50")).toBeTruthy()

    const coverageTile = screen.getByTestId("dashboard-coverage-tile")
    expect(within(coverageTile).getByText("of 2")).toBeTruthy()
    expect(within(coverageTile).getByText("0 with no rating \u00b7 1 not loaded")).toBeTruthy()

    expect(
      screen.getByText(/1 department\(s\) could not be loaded and are excluded from the figures above/i),
    ).toBeTruthy()

    const chart = screen.getByTestId("dashboard-chart")
    expect(within(chart).getAllByRole("listitem")).toHaveLength(1)
    expect(within(chart).queryByText("Department b (B)")).toBeNull()
    expect(within(chart).getByText(/1 rated of 2 departments \u00b7 1 not loaded/)).toBeTruthy()
  })

  it("renders the unavailable card when every figure is missing", () => {
    render(
      <ResultsDashboard
        rows={[makeRow("a", 4.5), makeRow("b", 3.0)]}
        attentionByDept={{}}
        settled
        missingDepartmentIds={["a", "b"]}
      />,
    )

    expect(
      screen.getByText(
        "Department figures could not be loaded. The dashboard is unavailable. Use Refresh above to try again.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText("Mean of department averages")).toBeNull()
    expect(screen.queryByTestId("dashboard-chart")).toBeNull()
  })

  it("renders the no-rating state without inventing a mean", () => {
    render(
      <ResultsDashboard
        rows={[makeRow("a", null), makeRow("b", null)]}
        attentionByDept={{}}
        settled
        missingDepartmentIds={[]}
      />,
    )

    const meanTile = screen.getByTestId("dashboard-mean-tile")
    expect(within(meanTile).getByText("\u2014")).toBeTruthy()
    expect(within(meanTile).getByText("No department has a rating yet")).toBeTruthy()

    const coverageTile = screen.getByTestId("dashboard-coverage-tile")
    expect(within(coverageTile).getByText("0")).toBeTruthy()
    expect(within(coverageTile).getByText("2 with no rating")).toBeTruthy()

    const chart = screen.getByTestId("dashboard-chart")
    const chartList = within(chart).getByRole("list", {
      name: "Average rating by department: 0 rated, 2 with no results",
    })
    expect(within(chartList).getAllByText("No results")).toHaveLength(2)

    expect(within(screen.getByTestId("dashboard-weakest")).getByText("No rubric data yet.")).toBeTruthy()
  })

  it("renders nothing when the period has no departments", () => {
    const { container } = render(
      <ResultsDashboard
        rows={[]}
        attentionByDept={{}}
        settled
        missingDepartmentIds={[]}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})

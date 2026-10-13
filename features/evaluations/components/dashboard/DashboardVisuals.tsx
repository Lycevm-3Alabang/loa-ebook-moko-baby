import Link from "next/link"
import { CATEGORY_LABELS } from "@/lib/evaluation-utils"
import type { DeanDashboardData, AdminDeptBar } from "../../evaluation-report.service"

/** Amber marker for fixture-driven review. Live source per component: see @source tags. */
export function PlaceholderBadge() {
  return (
    <span
      title="Demo values for visual review — not live data"
      className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      Placeholder
    </span>
  )
}

const REMARK_DOT: Record<string, string> = {
  Outstanding: "bg-emerald-500",
  "Very Satisfactory": "bg-blue-500",
  Satisfactory: "bg-amber-500",
  Unsatisfactory: "bg-red-500",
  Poor: "bg-red-700",
}

function remarkPill(remark: string | null): string {
  switch (remark) {
    case "Outstanding": return "text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300"
    case "Very Satisfactory": return "text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300"
    case "Satisfactory": return "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-300"
    case "Unsatisfactory": return "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300"
    case "Poor": return "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300"
    default: return "text-tertiary bg-slate-50 dark:bg-slate-800"
  }
}

const card = "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4"

/** Live source: DeanDashboardData.kpis ← buildDeptDashboard ← deptPeriodAverages + deptExpectedCounts + facultyGrainForDept. */
export function KpiCards({ dashboard, placeholder = false }: { dashboard: DeanDashboardData; placeholder?: boolean }) {
  const k = dashboard.kpis
  const items = [
    { label: "General", value: k.general?.toFixed(2) ?? "—", sub: k.remark ?? "" },
    { label: "Response", value: k.responsePct !== null ? `${k.responsePct}%` : "—", sub: `${k.actual} responses` },
    { label: "Faculty", value: `${k.facultyEvaluated}/${k.facultyAssigned}`, sub: "evaluated" },
    { label: "Risk", value: `${k.atRisk} at-risk`, sub: `${k.outstanding} outstanding` },
  ]
  return (
    <>
      {placeholder && <div><PlaceholderBadge /></div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((it) => (
        <div key={it.label} className={card}>
          <p className="text-[10px] text-tertiary">{it.label}</p>
          <p className="text-2xl font-bold text-primary">{it.value}</p>
          <p className="text-xs text-tertiary">{it.sub}</p>
        </div>
      ))}
    </div>
    </>
  )
}

/** Live source: DeanDashboardData.trend ← per-period deptPeriodAverages (last 4, chronological). */
export function TrendLine({ trend, placeholder = false }: { trend: DeanDashboardData["trend"]; placeholder?: boolean }) {
  const W = 300, H = 84, LPAD = 18, PAD = 8
  const yFor = (v: number) => H - PAD - ((v - 1) / 4) * (H - PAD * 2)
  const pts = trend.map((t, i) => ({
    x: trend.length === 1 ? LPAD + (W - LPAD - PAD) / 2 : LPAD + (i * (W - LPAD - PAD)) / (trend.length - 1),
    y: t.general === null ? H - PAD : yFor(t.general),
    t,
  }))
  const shortTitle = (title: string) => title.split("—").map((s) => s.trim()).filter(Boolean).pop() ?? title
  return (
    <div className={card}>
      <p className="text-xs font-bold text-primary mb-2">Trend{placeholder && <PlaceholderBadge />}</p>
      {trend.length === 0 ? <p className="text-xs text-tertiary">No history yet.</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" role="img" aria-label="Department average trend">
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={LPAD} x2={W - PAD} y1={yFor(v)} y2={yFor(v)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
              <text x={LPAD - 3} y={yFor(v) + 3} fontSize="8" textAnchor="end" className="fill-slate-400">{v}</text>
            </g>
          ))}
          <polyline fill="none" strokeWidth="2" className="stroke-emerald-500" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" className={p.t.rubricChanged ? "fill-amber-500" : "fill-emerald-500"} />
              {p.t.rubricChanged && <text x={p.x + 5} y={p.y - 5} fontSize="9" className="fill-amber-600">⚠ rubric</text>}
              <text x={p.x} y={H - 1} fontSize="8" textAnchor="middle" className="fill-slate-400">{shortTitle(p.t.title || p.t.semesterId)}</text>
            </g>
          ))}
        </svg>
      )}
      <div className="flex gap-3 mt-1 flex-wrap">
        {trend.map((t) => <span key={t.semesterId} className="text-[10px] text-tertiary">{t.title || t.semesterId}: {t.general?.toFixed(2) ?? "—"}</span>)}
      </div>
    </div>
  )
}

/** Live source: DeanDashboardData.remarkMix ← faculty-grain remarkOf counts (n≥5 only). */

export function RemarkStack({ mix, placeholder = false }: { mix: DeanDashboardData["remarkMix"]; placeholder?: boolean }) {
  const total = mix.reduce((s, m) => s + m.count, 0)
  return (
    <div className={card}>
      <p className="text-xs font-bold text-primary mb-2">Remarks{placeholder && <PlaceholderBadge />}</p>
      <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {mix.filter((m) => m.count > 0).map((m) => (
          <div key={m.remark} title={`${m.remark}: ${m.count}`} className={REMARK_DOT[m.remark] ?? "bg-slate-400"} style={{ width: `${total > 0 ? (m.count / total) * 100 : 0}%` }} />
        ))}
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {mix.map((m) => <span key={m.remark} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${remarkPill(m.remark)}`}>{m.remark}: {m.count}</span>)}
      </div>
    </div>
  )
}

/** Live source: DeanDashboardData.categories ← cur.cats + previous-period delta (deptPeriodAverages). */
export function CategoryBars({ categories, placeholder = false }: { categories: DeanDashboardData["categories"]; placeholder?: boolean }) {
  const sorted = [...categories].sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  const weakest = sorted.length > 0 ? sorted[sorted.length - 1].key : null
  return (
    <div className={card}>
      <p className="text-xs font-bold text-primary mb-2">Categories{placeholder && <PlaceholderBadge />}</p>
      {sorted.map((c) => (
        <div key={c.key} className="flex items-center gap-3 py-1">
          <span className={`text-xs w-40 truncate ${c.key === weakest ? "text-red-600 font-semibold" : "text-primary"}`}>{CATEGORY_LABELS[c.key as keyof typeof CATEGORY_LABELS] ?? c.key}</span>
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-emerald-500" style={{ width: `${c.value !== null ? (c.value / 5) * 100 : 0}%` }} />
          </div>
          <span className="text-xs w-10 text-right text-primary">{c.value?.toFixed(2) ?? "—"}</span>
          <span className={`text-xs w-12 text-right ${c.delta !== null && c.delta < 0 ? "text-red-600" : "text-emerald-600"}`}>{c.delta === null ? "" : c.delta > 0 ? `▲${c.delta}` : `▼${c.delta}`}</span>
        </div>
      ))}
    </div>
  )
}

/** Live source: kpis.responsePct/actual ← submitted vs enrolled; lowResponse ← sub-floor faculty + per-faculty expected. */
export function ResponseStrip({ dashboard, placeholder = false }: { dashboard: DeanDashboardData; placeholder?: boolean }) {
  const pct = dashboard.kpis.responsePct
  const shown = pct ?? 0
  const arc = "M10,60 A50,50 0 0 1 110,60"
  const tickAngle = (Math.PI * (180 - 60 * 1.8)) / 180
  const tickX = 60 + 50 * Math.cos(tickAngle)
  const tickY = 60 - 50 * Math.sin(tickAngle)
  return (
    <div className={card}>
      <p className="text-xs font-bold text-primary mb-2">Response health{placeholder && <PlaceholderBadge />}</p>
      <svg viewBox="0 0 120 78" className="w-full h-24" role="img" aria-label={`Response rate ${pct !== null ? `${pct} percent` : "unavailable"}`}>
        <path d={arc} fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="10" strokeLinecap="round" />
        <path d={arc} fill="none" pathLength={100} strokeDasharray={`${shown} 100`} className="stroke-emerald-500" strokeWidth="10" strokeLinecap="round" />
        <line x1={tickX} y1={tickY} x2={tickX} y2={tickY + 8} className="stroke-amber-500" strokeWidth="2" />
        <text x={tickX} y={tickY + 16} fontSize="7" textAnchor="middle" className="fill-amber-600">60%</text>
        <text x="60" y="62" fontSize="16" fontWeight="bold" textAnchor="middle" className="fill-slate-800 dark:fill-slate-100">{pct !== null ? `${pct}%` : "—"}</text>
      </svg>
      {dashboard.lowResponse.length === 0
        ? <p className="text-xs text-tertiary mt-1">All faculty above the response floor.</p>
        : dashboard.lowResponse.map((r) => (
          <p key={r.facultyId} className="text-xs text-tertiary mt-1">⚠ {r.facultyName}: {r.actual}{r.expected !== null ? `/${r.expected}` : ""} responses</p>
        ))}
    </div>
  )
}

/** Live source: bottom5/top5 ← faculty grain (n≥5), ranked by generalRating. */
export function AttentionCards({ title, items, tone, linkFor, placeholder = false }: {
  title: string
  items: { facultyId: string; facultyName: string; generalRating: number | null }[]
  tone: "risk" | "praise"
  linkFor: (facultyName: string) => string
  placeholder?: boolean
}) {
  return (
    <div className={card}>
      <p className="text-xs font-bold text-primary mb-2">{title}{placeholder && <PlaceholderBadge />}</p>
      {items.length === 0 && <p className="text-xs text-tertiary">None this period.</p>}
      <div className="space-y-2">
        {items.map((f) => (
          <Link key={f.facultyId} href={linkFor(f.facultyName)} className={`block rounded-lg border p-2.5 hover:shadow-sm transition-all ${tone === "risk" ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"}`}>
            <p className="text-sm font-semibold text-primary">{f.facultyName}</p>
            <p className="text-xs text-tertiary">{f.generalRating?.toFixed(2) ?? "—"}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Live source: AdminDashboardData.departments ← deptPeriodAverages per department. */
export function DeptBars({ departments, linkFor, placeholder = false }: { departments: AdminDeptBar[]; linkFor: (departmentId: string) => string; placeholder?: boolean }) {
  return (
    <div className={card}>
      <p className="text-xs font-bold text-primary mb-2">Departments{placeholder && <PlaceholderBadge />}</p>
      {departments.map((d) => (
        <Link key={d.departmentId} href={linkFor(d.departmentId)} className="flex items-center gap-3 py-1.5 group">
          <span className="text-xs w-32 truncate text-primary group-hover:underline">{d.departmentName}</span>
          <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-emerald-500" style={{ width: `${d.general !== null ? (d.general / 5) * 100 : 0}%` }} />
          </div>
          <span className="text-xs w-10 text-right text-primary">{d.general?.toFixed(2) ?? "—"}</span>
        </Link>
      ))}
    </div>
  )
}

export function DashboardEmpty() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
      <p className="text-sm text-tertiary">No data for this semester / period.</p>
    </div>
  )
}

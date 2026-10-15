import type { RubricKey } from "./evaluation-utils"
import { CATEGORY_LABELS, getRemark } from "./evaluation-utils"
import type { jsPDF } from "jspdf"

const CATEGORY_DISPLAY: Record<string, string> = {
  professionalManner: "Professional Manner",
  communicationWithStudent: "Communication with Students",
  studentEngagement: "Student Engagement",
  learningMaterials: "Learning Materials",
  timeManagement: "Time Management",
  experientialLearning: "Experiential Learning Provided to Students",
  respectUniqueness: "Respect the Uniqueness of the Students",
  assessmentAndFeedback: "Assessment and Feedback",
}

interface SubjectSummaryRow {
  facultyName: string
  facultyEmail: string
  subjectCode: string
  subjectName: string
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

interface EvalRow {
  evaluationId: string
  submittedAt: string | null
  generalRating: number | null
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  comment: string | null
  sentimentLabel: string | null
  sentimentScore: number | null
}

interface PdfData {
  facultyName: string
  facultyEmail?: string
  subjectCode: string
  subjectName: string
  departmentName?: string
  departmentCode?: string
  semesterLabel?: string
  summary: {
    totalRespondents: number
    avgRating: number | null
    remarks: string | null
    sentimentScore: number | null
  } & Record<string, number | null>
  evaluations: EvalRow[]
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

async function addPdfHeader(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth()
  const logoX = 14
  const logoY = 10
  const logoWidth = 32
  let logoHeight = 18
  let logoBase64: string | null = null

  try {
    const logoResp = await fetch("/logo-blk.png")
    const logoBlob = await logoResp.blob()
    logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(logoBlob)
    })
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = logoBase64 as string
    })
    logoHeight = logoWidth * (img.naturalHeight / img.naturalWidth)
  } catch {
    logoBase64 = null
  }

  // Row 1: logo (left) + school name (same row, middle-aligned)
  const hasLogo = logoBase64 !== null
  const rowH = hasLogo ? logoHeight : 12
  if (hasLogo) {
    doc.addImage(logoBase64 as string, "PNG", logoX, logoY, logoWidth, logoHeight)
  }
  const nameX = hasLogo ? logoX + logoWidth + 6 : 14
  const nameMidY = logoY + rowH / 2 + 2
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(0, 0, 0)
  doc.text("LYCEUM OF ALABANG", nameX, nameMidY)

  // Row 2: address centered under both
  const addrY = logoY + rowH + 6
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  doc.text("Main Bldg. Km. 30 National Road, Tunasan, Muntinlupa City", pageW / 2, addrY, { align: "center" })

  // Rule
  const lineY = addrY + 4
  doc.setDrawColor(180, 180, 180)
  doc.line(14, lineY, pageW - 14, lineY)
  const y = lineY + 6

  return { doc, y, pageW }
}

export async function downloadEvalDetailPdf(data: PdfData) {
  const [jsPDF, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])
  const { default: JsPDF } = jsPDF
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  let y = (await addPdfHeader(doc)).y
  const pageW = doc.internal.pageSize.getWidth()

  // ── Title ──
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.setFont("helvetica", "bold")
  doc.text("INDIVIDUAL FACULTY EVALUATION REPORT", pageW / 2, y, { align: "center" })
  y += 8

  // ── Info ──
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  const deptLine = data.departmentName
    ? `${data.departmentName}${data.departmentCode ? ` (${data.departmentCode})` : ""}`
    : null
  const semLabel = data.semesterLabel ?? "Semester"
  const infoLines = [
    `Faculty: ${data.facultyName}`,
    data.facultyEmail ? `Email: ${data.facultyEmail}` : null,
    `Subject: ${data.subjectCode} \u2013 ${data.subjectName}`,
    deptLine ? `Department: ${deptLine}` : null,
    `Semester: ${semLabel}`,
    `Date Generated: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`,
  ].filter(Boolean) as string[]
  for (const line of infoLines) {
    doc.text(line, 14, y)
    y += 4.5
  }
  y += 3

  // ── Rating Table ──
  const body: [string, string, string][] = []
  body.push(["", "Overall Rating", `${data.summary.avgRating?.toFixed(2) ?? "\u2014"} / 5.00`])
  for (const key of Object.keys(CATEGORY_LABELS) as RubricKey[]) {
    const label = CATEGORY_DISPLAY[key] ?? CATEGORY_LABELS[key]
    const val = data.summary[key]
    body.push([label, "", val !== null ? val.toFixed(2) : "\u2014"])
  }

  autoTable.default(doc, {
    theme: "grid",
    head: [["Category", "", "Rating"]],
    body,
    startY: y,
    styles: { fontSize: 9, cellPadding: 2.5, halign: "center" },
    headStyles: { fillColor: [59, 130, 246], fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 80 }, 1: { cellWidth: 40 } },
    margin: { left: 20, right: 20 },
  })
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  // ── Overall Rating ──
  const remark = data.summary.remarks ?? getRemark(data.summary.avgRating) ?? "\u2014"
  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text("Overall Rating", pageW / 2, y, { align: "center" })
  y += 6
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text(
    `${data.summary.avgRating?.toFixed(2) ?? "\u2014"} / 5.00 \u2013 ${remark}`,
    pageW / 2,
    y,
    { align: "center" },
  )
  y += 8

  // ── Student Comments ──
  const comments = data.evaluations.filter((e) => e.comment).map((e) => e.comment as string)
  if (comments.length > 0) {
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Student Comments", 14, y)
    y += 6

    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    const maxComments = 30
    const showComments = comments.slice(0, maxComments)
    for (const c of showComments) {
      const lines = doc.splitTextToSize(`\u2022 ${c}`, pageW - 28)
      if (y + lines.length * 4 > 270) {
        doc.addPage()
        y = 14
      }
      for (const l of lines) {
        doc.text(l, 14, y)
        y += 4
      }
      y += 1
    }
    if (comments.length > maxComments) {
      doc.text(`... and ${comments.length - maxComments} more comments`, 14, y)
      y += 5
    }
  } else {
    doc.setFontSize(10)
    doc.setFont("helvetica", "italic")
    doc.text("No student comments submitted.", 14, y)
    y += 6
  }
  y += 3

  // ── Sentiment Interpretation ──
  const sentimentScore = data.summary.sentimentScore
  if (sentimentScore !== null) {
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Sentiment Analysis", 14, y)
    y += 6

    const pct = ((sentimentScore + 1) / 2 * 100).toFixed(1)
    const positiveCount = data.evaluations.filter(
      (e) => e.sentimentLabel === "positive" || (e.sentimentScore ?? 0) > 0.05,
    ).length
    const negativeCount = data.evaluations.filter(
      (e) => e.sentimentLabel === "negative" || (e.sentimentScore ?? 0) < -0.05,
    ).length
    const neutralCount = data.evaluations.length - positiveCount - negativeCount
    const total = data.evaluations.length

    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    const interpLines = doc.splitTextToSize(
      `Sentiment score: ${sentimentScore.toFixed(4)} (${pct}% positivity). ` +
      `Positive: ${positiveCount}/${total} (${total > 0 ? (positiveCount / total * 100).toFixed(1) : 0}%), ` +
      `Neutral: ${neutralCount}/${total} (${total > 0 ? (neutralCount / total * 100).toFixed(1) : 0}%), ` +
      `Negative: ${negativeCount}/${total} (${total > 0 ? (negativeCount / total * 100).toFixed(1) : 0}%).`,
      pageW - 28,
    )
    if (y + interpLines.length * 4 > 270) {
      doc.addPage()
      y = 14
    }
    for (const l of interpLines) {
      doc.text(l, 14, y)
      y += 4
    }
  }

  // ── Save ──
  const filename = `${slug(data.facultyName)}_${data.subjectCode}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}

export async function downloadDeptPdf(data: {
  departmentName: string
  departmentCode: string
  semesterLabel?: string
  subjects: SubjectSummaryRow[]
  mode: "per_subject" | "per_faculty"
}) {
  const [jsPDF, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])
  const { default: JsPDF } = jsPDF
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  let y = (await addPdfHeader(doc)).y
  const pageW = doc.internal.pageSize.getWidth()

  // ── Title ──
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.setFont("helvetica", "bold")
  doc.text("DEPARTMENT EVALUATION REPORT", pageW / 2, y, { align: "center" })
  y += 8

  // ── Info ──
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  const semLabel = data.semesterLabel ?? "Semester"
  const infoLines = [
    `Department: ${data.departmentName} (${data.departmentCode})`,
    `Semester: ${semLabel}`,
    `Date Generated: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`,
  ]
  for (const line of infoLines) {
    doc.text(line, 14, y)
    y += 4.5
  }
  y += 4

  if (data.mode === "per_subject") {
    // ── Per Subject Table ──
    const fBody = data.subjects.map((s, i) => [
      String(i + 1),
      s.facultyName,
      s.subjectCode,
      s.avgRating?.toFixed(2) ?? "\u2014",
      s.remarks ?? "\u2014",
      String(s.totalRespondents),
      s.sentimentScore !== null ? s.sentimentScore.toFixed(4) : "\u2014",
    ])

    autoTable.default(doc, {
      theme: "grid",
      head: [["#", "Faculty", "Subject", "Rating", "Remark", "Resp.", "Sentiment"]],
      body: fBody,
      startY: y,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [59, 130, 246], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    })
  } else {
    // ── Per Faculty (Consolidated) ──
    const facMap = new Map<string, { name: string; email: string; subjects: SubjectSummaryRow[] }>()
    for (const s of data.subjects) {
      if (!facMap.has(s.facultyName)) {
        facMap.set(s.facultyName, { name: s.facultyName, email: s.facultyEmail, subjects: [] })
      }
      facMap.get(s.facultyName)!.subjects.push(s)
    }
    const facGroups = Array.from(facMap.values())

    const fBody = facGroups.map((g, i) => {
      const ratings = g.subjects.filter((s) => s.avgRating !== null).map((s) => s.avgRating as number)
      const avg = ratings.length > 0 ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 100) / 100 : null
      const totalResp = g.subjects.reduce((sum, s) => sum + s.totalRespondents, 0)
      const allSentiments = g.subjects.filter((s) => s.sentimentScore !== null).map((s) => s.sentimentScore as number)
      const avgSentiment = allSentiments.length > 0
        ? Math.round(allSentiments.reduce((a, b) => a + b, 0) / allSentiments.length * 100) / 100
        : null
      return [
        String(i + 1),
        g.name,
        String(g.subjects.length),
        avg?.toFixed(2) ?? "\u2014",
        getRemark(avg) ?? "\u2014",
        String(totalResp),
        avgSentiment !== null ? avgSentiment.toFixed(4) : "\u2014",
      ]
    })

    autoTable.default(doc, {
      theme: "grid",
      head: [["#", "Faculty", "Subjects", "Avg Rating", "Remark", "Total Resp.", "Sentiment"]],
      body: fBody,
      startY: y,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [59, 130, 246], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    })
  }

  const filename = `${slug(data.departmentName)}_dept_report_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}

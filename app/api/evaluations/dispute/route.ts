import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { evaluationRepository, evaluationPeriodRepository, studentEnrollmentRepository, auditLogRepository, userRepository } from "@/lib/repositories/factory"
import { getActiveEvaluationPeriod } from "@/features/admin-data/evaluation-periods.service"
import nodemailer from "nodemailer"

const emailEnabled = () => process.env.EMAIL_FEATURE_FLAG === "true"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as Record<string, unknown>).role as string
  const userId = (session.user as Record<string, unknown>).id as string
  const userEmail = (session.user as Record<string, unknown>).email as string
  const userName = (session.user as Record<string, unknown>).name as string

  if (!hasRole(role, "STUDENT")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { facultySubjectId, evaluateeId, evaluateeName, subjectName } = await request.json()

    if (!facultySubjectId || !evaluateeId) {
      return NextResponse.json({ error: "facultySubjectId and evaluateeId are required" }, { status: 400 })
    }

    const activePeriod = await getActiveEvaluationPeriod()
    if (!activePeriod) {
      return NextResponse.json({ error: "No active evaluation period" }, { status: 400 })
    }

    const evalPeriod = await evaluationPeriodRepository.findById(activePeriod.id)

    if (!evalPeriod) {
      return NextResponse.json({ error: "Invalid evaluation period" }, { status: 400 })
    }

    const enrollment = await studentEnrollmentRepository.findExisting(userId, facultySubjectId, evalPeriod.semesterId)

    if (!enrollment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const existing = await evaluationRepository.findByComposite(activePeriod.id, userId, facultySubjectId)
    const remarks = `Reported as wrong section/subject : ${subjectName || "Unknown"} for Faculty: ${evaluateeName || evaluateeId}`
    if (existing) {
      await evaluationRepository.invalidateById(existing.id, remarks)
    } else {
      await evaluationRepository.create(activePeriod.id, userId, evaluateeId, facultySubjectId, "dispute")
      await evaluationRepository.invalidateByEvaluatorAndPeriod(userId, facultySubjectId, activePeriod.id, remarks)
    }

    await auditLogRepository.create({
      userId,
      email: userEmail,
      action: "EVALUATION_DISPUTE",
      details: JSON.stringify({
        facultySubjectId,
        currentFacultyId: evaluateeId,
        currentFacultyName: evaluateeName,
        subjectName,
        studentName: userName,
        studentEmail: userEmail,
      }),
    })

    if (emailEnabled()) {
      const admins = await userRepository.listByRole("ADMIN")

      if (admins.length > 0) {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        })

        const subject = `[ACES] Evaluation Dispute: ${userName} reported wrong faculty for ${subjectName || "a subject"}`
        const html = `
          <h2>Evaluation Dispute</h2>
          <p><strong>Student:</strong> ${userName} (${userEmail})</p>
          <p><strong>Subject:</strong> ${subjectName || "Unknown"}</p>
          <p><strong>Reported Faculty:</strong> ${evaluateeName || evaluateeId}</p>
          <p><strong>Faculty Subject ID:</strong> ${facultySubjectId}</p>
          <p>The student reported that they are evaluating the wrong faculty for this subject. Please review and update the faculty-subject assignment if needed.</p>
          <hr>
          <p style="color:#666;font-size:12px;">This is an automated notification from ACES.</p>
        `

        for (const admin of admins) {
          try {
            await transporter.sendMail({ to: admin.email, subject, html })
          } catch {
            // Silently fail per-email errors
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to submit dispute" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { userRepository, passwordResetTokenRepository } from "@/lib/repositories/factory"
import { randomBytes } from "crypto"
import { sendActivationWorkflow, sendForgotPasswordWorkflow } from "@/lib/workflows/email-workflows"
import { logAuditEvent, logServerError } from "@/lib/services/audit"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await userRepository.findByEmail(email.toLowerCase())

    if (!user) {
      return NextResponse.json({ error: "No account found with this email", code: "NOT_FOUND" }, { status: 404 })
    }

    if (!user.hasLoggedInBefore) {
      // Send activation link instead
      const token = randomBytes(32).toString("hex")
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      await passwordResetTokenRepository.create(user.email, token, expiresAt)
      const activationUrl = `${process.env.NEXTAUTH_URL}/activate?token=${token}`
      sendActivationWorkflow(user.email, user.name, activationUrl).catch((err) =>
        console.error("Failed to send activation email:", err)
      )
      await logAuditEvent({ userId: user.id, email: user.email, action: "PASSWORD_RESET", details: "Inactive user requested reset — activation email sent" })
      return NextResponse.json({ success: true, code: "ACTIVATION_SENT" })
    }

    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await passwordResetTokenRepository.create(user.email, token, expiresAt)

    const resetUrl = `${process.env.NEXTAUTH_URL}/change-password?token=${token}`

    sendForgotPasswordWorkflow(user.email, user.name, resetUrl).catch((err) =>
      console.error("Failed to send forgot-password email:", err)
    )
    await logAuditEvent({ userId: user.id, email: user.email, action: "PASSWORD_RESET", details: "Password reset email sent" })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Forgot password error:", error)
    await logServerError({
      route: "/api/auth/forgot-password",
      method: req.method,
      params: Object.fromEntries(new URL(req.url).searchParams),
      error,
    })
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message, code: "SERVER_ERROR" }, { status: 500 })
  }
}

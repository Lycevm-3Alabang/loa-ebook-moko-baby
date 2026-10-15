import { NextRequest, NextResponse } from "next/server"
import { userRepository, passwordResetTokenRepository } from "@/lib/repositories/factory"
import { randomBytes } from "crypto"
import { sendActivationWorkflow } from "@/lib/workflows/email-workflows"
import { logAuditEvent, logServerError } from "@/lib/services/audit"

export async function POST(req: NextRequest) {
  try {
    const { email, callbackUrl } = await req.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await userRepository.findByEmail(email.toLowerCase())

    if (!user) {
      return NextResponse.json({ error: "No account found with this email", code: "NOT_FOUND" }, { status: 404 })
    }

    if (user.hasLoggedInBefore) {
      return NextResponse.json({ error: "Account already activated", code: "ALREADY_ACTIVATED" }, { status: 400 })
    }

    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await passwordResetTokenRepository.create(user.email, token, expiresAt)

    const cb = callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""
    const activationUrl = `${process.env.NEXTAUTH_URL}/activate?token=${token}${cb}`

    sendActivationWorkflow(user.email, user.name, activationUrl).catch((err) =>
      console.error("Failed to send activation email:", err)
    )
    await logAuditEvent({ userId: user.id, email: user.email, action: "ACTIVATE_USER", details: "Activation email sent" })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Activate error:", error)
    await logServerError({
      route: "/api/auth/activate",
      method: req.method,
      params: Object.fromEntries(new URL(req.url).searchParams),
      error,
    })
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message, code: "SERVER_ERROR" }, { status: 500 })
  }
}

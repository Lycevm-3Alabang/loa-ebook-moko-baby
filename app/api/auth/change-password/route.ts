import { NextRequest, NextResponse } from "next/server"
import { userRepository, passwordResetTokenRepository } from "@/lib/repositories/factory"
import { hash } from "bcryptjs"
import { sendPasswordChangedWorkflow } from "@/lib/workflows/email-workflows"
import { logServerError } from "@/lib/services/audit"

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const resetToken = await passwordResetTokenRepository.findByToken(token)

    if (!resetToken) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    if (resetToken.usedAt) {
      return NextResponse.json({ error: "Token has already been used" }, { status: 400 })
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "Token has expired" }, { status: 400 })
    }

    const passwordHash = await hash(password, 12)

    const user = await userRepository.findByEmail(resetToken.email)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    await userRepository.update(user.id, { passwordHash, hasLoggedInBefore: true })
    await passwordResetTokenRepository.markUsed(resetToken.id)

    // Send notification email (fire-and-forget — don't block response)
    sendPasswordChangedWorkflow(user.email, user.name).catch((err) =>
      console.error("Failed to send password changed email:", err)
    )

    return NextResponse.json({ success: true, email: resetToken.email, name: user.name })
  } catch (error) {
    console.error("Change password error:", error)
    await logServerError({
      route: "/api/auth/change-password",
      method: req.method,
      params: Object.fromEntries(new URL(req.url).searchParams),
      error,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

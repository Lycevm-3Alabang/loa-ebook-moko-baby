import { NextResponse } from "next/server"
import { userRepository } from "@/lib/repositories/factory"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { logServerError } from "@/lib/services/audit"

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as Record<string, unknown>).id as string
    if (!userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }

    await userRepository.update(userId, { onboardingVersion: 1 } as Record<string, unknown>)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Onboarding error:", error)
    await logServerError({ route: "/api/auth/onboarding", method: "POST", error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

import { NextAuthOptions, getServerSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { supabase } from "@/lib/db"
import { userRepository } from "@/lib/repositories/factory"
import { compare } from "bcryptjs"
import { hasRole } from "@/lib/utils/roles"

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await userRepository.findByEmail(credentials.email as string)

        if (!user || !user.passwordHash) return null
        if (user.isDisabled || user.deletedAt) return null
        if (hasRole(user.role, "GUEST")) return null

        const isValid = await compare(credentials.password as string, user.passwordHash)
        if (!isValid) return null

        await userRepository.update(user.id, { hasLoggedInBefore: true, lastLoginAt: new Date() })

        // Fire-and-forget audit log
        import("@/lib/services/audit").then(({ logAuditEvent }) =>
          logAuditEvent({ userId: user.id, email: user.email, action: "LOGIN", details: "Successful login" })
        ).catch(() => {})

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tokenVersion: user.tokenVersion,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Sign-in: store user details + current tokenVersion
        token.id = user.id
        ;(token as unknown as Record<string, unknown>).role = (user as unknown as Record<string, unknown>).role || "STUDENT"
        ;(token as unknown as Record<string, unknown>).tokenVersion = (user as unknown as Record<string, unknown>).tokenVersion ?? 0
      }
      return token
    },
    async session({ session, token }) {
      if (!session?.user) return session
      const su = session.user as unknown as Record<string, unknown>
      su.role = (token as unknown as Record<string, unknown>).role
      su.id = (token as unknown as Record<string, unknown>).id
      su.tokenVersion = (token as unknown as Record<string, unknown>).tokenVersion
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },
}

export async function auth() {
  const session = await getServerSession(authOptions)

  // Validate the session is still active — handles users disabled mid-session
  // and database resets (tokenVersion mismatch). Replaces the unreliable DB
  // lookup inside the jwt callback (which caused redirect loops).
  //
  // IMPORTANT: on DB error we return the session as-is, not null. Returning
  // null on a transient Supabase hiccup causes a redirect-to-login loop
  // because the login page's useSession() still sees a valid JWT cookie and
  // redirects right back.
  const userId = (session?.user as unknown as Record<string, unknown>)?.id as string | undefined
  if (!userId) return session

  try {
    const { data: dbUser, error } = await supabase
      .from("users")
      .select("id, \"isDisabled\", \"tokenVersion\", \"deletedAt\", userrole(roleName)")
      .eq("id", userId)
      .single()

    if (error || !dbUser) {
      if (error?.code === "PGRST116") {
        console.warn(`[auth] Session user ${userId} not found in DB — returning null`)
        return null
      }
      throw error
    }

    const roleRaw = (dbUser as unknown as Record<string, unknown>).userrole
    const role = Array.isArray(roleRaw)
      ? (roleRaw as Array<{ roleName: string }>).map((r) => r.roleName).join("|")
      : "GUEST"

    if (dbUser.isDisabled) {
      console.warn(`[auth] Session user ${userId} is disabled — returning null`)
      return null
    }

    if ((dbUser as unknown as Record<string, unknown>).deletedAt) {
      console.warn(`[auth] Session user ${userId} is deleted — returning null`)
      return null
    }

    if (hasRole(role, "GUEST")) {
      console.warn(`[auth] Session user ${userId} is GUEST — returning null`)
      return null
    }

    const jwtVersion = ((session?.user as unknown as Record<string, unknown>)?.tokenVersion as number) ?? 0
    if (dbUser.tokenVersion !== jwtVersion) {
      console.warn(`[auth] Session user ${userId} tokenVersion mismatch (JWT: ${jwtVersion}, DB: ${dbUser.tokenVersion}) — returning null`)
      return null
    }

    if (session?.user) {
      const su = session.user as unknown as Record<string, unknown>
      if (su.role !== role) {
        su.role = role
      }
    }
  } catch (err) {
    // DB transient error — leave session intact to avoid redirect loop
    const msg = (err as { message?: string })?.message || String(err)
    console.error(`[auth] DB error during session validation for ${userId}: ${msg}`)
    if (msg.includes('relation "userrole" does not exist')) {
      console.warn("[auth] Run the 'userrole' migration: ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT; CREATE TABLE IF NOT EXISTS userrole (...)")
    }
  }

  return session
}

/**
 * Lightweight session check for client components that use useSession().
 * Returns true if the server-side session is still valid (user active,
 * tokenVersion matches). Call this periodically or after sensitive actions.
 */
export async function checkSession(): Promise<boolean> {
  const session = await auth()
  return session !== null
}

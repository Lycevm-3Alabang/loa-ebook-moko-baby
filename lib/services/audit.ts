import { auditLogRepository } from "@/lib/repositories/factory"

export async function logAuditEvent(params: {
  userId?: string | null
  email?: string | null
  action: string
  details?: string | null
}) {
  await auditLogRepository.create(params).catch(() => {})
}

const MAX_ERROR_DETAILS_LENGTH = 8000
const MAX_BODY_LENGTH = 2000

const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "resettoken",
  "accesstoken",
  "refreshtoken",
  "secret",
  "authorization",
  "cookie",
  "credentials",
  "passcode",
  "otp",
])

function redactBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactBody)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_BODY_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redactBody(v),
      ]),
    )
  }
  return value
}

function toSafeBody(body: unknown): string {
  if (body === undefined) return ""
  try {
    const text = JSON.stringify(redactBody(body)) ?? "[unserializable]"
    return text.slice(0, MAX_BODY_LENGTH)
  } catch {
    return "[unserializable]"
  }
}

function toSafeParams(params: Record<string, string> | undefined): string {
  if (!params) return ""
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
}

function describeError(error: unknown): string[] {
  const lines: string[] = []
  if (error instanceof Error) {
    lines.push(`${error.name}: ${error.message}`)
    for (const k of ["code", "hint", "details"] as const) {
      const v = (error as unknown as Record<string, unknown>)[k]
      if (typeof v === "string" && v) lines.push(`${k}: ${v}`)
    }
    if (error.stack) lines.push(error.stack)
  } else if (typeof error === "object" && error !== null) {
    // PostgrestError and other shaped failures (not Error instances)
    for (const k of ["message", "code", "hint", "details"] as const) {
      const v = (error as unknown as Record<string, unknown>)[k]
      if (typeof v === "string" && v) lines.push(`${k}: ${v}`)
    }
    if (lines.length === 0) lines.push("UnknownError: non-serializable failure")
  } else {
    lines.push(`UnknownError: ${String(error)}`)
  }
  return lines
}

export interface LogServerErrorInput {
  route: string
  method?: string
  params?: Record<string, string>
  userId?: string | null
  email?: string | null
  role?: string | null
  requestBody?: unknown
  error: unknown
}

export async function logServerError(input: LogServerErrorInput) {
  const head = [`route: ${input.route}`, `method: ${input.method ?? "GET"}`]
  const paramLine = toSafeParams(input.params)
  if (paramLine) head.push(`params: ${paramLine}`)
  if (input.role) head.push(`role: ${input.role}`)
  const bodyLine = toSafeBody(input.requestBody)
  if (bodyLine) head.push(`body: ${bodyLine}`)
  const details = [...head, ...describeError(input.error)]
    .join("\n")
    .slice(0, MAX_ERROR_DETAILS_LENGTH)
  await logAuditEvent({ userId: input.userId, email: input.email, action: "SERVER_ERROR", details })
}

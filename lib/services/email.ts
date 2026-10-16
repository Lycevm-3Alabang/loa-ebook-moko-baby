import nodemailer from "nodemailer"
import type Mail from "nodemailer/lib/mailer"
import { consultationInviteHtml } from "@/lib/email-templates/consultation-invite"
import { meetingInviteHtml } from "@/lib/email-templates/meeting-invite"
import { consultationApprovedHtml } from "@/lib/email-templates/consultation-approved"
import { bookingAcknowledgementHtml } from "@/lib/email-templates/booking-acknowledgement"
import { statusNotificationHtml } from "@/lib/email-templates/status-notification"

type EmailProvider = "gmail" | "rest"

function getEmailProvider(): EmailProvider {
  const v = process.env.EMAIL_PROVIDER
  // Unset defaults to rest (relay). "domain" was decommissioned: direct
  // SMTP-auth from cloud IPs is silently quarantined server-side.
  if (!v) return "rest"
  if (v === "gmail" || v === "rest") return v
  throw new Error(`EMAIL_PROVIDER "${v}" is not supported (domain mode decommissioned). Use "rest" or "gmail".`)
}

function getTransporter() {
  // Domain SMTP was decommissioned (silent server-side quarantine from cloud
  // IPs). Gmail is the only SMTP transporter: primary in gmail mode,
  // fallback in rest mode.
  if (!process.env.GMAIL_USER) throw new Error("GMAIL_USER env var not set")
  return nodemailer.createTransport({
    name: getHeloName(),
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
}

// Explicit HELO hostname: serverless hosts announce link-local junk
// ([169.254.x.x]) by default, which trips sender-domain/HELO checks.
// Configurable via EMAIL_HELO_NAME, else derived from NEXTAUTH_URL;
// undefined preserves Nodemailer's default (os.hostname()).
function getHeloName(): string | undefined {
  if (process.env.EMAIL_HELO_NAME) return process.env.EMAIL_HELO_NAME
  try {
    if (process.env.NEXTAUTH_URL) {
      const helo = new URL(process.env.NEXTAUTH_URL).hostname
      console.log(`[email] HELO hostname from NEXTAUTH_URL: ${helo}`)
      return helo
    }
  } catch { /* fall through to default */ }
  console.log("[email] HELO hostname: NEXTAUTH_URL not set, using Nodemailer default")
  return undefined
}

// REST relay (LOA Auth Platform on cPanel): Vercel cannot reliably SMTP-auth
// from cloud IPs, so the relay submits locally on the host. Contract:
// POST {to, subject, html} → 200 {ok, message_id}; 401/422/429/502 otherwise.
// Secret comes from env only (RELAY_SECRET) — never hardcoded.
const RELAY_TIMEOUT_MS = 15_000
const RELAY_RETRY_CAP_MS = 15_000

function getRelayConfig() {
  const url = process.env.AUTH_RELAY_URL ?? "https://auth.lyceumalabang.edu.ph/api/v1/mail/send"
  const secret = process.env.RELAY_SECRET
  if (!secret) throw new Error("RELAY_SECRET env var not set")
  return { url, secret }
}

// Receipt threaded up to the workflow audit log: which path delivered
// the mail and the server/relay queue id (joinable to mail-server logs).
export interface EmailReceipt {
  provider: string
  messageId?: string
  // Present when the primary path failed and Gmail fallback delivered:
  // success-with-warning, so SUCCESS never hides what went wrong.
  fallbackFrom?: string
}

async function sendViaRest(mail: Mail.Options): Promise<string | undefined> {
  const { url, secret } = getRelayConfig()
  const to = Array.isArray(mail.to) ? mail.to.join(", ") : String(mail.to ?? "")
  const attachments = (mail as unknown as { attachments?: unknown[] }).attachments
  if (attachments && attachments.length > 0) {
    console.warn(`[email] rest mode: dropping ${attachments.length} attachment(s) for ${to} (relay v1 has no attachments)`)
  }
  const body = JSON.stringify({ to, subject: mail.subject, html: mail.html })
  const attempt = async (): Promise<string | undefined> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body,
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    })
    if (res.status === 429) {
      let retryAfterMs = 0
      try {
        const data = (await res.json()) as { retry_after?: number }
        if (typeof data.retry_after === "number") retryAfterMs = data.retry_after * 1000
      } catch { /* ignore parse errors */ }
      const err = new Error(
        `Relay rate-limited${retryAfterMs > 0 ? `, retry after ${Math.round(retryAfterMs / 1000)}s` : ""}`,
      ) as Error & { retryAfterMs?: number }
      err.retryAfterMs = retryAfterMs
      throw err
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Relay send failed (${res.status}): ${text.slice(0, 200)}`)
    }
    try {
      const data = (await res.json()) as { message_id?: string }
      return typeof data.message_id === "string" ? data.message_id : undefined
    } catch {
      return undefined
    }
  }
  try {
    return await attempt()
  } catch (e) {
    // Honor 429 once (capped for serverless), then let the durable
    // workflow retry later. Other failures throw immediately.
    const waitMs = (e as { retryAfterMs?: number }).retryAfterMs ?? 0
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(waitMs, RELAY_RETRY_CAP_MS)))
      return await attempt()
    } else {
      throw e
    }
  }
}

async function sendViaPrimary(mail: Mail.Options): Promise<EmailReceipt> {
  if (getEmailProvider() === "rest") {
    const messageId = await sendViaRest(mail)
    return { provider: "rest", messageId }
  }
  const info = await getTransporter().sendMail(mail)
  return { provider: getEmailProvider(), messageId: (info as { messageId?: string })?.messageId }
}

// Primary-then-gmail-once: covers hard failures (SMTP refused/auth/timeout,
// relay 4xx/5xx). Silent server-side quarantine (250 OK then dropped) is
// invisible here — that gap needs the mail-admin allowlist, not code.
async function sendMailWithFallback(mail: Mail.Options): Promise<EmailReceipt> {
  try {
    return await sendViaPrimary(mail)
  } catch (primaryErr) {
    const reason = (primaryErr as Error)?.message ?? String(primaryErr)
    console.warn(`[email] primary (${getEmailProvider()}) failed, gmail fallback: ${reason}`)
    if (getEmailProvider() === "gmail" || !process.env.GMAIL_USER) throw primaryErr
    try {
      const info = await getTransporter().sendMail({
        ...mail,
        from: `"ACES" <${process.env.GMAIL_USER}>`,
      })
      return {
        provider: "fallback:gmail",
        messageId: (info as { messageId?: string })?.messageId,
        fallbackFrom: reason,
      }
    } catch {
      throw primaryErr
    }
  }
}

function getFrom(): string {
  // Domain mode decommissioned: the Gmail identity is the only SMTP From.
  // (rest mode ignores From entirely — the relay stamps its own.)
  return `"ACES" <${process.env.GMAIL_USER}>`
}

function isEmailEnabled() {
  return process.env.EMAIL_FEATURE_FLAG === "true"
}

export async function sendActivationEmail(email: string, name: string, activationUrl: string) {
  if (!isEmailEnabled()) {
    console.log("[DEV] Activation email (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${email}`)
    console.log(`  Name: ${name}`)
    console.log(`  URL: ${activationUrl}`)
    return
  }

  return sendMailWithFallback({
    from: getFrom(),
    to: email,
    subject: "Activate Your ACES Account",
    html: `
      <p>Hello ${name},</p>
      <p>Your account has been created. Click the link below to set your password:</p>
      <p><a href="${activationUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Activate Account</a></p>
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">This link expires in 15 minutes. If you did not request this, please ignore this email.</p>
    `,
  })
}

export async function sendMeetingInviteEmail(
  email: string,
  name: string,
  meetingTitle: string,
  organizerName: string,
  date: string,
  startTime: string,
  endTime: string,
  inviteUrl: string
) {
  if (!isEmailEnabled()) {
    console.log("[DEV] Meeting invite email (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${email}`)
    console.log(`  Name: ${name}`)
    console.log(`  Meeting: ${meetingTitle}`)
    console.log(`  URL: ${inviteUrl}`)
    return
  }

  return sendMailWithFallback({
    from: getFrom(),
    to: email,
    subject: `Meeting Invitation: ${meetingTitle}`,
    html: `
      <p>Hello ${name},</p>
      <p><strong>${organizerName}</strong> has invited you to a meeting:</p>
      <div style="margin:16px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
        <p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${meetingTitle}</p>
        <p style="margin:2px 0;color:#6b7280;">${date} &middot; ${startTime} &ndash; ${endTime}</p>
      </div>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">View Meeting</a></p>
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">This link expires in 7 days.</p>
    `,
  })
}

export async function sendConsultationInvite(
  recipient: { email: string; name: string },
  data: {
    studentName: string
    studentEmail: string
    facultyName: string
    facultyEmail: string
    date: string
    startTime: string
    endTime: string
    title?: string | null
    description?: string | null
    viewUrl: string
  },
  icalString?: string
) {
  const html = consultationInviteHtml({
    recipientName: recipient.name,
    studentName: data.studentName,
    studentEmail: data.studentEmail,
    facultyName: data.facultyName,
    facultyEmail: data.facultyEmail,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    title: data.title,
    description: data.description,
    viewUrl: data.viewUrl,
  })

  if (!isEmailEnabled()) {
    console.log("[DEV] Consultation invite email (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${recipient.email} (${recipient.name})`)
    console.log(`  .ics: ${icalString ? "attached" : "none"}`)
    return
  }

  const mail: Mail.Options = {
    from: getFrom(),
    to: recipient.email,
    subject: `${data.studentName} is requesting for Consultation`,
    html,
    ...(icalString ? {
      attachments: [{
        filename: "event.ics",
        content: icalString,
        contentType: "text/calendar; charset=utf-8",
      }]
    } : {}),
  }

  return sendMailWithFallback(mail)
}

export async function sendMeetingInviteWithICS(
  recipient: { email: string; name: string },
  data: {
    organizerName: string
    title: string
    description?: string | null
    date: string
    startTime: string
    endTime: string
    participantNames: string[]
    viewUrl: string
  },
  icalString?: string
) {
  const html = meetingInviteHtml({
    recipientName: recipient.name,
    organizerName: data.organizerName,
    title: data.title,
    description: data.description,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    participantNames: data.participantNames,
    viewUrl: data.viewUrl,
  })

  if (!isEmailEnabled()) {
    console.log("[DEV] Consultation invite email (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${recipient.email} (${recipient.name})`)
    console.log(`  .ics: ${icalString ? "attached" : "none"}`)
    return
  }

  const mail: Mail.Options = {
    from: getFrom(),
    to: recipient.email,
    subject: `Consultation Invitation — ${data.title}`,
    html,
    ...(icalString ? {
      attachments: [{
        filename: "event.ics",
        content: icalString,
        contentType: "text/calendar; charset=utf-8",
      }]
    } : {}),
  }

  return sendMailWithFallback(mail)
}

export async function sendApprovedWithTeamsLink(
  recipient: { email: string; name: string },
  data: {
    studentName: string
    studentEmail: string
    facultyName: string
    facultyEmail: string
    date: string
    startTime: string
    endTime: string
    title?: string | null
    description?: string | null
    teamsLink: string | null
    viewUrl: string
  },
  icalString?: string
) {
  const html = consultationApprovedHtml({
    recipientName: recipient.name,
    studentName: data.studentName,
    studentEmail: data.studentEmail,
    facultyName: data.facultyName,
    facultyEmail: data.facultyEmail,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    title: data.title,
    description: data.description,
    teamsLink: data.teamsLink,
    viewUrl: data.viewUrl,
  })

  if (!isEmailEnabled()) {
    console.log("[DEV] Consultation approved email (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${recipient.email} (${recipient.name})`)
    console.log(`  Teams link: ${data.teamsLink}`)
    console.log(`  .ics: ${icalString ? "attached" : "none"}`)
    return
  }

  const mail: Mail.Options = {
    from: getFrom(),
    to: recipient.email,
    subject: `Consultation Accepted — Microsoft Teams Link Inside`,
    html,
    ...(icalString ? {
      attachments: [{
        filename: "event.ics",
        content: icalString,
        contentType: "text/calendar; charset=utf-8",
      }]
    } : {}),
  }

  return sendMailWithFallback(mail)
}

export async function sendForgotPasswordEmail(email: string, name: string, resetUrl: string) {
  if (!isEmailEnabled()) {
    console.log("[DEV] Forgot password email (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${email}`)
    console.log(`  Name: ${name}`)
    console.log(`  URL: ${resetUrl}`)
    return
  }

  return sendMailWithFallback({
    from: getFrom(),
    to: email,
    subject: "Reset Your ACES Password",
    html: `
      <p>Hello ${name},</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Reset Password</a></p>
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">This link expires in 15 minutes. If you did not request this, please ignore this email.</p>
    `,
  })
}

export async function sendBookingAcknowledgement(
  to: { email: string; name: string },
  data: {
    meetingTitle: string
    attendeeNames: string[]
    date: string
    startTime: string
    endTime: string
    viewUrl: string
    variant: "request" | "booking"
  }
) {
  const html = bookingAcknowledgementHtml({
    recipientName: to.name,
    meetingTitle: data.meetingTitle,
    attendeeNames: data.attendeeNames,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    viewUrl: data.viewUrl,
    variant: data.variant,
  })

  if (!isEmailEnabled()) {
    console.log("[DEV] Booking acknowledgement email (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${to.email} (${to.name})`)
    console.log(`  Meeting: ${data.meetingTitle}`)
    console.log(`  Attendees: ${data.attendeeNames.join(", ")}`)
    console.log(`  Variant: ${data.variant}`)
    return
  }

  const subject = data.variant === "request"
    ? `Consultation Request Sent: ${data.meetingTitle}`
    : `Meeting Created: ${data.meetingTitle}`

  return sendMailWithFallback({
    from: getFrom(),
    to: to.email,
    subject,
    html,
  })
}

export async function sendStatusUpdateEmail(
  recipient: { email: string; name: string },
  data: {
    variant: "cancelled" | "completed" | "accepted"
    actorName: string
    meetingTitle: string
    date: string
    startTime: string
    endTime: string
    description?: string | null
    viewUrl: string
    extraInfo?: string | null
    attendeeNames: string[]
    isCreator: boolean
    meetingType: "CONSULTATION" | "INTERNAL"
  }
) {
  const html = statusNotificationHtml({
    recipientName: recipient.name,
    variant: data.variant,
    actorName: data.actorName,
    meetingTitle: data.meetingTitle,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    description: data.description,
    viewUrl: data.viewUrl,
    extraInfo: data.extraInfo,
    attendeeNames: data.attendeeNames,
    isCreator: data.isCreator,
    meetingType: data.meetingType,
  })

  if (!isEmailEnabled()) {
    console.log(`[DEV] Status update (${data.variant}) email (EMAIL_FEATURE_FLAG=false):`)
    console.log(`  To: ${recipient.email} (${recipient.name})`)
    console.log(`  Appointment: ${data.meetingTitle}`)
    return
  }

  const subjectMap: Record<string, string> = {
    cancelled: `Cancelled: ${data.meetingTitle}`,
    completed: `Completed: ${data.meetingTitle}`,
    accepted: `Accepted: ${data.meetingTitle}`,
  }

  return sendMailWithFallback({
    from: getFrom(),
    to: recipient.email,
    subject: subjectMap[data.variant] || `Status Update: ${data.meetingTitle}`,
    html,
  })
}

export async function sendPasswordChangedEmail(email: string, name: string) {
  if (!isEmailEnabled()) {
    console.log("[DEV] Password changed notification (EMAIL_FEATURE_FLAG=false):")
    console.log(`  To: ${email}`)
    console.log(`  Name: ${name}`)
    return
  }

  return sendMailWithFallback({
    from: getFrom(),
    to: email,
    subject: "Your ACES Password Has Been Changed",
    html: `
      <p>Hello ${name},</p>
      <p>Your ACES account password was successfully changed.</p>
      <p>If you did this, you can ignore this email.</p>
      <p style="color:#dc2626;font-size:14px;margin-top:16px;"><strong>If you did NOT authorize this change, please contact your system administrator immediately to secure your account.</strong></p>
    `,
  })
}

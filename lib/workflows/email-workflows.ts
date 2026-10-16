import { sendConsultationInvite, sendApprovedWithTeamsLink, sendPasswordChangedEmail, sendBookingAcknowledgement, sendMeetingInviteWithICS, sendStatusUpdateEmail, sendActivationEmail, sendForgotPasswordEmail } from "@/lib/services/email"
import { logAuditEvent } from "@/lib/services/audit"

export interface EmailRecipient {
  email: string
  name: string
  viewUrl: string
}

import type { EmailReceipt } from "@/lib/services/email"

function receiptDetails(name: string, receipt: EmailReceipt | undefined) {
  const via = `sent to ${name} via ${receipt?.provider ?? "unknown"}`
  const id = receipt?.messageId ? `, id ${receipt.messageId}` : ""
  const warn = receipt?.fallbackFrom ? ` (primary failed: ${receipt.fallbackFrom})` : ""
  return `${via}${id}${warn}`
}

async function logEmailSend(email: string, action: string, status: "SUCCESS" | "FAILED", details?: string) {
  await logAuditEvent({
    email,
    action: status === "SUCCESS" ? "EMAIL_SENT" : "EMAIL_FAILED",
    details: `${action}${details ? ` — ${details}` : ""}`,
  })
}

export async function sendConsultationInviteWorkflow(
  recipient: { email: string; name: string },
  data: Parameters<typeof sendConsultationInvite>[1],
  icalString?: string
) {
  "use workflow"

  await sendConsultationInvite(recipient, data, icalString)
}

export async function sendApprovedWorkflow(
  recipients: EmailRecipient[],
  data: Omit<Parameters<typeof sendApprovedWithTeamsLink>[1], "viewUrl">,
  icalString?: string
) {
  "use workflow"

  for (const r of recipients) {
    await sendApprovedWithTeamsLink(
      { email: r.email, name: r.name },
      { ...data, viewUrl: r.viewUrl },
      icalString,
    )
  }
}

export async function sendPasswordChangedWorkflow(
  email: string,
  name: string
) {
  "use workflow"

  try {
    const receipt = await sendPasswordChangedEmail(email, name)
    await logEmailSend(email, "Password changed notification", "SUCCESS", receiptDetails(name, receipt))
  } catch (err) {
    await logEmailSend(email, "Password changed notification", "FAILED", err instanceof Error ? err.message : "Unknown error")
    throw err
  }
}

export async function sendActivationWorkflow(
  email: string,
  name: string,
  activationUrl: string
) {
  "use workflow"

  try {
    const receipt = await sendActivationEmail(email, name, activationUrl)
    await logEmailSend(email, "Activation email", "SUCCESS", receiptDetails(name, receipt))
  } catch (err) {
    await logEmailSend(email, "Activation email", "FAILED", err instanceof Error ? err.message : "Unknown error")
    throw err
  }
}

export async function sendForgotPasswordWorkflow(
  email: string,
  name: string,
  resetUrl: string
) {
  "use workflow"

  try {
    const receipt = await sendForgotPasswordEmail(email, name, resetUrl)
    await logEmailSend(email, "Password reset email", "SUCCESS", receiptDetails(name, receipt))
  } catch (err) {
    await logEmailSend(email, "Password reset email", "FAILED", err instanceof Error ? err.message : "Unknown error")
    throw err
  }
}

import type { ApptWithJoins } from "@/features/appointments/appointments.service"
import { getAppointmentUrl, getRecipientType } from "@/lib/utils/appointment-url"

export async function sendAppointmentCreatedWorkflow(
  appointment: Record<string, unknown>,
  _creatorId: string
) {
  "use workflow"

  const appt = appointment as unknown as ApptWithJoins
  const recipients: { email: string; name: string }[] = []
  const addRecipient = (u: { email: string; name: string }) => {
    recipients.push(u)
  }
  if (appt.student?.email) addRecipient(appt.student)
  if (appt.faculty?.email) addRecipient(appt.faculty)
  for (const att of (appt.attendees || [])) {
    const u = att.user
    if (u?.email) addRecipient(u)
  }
  for (const r of recipients) {
    const rtype = getRecipientType(r.email, appt)
    await sendMeetingInviteWithICS(
      { email: r.email, name: r.name },
      {
        organizerName: appt.faculty?.name || "Faculty",
        title: appt.title || "Meeting",
        description: appt.description,
        date: appt.date,
        startTime: appt.startTime,
        endTime: appt.endTime,
        participantNames: recipients.map((x) => x.name),
        viewUrl: getAppointmentUrl(appt.id!, rtype),
      },
      undefined,
    )
  }
}

export async function sendConsultationApprovedWorkflow(
  appointment: Record<string, unknown>
) {
  "use workflow"

  const appt = appointment as unknown as ApptWithJoins
  const student = appt.student
  const faculty = appt.faculty || { id: "", name: "Faculty", email: "" }
  if (!student?.email) return
  const url = getAppointmentUrl(appt.id!, "student")
  await sendApprovedWithTeamsLink(
    { email: student.email, name: student.name },
    {
      studentName: student.name,
      studentEmail: student.email,
      facultyName: faculty.name,
      facultyEmail: faculty.email,
      date: appt.date,
      startTime: appt.startTime,
      endTime: appt.endTime,
      title: appt.title,
      description: appt.description,
      teamsLink: null,
      viewUrl: url,
    },
    undefined,
  )
}

export async function sendMeetingInviteWithAcknowledgementWorkflow(
  recipients: EmailRecipient[],
  inviteData: {
    organizerName: string
    title: string
    description?: string | null
    date: string
    startTime: string
    endTime: string
    participantNames: string[]
  },
  icalString: string | undefined,
  acknowledgementRecipient: EmailRecipient | null,
  acknowledgementData: {
    meetingTitle: string
    attendeeNames: string[]
    date: string
    startTime: string
    endTime: string
    viewUrl: string
    variant: "request" | "booking"
  } | null
) {
  "use workflow"

  for (const r of recipients) {
    await sendInviteStep(r, inviteData, icalString)
  }
  if (acknowledgementRecipient && acknowledgementData) {
    await sendAcknowledgementStep(acknowledgementRecipient, acknowledgementData)
  }
}

export async function sendConsultationInviteWithAcknowledgementWorkflow(
  recipients: EmailRecipient[],
  inviteData: {
    studentName: string
    studentEmail: string
    facultyName: string
    facultyEmail: string
    date: string
    startTime: string
    endTime: string
    title?: string | null
    description?: string | null
  },
  icalString: string | undefined,
  acknowledgementRecipient: EmailRecipient | null,
  acknowledgementData: {
    meetingTitle: string
    attendeeNames: string[]
    date: string
    startTime: string
    endTime: string
    viewUrl: string
    variant: "request" | "booking"
  } | null
) {
  "use workflow"

  for (const r of recipients) {
    await sendConsultationInviteStep(r, inviteData, icalString)
  }
  if (acknowledgementRecipient && acknowledgementData) {
    await sendAcknowledgementStep(acknowledgementRecipient, acknowledgementData)
  }
}

async function sendConsultationInviteStep(
  recipient: EmailRecipient,
  inviteData: {
    studentName: string
    studentEmail: string
    facultyName: string
    facultyEmail: string
    date: string
    startTime: string
    endTime: string
    title?: string | null
    description?: string | null
  },
  icalString: string | undefined
) {
  "use step"

  await sendConsultationInvite(
    { email: recipient.email, name: recipient.name },
    {
      studentName: inviteData.studentName,
      studentEmail: inviteData.studentEmail,
      facultyName: inviteData.facultyName,
      facultyEmail: inviteData.facultyEmail,
      date: inviteData.date,
      startTime: inviteData.startTime,
      endTime: inviteData.endTime,
      title: inviteData.title,
      description: inviteData.description,
      viewUrl: recipient.viewUrl,
    },
    icalString,
  )
}

async function sendInviteStep(
  recipient: EmailRecipient,
  inviteData: {
    organizerName: string
    title: string
    description?: string | null
    date: string
    startTime: string
    endTime: string
    participantNames: string[]
  },
  icalString: string | undefined
) {
  "use step"

  await sendMeetingInviteWithICS(
    { email: recipient.email, name: recipient.name },
    {
      organizerName: inviteData.organizerName,
      title: inviteData.title,
      description: inviteData.description,
      date: inviteData.date,
      startTime: inviteData.startTime,
      endTime: inviteData.endTime,
      participantNames: inviteData.participantNames,
      viewUrl: recipient.viewUrl,
    },
    icalString,
  )
}

async function sendAcknowledgementStep(
  recipient: { email: string; name: string },
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
  "use step"

  await sendBookingAcknowledgement({ email: recipient.email, name: recipient.name }, data)
}

export async function sendStatusUpdateWorkflow(
  recipients: EmailRecipient[],
  data: {
    variant: "cancelled" | "completed" | "accepted"
    actorName: string
    meetingTitle: string
    date: string
    startTime: string
    endTime: string
    description?: string | null
    extraInfo?: string | null
    attendeeNames: string[]
    isCreator: boolean
    meetingType: "CONSULTATION" | "INTERNAL"
  }
) {
  "use workflow"

  for (const r of recipients) {
    await sendStatusUpdateEmail(
      { email: r.email, name: r.name },
      { ...data, viewUrl: r.viewUrl },
    )
  }
}

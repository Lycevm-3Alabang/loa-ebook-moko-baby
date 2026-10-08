export interface BookingAcknowledgementData {
  recipientName: string
  meetingTitle: string
  attendeeNames: string[]
  date: string
  startTime: string
  endTime: string
  viewUrl: string
  variant: "request" | "booking"
}

export function bookingAcknowledgementHtml(data: BookingAcknowledgementData): string {
  const attendeeList = data.attendeeNames.join(", ")

  const isRequest = data.variant === "request"

  const header = isRequest ? "Consultation Request Sent" : "Meeting Created"
  const title = isRequest ? "Your consultation request has been sent" : "Your meeting has been scheduled"
  const subtitle = isRequest
    ? "Your consultation request has been sent to the faculty."
    : "Invitations have been sent to your attendees."
  const ctaText = isRequest ? "View Consultation" : "View Meeting Details"
  const badgeBg = isRequest ? "#f59e0b" : "#059669"
  const cardBg = isRequest ? "#fffbeb" : "#f0fdf4"
  const cardBorder = isRequest ? "#fde68a" : "#bbf7d0"
  const cardText = isRequest ? "#92400e" : "#166534"
  const footerText = isRequest
    ? "This is a confirmation that your consultation request was sent. You will be notified when the faculty responds."
    : "This is a confirmation that your meeting invitation was sent. You can view the meeting details and manage attendees through the ACES system."

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
  <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
    <tr><td style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${header}</p>
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">${title}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">${subtitle}</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;margin-bottom:24px;">
        <tr><td style="padding:20px;">

          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:${cardText};">${escapeHtml(data.meetingTitle)}</p>

          <table cellpadding="0" cellspacing="0" style="color:#475569;font-size:14px;">
            <tr><td style="padding:3px 0;vertical-align:top;width:24px;">📅</td><td style="padding:3px 0;color:#0f172a;font-weight:600;">${escapeHtml(data.date)}</td></tr>
            <tr><td style="padding:3px 0;vertical-align:top;">⏰</td><td style="padding:3px 0;color:#0f172a;font-weight:600;">${escapeHtml(data.startTime)} – ${escapeHtml(data.endTime)}</td></tr>
            <tr><td style="padding:3px 0;vertical-align:top;">👥</td><td style="padding:3px 0;color:#0f172a;font-weight:600;">${escapeHtml(attendeeList)}</td></tr>
          </table>

        </td></tr>
      </table>

      <table cellpadding="0" cellspacing="0">
        <tr><td style="border-radius:8px;background:${badgeBg};padding:0;">
          <a href="${escapeHtml(data.viewUrl)}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${ctaText}</a>
        </td></tr>
      </table>

      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
        ${footerText}
      </p>

    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export interface ConsultationInviteData {
  recipientName: string
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
}

export function consultationInviteHtml(data: ConsultationInviteData): string {
  const displayTitle = data.title || `Consultation with ${data.facultyName}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
  <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
    <tr><td style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

      <!-- Header -->
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Consultation Request</p>
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f172a;">${escapeHtml(displayTitle)}</h1>

      <!-- Event card -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr><td style="padding:20px;">

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:1px;">Academic Consultation</p>

          <!-- Date/time -->
          <table cellpadding="0" cellspacing="0" style="margin-top:16px;color:#475569;font-size:14px;">
            <tr><td style="padding:4px 0;vertical-align:top;width:24px;">📅</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(data.date)}</td></tr>
            <tr><td style="padding:4px 0;vertical-align:top;">⏰</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(data.startTime)} – ${escapeHtml(data.endTime)}</td></tr>
          </table>

          <!-- Divider -->
          <div style="height:1px;background:#e2e8f0;margin:16px 0;"></div>

          <!-- People -->
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#475569;">
            <tr><td style="padding:2px 0;vertical-align:top;width:24px;">👤</td>
                <td style="padding:2px 0;"><strong style="color:#0f172a;">Student:</strong> ${escapeHtml(data.studentName)} &lt;${escapeHtml(data.studentEmail)}&gt;</td></tr>
            <tr><td style="padding:2px 0;vertical-align:top;">👤</td>
                <td style="padding:2px 0;"><strong style="color:#0f172a;">Faculty:</strong> ${escapeHtml(data.facultyName)} &lt;${escapeHtml(data.facultyEmail)}&gt;</td></tr>
          </table>

          ${data.description ? `
          <div style="height:1px;background:#e2e8f0;margin:16px 0;"></div>
          <p style="margin:0;font-size:14px;color:#475569;line-height:1.5;">${escapeHtml(data.description)}</p>
          ` : ""}

        </td></tr>
      </table>

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0">
        <tr><td style="border-radius:8px;background:#d97706;padding:0;">
          <a href="${escapeHtml(data.viewUrl)}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">View Details</a>
        </td></tr>
      </table>

      <!-- Footer -->
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
        This consultation was booked through the ACES system.
        The attached .ics file can be opened in Outlook, Google Calendar, or Apple Calendar.
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

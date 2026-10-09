export interface ConsultationApprovedData {
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
  teamsLink: string | null
  viewUrl: string
}

export function consultationApprovedHtml(data: ConsultationApprovedData): string {
  const displayTitle = data.title || `Consultation with ${data.facultyName}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
  <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
    <tr><td style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

      <!-- Header -->
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">Consultation Accepted &#10003;</p>
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f172a;">${escapeHtml(displayTitle)}</h1>

      <!-- Event card -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr><td style="padding:20px;">

          <!-- Date/time -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;color:#475569;font-size:14px;">
            <tr><td style="padding:4px 0;vertical-align:top;width:24px;">&#x1F4C5;</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(data.date)}</td></tr>
            <tr><td style="padding:4px 0;vertical-align:top;">&#x23F0;</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(data.startTime)} &ndash; ${escapeHtml(data.endTime)}</td></tr>
          </table>

          ${data.teamsLink ? `
          <!-- Teams link -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#166534;">Microsoft Teams Meeting</p>
              <p style="margin:0 0 12px;font-size:12px;color:#15803d;word-break:break-all;">${escapeHtml(data.teamsLink)}</p>
              <table cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:6px;background:#16a34a;padding:0;">
                  <a href="${escapeHtml(data.teamsLink)}" style="display:inline-block;padding:10px 24px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">Join Teams Meeting</a>
                </td></tr>
              </table>
            </td></tr>
          </table>
          ` : ""}

          <!-- Divider -->
          <div style="height:1px;background:#e2e8f0;margin:16px 0;"></div>

          <!-- People -->
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#475569;">
            <tr><td style="padding:2px 0;vertical-align:top;width:24px;">&#x1F464;</td>
                <td style="padding:2px 0;"><strong style="color:#0f172a;">Student:</strong> ${escapeHtml(data.studentName)} &lt;${escapeHtml(data.studentEmail)}&gt;</td></tr>
            <tr><td style="padding:2px 0;vertical-align:top;">&#x1F464;</td>
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
        This consultation was approved through the ACES system.
        The attached .ics file can be opened in Outlook, Google Calendar, or Apple Calendar.
        You are receiving this because you are a participant in this consultation.
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

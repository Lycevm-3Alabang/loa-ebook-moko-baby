/**
 * Generate an Outlook-compatible .ics (iCalendar) VEVENT string.
 * Times are stored as local date/time strings in the DB; we parse them
 * in the server's timezone and export as UTC so Outlook/Gmail display
 * the correct local time for each recipient.
 */

export interface ICalPerson {
  name: string
  email: string
}

export interface ICalEvent {
  uid: string
  summary: string
  description: string
  date: string   // "YYYY-MM-DD"
  startTime: string  // "HH:mm"
  endTime: string    // "HH:mm"
  location?: string
  organizer?: ICalPerson
  attendees?: ICalPerson[]
}

/** Format a local date+time pair to iCal UTC: 20260523T060000Z */
export function toICalUtc(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const [hh, mm] = timeStr.split(":").map(Number)
  const local = new Date(y, m - 1, d, hh, mm)
  return local.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

/** Fold long lines per RFC 5545 (max 75 octets) */
export function foldLine(line: string): string {
  if (line.length <= 75) return line
  let result = ""
  for (let i = 0; i < line.length; i += 75) {
    result += (i === 0 ? "" : "\r\n ") + line.substring(i, i + 75)
  }
  return result
}

export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

export function generateICal(event: ICalEvent): string {
  const now = new Date()
  const dtstamp = toICalUtc(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  )

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ACES//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTART:${toICalUtc(event.date, event.startTime)}`,
    `DTEND:${toICalUtc(event.date, event.endTime)}`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `LOCATION:${escapeText(event.location || "Microsoft Teams")}`,
    "X-MICROSOFT-CDO-BUSYSTATUS:BUSY",
    "X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY",
    "X-MICROSOFT-CDO-ALLDAYEVENT:FALSE",
    "X-MICROSOFT-CDO-IMPORTANCE:1",
  ]

  if (event.organizer) {
    lines.push(
      `ORGANIZER;CN=${escapeText(event.organizer.name)}:mailto:${event.organizer.email}`
    )
  }

  if (event.attendees) {
    for (const att of event.attendees) {
      lines.push(
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${att.email}`
      )
    }
  }

  lines.push("END:VEVENT", "END:VCALENDAR")

  return lines.map(foldLine).join("\r\n")
}

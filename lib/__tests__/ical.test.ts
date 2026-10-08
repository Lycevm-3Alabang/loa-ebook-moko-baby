import { describe, it, expect } from "vitest"
import { generateICal, toICalUtc, foldLine, escapeText } from "@/lib/services/ical"
import type { ICalEvent } from "@/lib/services/ical"

const BASE_EVENT: ICalEvent = {
  uid: "apt-123",
  summary: "Math Help Session",
  description: "Discuss calculus derivatives",
  date: "2026-06-15",
  startTime: "10:00",
  endTime: "11:00",
  location: "Room 301",
}

describe("toICalUtc", () => {
  it("formats date+time to iCal UTC string", () => {
    const result = toICalUtc("2026-06-15", "10:00")
    expect(result).toMatch(/^\d{8}T\d{6}Z$/)
  })
})

describe("foldLine", () => {
  it("does not fold lines under 75 chars", () => {
    const line = "A".repeat(70)
    expect(foldLine(line)).toBe(line)
  })

  it("folds lines over 75 chars", () => {
    const line = "A".repeat(150)
    const folded = foldLine(line)
    expect(folded).toContain("\r\n ")
    expect(folded.replace(/\r\n /g, "")).toBe(line)
  })
})

describe("escapeText", () => {
  it("escapes backslash", () => {
    expect(escapeText("a\\b")).toBe("a\\\\b")
  })

  it("escapes semicolon", () => {
    expect(escapeText("a;b")).toBe("a\\;b")
  })

  it("escapes comma", () => {
    expect(escapeText("a,b")).toBe("a\\,b")
  })

  it("escapes newline", () => {
    expect(escapeText("a\nb")).toBe("a\\nb")
  })
})

describe("generateICal", () => {
  it("produces valid iCal structure", () => {
    const result = generateICal(BASE_EVENT)
    expect(result).toContain("BEGIN:VCALENDAR")
    expect(result).toContain("END:VCALENDAR")
    expect(result).toContain("BEGIN:VEVENT")
    expect(result).toContain("END:VEVENT")
    expect(result).toContain("VERSION:2.0")
    expect(result).toContain("PRODID:-//ACES//EN")
  })

  it("includes UID, DTSTART, DTEND", () => {
    const result = generateICal(BASE_EVENT)
    expect(result).toContain("UID:apt-123")
    expect(result).toContain("DTSTART:")
    expect(result).toContain("DTEND:")
    expect(result).toContain("DTSTAMP:")
  })

  it("includes summary and description", () => {
    const result = generateICal(BASE_EVENT)
    expect(result).toContain("SUMMARY:Math Help Session")
    expect(result).toContain("DESCRIPTION:Discuss calculus derivatives")
  })

  it("includes location default when not provided", () => {
    const result = generateICal({ ...BASE_EVENT, location: undefined })
    expect(result).toContain("LOCATION:Microsoft Teams")
  })

  it("includes organizer when provided", () => {
    const result = generateICal({
      ...BASE_EVENT,
      organizer: { name: "Dr. Smith", email: "smith@test.com" },
    })
    expect(result).toContain("ORGANIZER;CN=Dr. Smith:mailto:smith@test.com")
  })

  it("includes attendees when provided", () => {
    const result = generateICal({
      ...BASE_EVENT,
      attendees: [
        { name: "John", email: "john@test.com" },
        { name: "Jane", email: "jane@test.com" },
      ],
    })
    expect(result).toContain("ATTENDEE;")
    expect(result).toContain("john@test.com")
    expect(result).toContain("jane@test.com")
  })

  it("sets Microsoft-specific properties", () => {
    const result = generateICal(BASE_EVENT)
    expect(result).toContain("X-MICROSOFT-CDO-BUSYSTATUS:BUSY")
    expect(result).toContain("X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY")
    expect(result).toContain("X-MICROSOFT-CDO-ALLDAYEVENT:FALSE")
    expect(result).toContain("X-MICROSOFT-CDO-IMPORTANCE:1")
  })

  it("separates lines with CRLF", () => {
    const result = generateICal(BASE_EVENT)
    expect(result).toContain("\r\n")
    expect(result).not.toContain("\n\n")
  })
})

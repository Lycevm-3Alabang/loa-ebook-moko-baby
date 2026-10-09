import { describe, it, expect } from "vitest"
import { consultationInviteHtml } from "@/lib/email-templates/consultation-invite"
import { bookingAcknowledgementHtml } from "@/lib/email-templates/booking-acknowledgement"
import { consultationApprovedHtml } from "@/lib/email-templates/consultation-approved"
import { meetingInviteHtml } from "@/lib/email-templates/meeting-invite"
import { statusNotificationHtml } from "@/lib/email-templates/status-notification"
import type { StatusVariant } from "@/lib/email-templates/status-notification"

const BASE_INVITE = {
  recipientName: "Dr. Smith",
  studentName: "John Doe",
  studentEmail: "john@test.com",
  facultyName: "Dr. Smith",
  facultyEmail: "smith@test.com",
  date: "2026-06-15",
  startTime: "10:00",
  endTime: "11:00",
  title: "Math Help",
  description: "Need help with calculus",
  viewUrl: "https://app.test/view/apt-1",
}

const BASE_BOOKING_ACK = {
  recipientName: "John Doe",
  meetingTitle: "Math Help",
  attendeeNames: ["Dr. Smith", "John Doe"],
  date: "2026-06-15",
  startTime: "10:00",
  endTime: "11:00",
  viewUrl: "https://app.test/view/apt-1",
}

const BASE_APPROVED = {
  recipientName: "John Doe",
  studentName: "John Doe",
  studentEmail: "john@test.com",
  facultyName: "Dr. Smith",
  facultyEmail: "smith@test.com",
  date: "2026-06-15",
  startTime: "10:00",
  endTime: "11:00",
  title: "Math Help",
  description: null,
  teamsLink: "https://teams.microsoft.com/meeting/123",
  viewUrl: "https://app.test/view/apt-1",
}

const BASE_MEETING_INVITE = {
  recipientName: "Attendee",
  organizerName: "Dr. Smith",
  title: "Math Help",
  description: "Let's discuss calculus",
  date: "2026-06-15",
  startTime: "10:00",
  endTime: "11:00",
  participantNames: ["Dr. Smith", "John Doe", "Jane Roe"],
  viewUrl: "https://app.test/view/apt-1",
}

const BASE_STATUS = {
  recipientName: "John Doe",
  actorName: "Dr. Smith",
  meetingTitle: "Math Help",
  date: "2026-06-15",
  startTime: "10:00",
  endTime: "11:00",
  description: null,
  viewUrl: "https://app.test/view/apt-1",
  extraInfo: null,
  attendeeNames: ["Dr. Smith"],
  isCreator: false,
  meetingType: "CONSULTATION" as const,
}

describe("consultationInviteHtml", () => {
  it("renders with all fields", () => {
    const html = consultationInviteHtml(BASE_INVITE)
    expect(html).toContain("Math Help")
    expect(html).toContain("2026-06-15")
    expect(html).toContain("10:00")
    expect(html).toContain("11:00")
    expect(html).toContain("John Doe")
    expect(html).toContain("Dr. Smith")
    expect(html).toContain("Need help with calculus")
    expect(html).toContain("View Details")
  })

  it("falls back to default title when title is null", () => {
    const html = consultationInviteHtml({ ...BASE_INVITE, title: null })
    expect(html).toContain("Consultation with Dr. Smith")
  })

  it("falls back to default title when title is undefined", () => {
    const html = consultationInviteHtml({ ...BASE_INVITE, title: undefined })
    expect(html).toContain("Consultation with Dr. Smith")
  })

  it("omits description section when description is null", () => {
    const html = consultationInviteHtml({ ...BASE_INVITE, description: null })
    expect(html).not.toContain("Need help with calculus")
  })

  it("escapes HTML injection in user fields", () => {
    const html = consultationInviteHtml({ ...BASE_INVITE, studentName: "<script>alert('xss')</script>" })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("bookingAcknowledgementHtml", () => {
  it("renders request variant with correct badge color", () => {
    const html = bookingAcknowledgementHtml({ ...BASE_BOOKING_ACK, variant: "request" })
    expect(html).toContain("Consultation Request Sent")
    expect(html).toContain("#f59e0b")
    expect(html).toContain("View Consultation")
  })

  it("renders booking variant with correct badge color", () => {
    const html = bookingAcknowledgementHtml({ ...BASE_BOOKING_ACK, variant: "booking" })
    expect(html).toContain("Meeting Created")
    expect(html).toContain("#059669")
    expect(html).toContain("View Meeting Details")
  })

  it("joins attendee names with comma", () => {
    const html = bookingAcknowledgementHtml({ ...BASE_BOOKING_ACK, variant: "request", attendeeNames: ["Alice", "Bob", "Charlie"] })
    expect(html).toContain("Alice, Bob, Charlie")
  })
})

describe("consultationApprovedHtml", () => {
  it("renders with teams link when provided", () => {
    const html = consultationApprovedHtml(BASE_APPROVED)
    expect(html).toContain("Join Teams Meeting")
    expect(html).toContain("https://teams.microsoft.com/meeting/123")
  })

  it("omits teams section when link is null", () => {
    const html = consultationApprovedHtml({ ...BASE_APPROVED, teamsLink: null })
    expect(html).not.toContain("Join Teams Meeting")
  })

  it("omits description section when null", () => {
    const html = consultationApprovedHtml({ ...BASE_APPROVED, description: null })
    expect(html).not.toContain("divider")
  })

  it("includes description when provided", () => {
    const html = consultationApprovedHtml({ ...BASE_APPROVED, description: "Let's review your paper." })
    expect(html).toContain("Let's review your paper.")
  })
})

describe("meetingInviteHtml", () => {
  it("renders with all fields", () => {
    const html = meetingInviteHtml(BASE_MEETING_INVITE)
    expect(html).toContain("Math Help")
    expect(html).toContain("Dr. Smith")
    expect(html).toContain("John Doe, Jane Roe")
    expect(html).toContain("Let's discuss calculus")
    expect(html).toContain("View Meeting")
  })

  it("omits description section when not provided", () => {
    const html = meetingInviteHtml({ ...BASE_MEETING_INVITE, description: null })
    expect(html).not.toContain("Let's discuss calculus")
  })
})

describe("statusNotificationHtml", () => {
  it("renders cancelled variant", () => {
    const html = statusNotificationHtml({ ...BASE_STATUS, variant: "cancelled" as StatusVariant })
    expect(html).toContain("Appointment Cancelled")
    expect(html).toContain("cancelled this appointment")
  })

  it("renders completed variant", () => {
    const html = statusNotificationHtml({ ...BASE_STATUS, variant: "completed" as StatusVariant })
    expect(html).toContain("Appointment Completed")
    expect(html).toContain("completed this appointment")
  })

  it("renders accepted variant for non-creator", () => {
    const html = statusNotificationHtml({ ...BASE_STATUS, variant: "accepted" as StatusVariant, isCreator: false })
    expect(html).toContain("has accepted the appointment")
  })

  it("renders accepted variant for creator with internal meeting", () => {
    const html = statusNotificationHtml({
      ...BASE_STATUS, variant: "accepted" as StatusVariant, isCreator: true, meetingType: "INTERNAL" as const,
    })
    expect(html).toContain("You accepted your appointment")
  })

  it("shows extraInfo lines when provided", () => {
    const html = statusNotificationHtml({ ...BASE_STATUS, variant: "completed" as StatusVariant, extraInfo: "Action taken:\nReviewed the paper." })
    expect(html).toContain("Action taken:")
    expect(html).toContain("Reviewed the paper.")
  })

  it("throws on unknown variant", () => {
    expect(() => statusNotificationHtml({ ...BASE_STATUS, variant: "unknown" as StatusVariant })).toThrow("Unknown variant")
  })
})

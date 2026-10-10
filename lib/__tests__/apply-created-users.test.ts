import { describe, expect, it } from "vitest"
import { applyCreatedUsers } from "@/features/users/components/bulk-import/apply-created-users"

interface TestRow {
  email: string
  isNewStudent: boolean
  label: string
}

const row = (email: string, isNewStudent: boolean): TestRow => ({ email, isNewStudent, label: email })

describe("applyCreatedUsers", () => {
  it("appends created emails missing from the snapshot", () => {
    const { existingUsers } = applyCreatedUsers(
      [{ email: "a@itmlyceumalabang.onmicrosoft.com" }],
      [],
      [{ name: "B", email: "b@itmlyceumalabang.onmicrosoft.com", role: "STUDENT" }],
    )
    expect(existingUsers.map((u) => u.email)).toEqual([
      "a@itmlyceumalabang.onmicrosoft.com",
      "b@itmlyceumalabang.onmicrosoft.com",
    ])
  })

  it("skips already-known emails, case-insensitively", () => {
    const { existingUsers } = applyCreatedUsers(
      [{ email: "a@itmlyceumalabang.onmicrosoft.com" }],
      [],
      [{ name: "A", email: "A@ITMLYCEUMALABANG.onmicrosoft.com", role: "STUDENT" }],
    )
    expect(existingUsers).toHaveLength(1)
  })

  it("flips isNewStudent only on rows matching a created email", () => {
    const { previewRows } = applyCreatedUsers(
      [],
      [row("new@itmlyceumalabang.onmicrosoft.com", true), row("old@itmlyceumalabang.onmicrosoft.com", true)],
      [{ name: "New", email: "new@itmlyceumalabang.onmicrosoft.com", role: "STUDENT" }],
    )
    expect(previewRows.map((r) => r.isNewStudent)).toEqual([false, true])
  })

  it("leaves already-false flags untouched", () => {
    const { previewRows } = applyCreatedUsers(
      [],
      [row("a@itmlyceumalabang.onmicrosoft.com", false)],
      [{ name: "A", email: "a@itmlyceumalabang.onmicrosoft.com", role: "STUDENT" }],
    )
    expect(previewRows[0]).toEqual(row("a@itmlyceumalabang.onmicrosoft.com", false))
  })

  it("is a no-op on empty created", () => {
    const users = [{ email: "a@itmlyceumalabang.onmicrosoft.com" }]
    const rows = [row("a@itmlyceumalabang.onmicrosoft.com", false)]
    const out = applyCreatedUsers(users, rows, [])
    expect(out.existingUsers).toBe(users)
    expect(out.previewRows).toBe(rows)
  })

  it("never mutates its inputs and dedupes repeats", () => {
    const users = [{ email: "known@itmlyceumalabang.onmicrosoft.com" }]
    const rows = [row("dup@itmlyceumalabang.onmicrosoft.com", true)]
    const created = [
      { name: "D", email: " dup@ITMLYCEUMALABANG.onmicrosoft.com ", role: "STUDENT" },
      { name: "D", email: "dup@itmlyceumalabang.onmicrosoft.com", role: "STUDENT" },
    ]
    const out = applyCreatedUsers(users, rows, created)
    expect(users).toHaveLength(1)
    expect(rows[0]?.isNewStudent).toBe(true)
    expect(out.existingUsers).toHaveLength(2)
    expect(out.previewRows[0]?.isNewStudent).toBe(false)
  })
})

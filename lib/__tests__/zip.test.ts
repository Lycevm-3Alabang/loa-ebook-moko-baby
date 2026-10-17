import { describe, it, expect } from "vitest"
import { createZip } from "@/lib/zip"

const enc = new TextEncoder()

function u16(buf: Uint8Array, off: number) { return buf[off] | (buf[off + 1] << 8) }
function u32(buf: Uint8Array, off: number) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0 }

describe("createZip", () => {
  it("produces a valid empty zip (22 bytes EOCD)", () => {
    const out = createZip([])
    expect(out.length).toBe(22)
    expect(u32(out, 0)).toBe(0x06054b50)
    expect(u16(out, 8)).toBe(0)  // entries on disk
    expect(u16(out, 10)).toBe(0) // total entries
  })

  it("writes one entry with correct local header", () => {
    const data = enc.encode("hello")
    const out = createZip([{ name: "a.txt", data }])
    // EOCD at end
    const eocdOff = out.length - 22
    expect(u32(out, eocdOff)).toBe(0x06054b50)
    expect(u16(out, eocdOff + 8)).toBe(1)
    // local header signature
    expect(u32(out, 0)).toBe(0x04034b50)
    // filename length
    expect(u16(out, 26)).toBe(5) // "a.txt"
    // crc32 of "hello" = 0x3610a686
    expect(u32(out, 14)).toBe(0x3610a686)
    // sizes
    expect(u32(out, 18)).toBe(5)
    expect(u32(out, 22)).toBe(5)
  })

  it("writes multiple entries", () => {
    const out = createZip([
      { name: "one.txt", data: enc.encode("one") },
      { name: "two.txt", data: enc.encode("two") },
    ])
    const eocdOff = out.length - 22
    expect(u16(out, eocdOff + 8)).toBe(2)
    expect(u16(out, eocdOff + 10)).toBe(2)
  })

  it("central directory lists all entry names", () => {
    const out = createZip([
      { name: "dir/file.csv", data: enc.encode("a,b") },
    ])
    const decoder = new TextDecoder()
    const text = decoder.decode(out)
    expect(text).toContain("dir/file.csv")
  })

  it("stores empty file entry", () => {
    const out = createZip([{ name: "empty.txt", data: new Uint8Array(0) }])
    expect(u32(out, 14)).toBe(0) // crc of empty
    expect(u32(out, 18)).toBe(0)
    expect(u32(out, 22)).toBe(0)
  })

  it("handles unicode filenames", () => {
    const out = createZip([{ name: "café.txt", data: enc.encode("x") }])
    const decoder = new TextDecoder()
    expect(decoder.decode(out)).toContain("café.txt")
  })
})

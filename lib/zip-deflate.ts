import { deflateRawSync } from "zlib"

/**
 * A DEFLATE zip writer — the export's ZIP.
 *
 * ⭐ The repo has two zip writers, and that is deliberate: `lib/zip.ts` is
 * **store-only** and **browser-safe** (the client's `downloadBlob` imports it,
 * so it must never pull Node's `zlib` into the browser bundle). This one is
 * **server-only** and compresses.
 *
 * ⭐ Why it exists (measured, the spike 2026-10-22): the letterhead PNG is
 * **47 KB and is in EVERY workbook**, and the workbook's own package is
 * store-only — so the workbook's XML travels uncompressed. A 199-section
 * department is **19.63 MB** stored and **8.23 MB** deflated; the platform's
 * response ceiling is ≈ **4.5 MB**. ⭐ The compression is a REQUIREMENT, not
 * an optimisation.
 *
 * The layout is `lib/zip.ts`'s — the local headers, the central directory, the
 * EOCD — with one difference: the entries are deflated and the method field
 * says so. ⭐ The CRC is always of the UNCOMPRESSED data.
 */

/** One entry of the archive. */
export interface ZipEntry {
  /** the entry's path inside the archive */
  name: string
  /** the entry's bytes — the archive compresses them */
  data: Uint8Array
}

/** The CRC-32 of a run of bytes (the zip's own checksum). */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let k = 0; k < 8; k++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * The archive — the local headers, the central directory, the EOCD.
 *
 * ⭐ Every size in the headers is the COMPRESSED size and the uncompressed
 * size is written beside it; a reader inflates by the compressed size and
 * checks the CRC against what it got.
 */
export function createDeflatedZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const offsets: number[] = []

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const compressed = new Uint8Array(deflateRawSync(entry.data))
    const size = compressed.length
    const raw = entry.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 8, true) // ⭐ the method: deflate
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, raw, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    offsets.push(offset)
    offset += local.length + size

    const cd = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 8, true) // ⭐ the method: deflate
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, raw, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offsets[offsets.length - 1], true)
    cd.set(nameBytes, 46)

    locals.push(local, compressed)
    central.push(cd)
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0)
  const centralOffset = offset

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, centralOffset, true)
  ev.setUint16(20, 0, true)

  const total = offset + centralSize + 22
  const out = new Uint8Array(total)
  let pos = 0
  for (const l of locals) {
    out.set(l, pos)
    pos += l.length
  }
  for (const c of central) {
    out.set(c, pos)
    pos += c.length
  }
  out.set(eocd, pos)
  return out
}

/**
 * The letterhead's own dimensions.
 *
 * A PNG's size is in its IHDR chunk — the first chunk of the file, right after
 * the signature. Reading it means the export can size the letterhead at the
 * image's OWN aspect, so swapping the file never stretches it (the legacy's
 * banner slot was 6.14:1 and the logo is 2.18:1 — dropping one into the
 * other's slot is what stretched it).
 */

export interface PngSize {
  width: number
  height: number
}

/** The PNG's pixel size, read out of its header. */
export function pngSize(bytes: Uint8Array): PngSize {
  if (bytes.length < 24) throw new Error("that is not a PNG - it is too short")
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) throw new Error("that is not a PNG")
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** The image's aspect — its width over its height. */
export function pngAspect(bytes: Uint8Array): number {
  const { width, height } = pngSize(bytes)
  if (!height) throw new Error("the PNG has no height")
  return width / height
}

import { readFileSync } from "fs"
import { join } from "path"

/**
 * The letterhead — the logo the form carries.
 *
 * ⭐ This is the ONE server module in the package: it reads the filesystem,
 * so only the export route may import it. Everything else here is pure.
 *
 * The file lives in `public/`, so the app also serves it as a static asset
 * (the PDF and the dashboard fetch it by URL). The export reads it from disk
 * instead, and on Vercel that needs the file TRACED into the function —
 * `next.config.ts`'s `outputFileTracingIncludes`, the same mechanism that
 * carries the export's template today. Without the trace the file is absent
 * in production and the export loses its letterhead there while working
 * locally.
 *
 * ⭐ A missing letterhead must NOT fail the export: the numbers are the
 * artifact, the letterhead is decoration. So the loader answers null, and the
 * caller says so in the log.
 */

/** The letterhead's path, relative to the project root. */
export const LETTERHEAD_PATH = "public/logo-blk.png"

/** The letterhead's bytes — or null when the file cannot be read. */
export function loadLetterhead(): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(join(process.cwd(), ...LETTERHEAD_PATH.split("/"))))
  } catch {
    console.warn(
      `[xlsx] the letterhead (${LETTERHEAD_PATH}) could not be read — the form will carry no logo`,
    )
    return null
  }
}

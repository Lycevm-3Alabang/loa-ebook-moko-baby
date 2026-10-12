/**
 * Parse a section string into { name, program }.
 *   "BSIT-32A3"      → { name: "32A3", program: "BSIT" }
 *   "BSIT 32A3"      → { name: "32A3", program: "BSIT" }
 *   "32A3"           → { name: "32A3", program: "" }
 *   " BSIT-32A3 "    → { name: "32A3", program: "BSIT" } (trims whitespace)
 */
export function parseSectionIdentifier(raw: string): { name: string; program: string } {
  const dashIdx = raw.indexOf("-")
  const spaceIdx = raw.indexOf(" ")
  const idx = dashIdx !== -1 ? dashIdx : spaceIdx
  if (idx === -1) return { name: raw.trim(), program: "" }
  return { program: raw.slice(0, idx).trim(), name: raw.slice(idx + 1).trim() }
}
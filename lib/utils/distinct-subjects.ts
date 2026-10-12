import { cleanSubjectCode } from "@/lib/csv-utils"

/**
 * Given an array of raw subject code strings, return a new array with
 * duplicates removed. Each code is first normalized by `cleanSubjectCode`
 * (trims whitespace, strips surrounding quotes and parentheses).
 * Blank/whitespace-only codes are skipped (not included in the result).
 *
 * Case-sensitive: "CS101" and "cs101" are treated as distinct codes.
 *
 * @param codes - Raw subject code strings (may contain duplicates, whitespace, quotes)
 * @returns Distinct normalized subject codes, in original order (first occurrence kept);
 *          blank codes are omitted.
 */
export function distinctSubjectCodes(codes: string[]): string[] {
  const seen = new Set<string>()
  const distinct: string[] = []

  for (const raw of codes) {
    const code = cleanSubjectCode(raw)
    if (code.length === 0) continue       // skip blank/whitespace-only codes
    if (seen.has(code)) continue
    seen.add(code)
    distinct.push(code)
  }

  return distinct
}
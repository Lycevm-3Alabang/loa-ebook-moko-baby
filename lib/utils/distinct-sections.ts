/**
 * Given an array of section items, return a new array with duplicates removed.
 * Deduplication key is `${name}|${program}` — two sections are considered
 * the same if they have the same name and program.
 *
 * Trims whitespace from name and program before comparing.
 *
 * @param items - Array of { name, program } objects
 * @returns Distinct section items, in original order (first occurrence kept);
 *          duplicate ${name}|${program} pairs are omitted.
 */
export function distinctSections(items: { name: string; program: string }[]): { name: string; program: string }[] {
  const seen = new Set<string>()
  const distinct: typeof items = []

  for (const raw of items) {
    const key = `${raw.name.trim()}|${raw.program.trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    distinct.push(raw)
  }

  return distinct
}
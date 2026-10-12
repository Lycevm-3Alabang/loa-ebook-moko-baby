/**
 * Given an array of faculty subject mapping objects, return a new array with
 * duplicates removed. Duplicates are identified by the composite key
 * `${faculty_id}|${subject_id}|${semesterId}` — this is the same key used by
 * the mappings service to track existing slots and resolve dummy-versus-real
 * conflicts.
 *
 * Trims whitespace from facet_ids before comparing.
 *
 * @param items - Array of faculty subject mapping objects
 * @returns Distinct mapping items, in original order (first occurrence kept);
 *          duplicate `${faculty_id}|${subject_id}|${semesterId}` pairs are omitted.
 *
 * Typical item shape:
 *   { faculty_id: string; subject_id: string; section_id: string;
 *     semesterId: string; rowNum: number; email: string }
 */
export function distinctFacultySubjectMappings(
  items: {
    faculty_id: string
    subject_id: string
    section_id: string
    semesterId: string
    rowNum: number
    email: string
  }[]
): {
    faculty_id: string
    subject_id: string
    section_id: string
    semesterId: string
    rowNum: number
    email: string
}[] {
  const seen = new Set<string>()
  const distinct: {
    faculty_id: string
    subject_id: string
    section_id: string
    semesterId: string
    rowNum: number
    email: string
  }[] = []

  for (const raw of items) {
    const key = `${raw.faculty_id.trim()}|${raw.subject_id.trim()}|${raw.semesterId ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    distinct.push(raw)
  }

  return distinct
}
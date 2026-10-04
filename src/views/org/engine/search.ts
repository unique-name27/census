/**
 * People search for "jump to person" (the old tool's command palette ranking): name matches beat
 * title, department, location, level and ID matches; ties go to the larger org, then the name.
 */
import type { Employee } from '@/data/schema'

export interface SearchHit {
  id: string
  score: number
}

const fold = (s: string | null | undefined) =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Score one person against an already folded query (0 = no match). */
export function scorePerson(e: Employee, q: string): number {
  if (!q) return 0
  const name = fold(e.name)
  const id = fold(e.employeeId)
  let s = 0
  if (id === q) s += 250
  else if (id.includes(q)) s += 15
  if (name === q) s += 200
  else if (name.startsWith(q)) s += 120
  else if (name.split(/[\s\-']+/).some((w) => w.startsWith(q))) s += 90
  else if (name.includes(q)) s += 60
  // Every word of a multi-word query appears in the name ("anan shet").
  else if (q.includes(' ') && q.split(/\s+/).every((w) => name.includes(w))) s += 70
  const title = fold(e.jobTitle)
  if (title === q) s += 50
  else if (title.includes(q)) s += 35
  const dept = fold(e.department)
  if (dept === q) s += 80
  else if (dept.includes(q)) s += 25
  if (fold(e.location).includes(q)) s += 20
  if (e.level && fold(e.level) === q) s += 30
  return s
}

/** The best matches for a query, highest score first. */
export function searchPeople(
  people: Iterable<Employee>,
  query: string,
  opts: { limit?: number; orgSize?: (id: string) => number } = {},
): SearchHit[] {
  const q = fold(query)
  if (!q) return []
  const size = opts.orgSize ?? (() => 0)
  const hits: (SearchHit & { name: string; size: number })[] = []
  for (const e of people) {
    const score = scorePerson(e, q)
    if (score > 0) hits.push({ id: e.employeeId, score, name: e.name, size: size(e.employeeId) })
  }
  hits.sort((a, b) => b.score - a.score || b.size - a.size || a.name.localeCompare(b.name))
  return hits.slice(0, opts.limit ?? 10).map(({ id, score }) => ({ id, score }))
}

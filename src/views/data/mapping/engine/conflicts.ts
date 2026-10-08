/**
 * Where the categories disagree, as plain sentences with a count of the people (or requisitions)
 * behind each one and, where one change fixes it, the mapping that would. People are active
 * employees on the as-of date, as in every diagram and table on the tab. Pure.
 */

import { swappedText } from '@/data/import/swap'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { StructureReport } from '@/data/reference'
import type { Employee } from '@/data/schema'
import { employeesOnly } from './structure'

export type ConflictKind =
  | 'department-several-units'
  | 'department-no-unit'
  | 'req-department-missing'
  | 'function-several-families'
  | 'function-no-family'
  | 'title-level-outlier'
  | 'people-no-function'
  | 'job-levels-swapped'
  | 'department-official-unit'
  | 'function-official-family'

/** A change that would resolve the conflict, ready for the edit form. `to` may be '' (you choose). */
export type Fix =
  | { kind: 'move-department'; department: string; from: string | null; to: string }
  | { kind: 'move-function'; jobFunction: string; from: string | null; to: string }
  | { kind: 'merge'; ref: FieldRef; from: string[]; to: string }

export interface Conflict {
  id: string
  kind: ConflictKind
  section: 'org' | 'job'
  severity: 'warning' | 'info'
  /** Short word for the status pill. */
  pill: string
  text: string
  /** Active employees, or requisitions for a requisition gap; equals `rows.length`. */
  count: number
  dataset: 'employees' | 'requisitions'
  rows: number[]
  fix: Fix | null
  /** Button text for the fix: "Move to Silicon Engineering". */
  fixLabel: string | null
  /**
   * The fix is certain (it puts rows under their official parent from Settings > Official lists),
   * so the button makes the change at once instead of filling in the edit form.
   */
  direct?: boolean
}

const intText = (n: number) => n.toLocaleString('en-US')
const people = (n: number) => `${intText(n)} ${n === 1 ? 'person' : 'people'}`
const reqs = (n: number) => `${intText(n)} ${n === 1 ? 'requisition' : 'requisitions'}`

/** "A, B and C" */
export function listText(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const STOP = new Set(['and', 'of', 'the', 'for'])
const initials = (s: string) =>
  norm(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map((w) => w[0])
    .join('')

/**
 * The candidate a stray spelling most likely means: the same words, its initials ("DV" for
 * Design Verification), a clear prefix ("Design verif"), or most words in common. Null when
 * nothing is close.
 */
export function closestValue(value: string, candidates: readonly string[]): string | null {
  const v = norm(value)
  if (!v) return null
  const pool = candidates.filter((c) => c !== value)
  const exact = pool.find((c) => norm(c) === v)
  if (exact) return exact
  const compact = v.replace(/ /g, '')
  // The same letters with different spacing or punctuation ("E-mail" for Email).
  const squeezed = pool.filter((c) => norm(c).replace(/ /g, '') === compact)
  if (squeezed.length === 1) return squeezed[0]
  if (compact.length >= 2 && compact.length <= 5) {
    const hit = pool.filter((c) => initials(c) === compact)
    if (hit.length === 1) return hit[0]
  }
  if (v.length >= 4) {
    const hit = pool.filter((c) => {
      const n = norm(c)
      return n.startsWith(v) || (n.length >= 4 && v.startsWith(n))
    })
    if (hit.length === 1) return hit[0]
  }
  const words = wordsOf(v)
  let best: string | null = null
  let bestScore = 0
  const covering: string[] = []
  for (const c of pool) {
    const cw = wordsOf(norm(c))
    let shared = 0
    for (const w of words) if (cw.some((x) => sameWord(w, x))) shared++
    const score = shared / new Set([...words, ...cw]).size
    if (score > bestScore) {
      best = c
      bestScore = score
    }
    // Every word of the candidate is in the value ("Third-party agency" for Agency).
    if (cw.length && cw.every((x) => words.some((w) => sameWord(w, x)))) covering.push(c)
  }
  if (bestScore >= 0.5) return best
  return covering.length === 1 ? covering[0] : null
}

const wordsOf = (normed: string) => normed.split(' ').filter((w) => w && !STOP.has(w))

/** The same word, a clear prefix of it ("verif"), or the same stem ("referred", "referral"). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length >= 4 && long.startsWith(short)) return true
  let n = 0
  while (n < short.length && short[n] === long[n]) n++
  return n >= 5 && n >= 0.7 * short.length
}

export function orgConflicts(r: StructureReport): Conflict[] {
  const out: Conflict[] = []
  for (const d of r.departmentsUnderSeveralUnits) {
    const units = d.businessUnits.filter((s) => s.value != null)
    const rows = units.flatMap((s) => s.rows)
    const main = units[0]?.value ?? null
    const minor = units[1]?.value ?? null
    out.push({
      id: `dept-units:${d.department}`,
      kind: 'department-several-units',
      section: 'org',
      severity: 'warning',
      pill: 'Several units',
      text: `${d.department} appears under ${units.length} business units: ${listText(
        units.map((s) => `${s.value} (${people(s.rows.length)})`),
      )}.`,
      count: rows.length,
      dataset: 'employees',
      rows,
      fix:
        main && minor ? { kind: 'move-department', department: d.department, from: minor, to: main } : null,
      fixLabel: main && minor ? `Move the ${minor} part to ${main}` : null,
    })
  }
  // Where each department otherwise sits, for departments with some rows that have no unit.
  const home = new Map<string, { unit: string; headcount: number }>()
  for (const e of r.org) {
    if (!e.department || !e.businessUnit) continue
    const h = home.get(e.department)
    if (!h || e.headcount > h.headcount)
      home.set(e.department, { unit: e.businessUnit, headcount: e.headcount })
  }
  for (const s of r.departmentsWithoutUnit) {
    const dept = s.value
    if (dept == null) continue
    const to = home.get(dept)?.unit ?? ''
    out.push({
      id: `dept-no-unit:${dept}`,
      kind: 'department-no-unit',
      section: 'org',
      severity: 'warning',
      pill: 'No unit',
      text: `${dept} has no business unit for ${people(s.rows.length)}.`,
      count: s.rows.length,
      dataset: 'employees',
      rows: s.rows,
      fix: { kind: 'move-department', department: dept, from: null, to },
      fixLabel: to ? `Put ${dept} under ${to}` : 'Choose a business unit',
    })
  }
  const roster = [...new Set(r.org.map((e) => e.department).filter((d): d is string => !!d))]
  for (const g of r.reqDepartmentsNotInRoster) {
    const to = closestValue(g.department, roster) ?? ''
    out.push({
      id: `req-dept:${g.department}:${g.businessUnit ?? ''}`,
      kind: 'req-department-missing',
      section: 'org',
      severity: 'info',
      pill: 'Not in roster',
      text: `${reqs(g.reqs)}${g.openReqs ? ` (${intText(g.openReqs)} open)` : ''} name ${g.department}${
        g.businessUnit ? ` in ${g.businessUnit}` : ''
      }, a department with no active people in Employees.`,
      count: g.rows.length,
      dataset: 'requisitions',
      rows: g.rows,
      fix: { kind: 'merge', ref: 'requisitions.department', from: [g.department], to },
      fixLabel: to ? `Merge into ${to}` : 'Merge into a department',
    })
  }
  return out
}

export function jobConflicts(r: StructureReport, employees: readonly Employee[]): Conflict[] {
  const out: Conflict[] = []
  if (r.swapped)
    out.push({
      id: 'job-levels-swapped',
      kind: 'job-levels-swapped',
      section: 'job',
      severity: 'info',
      pill: 'Columns swapped',
      text: `${swappedText(r.swapped)} Upload Employees again and swap the two columns in the mapping step.`,
      count: 0,
      dataset: 'employees',
      rows: [],
      fix: null,
      fixLabel: null,
    })
  for (const f of r.functionsUnderSeveralFamilies) {
    const rows = f.families.flatMap((s) => s.rows)
    const named = f.families.filter((s) => s.value != null)
    const main = named[0]?.value ?? null
    out.push({
      id: `function-fams:${f.jobFunction}`,
      kind: 'function-several-families',
      section: 'job',
      severity: 'warning',
      pill: 'Several families',
      text: `${f.jobFunction} appears under ${f.families.length} job families: ${listText(
        f.families.map((s) => `${s.value ?? 'no family'} (${people(s.rows.length)})`),
      )}.`,
      count: rows.length,
      dataset: 'employees',
      rows,
      fix: main ? { kind: 'move-function', jobFunction: f.jobFunction, from: null, to: main } : null,
      fixLabel: main ? `Put it all under ${main}` : null,
    })
  }
  const several = new Set(r.functionsUnderSeveralFamilies.map((f) => f.jobFunction))
  const unassigned = r.jobs.filter(
    (e) => e.jobFamily == null && e.jobFunction != null && e.headcount > 0 && !several.has(e.jobFunction),
  )
  if (unassigned.length) {
    const rows = employeesOnly(
      unassigned.flatMap((e) => e.rows),
      employees,
    )
    const first = [...unassigned].sort((a, b) => b.headcount - a.headcount)[0]
    const n = unassigned.length
    out.push({
      id: 'function-no-family',
      kind: 'function-no-family',
      section: 'job',
      severity: 'info',
      pill: 'No family',
      text: `${intText(n)} ${n === 1 ? 'job function has' : 'job functions have'} no job family (${people(rows.length)}).`,
      count: rows.length,
      dataset: 'employees',
      rows,
      fix: { kind: 'move-function', jobFunction: first.jobFunction!, from: null, to: '' },
      fixLabel: 'Assign a family',
    })
  }
  if (r.peopleWithoutFunction.rows.length) {
    const n = r.peopleWithoutFunction.rows.length
    out.push({
      id: 'people-no-function',
      kind: 'people-no-function',
      section: 'job',
      severity: 'warning',
      pill: 'No function',
      text: `${people(n)} ${n === 1 ? 'has' : 'have'} no job function. Fix it in the source system and upload again.`,
      count: n,
      dataset: 'employees',
      rows: r.peopleWithoutFunction.rows,
      fix: null,
      fixLabel: null,
    })
  }
  for (const o of r.levelOutliers) {
    out.push({
      id: `level:${o.jobFunction}:${o.jobTitle}`,
      kind: 'title-level-outlier',
      section: 'job',
      severity: 'info',
      pill: 'Level outside range',
      text: `${o.jobTitle} (${o.jobFunction}) sits at ${o.level}, outside the function’s usual ${o.usual[0]} to ${o.usual[1]}.`,
      count: o.rows.length,
      dataset: 'employees',
      rows: o.rows,
      fix: null,
      fixLabel: null,
    })
  }
  return out
}

/** Conflicts of one kind, counted, for the summary line ("3 departments under several units"). */
export function countByKind(conflicts: readonly Conflict[]): Partial<Record<ConflictKind, number>> {
  const out: Partial<Record<ConflictKind, number>> = {}
  for (const c of conflicts) out[c.kind] = (out[c.kind] ?? 0) + 1
  return out
}

/* ───────────── official parents (Settings > Official lists) ───────────── */

/** The official parent of each department and job function, from lists that are official. */
export interface OfficialParents {
  department: ReadonlyMap<string, string>
  jobFunction: ReadonlyMap<string, string>
}

/**
 * Rows under a parent other than their official one: a department whose people sit under another
 * business unit, a job function under another family. One conflict per place the rows sit, each
 * fixed by moving them under the official parent. Active employees, as everywhere on the tab.
 */
export function officialConflicts(
  r: StructureReport,
  parents: OfficialParents,
  employees: readonly Employee[],
): Conflict[] {
  const out: Conflict[] = []
  for (const e of r.org) {
    if (!e.department || !e.businessUnit || !e.headcount) continue
    const official = parents.department.get(e.department)
    if (!official || official === e.businessUnit) continue
    const rows = employeesOnly(e.rows, employees)
    out.push({
      id: `dept-official:${e.department}:${e.businessUnit}`,
      kind: 'department-official-unit',
      section: 'org',
      severity: 'warning',
      pill: 'Not its official unit',
      text: `${e.department} sits under ${e.businessUnit} for ${people(rows.length)}; its official business unit is ${official}.`,
      count: rows.length,
      dataset: 'employees',
      rows,
      fix: { kind: 'move-department', department: e.department, from: e.businessUnit, to: official },
      fixLabel: `Move to ${official}`,
      direct: true,
    })
  }
  for (const f of r.jobs) {
    if (!f.jobFamily || !f.jobFunction || !f.headcount) continue
    const official = parents.jobFunction.get(f.jobFunction)
    if (!official || official === f.jobFamily) continue
    const rows = employeesOnly(f.rows, employees)
    out.push({
      id: `function-official:${f.jobFunction}:${f.jobFamily}`,
      kind: 'function-official-family',
      section: 'job',
      severity: 'warning',
      pill: 'Not its official family',
      text: `${f.jobFunction} sits under ${f.jobFamily} for ${people(rows.length)}; its official job family is ${official}.`,
      count: rows.length,
      dataset: 'employees',
      rows,
      fix: { kind: 'move-function', jobFunction: f.jobFunction, from: f.jobFamily, to: official },
      fixLabel: `Move to ${official}`,
      direct: true,
    })
  }
  return out.sort((a, b) => b.count - a.count)
}

/**
 * A section's conflicts with the official lists taken into account: where a department or job
 * function has an official parent, "under several units" gives way to the precise conflicts above,
 * which come first.
 */
export function withOfficialParents(
  conflicts: readonly Conflict[],
  official: readonly Conflict[],
  parents: OfficialParents,
  section: Conflict['section'],
): Conflict[] {
  const rest = conflicts.filter((c) => {
    if (c.kind === 'department-several-units')
      return !parents.department.has(c.id.slice('dept-units:'.length))
    if (c.kind === 'function-several-families')
      return !parents.jobFunction.has(c.id.slice('function-fams:'.length))
    return true
  })
  return [...official.filter((c) => c.section === section), ...rest]
}

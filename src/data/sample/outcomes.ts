/**
 * How the sample's hires turned out, read the way Quality of hire reads them at its default
 * settings (docs/ANALYSES.md, 2.2): the first full review on a 0 to 100 scale, whether they stayed
 * a year (regretted exits in the second year count against, a reduction in force has no score),
 * and the weighted mean of the two. The education plant chooses who studied where from these
 * outcomes, so the planted stories hold; its tests measure them the same way. Nothing here is
 * written to a row. Pure.
 */
import { addDays, addMonths, daysBetween } from '@/lib/dates'
import type { Employee, ISODate, JobChange, Level, Review } from '../schema'
import { LEVELS } from '../schema'

/** Hires in the cohort: the 24 months ending 12 months before the as-of date. */
export function cohortWindow(asOf: ISODate): { start: ISODate; end: ISODate } {
  const end = addMonths(asOf, -12)
  return { start: addDays(addMonths(end, -24), 1), end }
}

export type LevelBand = 'L1-L2' | 'L3-L4' | 'L5-L6' | 'M1-E3'

export const bandOf = (level: Level | null): LevelBand | null => {
  if (!level) return null
  const i = LEVELS.indexOf(level)
  return i <= 1 ? 'L1-L2' : i <= 3 ? 'L3-L4' : i <= 5 ? 'L5-L6' : 'M1-E3'
}

export interface HireOutcome {
  e: Employee
  /** First full review, 0 to 100; null when there is none. */
  P: number | null
  /** 100 stayed a year, 0 did not; null for a reduction in force. */
  R: number | null
  /** Quality of hire; null when the hire is not scored. */
  Q: number | null
  /** Left before 12 months. */
  leftEarly: boolean
  levelAtHire: Level | null
  band: LevelBand | null
}

const RIF = 'Reduction in force'

/** Level on a date from the job history: the `from` of the first level change after it, else today's. */
function levelAtFn(changes: readonly JobChange[]): (e: Employee, d: ISODate) => Level | null {
  const steps = new Map<string, { date: ISODate; from: Level | null }[]>()
  for (const c of changes)
    if (c.toLevel && c.fromLevel !== undefined && c.fromLevel !== c.toLevel) {
      const arr = steps.get(c.employeeId) ?? []
      arr.push({ date: c.effectiveDate, from: c.fromLevel ?? null })
      steps.set(c.employeeId, arr)
    }
  for (const arr of steps.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
  return (e, d) => {
    for (const s of steps.get(e.employeeId) ?? []) if (s.date > d) return s.from
    return e.level
  }
}

/** Every cohort hire (employees only) with their outcome at the default settings. */
export function hireOutcomes(
  employees: readonly Employee[],
  reviews: readonly Review[],
  jobChanges: readonly JobChange[],
  asOf: ISODate,
): HireOutcome[] {
  const { start, end } = cohortWindow(asOf)
  const byPerson = new Map<string, Review[]>()
  for (const r of reviews) {
    const arr = byPerson.get(r.employeeId) ?? []
    arr.push(r)
    byPerson.set(r.employeeId, arr)
  }
  const levelAt = levelAtFn(jobChanges)
  const out: HireOutcome[] = []
  for (const e of employees) {
    if (e.employmentType !== 'Employee' || e.hireDate < start || e.hireDate > end) continue
    const within = addMonths(e.hireDate, 24)
    const first = (byPerson.get(e.employeeId) ?? [])
      .filter((r) => r.rating != null && daysBetween(e.hireDate, r.cycleDate) >= 180 && r.cycleDate <= within)
      .sort((a, b) => a.cycleDate.localeCompare(b.cycleDate))[0]
    const P = first ? ((first.rating - 1) / 4) * 100 : null
    const at12 = addMonths(e.hireDate, 12)
    const leftEarly = !!e.terminationDate && e.terminationDate <= at12
    let R: number | null = leftEarly ? 0 : 100
    // A regretted exit in the second year counts against (default on).
    if (
      !leftEarly &&
      e.terminationDate &&
      e.regrettable &&
      e.terminationDate <= within &&
      e.terminationDate <= asOf
    )
      R = 0
    if (e.terminationReason === RIF) R = null
    let Q: number | null
    if (P != null && R != null) Q = (P + R) / 2
    else if (P == null && leftEarly && R != null) Q = 0
    else if (P != null) Q = P
    else Q = null
    const levelAtHire = levelAt(e, e.hireDate)
    out.push({ e, P, R, Q, leftEarly, levelAtHire, band: bandOf(levelAtHire) })
  }
  return out
}

const mean = (xs: readonly number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null

export interface GroupScore {
  n: number
  Q: number | null
  P: number | null
  R: number | null
  sd: number
  low: number | null
  high: number | null
}

/** A group's mean scores and its 90% interval of quality of hire. */
export function groupScore(group: readonly HireOutcome[], z = 1.645): GroupScore {
  const scored = group.filter((h) => h.Q != null)
  const qs = scored.map((h) => h.Q as number)
  const Q = mean(qs)
  const sd =
    Q == null || qs.length < 2 ? 0 : Math.sqrt(qs.reduce((a, q) => a + (q - Q) ** 2, 0) / (qs.length - 1))
  const half = qs.length ? (z * sd) / Math.sqrt(qs.length) : 0
  return {
    n: scored.length,
    Q,
    P: mean(scored.filter((h) => h.P != null).map((h) => h.P as number)),
    R: mean(scored.filter((h) => h.R != null).map((h) => h.R as number)),
    sd,
    low: Q == null ? null : Q - half,
    high: Q == null ? null : Q + half,
  }
}

/**
 * The expected quality of hire of a group from its site and level mix: the company mean in each
 * member's site and level band cell, else its site, else the company (cells of 10 or more).
 */
export function expectedScore(
  group: readonly HireOutcome[],
  company: readonly HireOutcome[],
  minCell = 10,
): number | null {
  const scored = company.filter((h) => h.Q != null)
  const cells = new Map<string, number[]>()
  const add = (k: string, q: number) => {
    const arr = cells.get(k) ?? []
    arr.push(q)
    cells.set(k, arr)
  }
  for (const h of scored) {
    add(`${h.e.location}|${h.band}`, h.Q as number)
    add(h.e.location, h.Q as number)
    add('', h.Q as number)
  }
  const cellMean = (k: string) => {
    const arr = cells.get(k)
    return arr && arr.length >= minCell ? (mean(arr) as number) : null
  }
  const xs = group
    .filter((h) => h.Q != null)
    .map((h) => cellMean(`${h.e.location}|${h.band}`) ?? cellMean(h.e.location) ?? (cellMean('') as number))
  return mean(xs)
}

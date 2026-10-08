/**
 * The quality of hire cohort and each hire's two parts (docs/ANALYSES.md, 2.2): the first full
 * review on a 0 to 100 scale, whether they stayed a year, and the weighted mean of the two. A
 * hire's score exists only inside the engine, to average over groups: nothing here is shown,
 * drilled or exported per person (the drills list the inputs, never the score). Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { readUniversity, universityNames } from '@/data/lists/universities'
import {
  DEGREE_LEVELS,
  type DegreeLevel,
  type Employee,
  type ISODate,
  LEVELS,
  type Level,
  type Review,
} from '@/data/schema'
import { addDays, addMonths, daysBetween, monthEnd } from '@/lib/dates'
import { isEmployee } from '@/lib/people'
import { buildHistory, type History } from '@/views/hrbp/engine/base'
import { regrettedBy } from '@/views/hrbp/engine/population'
import { settingsOf } from '@/views/hrbp/engine/settings'
import type { App } from '@/views/recruiting/engine/types'
import { normRating } from '@/views/talent/engine/base'
import type { QualitySettings } from './settings'
import { hiredApplications } from './source'

export const RIF = 'Reduction in force'

export type LevelBand = 'L1-L2' | 'L3-L4' | 'L5-L6' | 'M1-E3'
export const LEVEL_BANDS: readonly LevelBand[] = ['L1-L2', 'L3-L4', 'L5-L6', 'M1-E3']

export const bandOf = (level: Level | null): LevelBand | null => {
  if (!level) return null
  const i = LEVELS.indexOf(level)
  return i < 0 ? null : i <= 1 ? 'L1-L2' : i <= 3 ? 'L3-L4' : i <= 5 ? 'L5-L6' : 'M1-E3'
}

/** How the 12-month outcome reads. */
export type Outcome =
  /** Still employed at the retention mark. */
  | 'stayed'
  /** Left before the retention mark. */
  | 'left'
  /** Stayed past the mark, then a regretted exit in the year after it. */
  | 'secondYear'
  /** Left in a reduction in force: no retention score. */
  | 'rif'
  /** No termination dates anywhere in Employees: unknown, never "stayed". */
  | 'unknown'

export interface Hire {
  e: Employee
  /** The first full review used, or null. */
  review: Review | null
  /** The Reviews data starts after this hire's first eligible cycle: the earliest review on record is used. */
  earliestOnRecord: boolean
  /** The rating that review gave, 1 to 5. */
  rating: number | null
  /** First review score, 0 to 100. */
  P: number | null
  /** Retention score: 100 stayed, 0 did not, null for none. */
  R: 0 | 100 | null
  outcome: Outcome
  /** Quality of hire, for group means only; null when not scored. */
  Q: number | null
  /** Left before the retention mark with no first full review: scored 0 on retention alone. */
  leftBeforeReview: boolean
  levelAtHire: Level | null
  band: LevelBand | null
  /** Today's location (Census keeps no location history). */
  site: string
  university: string | null
  degree: DegreeLevel | null
  field: string | null
  /** University or degree level recorded. */
  recorded: boolean
  /** The hired application this hire came from, when the candidate data has it. */
  app: App | null
}

/** What the data holds, company-wide (a filter never changes it). */
export interface Coverage {
  reviews: boolean
  /** Some row has a termination date: without leavers retention is unknown. */
  exitData: boolean
  university: boolean
  degree: boolean
  field: boolean
  candidates: boolean
  jobChanges: boolean
  /** The earliest review cycle on record. */
  firstCycle: ISODate | null
  /** The earliest application date in the candidate data. */
  candidatesSince: ISODate | null
}

/** The hire window: the `cohortMonths` months ending `retentionMonths` before the as-of date. */
export function cohortWindow(
  asOf: ISODate,
  s: Pick<QualitySettings, 'cohortMonths' | 'retentionMonths'>,
): { start: ISODate; end: ISODate } {
  // Month ends stay month ends: 30 Sep less 6 months is 31 Mar.
  const back = (d: ISODate, months: number) =>
    monthEnd(d) === d ? monthEnd(addMonths(d, -months)) : addMonths(d, -months)
  const end = back(asOf, s.retentionMonths)
  return { start: addDays(back(end, s.cohortMonths), 1), end }
}

const isDegree = (v: unknown): v is DegreeLevel =>
  typeof v === 'string' && (DEGREE_LEVELS as readonly string[]).includes(v)

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t || null
}

/** The scorer of a rating: position on the scale, or percentile among everyone rated in its cycle. */
function scorer(
  reviews: readonly Review[],
  scoring: QualitySettings['scoring'],
): (r: Review) => number | null {
  if (scoring === 'scale')
    return (r) => {
      const v = normRating(r.rating)
      return v == null ? null : ((v - 1) / 4) * 100
    }
  const counts = new Map<string, number[]>()
  for (const r of reviews) {
    const v = normRating(r.rating)
    if (v == null) continue
    const k = `${r.cycle}|${r.cycleDate}`
    let c = counts.get(k)
    if (!c) {
      c = [0, 0, 0, 0, 0, 0]
      counts.set(k, c)
    }
    c[v]++
  }
  return (r) => {
    const v = normRating(r.rating)
    const c = counts.get(`${r.cycle}|${r.cycleDate}`)
    if (v == null || !c) return null
    let below = 0
    let total = 0
    for (let i = 1; i <= 5; i++) {
      total += c[i]
      if (i < v) below += c[i]
    }
    return total ? (100 * (below + c[v] / 2)) / total : null
  }
}

export interface CohortInputs {
  s: QualitySettings
  history: History
  coverage: Coverage
  /** Reviews by employee, earliest cycle first. */
  reviewsOf: (id: string) => readonly Review[]
  score: (r: Review) => number | null
  isRegretted: (e: Employee) => boolean
  universities: ReadonlyMap<string, string>
  apps: ReadonlyMap<string, App>
  window: { start: ISODate; end: ISODate }
  asOf: ISODate
}

/** Everything the cohort is built from, once per context. */
export function cohortInputs(ctx: AnalyticsContext, s: QualitySettings): CohortInputs {
  const all = ctx.all
  const byPerson = new Map<string, Review[]>()
  let firstCycle: ISODate | null = null
  for (const r of all.reviews) {
    if (!r.cycleDate) continue
    if (!firstCycle || r.cycleDate < firstCycle) firstCycle = r.cycleDate
    const arr = byPerson.get(r.employeeId)
    if (arr) arr.push(r)
    else byPerson.set(r.employeeId, [r])
  }
  for (const arr of byPerson.values())
    arr.sort((a, b) => (a.cycleDate < b.cycleDate ? -1 : a.cycleDate > b.cycleDate ? 1 : 0))
  let candidatesSince: ISODate | null = null
  for (const c of all.candidates)
    if (c.appliedDate && (!candidatesSince || c.appliedDate < candidatesSince))
      candidatesSince = c.appliedDate
  const coverage: Coverage = {
    reviews: all.reviews.length > 0,
    exitData: all.employees.some((e) => !!e.terminationDate),
    university: all.employees.some((e) => !!text(e.university)),
    degree: all.employees.some((e) => isDegree(e.degreeLevel)),
    field: all.employees.some((e) => !!text(e.fieldOfStudy)),
    candidates: all.candidates.length > 0,
    jobChanges: all.jobChanges.length > 0,
    firstCycle,
    candidatesSince,
  }
  const none: readonly Review[] = []
  return {
    s,
    history: buildHistory(all.jobChanges),
    coverage,
    reviewsOf: (id) => byPerson.get(id) ?? none,
    score: scorer(all.reviews, s.scoring),
    // The regretted rule in force on People stats (`hrbp.attrition.regretted`).
    isRegretted: regrettedBy(settingsOf(ctx.metrics).regretted),
    universities: universityNames(ctx.universities),
    apps: coverage.candidates ? hiredApplications(ctx) : new Map(),
    window: cohortWindow(ctx.asOf, s),
    asOf: ctx.asOf,
  }
}

/** One cohort hire with their outcome, or null when the row is not a cohort hire. */
export function hireOf(e: Employee, x: CohortInputs): Hire | null {
  if (!isEmployee(e) || !e.hireDate || e.hireDate < x.window.start || e.hireDate > x.window.end) return null
  const { s, coverage, asOf } = x
  // First full review: the earliest at least `firstReviewMinDays` after hire and within the window.
  const within = addMonths(e.hireDate, s.firstReviewWithinMonths)
  let review: Review | null = null
  let P: number | null = null
  for (const r of x.reviewsOf(e.employeeId)) {
    if (r.cycleDate > within || r.cycleDate > asOf) break
    if (daysBetween(e.hireDate, r.cycleDate) < s.firstReviewMinDays) continue
    const p = x.score(r)
    if (p == null) continue
    review = r
    P = p
    break
  }
  const earliestOnRecord =
    !!review && !!coverage.firstCycle && addDays(e.hireDate, s.firstReviewMinDays) < coverage.firstCycle

  // The 12-month outcome.
  const term = e.terminationDate && e.terminationDate <= asOf ? e.terminationDate : null
  const mark = addMonths(e.hireDate, s.retentionMonths)
  const leftEarly = !!term && term <= mark
  let outcome: Outcome
  let R: 0 | 100 | null
  if (!coverage.exitData) {
    outcome = 'unknown'
    R = null
  } else if (term && s.rifExcluded && e.terminationReason === RIF) {
    outcome = 'rif'
    R = null
  } else if (leftEarly) {
    outcome = 'left'
    R = 0
  } else if (
    term &&
    s.regrettedSecondYear &&
    term <= addMonths(e.hireDate, s.retentionMonths + 12) &&
    x.isRegretted(e)
  ) {
    outcome = 'secondYear'
    R = 0
  } else {
    outcome = 'stayed'
    R = 100
  }

  // Quality of hire: the weighted mean, retention alone for an early leaver with no first review,
  // the first review alone for a reduction in force. Null without Reviews or without leavers.
  const leftBeforeReview = P == null && outcome === 'left'
  let Q: number | null = null
  if (coverage.reviews && coverage.exitData) {
    if (P != null && R != null) Q = (s.wP * P + s.wR * R) / (s.wP + s.wR)
    else if (leftBeforeReview) Q = 0
    else if (P != null) Q = P
  }

  const levelAtHire = x.history.levelAt(e, e.hireDate)
  const university = readUniversity(e.university, x.universities)
  const degree = isDegree(e.degreeLevel) ? e.degreeLevel : null
  return {
    e,
    review,
    earliestOnRecord,
    rating: review ? normRating(review.rating) : null,
    P,
    R,
    outcome,
    Q,
    leftBeforeReview,
    levelAtHire,
    band: bandOf(levelAtHire),
    site: e.location,
    university,
    degree,
    field: text(e.fieldOfStudy),
    recorded: !!university || !!degree,
    app: x.apps.get(e.employeeId) ?? null,
  }
}

/** The cohort hires among `employees`, by hire date then name. */
export function cohortOf(employees: readonly Employee[], x: CohortInputs): Hire[] {
  const out: Hire[] = []
  for (const e of employees) {
    const h = hireOf(e, x)
    if (h) out.push(h)
  }
  return out.sort(byHireDate)
}

export const byHireDate = (a: Hire, b: Hire): number =>
  a.e.hireDate < b.e.hireDate
    ? -1
    : a.e.hireDate > b.e.hireDate
      ? 1
      : a.e.name.localeCompare(b.e.name) || a.e.employeeId.localeCompare(b.e.employeeId)

/** The hire's mix cells, finest first: site and level band at hire, then site, then the company. */
export const cellsOf = (h: Hire): readonly string[] => [`${h.site}|${h.band ?? ''}`, h.site, '']

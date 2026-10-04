/**
 * Flight risk: an explainable points model that replaces the old weighted formula.
 *
 * 1. Signals. Each factor is computed at a scoring date d from data on or before d and gives a
 *    plain reason and a strength from 0 to 1 (most factors are simply present or not).
 * 2. Points. Each factor's points come from evidence gathered strictly before the date the points
 *    are used: everyone active at each of the 12 month-ends 12 to 23 months back is checked
 *    for each factor, and we see who left by choice in the 12 months after each month-end.
 *    A factor earns points in proportion to the log of how much it raised the exit rate (its
 *    lift), shrunk toward no effect when few people have it. Factors that did not raise the exit
 *    rate get 0 points; factors whose data does not reach back far enough keep their default
 *    points. Points are rounded to 5 and add up to 100. With too little history (fewer than 20
 *    leavers or 100 people) the default points are used instead.
 * 3. Score = sum of strength × points, 0 to 100. Bands are relative to everyone scored: the high
 *    band is about the top 10% of scores and the medium band the next 25% (both are settings of
 *    the risk bands metric). People with the same score always share a band, so each cut sits
 *    where the band's share comes closest to its target, and the actual shares are reported.
 *
 * Back-test (out of time): everyone active 12 months before the as-of date is scored with points
 * learned only from month-ends whose 12-month outcome had ended by then (24 to 35 months back),
 * and their exits over the following 12 months are counted per band. No outcome after the scoring
 * date is used to set the points it is judged on.
 *
 * Pure: no React, no DOM. Scores the whole company so a band means the same thing in every scope.
 */
import {
  type CompRecord,
  type Employee,
  type ISODate,
  type JobChange,
  type Level,
  MIN_GROUP,
} from '@/data/schema'
import type { Window } from '@/data/scope'
import { addDays, addMonths, formatDate, monthEnd, ms } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { inWindow, isActiveAt, isEmployee, type ReviewIndex, snapshotDates, tenureYears } from '@/lib/people'
import { median } from '@/lib/stats'
import { type FieldCoverage, normRating, reviewPair, trailing12, trailingMonths } from './base'
import { DEFAULTS, highRatingText } from './settings'

export type RiskBand = 'High' | 'Medium' | 'Low'
export const RISK_BANDS: readonly RiskBand[] = ['Low', 'Medium', 'High']

export type FactorKey =
  | 'promotionGap'
  | 'highNoPromo'
  | 'deptAttrition'
  | 'siteAttrition'
  | 'peersLeft'
  | 'tenurePeak'
  | 'ratingDrop'
  | 'lowCompa'
  | 'newManager'

export interface FactorDef {
  key: FactorKey
  label: string
  /** Points used when there is too little history to learn from (they add up to 100). */
  defaultPoints: number
  /** Plain definition for the datasheet. */
  text: string
}

export const FACTORS: readonly FactorDef[] = [
  {
    key: 'promotionGap',
    label: 'Long wait for promotion',
    defaultPoints: 15,
    text: 'Months since the last promotion (or hire) are at or above the typical time at that level. Half strength at the typical time, full strength at twice it. Executives are not scored.',
  },
  {
    key: 'highNoPromo',
    label: 'High rating, no recent promotion',
    defaultPoints: 12,
    text: 'Latest rating of 4 or 5 and no promotion in the last 36 months.',
  },
  {
    key: 'deptAttrition',
    label: 'High department attrition',
    defaultPoints: 12,
    text: 'Voluntary attrition in the department over the last 12 months is more than 2 pts above the company, measured as on People stats (its population and annualizing settings). Strength grows with the gap and is full at 10 pts. Departments with an average headcount under 10 are not compared.',
  },
  {
    key: 'siteAttrition',
    label: 'High location attrition',
    defaultPoints: 10,
    text: 'Voluntary attrition at the work location over the last 12 months is more than 2 pts above the company, measured the same way as for departments.',
  },
  {
    key: 'peersLeft',
    label: 'Teammates leaving',
    defaultPoints: 12,
    text: 'At least 40% of the people under the same manager left in the last 12 months (at least 2 people, teams of 3 or more).',
  },
  {
    key: 'tenurePeak',
    label: 'Tenure of 1-3 years',
    defaultPoints: 10,
    text: 'Between 1 and 3 years at the company.',
  },
  {
    key: 'ratingDrop',
    label: 'Rating dropped',
    defaultPoints: 10,
    text: 'The latest rating is lower than the one before it.',
  },
  {
    key: 'lowCompa',
    label: 'Pay below range',
    defaultPoints: 10,
    text: 'Compa-ratio (base ÷ range midpoint) below 0.90. Pay history is not kept, so this factor cannot be back-tested; it keeps a fixed 10 points and applies to today’s score only, when compensation data is loaded.',
  },
  {
    key: 'newManager',
    label: 'New manager',
    defaultPoints: 9,
    text: 'The manager changed in the last 6 months.',
  },
]
export const factorDef = new Map(FACTORS.map((f) => [f.key, f]))

/** A factor's definition for the datasheet, worded for the high performer rating in force. */
export function factorText(key: FactorKey, highRating: number = DEFAULTS.highRating): string {
  if (key === 'highNoPromo')
    return `Latest rating of ${highRatingText(highRating)} and no promotion in the last 36 months.`
  return factorDef.get(key)?.text ?? ''
}
const FACTOR_ORDER = new Map(FACTORS.map((f, i) => [f.key, i]))

/** Fixed points for the factor that cannot be back-tested. */
const COMPA_POINTS = 10
/**
 * Pseudo-observations at the base exit rate added to each factor, so factors few people have
 * shrink toward no effect. Counted in person-months (one person at one month-end).
 */
const SHRINK = 80
/** Lift is capped so one factor can't take every point. */
const MAX_LIFT = 4
const MIN_LEARN_PEOPLE = 100
const MIN_LEARN_LEAVERS = 20
/** Points are rounded to this step. */
const POINT_STEP = 5
/** Month-ends (months before the date the points are used) whose exits teach the points. */
export const LEARN_OFFSETS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const
/** Attrition-based factors need at least this many months of exit history before the date. */
const MIN_HISTORY_MONTHS = 6
/**
 * Target shares of everyone scored: in the high band, and in the medium band below it. The
 * engines read them from the risk bands metric; these are its defaults.
 */
export interface BandShares {
  high: number
  medium: number
}
export const DEFAULT_BAND_SHARES: BandShares = { high: DEFAULTS.highBand, medium: DEFAULTS.mediumBand }
/** The default targets: the high band, and the high and medium bands together. */
export const HIGH_TARGET = DEFAULT_BAND_SHARES.high
export const MEDIUM_TARGET = DEFAULT_BAND_SHARES.high + DEFAULT_BAND_SHARES.medium

/**
 * How voluntary attrition is measured for the department and location factors: the People stats
 * settings, so the rates quoted here are the ones People stats shows.
 */
export interface RateSettings {
  /** Contractors count in the rate (People stats "Count contractors in headcount"). */
  contractors: boolean
  /** Rates are scaled by 12 ÷ window months (People stats "Annualize turnover rates"). */
  annualize: boolean
}
export const DEFAULT_RATE_SETTINGS: RateSettings = { contractors: false, annualize: true }

/** What the model reads from the metric dictionary. */
export interface RiskSettings {
  bands: BandShares
  /** The lowest rating that counts as high (the "high rating, no recent promotion" factor). */
  highRating: number
  /** The anonymity minimum: back-test exit rates over fewer people are hidden. */
  minGroup: number
  /** How the attrition factors measure voluntary attrition (People stats settings). */
  rates?: RateSettings
}
export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  bands: DEFAULT_BAND_SHARES,
  highRating: DEFAULTS.highRating,
  minGroup: MIN_GROUP,
  rates: DEFAULT_RATE_SETTINGS,
}

/** A stable key of the settings, for caching a model per set of values. */
export const riskSettingsKey = (s: RiskSettings): string => {
  const r = s.rates ?? DEFAULT_RATE_SETTINGS
  return `${s.bands.high}|${s.bands.medium}|${s.highRating}|${s.minGroup}|${r.contractors}|${r.annualize}`
}

export interface Signal {
  key: FactorKey
  /** 0 to 1. */
  strength: number
  reason: string
}

export interface PersonSignals {
  employeeId: string
  signals: Signal[]
}

export interface SignalSet {
  date: ISODate
  people: PersonSignals[]
  /** Factors switched off because the data lacks what they need (at this date). */
  off: { key: FactorKey; why: string }[]
  companyVoluntary: number | null
  levelNorms: Map<string, { months: number; n: number; fallback: boolean }>
}

export interface RiskInput {
  employees: readonly Employee[]
  jobs: Map<string, JobChange[]>
  reviews: ReviewIndex
  comp: readonly CompRecord[]
  has: FieldCoverage
}

export interface SignalOptions {
  /** Add the pay factor (today's score only: pay history is not kept). */
  useComp: boolean
  /**
   * First exit date in the data. Leavers before it are not in the file, so attrition-based
   * factors only count exits from this date on, and switch off with less than 6 months of them.
   */
  historyStart?: ISODate | null
  /** Write the plain reasons (default true); learning dates don't need them. */
  reasons?: boolean
  /** The lowest rating that counts as high (default 4). */
  highRating?: number
  /** How voluntary attrition is measured (default: employees only, annualized). */
  rates?: RateSettings
}

const DAY = 86_400_000
const monthsBetween = (a: ISODate, b: ISODate) => (ms(b) - ms(a)) / DAY / 30.436875

/** Typical months in a level before promotion, used when the data has fewer than 5 examples. */
const DEFAULT_NORM: Partial<Record<Level, number>> = {
  L1: 18,
  L2: 24,
  L3: 30,
  L4: 36,
  L5: 42,
  L6: 48,
  M1: 36,
  M2: 48,
}

const isExecutive = (l: Level | null | undefined) => !!l && l.startsWith('E')

/** Level, department and manager at d, read back from the job history (current values when nothing changed since). */
export function stateAt(
  e: Employee,
  jobs: Map<string, JobChange[]>,
  d: ISODate,
): { level: Level | null; department: string; managerId: string | null } {
  let level: Level | null = e.level
  let department = e.department
  let managerId = e.managerId ?? null
  const arr = jobs.get(e.employeeId)
  if (!arr) return { level, department, managerId }
  let levelSet = false
  let deptSet = false
  let mgrSet = false
  for (const j of arr) {
    if (j.effectiveDate <= d) continue
    if (!levelSet && j.fromLevel) {
      level = j.fromLevel
      levelSet = true
    }
    if (!deptSet && j.fromDepartment) {
      department = j.fromDepartment
      deptSet = true
    }
    if (!mgrSet && j.fromManagerId) {
      managerId = j.fromManagerId
      mgrSet = true
    }
    if (levelSet && deptSet && mgrSet) break
  }
  return { level, department, managerId }
}

function lastPromotionAt(arr: JobChange[] | undefined, d: ISODate): ISODate | null {
  if (!arr) return null
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].changeType === 'Promotion' && arr[i].effectiveDate <= d) return arr[i].effectiveDate
  }
  return null
}

function managerChangeSince(arr: JobChange[] | undefined, from: ISODate, to: ISODate): ISODate | null {
  if (!arr) return null
  for (let i = arr.length - 1; i >= 0; i--) {
    const j = arr[i]
    if (j.effectiveDate > to) continue
    if (j.effectiveDate < from) break
    if (j.toManagerId && j.toManagerId !== j.fromManagerId) return j.effectiveDate
  }
  return null
}

/** Median months between promotions (or hire and first promotion) per starting level, from events on or before d. */
export function levelNorms(
  employees: readonly Employee[],
  jobs: Map<string, JobChange[]>,
  d: ISODate,
): Map<string, { months: number; n: number; fallback: boolean }> {
  const gaps = new Map<string, number[]>()
  for (const e of employees) {
    const arr = jobs.get(e.employeeId)
    if (!arr) continue
    let prev = e.hireDate
    for (const j of arr) {
      if (j.effectiveDate > d) break
      if (j.changeType !== 'Promotion') continue
      if (j.fromLevel && prev) {
        const g = gaps.get(j.fromLevel) ?? []
        g.push(monthsBetween(prev, j.effectiveDate))
        gaps.set(j.fromLevel, g)
      }
      prev = j.effectiveDate
    }
  }
  const out = new Map<string, { months: number; n: number; fallback: boolean }>()
  for (const [level, fallback] of Object.entries(DEFAULT_NORM)) {
    const g = gaps.get(level) ?? []
    const m = g.length >= 5 ? median(g) : null
    out.set(
      level,
      m != null && m > 0
        ? { months: m, n: g.length, fallback: false }
        : { months: fallback, n: g.length, fallback: true },
    )
  }
  return out
}

/** Index of the first date in sorted `pts` on or after d. */
function firstAtOrAfter(pts: readonly ISODate[], d: ISODate): number {
  let lo = 0
  let hi = pts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid] < d) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Voluntary attrition over w for the company and per department and per location (groups with an
 * average headcount of at least 10). Same definition as `attrition(group, w, 'voluntary')`, with
 * the People stats settings for who counts and whether rates are annualized, computed in one pass
 * because the model needs it at many dates.
 */
export function voluntaryRates(
  employees: readonly Employee[],
  w: Window,
  rates: RateSettings = DEFAULT_RATE_SETTINGS,
): { company: number | null; department: Map<string, number>; location: Map<string, number> } {
  const counts = (e: Employee) => isEmployee(e) || (rates.contractors && e.employmentType === 'Contractor')
  const pts = snapshotDates(w)
  type Tally = { hc: number; exits: number; typed: number; voluntary: number }
  const tally = (): Tally => ({ hc: 0, exits: 0, typed: 0, voluntary: 0 })
  const company = tally()
  const byDept = new Map<string, Tally>()
  const bySite = new Map<string, Tally>()
  const get = (m: Map<string, Tally>, k: string) => {
    let t = m.get(k)
    if (!t) {
      t = tally()
      m.set(k, t)
    }
    return t
  }
  for (const e of employees) {
    if (!counts(e)) continue
    // Snapshots on which the person is active (hireDate <= d < terminationDate); pts are sorted.
    const hc = e.hireDate
      ? Math.max(
          0,
          (e.terminationDate ? firstAtOrAfter(pts, e.terminationDate) : pts.length) -
            firstAtOrAfter(pts, e.hireDate),
        )
      : 0
    const exit = inWindow(e.terminationDate, w)
    for (const t of [company, get(byDept, e.department), get(bySite, e.location)]) {
      t.hc += hc
      if (!exit) continue
      t.exits++
      if (e.terminationType) t.typed++
      if (e.terminationType === 'Voluntary') t.voluntary++
    }
  }
  const rateOf = (t: Tally, minHeadcount: number) => {
    const avg = pts.length ? t.hc / pts.length : 0
    if (avg <= 0 || avg < minHeadcount || (t.exits > 0 && t.typed === 0)) return null
    return rates.annualize ? (t.voluntary / avg) * (12 / w.months) : t.voluntary / avg
  }
  const groups = (m: Map<string, Tally>) => {
    const out = new Map<string, number>()
    for (const [k, t] of m) {
      const r = rateOf(t, 10)
      if (r != null) out.set(k, r)
    }
    return out
  }
  return { company: rateOf(company, 0), department: groups(byDept), location: groups(bySite) }
}

const excessStrength = (excess: number) => Math.min(1, Math.max(0.2, (excess * 100) / 10))

/** The first exit date in the data, or null when nobody has left. */
export function exitHistoryStart(employees: readonly Employee[]): ISODate | null {
  let first: ISODate | null = null
  for (const e of employees) {
    if (e.terminationDate && (!first || e.terminationDate < first)) first = e.terminationDate
  }
  return first
}

/** Factor signals for every employee active at d. */
export function signalsAt(input: RiskInput, d: ISODate, opts: SignalOptions): SignalSet {
  const { employees, jobs, reviews, has } = input
  const off: { key: FactorKey; why: string }[] = []
  const turnOff = (key: FactorKey, why: string) => {
    if (!off.some((o) => o.key === key)) off.push({ key, why })
  }
  if (!has.jobChanges) {
    for (const k of ['promotionGap', 'highNoPromo', 'newManager'] as const)
      turnOff(k, 'Job changes are not loaded')
  }
  if (!has.reviews) {
    turnOff('ratingDrop', 'Reviews are not loaded')
    turnOff('highNoPromo', 'Reviews are not loaded')
  } else {
    const closed = reviews.cycles.filter((c) => c.cycleDate <= d).length
    if (closed === 0) {
      turnOff('ratingDrop', `No review cycle had closed by ${formatDate(d)}`)
      turnOff('highNoPromo', `No review cycle had closed by ${formatDate(d)}`)
    } else if (closed === 1) {
      turnOff('ratingDrop', `Only one review cycle had closed by ${formatDate(d)}`)
    }
  }
  if (!has.terminationType) {
    turnOff('deptAttrition', 'Termination type is missing')
    turnOff('siteAttrition', 'Termination type is missing')
  }
  // Exits before the first one in the file are missing, so trailing windows start no earlier.
  const w12 = trailing12(d)
  const clipped = !!opts.historyStart && opts.historyStart > w12.start
  const w: Window = clipped
    ? {
        start: opts.historyStart!,
        end: d,
        months: monthsBetween(opts.historyStart!, d),
        label: `${formatDate(opts.historyStart)} – ${formatDate(d)}`,
      }
    : w12
  if (clipped && w.months < MIN_HISTORY_MONTHS) {
    const why = `Less than ${MIN_HISTORY_MONTHS} months of exits before ${formatDate(d)}`
    turnOff('deptAttrition', why)
    turnOff('siteAttrition', why)
    turnOff('peersLeft', why)
  }
  if (!opts.useComp) turnOff('lowCompa', 'Pay history is not available for past dates')
  else if (!has.comp) turnOff('lowCompa', 'Compensation is not loaded')
  const isOff = new Set(off.map((o) => o.key))
  const highRating = opts.highRating ?? DEFAULTS.highRating
  const sinceText = clipped ? `since ${formatDate(w.start)}` : 'in the last 12 months'
  /** Reasons are only written for scores people read; learning dates skip the text. */
  const why = (text: () => string) => (opts.reasons === false ? '' : text())

  const population = employees.filter((e) => isEmployee(e) && isActiveAt(e, d))
  const norms = levelNorms(employees, jobs, d)
  const newMgrFrom = trailingMonths(d, 6).start
  const threeYearsAgo = addMonths(d, -36)

  const rates =
    has.terminationType && !isOff.has('deptAttrition') ? voluntaryRates(employees, w, opts.rates) : null
  const company = rates?.company ?? null
  const deptRate = rates?.department ?? new Map<string, number>()
  const siteRate = rates?.location ?? new Map<string, number>()
  /** One shared signal per department or location more than 2 pts above the company. */
  const groupSignals = (key: 'deptAttrition' | 'siteAttrition', rates: Map<string, number>) => {
    const out = new Map<string, Signal>()
    if (company == null || isOff.has(key)) return out
    for (const [group, r] of rates) {
      if (r - company <= 0.02) continue
      out.set(group, {
        key,
        strength: excessStrength(r - company),
        reason: `Voluntary attrition in ${group} is ${fmt(r, 'pct')}, vs ${fmt(company, 'pct')} company-wide`,
      })
    }
    return out
  }
  const deptSignal = groupSignals('deptAttrition', deptRate)
  const siteSignal = groupSignals('siteAttrition', siteRate)

  // Teams at d (manager read back from history) and leavers in the trailing window by last manager.
  const states = new Map<string, ReturnType<typeof stateAt>>()
  const teamSize = new Map<string, number>()
  for (const e of population) {
    const s = stateAt(e, jobs, d)
    states.set(e.employeeId, s)
    if (s.managerId) teamSize.set(s.managerId, (teamSize.get(s.managerId) ?? 0) + 1)
  }
  const leftUnder = new Map<string, number>()
  if (!isOff.has('peersLeft')) {
    for (const e of employees) {
      if (!isEmployee(e) || !e.terminationDate || !e.managerId) continue
      if (e.terminationDate < w.start || e.terminationDate > w.end) continue
      leftUnder.set(e.managerId, (leftUnder.get(e.managerId) ?? 0) + 1)
    }
  }

  const compa = new Map<string, number>()
  if (!isOff.has('lowCompa')) {
    for (const c of input.comp) {
      if (c.rangeMid > 0 && Number.isFinite(c.baseSalary)) compa.set(c.employeeId, c.baseSalary / c.rangeMid)
    }
  }

  const people: PersonSignals[] = []
  for (const e of population) {
    const id = e.employeeId
    const signals: Signal[] = []
    const arr = jobs.get(id)
    const state = states.get(id) ?? stateAt(e, jobs, d)
    const level = state.level
    const promo = lastPromotionAt(arr, d)
    const since = promo ?? e.hireDate
    const { latest, previous } = has.reviews
      ? reviewPair({ reviews }, id, d)
      : { latest: null, previous: null }
    const rating = normRating(latest?.rating)

    if (!isOff.has('promotionGap') && level && !isExecutive(level)) {
      const norm = norms.get(level)
      const months = monthsBetween(since, d)
      if (norm && months >= norm.months) {
        signals.push({
          key: 'promotionGap',
          strength: Math.min(1, 0.5 + 0.5 * (months / norm.months - 1)),
          reason: why(
            () =>
              `${Math.round(months)} months since ${promo ? 'last promotion' : 'joining'}; typical at ${level} is ${Math.round(norm.months)}`,
          ),
        })
      }
    }
    if (
      !isOff.has('highNoPromo') &&
      rating != null &&
      rating >= highRating &&
      since <= threeYearsAgo &&
      !isExecutive(level)
    ) {
      signals.push({
        key: 'highNoPromo',
        strength: 1,
        reason: why(() =>
          promo
            ? `Rated ${rating}, last promoted ${formatDate(promo)}`
            : `Rated ${rating}, not promoted since joining in ${e.hireDate.slice(0, 4)}`,
        ),
      })
    }
    const ds = deptSignal.get(state.department)
    if (ds) signals.push(ds)
    const ss = siteSignal.get(e.location)
    if (ss) signals.push(ss)
    if (!isOff.has('peersLeft') && state.managerId) {
      const left = leftUnder.get(state.managerId) ?? 0
      const peers = (teamSize.get(state.managerId) ?? 1) - 1
      const total = left + peers
      if (left >= 2 && total >= 3 && left / total >= 0.4) {
        signals.push({
          key: 'peersLeft',
          strength: 1,
          reason: why(() => `${left} of ${total} people under the same manager left ${sinceText}`),
        })
      }
    }
    const t = tenureYears(e, d)
    if (t >= 1 && t < 3) {
      signals.push({
        key: 'tenurePeak',
        strength: 1,
        reason: why(
          () => `${(Math.floor(t * 10) / 10).toFixed(1)} yrs at the company, within the 1-3 year range`,
        ),
      })
    }
    const prevRating = normRating(previous?.rating)
    if (!isOff.has('ratingDrop') && latest && rating != null && prevRating != null && rating < prevRating) {
      signals.push({
        key: 'ratingDrop',
        strength: 1,
        reason: why(() => `Rating fell from ${prevRating} to ${rating} in ${latest.cycle}`),
      })
    }
    const cr = compa.get(id)
    if (cr != null && cr < 0.9) {
      signals.push({ key: 'lowCompa', strength: 1, reason: `Compa-ratio ${fmt(cr, 'ratio')}, below 0.90` })
    }
    if (!isOff.has('newManager')) {
      const changed = managerChangeSince(arr, newMgrFrom, d)
      if (changed)
        signals.push({
          key: 'newManager',
          strength: 1,
          reason: why(() => `New manager since ${formatDate(changed)}`),
        })
    }
    people.push({ employeeId: id, signals })
  }
  return { date: d, people, off, companyVoluntary: company, levelNorms: norms }
}

/* ───────── points ───────── */

export type Points = Record<FactorKey, number>

/** How a factor's points were set. */
export type PointSource = 'learned' | 'default' | 'fixed' | 'off'

/** One person behind a factor's evidence: the month-ends they counted, and how many an exit followed. */
export interface EvidencePerson {
  months: number
  left: number
}

/** The people behind each side of a factor's evidence, by employee ID. */
export interface FactorPeople {
  with: ReadonlyMap<string, EvidencePerson>
  without: ReadonlyMap<string, EvidencePerson>
}

const NO_PEOPLE: FactorPeople = { with: new Map(), without: new Map() }

export interface FactorEvidence {
  key: FactorKey
  label: string
  /** Person-months with the factor (one person at one month-end). */
  withFactor: number
  withLeft: number
  withRate: number | null
  without: number
  withoutLeft: number
  withoutRate: number | null
  /** withRate ÷ withoutRate, unshrunk; null below 5 on either side. */
  lift: number | null
  /** Points the factor earns (0 when it did not raise the exit rate). */
  points: number
  /** Whether the factor could be tested against outcomes at all. */
  tested: boolean
  source: PointSource
  /** Who the person-months are, for the drill (sums match withFactor, withLeft, without, withoutLeft). */
  people: FactorPeople
}

/** One month-end used to learn points: everyone active then, and who left in the next 12 months. */
export interface LearningSample {
  signals: SignalSet
  left: (id: string) => boolean
}

export interface LearnedPoints {
  points: Points
  /** False when there was too little history and the default points apply. */
  learned: boolean
  evidence: FactorEvidence[]
  /** The month-ends the points were learned from, oldest first. */
  snapshots: ISODate[]
  /** Distinct people active at any of them. */
  people: number
  /** Distinct people who left within 12 months of a month-end they were active at. */
  leavers: number
}

const emptyPoints = (): Points => Object.fromEntries(FACTORS.map((f) => [f.key, 0])) as Points

/**
 * Raw points per factor (adding up to `total`) rounded to multiples of 5 by largest remainder,
 * so the rounded points still add up to the same total.
 */
export function roundPoints(
  raw: Partial<Record<FactorKey, number>>,
  total = 100,
): Partial<Record<FactorKey, number>> {
  const keys = FACTORS.map((f) => f.key).filter((k) => (raw[k] ?? 0) > 0)
  const units = Math.round(total / POINT_STEP)
  const exact = keys.map((k) => (raw[k] ?? 0) / POINT_STEP)
  const floors = exact.map(Math.floor)
  let left = units - floors.reduce((a, b) => a + b, 0)
  const order = keys
    .map((_k, i) => ({ i, rem: exact[i] - floors[i] }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (const o of order) {
    if (left <= 0) break
    floors[o.i]++
    left--
  }
  return Object.fromEntries(keys.map((k, i) => [k, floors[i] * POINT_STEP]))
}

/**
 * Points per factor from outcomes, pooled over the given month-ends. A factor earns points in
 * proportion to the log of its lift, shrunk toward no effect when few people have it. Factors
 * the samples could not test (switched off at every month-end) but that are on today keep
 * their default points; the pay factor keeps 10 fixed points when it is on.
 */
export function learnPoints(
  samples: readonly LearningSample[],
  offNow: ReadonlySet<FactorKey>,
  opts: { compaOn: boolean },
): LearnedPoints {
  const testable = FACTORS.filter((f) => f.key !== 'lowCompa' && !offNow.has(f.key))
  const acc = new Map(
    testable.map((f) => [
      f.key,
      {
        n: 0,
        k: 0,
        with: 0,
        withLeft: 0,
        people: { with: new Map<string, EvidencePerson>(), without: new Map<string, EvidencePerson>() },
      },
    ]),
  )
  const count = (side: Map<string, EvidencePerson>, id: string, left: boolean) => {
    const p = side.get(id)
    if (p) {
      p.months++
      if (left) p.left++
    } else side.set(id, { months: 1, left: left ? 1 : 0 })
  }
  const peopleIds = new Set<string>()
  const leaverIds = new Set<string>()
  let personMonths = 0
  for (const s of samples) {
    const off = new Set(s.signals.off.map((o) => o.key))
    for (const p of s.signals.people) {
      const left = s.left(p.employeeId)
      peopleIds.add(p.employeeId)
      personMonths++
      if (left) leaverIds.add(p.employeeId)
      for (const f of testable) {
        if (off.has(f.key)) continue
        const a = acc.get(f.key)!
        a.n++
        if (left) a.k++
        const has = p.signals.some((x) => x.key === f.key)
        if (has) {
          a.with++
          if (left) a.withLeft++
        }
        count(has ? a.people.with : a.people.without, p.employeeId, left)
      }
    }
  }
  const learned = peopleIds.size >= MIN_LEARN_PEOPLE && leaverIds.size >= MIN_LEARN_LEAVERS
  const rate = (k: number, m: number) => (m >= 5 ? k / m : null)
  const evidence: FactorEvidence[] = testable.map((f) => {
    const a = acc.get(f.key)!
    const without = a.n - a.with
    const withoutLeft = a.k - a.withLeft
    const withRate = rate(a.withLeft, a.with)
    const withoutRate = rate(withoutLeft, without)
    return {
      key: f.key,
      label: f.label,
      withFactor: a.with,
      withLeft: a.withLeft,
      withRate,
      without,
      withoutLeft,
      withoutRate,
      lift: withRate != null && withoutRate != null && withoutRate > 0 ? withRate / withoutRate : null,
      points: 0,
      tested: a.n > 0,
      source: a.n > 0 ? 'learned' : 'default',
      people: a.people,
    }
  })

  const raw: Partial<Record<FactorKey, number>> = {}
  if (opts.compaOn) raw.lowCompa = COMPA_POINTS
  const fixed = opts.compaOn ? COMPA_POINTS : 0
  const defaultsFor = (list: readonly FactorEvidence[], budget: number) => {
    const total = list.reduce((s, e) => s + factorDef.get(e.key)!.defaultPoints, 0)
    for (const e of list) raw[e.key] = total ? (budget * factorDef.get(e.key)!.defaultPoints) / total : 0
  }

  let usedLearning = false
  if (learned && personMonths > 0) {
    const untested = evidence.filter((e) => !e.tested)
    const tested = evidence.filter((e) => e.tested)
    // Untested factors keep their default points (out of 100); the tested ones share the rest.
    const untestedPoints = untested.reduce((s, e) => s + factorDef.get(e.key)!.defaultPoints, 0)
    const budget = Math.max(0, 100 - fixed - untestedPoints)
    const weight = (e: FactorEvidence) => {
      const a = acc.get(e.key)!
      const base = a.n ? a.k / a.n : 0
      const ref = e.without >= 5 && e.withoutLeft > 0 ? e.withoutLeft / e.without : base
      if (ref <= 0) return 0
      const shrunk = (e.withLeft + SHRINK * base) / (e.withFactor + SHRINK)
      return Math.max(0, Math.log(Math.min(MAX_LIFT, shrunk / ref)))
    }
    const weights = tested.map(weight)
    const total = weights.reduce((a, b) => a + b, 0)
    if (total > 0) {
      usedLearning = true
      tested.forEach((e, i) => {
        raw[e.key] = (budget * weights[i]) / total
      })
      for (const e of untested) raw[e.key] = factorDef.get(e.key)!.defaultPoints
    }
  }
  if (!usedLearning) {
    // Too little history (or nothing predicted exits): default points, rescaled to the budget.
    defaultsFor(evidence, 100 - fixed)
    for (const e of evidence) e.source = 'default'
  }
  const rawTotal = Object.values(raw).reduce((a, b) => a + (b ?? 0), 0)
  const rounded = roundPoints(raw, Math.round(rawTotal / POINT_STEP) * POINT_STEP)
  const points = emptyPoints()
  for (const f of FACTORS) points[f.key] = rounded[f.key] ?? 0
  for (const e of evidence) e.points = points[e.key]

  const rows = [...evidence]
  if (opts.compaOn) {
    rows.push({
      key: 'lowCompa',
      label: factorDef.get('lowCompa')!.label,
      withFactor: 0,
      withLeft: 0,
      withRate: null,
      without: 0,
      withoutLeft: 0,
      withoutRate: null,
      lift: null,
      points: points.lowCompa,
      tested: false,
      source: 'fixed',
      people: NO_PEOPLE,
    })
  }
  return {
    points,
    learned: usedLearning,
    evidence: rows,
    snapshots: samples.map((s) => s.signals.date).sort(),
    people: peopleIds.size,
    leavers: leaverIds.size,
  }
}

/* ───────── scores and bands ───────── */

export interface FactorHit {
  key: FactorKey
  points: number
  reason: string
}

export interface PersonRisk {
  employeeId: string
  score: number
  band: RiskBand
  /** Factors that earned points, largest first. */
  factors: FactorHit[]
}

export interface BandCuts {
  cutHigh: number | null
  cutMedium: number | null
  /** Actual share of everyone scored in the high band, and in the medium band. */
  highShare: number | null
  mediumShare: number | null
}

export function scorePeople(
  people: readonly PersonSignals[],
  points: Points,
  shares: BandShares = DEFAULT_BAND_SHARES,
): Map<string, PersonRisk> {
  const out = new Map<string, PersonRisk>()
  for (const p of people) {
    const factors: FactorHit[] = []
    for (const s of p.signals) {
      const pts = Math.round(s.strength * points[s.key])
      if (pts > 0) factors.push({ key: s.key, points: pts, reason: s.reason })
    }
    factors.sort(
      (a, b) => b.points - a.points || (FACTOR_ORDER.get(a.key) ?? 0) - (FACTOR_ORDER.get(b.key) ?? 0),
    )
    const score = Math.min(
      100,
      factors.reduce((s, f) => s + f.points, 0),
    )
    out.set(p.employeeId, { employeeId: p.employeeId, score, band: 'Low', factors })
  }
  applyBands(out, shares)
  return out
}

/**
 * Cut scores for the bands. People with the same score always share a band, so each cut sits
 * where the band's share of everyone scored comes closest to its target: about 10% High, and
 * 35% High or Medium together at the default shares (on a tie, the smaller band). The high band
 * is never empty while anyone scores above 0; a score of 0 is always Low.
 */
export function bandCuts(scores: readonly number[], shares: BandShares = DEFAULT_BAND_SHARES): BandCuts {
  const highTarget = shares.high
  const mediumTarget = Math.min(1, shares.high + shares.medium)
  const n = scores.length
  const pos = scores.filter((s) => s > 0).sort((a, b) => b - a)
  if (!n || !pos.length)
    return { cutHigh: null, cutMedium: null, highShare: n ? 0 : null, mediumShare: n ? 0 : null }
  // Distinct scores, highest first, with how many people score at or above each.
  const steps: { v: number; c: number }[] = []
  for (let i = 0; i < pos.length; i++)
    if (i === pos.length - 1 || pos[i + 1] !== pos[i]) steps.push({ v: pos[i], c: i + 1 })
  const closest = (from: number, target: number, none: number | null) => {
    let best = -1
    let bestGap = none == null ? Number.POSITIVE_INFINITY : Math.abs(none / n - target)
    for (let i = from; i < steps.length; i++) {
      const gap = Math.abs(steps[i].c / n - target)
      if (gap < bestGap - 1e-12) {
        best = i
        bestGap = gap
      }
    }
    return best
  }
  const hi = Math.max(0, closest(0, highTarget, null))
  const highCount = steps[hi].c
  const mi = closest(hi + 1, mediumTarget, highCount)
  const medCount = mi < 0 ? 0 : steps[mi].c - highCount
  return {
    cutHigh: steps[hi].v,
    cutMedium: mi < 0 ? null : steps[mi].v,
    highShare: highCount / n,
    mediumShare: medCount / n,
  }
}

export function bandFor(score: number, cutHigh: number | null, cutMedium: number | null): RiskBand {
  if (score <= 0 || cutHigh == null) return 'Low'
  if (score >= cutHigh) return 'High'
  if (cutMedium != null && score >= cutMedium) return 'Medium'
  return 'Low'
}

function applyBands(scores: Map<string, PersonRisk>, shares: BandShares): BandCuts {
  const cuts = bandCuts(
    [...scores.values()].map((s) => s.score),
    shares,
  )
  for (const s of scores.values()) s.band = bandFor(s.score, cuts.cutHigh, cuts.cutMedium)
  return cuts
}

/* ───────── model + back-test ───────── */

export interface BackTestBand {
  band: RiskBand
  people: number
  leavers: number
  rate: number | null
  /** Share of all leavers who were in this band a year earlier. */
  shareOfLeavers: number | null
}

export interface BackTest {
  scoredOn: ISODate
  outcome: Window
  /** 'voluntary' when termination type exists, else every exit counts. */
  exitKind: 'voluntary' | 'all'
  population: number
  leavers: number
  overallRate: number | null
  /** Exit rate per band, scored with points learned only from outcomes before `scoredOn`. */
  bands: BackTestBand[]
  /** High band exit rate ÷ Low band exit rate. */
  lift: number | null
  /** True when the exit rates run High > Medium > Low; null when a rate is missing. */
  ordered: boolean | null
  /** Points used for the back-test score, and where they came from. */
  points: Points
  learned: boolean
  learnedFrom: ISODate[]
  learnedLeavers: number
  /** Factors scored with default points because their data did not reach back far enough. */
  defaults: FactorKey[]
  /** Actual share of people in the high band at the scoring date (ties share a band). */
  highShare: number | null
  /** Everyone scored at the scoring date, with the score and band they had then. */
  scored: Map<string, PersonRisk>
  /** Who of them left in the outcome window (voluntarily, when termination type exists). */
  leaverIds: Set<string>
}

export interface RiskModel {
  asOf: ISODate
  scores: Map<string, PersonRisk>
  population: number
  cutHigh: number | null
  cutMedium: number | null
  /** Actual band shares company-wide; people with the same score share a band. */
  highShare: number | null
  mediumShare: number | null
  points: Points
  learned: boolean
  /** The month-ends today’s points were learned from, and how many people and leavers they hold. */
  learnedFrom: ISODate[]
  learnedPeople: number
  learnedLeavers: number
  exitKind: 'voluntary' | 'all'
  /** Per-factor outcomes over those month-ends, with the points each factor earned. */
  evidence: FactorEvidence[]
  off: { key: FactorKey; why: string }[]
  backTest: BackTest
  companyVoluntary: number | null
}

const isMonthEnd = (d: ISODate) => monthEnd(d) === d

/** d minus m months, kept on month ends when d is one. */
export const monthsBack = (d: ISODate, m: number): ISODate =>
  isMonthEnd(d) ? monthEnd(addMonths(d, -m)) : addMonths(d, -m)

/**
 * Score everyone today with points learned from the last two years, and back-test the approach
 * out of time. `settings` are the band shares, the high rating and the anonymity minimum in force.
 */
export function buildRiskModel(
  input: RiskInput,
  asOf: ISODate,
  settings: RiskSettings = DEFAULT_RISK_SETTINGS,
): RiskModel {
  const { bands: shares, highRating, minGroup } = settings
  const rates = settings.rates ?? DEFAULT_RATE_SETTINGS
  const historyStart = exitHistoryStart(input.employees)
  const exitKind: BackTest['exitKind'] = input.has.terminationType ? 'voluntary' : 'all'
  const byId = new Map(input.employees.map((e) => [e.employeeId, e]))
  const leftIn = (w: Pick<Window, 'start' | 'end'>) => (id: string) => {
    const e = byId.get(id)
    if (!e?.terminationDate || e.terminationDate < w.start || e.terminationDate > w.end) return false
    return exitKind === 'all' || e.terminationType === 'Voluntary'
  }
  const past = new Map<ISODate, SignalSet>()
  const pastSignals = (d: ISODate) => {
    let s = past.get(d)
    if (!s) {
      s = signalsAt(input, d, { useComp: false, historyStart, reasons: false, highRating, rates })
      past.set(d, s)
    }
    return s
  }
  /** Month-ends whose 12-month outcome ends by `end`, on or after the first exit in the data. */
  const samplesFor = (end: ISODate): LearningSample[] =>
    LEARN_OFFSETS.map((m) => monthsBack(end, m))
      .filter((d) => !!historyStart && d >= historyStart)
      .map((d) => ({
        signals: pastSignals(d),
        left: leftIn({ start: addDays(d, 1), end: monthsBack(d, -12) }),
      }))

  // Today: points learned from the month-ends 12 to 23 months back.
  const now = signalsAt(input, asOf, { useComp: true, historyStart, highRating, rates })
  const offNow = new Set(now.off.map((o) => o.key))
  const compaOn = !offNow.has('lowCompa')
  const today = learnPoints(samplesFor(asOf), offNow, { compaOn })
  const scores = scorePeople(now.people, today.points, shares)
  const cuts = bandCuts(
    [...scores.values()].map((s) => s.score),
    shares,
  )

  // Back-test: score everyone a year ago with points learned only from outcomes known by then.
  const d0 = monthsBack(asOf, 12)
  const then = pastSignals(d0)
  const offThen = new Set(then.off.map((o) => o.key))
  const earlier = learnPoints(samplesFor(d0), offThen, { compaOn: false })
  const scored = scorePeople(then.people, earlier.points, shares)
  const cutsThen = bandCuts(
    [...scored.values()].map((s) => s.score),
    shares,
  )
  const outcome = trailing12(asOf)
  const left = leftIn(outcome)
  const all = [...scored.values()]
  const leaverIds = new Set(all.filter((s) => left(s.employeeId)).map((s) => s.employeeId))
  const rate = (k: number, n: number) => (n >= minGroup ? k / n : null)
  const bands: BackTestBand[] = RISK_BANDS.map((band) => {
    const inBand = all.filter((s) => s.band === band)
    const k = inBand.filter((s) => leaverIds.has(s.employeeId)).length
    return {
      band,
      people: inBand.length,
      leavers: k,
      rate: rate(k, inBand.length),
      shareOfLeavers: leaverIds.size ? k / leaverIds.size : null,
    }
  })
  const [lowB, medB, highB] = bands
  const ordered =
    lowB.rate == null || highB.rate == null
      ? null
      : medB.rate == null
        ? highB.rate > lowB.rate
        : highB.rate > medB.rate && medB.rate > lowB.rate

  return {
    asOf,
    scores,
    population: now.people.length,
    cutHigh: cuts.cutHigh,
    cutMedium: cuts.cutMedium,
    highShare: cuts.highShare,
    mediumShare: cuts.mediumShare,
    points: today.points,
    learned: today.learned,
    learnedFrom: today.snapshots,
    learnedPeople: today.people,
    learnedLeavers: today.leavers,
    exitKind,
    evidence: today.evidence,
    off: now.off,
    companyVoluntary: now.companyVoluntary,
    backTest: {
      scoredOn: d0,
      outcome,
      exitKind,
      population: all.length,
      leavers: leaverIds.size,
      overallRate: rate(leaverIds.size, all.length),
      bands,
      lift: highB.rate != null && lowB.rate != null && lowB.rate > 0 ? highB.rate / lowB.rate : null,
      ordered,
      points: earlier.points,
      learned: earlier.learned,
      learnedFrom: earlier.snapshots,
      learnedLeavers: earlier.leavers,
      defaults: earlier.evidence.filter((e) => e.source === 'default' && e.points > 0).map((e) => e.key),
      highShare: cutsThen.highShare,
      scored,
      leaverIds,
    },
  }
}

/** One honest sentence (two at most) about how well the bands separated leavers in the back-test. */
export function backTestSummary(bt: BackTest): string {
  const [low, medium, high] = bt.bands
  const who = bt.exitKind === 'voluntary' ? 'left voluntarily' : 'left'
  if (bt.lift == null || high.rate == null || low.rate == null) {
    return 'There were too few people or exits a year ago to test the bands.'
  }
  const rates = `${fmt(high.rate, 'pct')} vs ${fmt(low.rate, 'pct')}`
  const times = `${bt.lift.toFixed(1)}×`
  let order = ''
  if (medium.rate != null && bt.ordered === false && bt.lift >= 1.2) {
    order =
      medium.rate >= high.rate
        ? ` The medium band ${who} at ${fmt(medium.rate, 'pct')}, as often as the high band, so the line between those two bands means little.`
        : ` The medium band ${who} at ${fmt(medium.rate, 'pct')}, less often than the low band, so only the high band stands out.`
  } else if (medium.rate != null && bt.ordered) {
    order = ` The medium band fell in between at ${fmt(medium.rate, 'pct')}.`
  }
  if (bt.lift >= 1.5) {
    return `People placed in the high band a year ago ${who} at ${times} the rate of the low band (${rates}).${order}`
  }
  if (bt.lift >= 1.2) {
    return `The bands separated leavers only modestly: the high band ${who} at ${times} the rate of the low band (${rates}).${order}`
  }
  return `The bands did not separate leavers from stayers in this data (${rates}). Treat scores as a prompt for conversations, not a prediction.`
}

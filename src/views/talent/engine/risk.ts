/**
 * Flight risk: an explainable points model that replaces the old weighted formula.
 *
 * 1. Signals. Each factor is computed at a scoring date d from data on or before d and gives a
 *    plain reason and a strength from 0 to 1 (most factors are simply present or not).
 * 2. Points. Each factor's points come from evidence: score everyone as of 12 months before the
 *    as-of date, see who left by choice in the following 12 months, and give each factor points in
 *    proportion to how much it raised the exit rate (its lift above 1, shrunk toward no effect when
 *    few people have it). Factors that did not raise the exit rate get 0 points. With too little
 *    history (fewer than 20 exits or 100 people) the default points are used instead.
 * 3. Score = sum of strength × points, 0 to 100. Bands are relative: the top 10% of scores are High,
 *    the next 25% Medium, the rest Low (0 is always Low; ties at a cut share the higher band).
 *
 * Back-test: the band exit rates are measured out of sample. People are split in two halves by
 * a hash of their ID; each half is scored with points learned from the other half, so no one is
 * scored by points that saw their own outcome.
 *
 * Pure: no React, no DOM. Scores the whole company so a band means the same thing in every scope.
 */
import type { CompRecord, Employee, ISODate, JobChange, Level } from '@/data/schema'
import type { Window } from '@/data/scope'
import { addMonths, formatDate, ms } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { attrition, isActiveAt, isEmployee, type ReviewIndex, tenureYears } from '@/lib/people'
import { fnv, median } from '@/lib/stats'
import { type FieldCoverage, normRating, reviewPair, trailing12, trailingMonths } from './base'

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
    text: 'Voluntary attrition in the department over the last 12 months is more than 2 pts above the company. Strength grows with the gap and is full at 10 pts. Departments with an average headcount under 10 are not compared.',
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
const FACTOR_ORDER = new Map(FACTORS.map((f, i) => [f.key, i]))

/** Fixed points for the factor that cannot be back-tested. */
const COMPA_POINTS = 10
/** Pseudo-people at the base exit rate added to each factor, so rare factors shrink toward no effect. */
const SHRINK = 20
/** Lift is capped so one factor can't take every point. */
const MAX_LIFT = 4
const MIN_LEARN_PEOPLE = 100
const MIN_LEARN_LEAVERS = 20

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
  /** Factors switched off because the data lacks what they need. */
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

/** Voluntary attrition per group over w, for groups with an average headcount of at least 10. */
function groupRates(
  employees: readonly Employee[],
  w: Window,
  key: (e: Employee) => string,
): Map<string, number> {
  const groups = new Map<string, Employee[]>()
  for (const e of employees) {
    const k = key(e)
    const arr = groups.get(k)
    if (arr) arr.push(e)
    else groups.set(k, [e])
  }
  const out = new Map<string, number>()
  for (const [k, group] of groups) {
    const r = attrition(group, w, 'voluntary')
    if (r.rate != null && r.avgHeadcount >= 10) out.set(k, r.rate)
  }
  return out
}

const excessStrength = (excess: number) => Math.min(1, Math.max(0.2, (excess * 100) / 10))

/** Factor signals for every employee active at d. `useComp` adds the pay factor (today's score only). */
export function signalsAt(input: RiskInput, d: ISODate, opts: { useComp: boolean }): SignalSet {
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
  }
  if (!has.terminationType) {
    turnOff('deptAttrition', 'Termination type is missing')
    turnOff('siteAttrition', 'Termination type is missing')
  }
  if (!opts.useComp) turnOff('lowCompa', 'Pay history is not available for past dates')
  else if (!has.comp) turnOff('lowCompa', 'Compensation is not loaded')
  const isOff = new Set(off.map((o) => o.key))

  const population = employees.filter((e) => isEmployee(e) && isActiveAt(e, d))
  const norms = levelNorms(employees, jobs, d)
  const w = trailing12(d)
  const newMgrFrom = trailingMonths(d, 6).start
  const threeYearsAgo = addMonths(d, -36)

  const company = has.terminationType ? attrition(employees, w, 'voluntary').rate : null
  const deptRate = company != null ? groupRates(employees, w, (e) => e.department) : new Map<string, number>()
  const siteRate = company != null ? groupRates(employees, w, (e) => e.location) : new Map<string, number>()

  // Teams at d (manager read back from history) and leavers in the last 12 months by last manager.
  const states = new Map<string, ReturnType<typeof stateAt>>()
  const teamSize = new Map<string, number>()
  for (const e of population) {
    const s = stateAt(e, jobs, d)
    states.set(e.employeeId, s)
    if (s.managerId) teamSize.set(s.managerId, (teamSize.get(s.managerId) ?? 0) + 1)
  }
  const leftUnder = new Map<string, number>()
  for (const e of employees) {
    if (!isEmployee(e) || !e.terminationDate || !e.managerId) continue
    if (e.terminationDate < w.start || e.terminationDate > w.end) continue
    leftUnder.set(e.managerId, (leftUnder.get(e.managerId) ?? 0) + 1)
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
          reason: `${Math.round(months)} months since ${promo ? 'last promotion' : 'joining'}; typical at ${level} is ${Math.round(norm.months)}`,
        })
      }
    }
    if (
      !isOff.has('highNoPromo') &&
      rating != null &&
      rating >= 4 &&
      since <= threeYearsAgo &&
      !isExecutive(level)
    ) {
      signals.push({
        key: 'highNoPromo',
        strength: 1,
        reason: promo
          ? `Rated ${rating}, last promoted ${formatDate(promo)}`
          : `Rated ${rating}, not promoted since joining in ${e.hireDate.slice(0, 4)}`,
      })
    }
    if (company != null) {
      const dr = deptRate.get(state.department)
      if (!isOff.has('deptAttrition') && dr != null && dr - company > 0.02) {
        signals.push({
          key: 'deptAttrition',
          strength: excessStrength(dr - company),
          reason: `Voluntary attrition in ${state.department} is ${fmt(dr, 'pct')}, vs ${fmt(company, 'pct')} company-wide`,
        })
      }
      const sr = siteRate.get(e.location)
      if (!isOff.has('siteAttrition') && sr != null && sr - company > 0.02) {
        signals.push({
          key: 'siteAttrition',
          strength: excessStrength(sr - company),
          reason: `Voluntary attrition in ${e.location} is ${fmt(sr, 'pct')}, vs ${fmt(company, 'pct')} company-wide`,
        })
      }
    }
    if (state.managerId) {
      const left = leftUnder.get(state.managerId) ?? 0
      const peers = (teamSize.get(state.managerId) ?? 1) - 1
      const total = left + peers
      if (left >= 2 && total >= 3 && left / total >= 0.4) {
        signals.push({
          key: 'peersLeft',
          strength: 1,
          reason: `${left} of ${total} people under the same manager left in the last 12 months`,
        })
      }
    }
    const t = tenureYears(e, d)
    if (t >= 1 && t < 3) {
      signals.push({
        key: 'tenurePeak',
        strength: 1,
        reason: `${(Math.floor(t * 10) / 10).toFixed(1)} yrs at the company, within the 1-3 year range`,
      })
    }
    const prevRating = normRating(previous?.rating)
    if (!isOff.has('ratingDrop') && latest && rating != null && prevRating != null && rating < prevRating) {
      signals.push({
        key: 'ratingDrop',
        strength: 1,
        reason: `Rating fell from ${prevRating} to ${rating} in ${latest.cycle}`,
      })
    }
    const cr = compa.get(id)
    if (cr != null && cr < 0.9) {
      signals.push({ key: 'lowCompa', strength: 1, reason: `Compa-ratio ${fmt(cr, 'ratio')}, below 0.90` })
    }
    if (!isOff.has('newManager')) {
      const changed = managerChangeSince(arr, newMgrFrom, d)
      if (changed)
        signals.push({ key: 'newManager', strength: 1, reason: `New manager since ${formatDate(changed)}` })
    }
    people.push({ employeeId: id, signals })
  }
  return { date: d, people, off, companyVoluntary: company, levelNorms: norms }
}

/* ───────── points ───────── */

export type Points = Record<FactorKey, number>

export interface FactorEvidence {
  key: FactorKey
  label: string
  withFactor: number
  withLeft: number
  withRate: number | null
  without: number
  withoutLeft: number
  withoutRate: number | null
  /** withRate ÷ withoutRate, unshrunk; null below 5 people on either side. */
  lift: number | null
  /** Points the factor earns (0 when it did not raise the exit rate). */
  points: number
  /** Whether the factor could be tested against outcomes at all. */
  tested: boolean
}

export interface LearnedPoints {
  points: Points
  /** False when there was too little history and the default points apply. */
  learned: boolean
  evidence: FactorEvidence[]
}

const emptyPoints = (): Points => Object.fromEntries(FACTORS.map((f) => [f.key, 0])) as Points

/**
 * Points per factor from outcomes: lift above 1, shrunk toward no effect for rare factors, scaled so
 * the tested factors share 100 points (90 when the untestable pay factor is in play).
 */
export function learnPoints(
  people: readonly PersonSignals[],
  left: (id: string) => boolean,
  off: ReadonlySet<FactorKey>,
  opts: { compaOn: boolean },
): LearnedPoints {
  const testable = FACTORS.filter((f) => f.key !== 'lowCompa' && !off.has(f.key))
  const n = people.length
  const leftIds = new Set(people.filter((p) => left(p.employeeId)).map((p) => p.employeeId))
  const leavers = leftIds.size
  const base = n ? leavers / n : 0
  const budget = 100 - (opts.compaOn ? COMPA_POINTS : 0)
  const learned = n >= MIN_LEARN_PEOPLE && leavers >= MIN_LEARN_LEAVERS
  const rate = (k: number, m: number) => (m >= 5 ? k / m : null)

  const evidence: FactorEvidence[] = testable.map((f) => {
    let withFactor = 0
    let withLeft = 0
    for (const p of people) {
      if (!p.signals.some((s) => s.key === f.key)) continue
      withFactor++
      if (leftIds.has(p.employeeId)) withLeft++
    }
    const without = n - withFactor
    const withoutLeft = leavers - withLeft
    const withRate = rate(withLeft, withFactor)
    const withoutRate = rate(withoutLeft, without)
    return {
      key: f.key,
      label: f.label,
      withFactor,
      withLeft,
      withRate,
      without,
      withoutLeft,
      withoutRate,
      lift: withRate != null && withoutRate != null && withoutRate > 0 ? withRate / withoutRate : null,
      points: 0,
      tested: true,
    }
  })

  const points = emptyPoints()
  if (opts.compaOn) points.lowCompa = COMPA_POINTS
  if (learned) {
    const weight = (e: FactorEvidence) => {
      const ref = e.without >= 5 && e.withoutLeft > 0 ? e.withoutLeft / e.without : base
      if (ref <= 0) return 0
      const shrunk = (e.withLeft + SHRINK * base) / (e.withFactor + SHRINK)
      return Math.max(0, Math.min(MAX_LIFT, shrunk / ref) - 1)
    }
    const weights = evidence.map(weight)
    const total = weights.reduce((a, b) => a + b, 0)
    if (total > 0) {
      evidence.forEach((e, i) => {
        e.points = Math.round((budget * weights[i]) / total)
        points[e.key] = e.points
      })
      return { points, learned: true, evidence: withCompaRow(evidence, opts.compaOn) }
    }
  }
  // Too little history (or nothing predicted exits): default points, rescaled to the budget.
  const defTotal = testable.reduce((s, f) => s + f.defaultPoints, 0)
  for (const e of evidence) {
    e.points = defTotal ? Math.round((budget * factorDef.get(e.key)!.defaultPoints) / defTotal) : 0
    points[e.key] = e.points
  }
  return { points, learned: false, evidence: withCompaRow(evidence, opts.compaOn) }
}

function withCompaRow(evidence: FactorEvidence[], compaOn: boolean): FactorEvidence[] {
  if (!compaOn) return evidence
  return [
    ...evidence,
    {
      key: 'lowCompa',
      label: factorDef.get('lowCompa')!.label,
      withFactor: 0,
      withLeft: 0,
      withRate: null,
      without: 0,
      withoutLeft: 0,
      withoutRate: null,
      lift: null,
      points: COMPA_POINTS,
      tested: false,
    },
  ]
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

export function scorePeople(people: readonly PersonSignals[], points: Points): Map<string, PersonRisk> {
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
  applyBands(out)
  return out
}

/** Percentile cuts: the top 10% of scores are High, the next 25% Medium. */
export function bandCuts(scores: readonly number[]): { cutHigh: number | null; cutMedium: number | null } {
  const sorted = scores.filter((s) => s > 0).sort((a, b) => b - a)
  const n = scores.length
  if (!n || !sorted.length) return { cutHigh: null, cutMedium: null }
  const at = (share: number) => sorted[Math.min(sorted.length, Math.max(1, Math.ceil(share * n))) - 1]
  return { cutHigh: at(0.1), cutMedium: at(0.35) }
}

export function bandFor(score: number, cutHigh: number | null, cutMedium: number | null): RiskBand {
  if (score <= 0 || cutHigh == null) return 'Low'
  if (score >= cutHigh) return 'High'
  if (cutMedium != null && score >= cutMedium) return 'Medium'
  return 'Low'
}

function applyBands(scores: Map<string, PersonRisk>): { cutHigh: number | null; cutMedium: number | null } {
  const cuts = bandCuts([...scores.values()].map((s) => s.score))
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
  /** Out of sample: each half scored with points learned from the other half. */
  bands: BackTestBand[]
  /** High band exit rate ÷ Low band exit rate. */
  lift: number | null
}

export interface RiskModel {
  asOf: ISODate
  scores: Map<string, PersonRisk>
  population: number
  cutHigh: number | null
  cutMedium: number | null
  points: Points
  learned: boolean
  /** Per-factor outcomes in the back-test window, with the points each factor earned. */
  evidence: FactorEvidence[]
  off: { key: FactorKey; why: string }[]
  backTest: BackTest
  companyVoluntary: number | null
}

/** Score everyone today with points learned from the last 12 months, and back-test the approach. */
export function buildRiskModel(input: RiskInput, asOf: ISODate): RiskModel {
  const d0 = addMonths(asOf, -12)
  const past = signalsAt(input, d0, { useComp: false })
  const now = signalsAt(input, asOf, { useComp: true })
  const outcome = trailing12(asOf)
  const exitKind: BackTest['exitKind'] = input.has.terminationType ? 'voluntary' : 'all'
  const byId = new Map(input.employees.map((e) => [e.employeeId, e]))
  const left = (id: string) => {
    const e = byId.get(id)
    if (!e?.terminationDate || e.terminationDate < outcome.start || e.terminationDate > outcome.end)
      return false
    return exitKind === 'all' || e.terminationType === 'Voluntary'
  }
  const pastOff = new Set(past.off.map((o) => o.key))
  const compaOn = !now.off.some((o) => o.key === 'lowCompa')

  // Points for today come from everyone's outcomes over the last 12 months.
  const full = learnPoints(past.people, left, pastOff, { compaOn })
  const scores = scorePeople(now.people, full.points)
  const cuts = bandCuts([...scores.values()].map((s) => s.score))

  // Out-of-sample back-test: two halves, each scored with the other half's points (pay factor excluded).
  const half = (id: string) => fnv(id) & 1
  const oos = new Map<string, PersonRisk>()
  for (const fold of [0, 1]) {
    const train = past.people.filter((p) => half(p.employeeId) !== fold)
    const test = past.people.filter((p) => half(p.employeeId) === fold)
    const learnedHalf = learnPoints(train, left, pastOff, { compaOn: false })
    for (const [id, r] of scorePeople(test, learnedHalf.points)) oos.set(id, r)
  }
  applyBands(oos)
  const all = [...oos.values()]
  const leaverIds = new Set(all.filter((s) => left(s.employeeId)).map((s) => s.employeeId))
  const rate = (k: number, n: number) => (n >= 5 ? k / n : null)
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
  const high = bands[2].rate
  const low = bands[0].rate

  return {
    asOf,
    scores,
    population: now.people.length,
    cutHigh: cuts.cutHigh,
    cutMedium: cuts.cutMedium,
    points: full.points,
    learned: full.learned,
    evidence: full.evidence,
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
      lift: high != null && low != null && low > 0 ? high / low : null,
    },
  }
}

/** One honest sentence about how well the bands separated leavers in the back-test. */
export function backTestSummary(bt: BackTest): string {
  const [low, , high] = bt.bands
  const who = bt.exitKind === 'voluntary' ? 'left voluntarily' : 'left'
  if (bt.lift == null || high.rate == null || low.rate == null) {
    return 'There were too few people or exits a year ago to test the bands.'
  }
  const rates = `${fmt(high.rate, 'pct')} vs ${fmt(low.rate, 'pct')}`
  if (bt.lift >= 1.5) {
    return `People placed in the high band a year ago ${who} at ${bt.lift.toFixed(1)}× the rate of the low band (${rates}).`
  }
  if (bt.lift >= 1.2) {
    return `The bands separated leavers only modestly: the high band ${who} at ${bt.lift.toFixed(1)}× the rate of the low band (${rates}).`
  }
  return `The bands did not separate leavers from stayers in this data (${rates}). Treat scores as a prompt for conversations, not a prediction.`
}

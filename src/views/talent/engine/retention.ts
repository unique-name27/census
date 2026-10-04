/**
 * Retention risk for the scope: people by flight-risk band, key talent at risk, what drives the
 * scores, regretted exits of high performers and recent high-potential exits.
 * Pure: no React, no DOM.
 */
import type { Employee, ISODate } from '@/data/schema'
import type { Window } from '@/data/scope'
import { decomposeRate, type Segment } from '@/lib/decompose'
import { exitsIn, quarterPoints, reviewAt } from '@/lib/people'
import { nameOf, normRating, orgDims, potentialAt, ratingAt, type TalentBase, trailingMonths } from './base'
import {
  FACTORS,
  type FactorHit,
  type FactorKey,
  type PersonRisk,
  RISK_BANDS,
  type RiskBand,
  type RiskModel,
} from './risk'

export interface BandRow {
  band: RiskBand
  people: number
  share: number | null
  /** The same band's share company-wide, for comparison under a filter. */
  companyShare: number | null
}

export interface RiskPersonRow {
  employeeId: string
  name: string
  jobTitle: string
  department: string
  location: string
  level: string | null
  manager: string
  rating: number | null
  /** Cycle of the latest rating. */
  ratingCycle: string | null
  score: number
  band: RiskBand
  /** The factor that adds the most points among those that set the person apart. */
  reason1: string
  /** The next factor by points. */
  reason2: string
}

export interface DriverRow {
  factor: string
  key: FactorKey
  /** People in the high band for whom this factor is the main reason. */
  topReason: number
  /** People in the high band with this factor at all. */
  anyReason: number
  points: number
  /** Shared by most of the company's high band, so it is listed as a main reason only when nothing else is. */
  common: boolean
}

export interface ExitPerson {
  employeeId: string
  name: string
  department: string
  location: string
  level: string | null
  terminationDate: ISODate
  reason: string
  rating: number | null
}

export interface RetentionResult {
  bands: BandRow[]
  scored: number
  keyTalent: RiskPersonRow[]
  /** Active people in scope whose latest rating is at or above the high performer rating, for the share at risk. */
  highPerformers: number
  /** Those people (the share's denominator). */
  highPerformerPeople: Employee[]
  watchList: RiskPersonRow[]
  drivers: DriverRow[]
  /** Factors most of the company's high band shares. */
  commonFactors: FactorKey[]
  keyTalentTop: Segment | null
  regrettedHigh: {
    /** False when a column the count needs is missing; the count is then null, never 0. */
    available: boolean
    missing: string | null
    current: ExitPerson[]
    prior: ExitPerson[]
    byQuarter: number[]
  }
  hipoExits: { window: Window; available: boolean; missing: string | null; people: ExitPerson[] }
  /** Active scored employees in scope per band (the band chart's people). */
  bandPeople: Record<RiskBand, Employee[]>
}

/** Main reason: the top factor by points that most of the high band does not share; then the next one. */
export function reasonsFor(
  factors: readonly FactorHit[],
  common: ReadonlySet<FactorKey>,
): [FactorHit | null, FactorHit | null] {
  const main = factors.find((f) => !common.has(f.key)) ?? factors[0] ?? null
  const also = factors.find((f) => f !== main) ?? null
  return [main, also]
}

function personRow(
  base: TalentBase,
  e: Employee,
  r: PersonRisk,
  common: ReadonlySet<FactorKey>,
): RiskPersonRow {
  const latest = reviewAt(base.reviews, e.employeeId, base.asOf)
  const rating = normRating(latest?.rating)
  const [main, also] = reasonsFor(r.factors, common)
  return {
    employeeId: e.employeeId,
    name: e.name,
    jobTitle: e.jobTitle,
    department: e.department,
    location: e.location,
    level: e.level,
    manager: nameOf(base, e.managerId),
    rating,
    ratingCycle: rating != null ? (latest?.cycle ?? null) : null,
    score: r.score,
    band: r.band,
    reason1: main?.reason ?? '',
    reason2: also?.reason ?? '',
  }
}

/** Which columns the regretted-exit counts need, or null when everything is there. */
function regretMissing(base: TalentBase): string | null {
  if (!base.has.terminationType) return 'Termination type is missing'
  if (!base.has.regrettable) return 'Regrettable flag is missing'
  if (!base.has.reviews) return 'Reviews are not loaded'
  return null
}

/** Voluntary regretted exits in a window whose last rating before leaving was high (4 or 5 by default). */
function regrettedHighIn(base: TalentBase, w: Pick<Window, 'start' | 'end'>): ExitPerson[] {
  const { highRating } = base.settings
  return exitsIn(base.scoped, w)
    .filter((e) => e.terminationType === 'Voluntary' && e.regrettable === true)
    .map((e) => ({ e, rating: ratingAt(base, e.employeeId, e.terminationDate!) }))
    .filter((x) => x.rating != null && x.rating >= highRating)
    .map(({ e, rating }) => exitPerson(e, rating))
    .sort((a, b) => (a.terminationDate < b.terminationDate ? 1 : -1))
}

const exitPerson = (e: Employee, rating: number | null): ExitPerson => ({
  employeeId: e.employeeId,
  name: e.name,
  department: e.department,
  location: e.location,
  level: e.level,
  terminationDate: e.terminationDate!,
  reason: e.terminationReason ?? '—',
  rating,
})

export function computeRetention(base: TalentBase, model: RiskModel): RetentionResult {
  const { asOf } = base
  const { highRating, minGroup, sharedFactor, findings: rule } = base.settings
  const scopedScores: { e: Employee; r: PersonRisk }[] = []
  for (const e of base.active) {
    const r = model.scores.get(e.employeeId)
    if (r) scopedScores.push({ e, r })
  }
  const scored = scopedScores.length
  const companyCount = model.scores.size
  const bandPeople = Object.fromEntries(
    RISK_BANDS.map((band) => [band, scopedScores.filter((s) => s.r.band === band).map((s) => s.e)]),
  ) as Record<RiskBand, Employee[]>
  const bands: BandRow[] = RISK_BANDS.map((band) => {
    const k = bandPeople[band].length
    let all = 0
    for (const s of model.scores.values()) if (s.band === band) all++
    return {
      band,
      people: k,
      share: scored >= minGroup ? k / scored : null,
      companyShare: companyCount >= minGroup ? all / companyCount : null,
    }
  })

  // Factors most of the company's high band carries: at least the shared-factor setting (80% by
  // default) says little about one person (in the sample, tenure of 1-3 years), so it is never
  // shown as their main reason when they have another one.
  const companyHigh = [...model.scores.values()].filter((s) => s.band === 'High')
  const commonFactors = FACTORS.map((f) => f.key).filter(
    (k) =>
      companyHigh.length > 0 &&
      companyHigh.filter((s) => s.factors.some((x) => x.key === k)).length / companyHigh.length >=
        sharedFactor,
  )
  const common = new Set(commonFactors)

  const rows = scopedScores
    .filter((s) => s.r.band !== 'Low')
    .map((s) => personRow(base, s.e, s.r, common))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const keyTalent = rows.filter((r) => r.band === 'High' && r.rating != null && r.rating >= highRating)
  const highPerformers = scopedScores.filter((s) => (ratingAt(base, s.e.employeeId, asOf) ?? 0) >= highRating)

  // Where key talent at risk concentrates among high performers.
  const keyIds = new Set(keyTalent.map((k) => k.employeeId))
  const segs = keyTalent.length
    ? decomposeRate(
        highPerformers,
        orgDims((s) => s.e),
        (s) => keyIds.has(s.e.employeeId),
        { minDev: 0.05, top: 6 },
      )
    : []
  const keyTalentTop = segs.find((s) => !s.small) ?? null

  const high = scopedScores.filter((s) => s.r.band === 'High')
  const drivers: DriverRow[] = FACTORS.map((f) => ({
    factor: f.label,
    key: f.key,
    topReason: high.filter((s) => reasonsFor(s.r.factors, common)[0]?.key === f.key).length,
    anyReason: high.filter((s) => s.r.factors.some((x) => x.key === f.key)).length,
    points: model.points[f.key],
    common: common.has(f.key),
  }))
    .filter((d) => d.points > 0)
    .sort((a, b) => b.anyReason - a.anyReason || b.topReason - a.topReason)

  // Regretted exits of high performers: current and prior window, plus the last 8 quarters.
  const missing = regretMissing(base)
  const available = missing == null
  const current = available ? regrettedHighIn(base, base.ctx.window) : []
  const prior = available ? regrettedHighIn(base, base.ctx.prior) : []
  const byQuarter = available
    ? quarterPoints(asOf, 8).map((end) => regrettedHighIn(base, trailingMonths(end, 3)).length)
    : []

  // High-potential regretted exits in the last months of the finding's setting (6 by default):
  // latest potential on record High, rated at or above the high performer rating.
  const hipoWindow = trailingMonths(asOf, rule.hipoExitMonths)
  const hipoMissing = missing ?? (base.has.potential ? null : 'Potential is missing')
  const hipo = hipoMissing
    ? []
    : exitsIn(base.scoped, hipoWindow)
        .filter((e) => e.terminationType === 'Voluntary' && e.regrettable === true)
        .filter((e) => potentialAt(base, e.employeeId, e.terminationDate!) === 'High')
        .map((e) => exitPerson(e, ratingAt(base, e.employeeId, e.terminationDate!)))
        .filter((p) => p.rating != null && p.rating >= highRating)
        .sort((a, b) => (a.terminationDate < b.terminationDate ? -1 : 1))

  return {
    bands,
    scored,
    keyTalent,
    highPerformers: highPerformers.length,
    highPerformerPeople: highPerformers.map((s) => s.e),
    watchList: rows,
    drivers,
    commonFactors,
    keyTalentTop,
    regrettedHigh: { available, missing, current, prior, byQuarter },
    hipoExits: { window: hipoWindow, available: hipoMissing == null, missing: hipoMissing, people: hipo },
    bandPeople,
  }
}

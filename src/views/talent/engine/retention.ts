/**
 * Retention risk for the scope: people by flight-risk band, key talent at risk, what drives the
 * scores, regretted exits of high performers and recent high-potential exits.
 * Pure: no React, no DOM.
 */
import type { Employee, ISODate } from '@/data/schema'
import type { Window } from '@/data/scope'
import { decomposeRate, type Segment } from '@/lib/decompose'
import { exitsIn, quarterPoints } from '@/lib/people'
import { nameOf, orgDims, potentialAt, ratingAt, type TalentBase, trailingMonths } from './base'
import { FACTORS, type FactorKey, type PersonRisk, RISK_BANDS, type RiskBand, type RiskModel } from './risk'

export interface BandRow {
  band: RiskBand
  people: number
  share: number | null
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
  score: number
  band: RiskBand
  reason1: string
  reason2: string
}

export interface DriverRow {
  factor: string
  key: FactorKey
  /** People in the high band for whom this factor earned the most points. */
  topReason: number
  /** People in the high band with this factor at all. */
  anyReason: number
  points: number
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
  /** Everyone rated 4-5 in scope, for the share at risk. */
  highPerformers: number
  watchList: RiskPersonRow[]
  drivers: DriverRow[]
  keyTalentTop: Segment | null
  regrettedHigh: { current: ExitPerson[]; prior: ExitPerson[]; byQuarter: number[] }
  hipoExits: { window: Window; people: ExitPerson[] }
}

function personRow(base: TalentBase, e: Employee, r: PersonRisk): RiskPersonRow {
  return {
    employeeId: e.employeeId,
    name: e.name,
    jobTitle: e.jobTitle,
    department: e.department,
    location: e.location,
    level: e.level,
    manager: nameOf(base, e.managerId),
    rating: ratingAt(base, e.employeeId, base.asOf),
    score: r.score,
    band: r.band,
    reason1: r.factors[0]?.reason ?? '',
    reason2: r.factors[1]?.reason ?? '',
  }
}

/** Voluntary regretted exits in a window whose last rating before leaving was 4 or 5. */
function regrettedHighIn(base: TalentBase, w: Pick<Window, 'start' | 'end'>): ExitPerson[] {
  return exitsIn(base.scoped, w)
    .filter((e) => e.terminationType === 'Voluntary' && e.regrettable === true)
    .map((e) => ({ e, rating: ratingAt(base, e.employeeId, e.terminationDate!) }))
    .filter((x) => x.rating != null && x.rating >= 4)
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
  const scopedScores: { e: Employee; r: PersonRisk }[] = []
  for (const e of base.active) {
    const r = model.scores.get(e.employeeId)
    if (r) scopedScores.push({ e, r })
  }
  const scored = scopedScores.length
  const bands: BandRow[] = RISK_BANDS.map((band) => {
    const k = scopedScores.filter((s) => s.r.band === band).length
    return { band, people: k, share: scored >= 5 ? k / scored : null }
  })

  const rows = scopedScores
    .filter((s) => s.r.band !== 'Low')
    .map((s) => personRow(base, s.e, s.r))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const keyTalent = rows.filter((r) => r.band === 'High' && r.rating != null && r.rating >= 4)
  const highPerformers = scopedScores.filter((s) => (ratingAt(base, s.e.employeeId, asOf) ?? 0) >= 4)

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
    topReason: high.filter((s) => s.r.factors[0]?.key === f.key).length,
    anyReason: high.filter((s) => s.r.factors.some((x) => x.key === f.key)).length,
    points: model.points[f.key],
  }))
    .filter((d) => d.points > 0)
    .sort((a, b) => b.topReason - a.topReason || b.anyReason - a.anyReason)

  // Regretted exits of high performers: current and prior window, plus the last 8 quarters.
  const current = regrettedHighIn(base, base.ctx.window)
  const prior = regrettedHighIn(base, base.ctx.prior)
  const byQuarter = quarterPoints(asOf, 8).map((end) => regrettedHighIn(base, trailingMonths(end, 3)).length)

  // High-potential regretted exits in the last 6 months: latest potential on record High, rated 4+.
  const hipoWindow = trailingMonths(asOf, 6)
  const hipo = exitsIn(base.scoped, hipoWindow)
    .filter((e) => e.terminationType === 'Voluntary' && e.regrettable === true)
    .filter((e) => potentialAt(base, e.employeeId, e.terminationDate!) === 'High')
    .map((e) => exitPerson(e, ratingAt(base, e.employeeId, e.terminationDate!)))
    .filter((p) => p.rating != null && p.rating >= 4)
    .sort((a, b) => (a.terminationDate < b.terminationDate ? -1 : 1))

  return {
    bands,
    scored,
    keyTalent,
    highPerformers: highPerformers.length,
    watchList: rows,
    drivers,
    keyTalentTop,
    regrettedHigh: { current, prior, byQuarter },
    hipoExits: { window: hipoWindow, people: hipo },
  }
}

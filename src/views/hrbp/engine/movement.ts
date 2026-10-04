/**
 * Internal movement from the Job changes history: every promotion, transfer, lateral move and
 * demotion event counts (a person promoted twice counts twice). Mobility counts people, once each.
 *
 * Promotion rate is NOT annualized (VIEWS.md): promotions come in cycles (1 Mar and 1 Sep in the
 * sample), so annualizing a 3-month window that holds a cycle would quadruple it. For the same
 * reason a window shorter than a year compares with the same months a year earlier, not with the
 * months just before it.
 */
import type { Employee, ISODate, JobChange } from '@/data/schema'
import { LEVELS, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { daysBetween } from '@/lib/dates'
import { activeAt, avgHeadcount, inWindow } from '@/lib/people'
import { type Prep, priorLabel, quarterBlocks, yearEarlier } from './base'
import { exitsByGroup } from './rates'
import { NO_LEVEL } from './workforce'

export const MOVE_TYPES = ['Promotion', 'Transfer', 'Lateral move', 'Demotion'] as const
export type MoveType = (typeof MOVE_TYPES)[number]
const isMove = (c: JobChange): c is JobChange & { changeType: MoveType } =>
  (MOVE_TYPES as readonly string[]).includes(c.changeType)

export interface PromotionQuarterRow {
  quarter: string
  start: ISODate
  end: ISODate
  promotions: number
  avgHeadcount: number
  rate: number | null
  /** The promotion events behind `promotions`; empty when the rate is hidden (average headcount under 5). */
  records: JobChange[]
}

export interface LevelRateRow {
  level: string
  promotions: number
  avgHeadcount: number
  rate: number | null
  /** Promotions from this level; empty when the rate is hidden. */
  records: JobChange[]
}

export interface DeptMoveRow {
  department: string
  type: 'Transfer' | 'Lateral move'
  moves: number
  /** The moves behind `moves`. */
  records: JobChange[]
}

export interface SincePromotionRow {
  band: string
  people: number
  share: number
  /** The employees behind `people`. */
  records: Employee[]
}

/** The events and people behind the movement tiles. */
export interface MovementRecords {
  promotions: JobChange[]
  transfers: JobChange[]
  lateral: JobChange[]
  demotions: JobChange[]
  /** Employees with at least one promotion, transfer or lateral move in the window (mobility's numerator). */
  movers: Employee[]
}

export interface MoveRow {
  date: ISODate
  employeeId: string
  name: string
  type: MoveType
  fromLevel: string | null
  toLevel: string | null
  fromDepartment: string | null
  toDepartment: string | null
}

export interface PromotionRate {
  rate: number | null
  promotions: number
  avgHeadcount: number
}

export interface MovementModel {
  promotions: PromotionRate
  companyPromotions: PromotionRate
  /** The comparison: the prior window for 12-month and year-to-date periods, else the same months a year earlier. */
  priorPromotions: PromotionRate
  /** Delta label for `priorPromotions`, e.g. "vs same period last year". */
  priorLabel: string
  transfers: number
  lateral: number
  demotions: number
  /** People who moved at least once in the window ÷ average headcount (not annualized). */
  mobility: { rate: number | null; movers: number }
  byQuarter: PromotionQuarterRow[]
  byLevel: LevelRateRow[]
  byDepartment: DeptMoveRow[]
  sincePromotion: SincePromotionRow[]
  moves: MoveRow[]
  records: MovementRecords
}

export const SINCE_BANDS = [
  'Under 1 yr',
  '1-2 yrs',
  '2-3 yrs',
  '3-5 yrs',
  '5+ yrs',
  'Never promoted',
] as const

/** Events ÷ average headcount, not annualized; null under the anonymity floor. */
export function shareOf(events: number, avg: number): number | null {
  return avg >= MIN_GROUP ? events / avg : null
}

/**
 * Promotion events in the window ÷ average headcount (not annualized). Null without a Job
 * changes dataset or below an average headcount of 5.
 */
export function promotionRate(
  emps: readonly Employee[],
  changes: readonly JobChange[],
  w: Window,
  hasJobChanges: boolean,
): PromotionRate {
  const avg = avgHeadcount(emps, w)
  const promotions = changes.filter(
    (c) => c.changeType === 'Promotion' && inWindow(c.effectiveDate, w),
  ).length
  return { rate: hasJobChanges ? shareOf(promotions, avg) : null, promotions, avgHeadcount: avg }
}

/**
 * What promotions compare with: the prior window when the period covers a year or is already set
 * against last year (year to date); otherwise the same months a year earlier, so a promotion
 * cycle inside the window is never set against a window without one.
 */
export function promotionComparison(p: Prep): { window: Window; label: string } {
  const { period } = p.ctx.filters
  if (period === 'ytd' || p.window.months >= 11.5) {
    return { window: p.prior, label: priorLabel(period, p.window.months) }
  }
  return { window: yearEarlier(p.window), label: 'vs same period last year' }
}

export function sinceBand(years: number | null): (typeof SINCE_BANDS)[number] {
  if (years == null) return 'Never promoted'
  if (years < 1) return 'Under 1 yr'
  if (years < 2) return '1-2 yrs'
  if (years < 3) return '2-3 yrs'
  if (years < 5) return '3-5 yrs'
  return '5+ yrs'
}

export function computeMovement(p: Prep): MovementModel {
  const { emps, window, asOf, changes, ctx } = p
  const has = p.has.jobChanges
  const byId = ctx.org.byId
  const inWin = changes.filter((c) => inWindow(c.effectiveDate, window))
  const promos = inWin.filter((c) => c.changeType === 'Promotion')

  const byQuarter: PromotionQuarterRow[] = quarterBlocks(asOf, 8).map((b) => {
    const records = changes.filter((c) => c.changeType === 'Promotion' && inWindow(c.effectiveDate, b))
    const avg = avgHeadcount(emps, b)
    return {
      quarter: b.label,
      start: b.start,
      end: b.end,
      promotions: records.length,
      avgHeadcount: avg,
      rate: has ? shareOf(records.length, avg) : null,
      records: avg >= MIN_GROUP ? records : [],
    }
  })

  // Promotion rate by the level people were promoted FROM, over average headcount at that level.
  const levelHc = exitsByGroup(
    emps,
    window,
    (e) => e.level ?? NO_LEVEL,
    (e, d) => p.history.levelAt(e, d) ?? NO_LEVEL,
  )
  const promosByLevel = new Map<string, JobChange[]>()
  for (const c of promos) {
    const e = byId.get(c.employeeId)
    const from = c.fromLevel ?? (e ? p.history.levelAt(e, c.effectiveDate) : null) ?? NO_LEVEL
    const arr = promosByLevel.get(from)
    if (arr) arr.push(c)
    else promosByLevel.set(from, [c])
  }
  const byLevel: LevelRateRow[] = [...LEVELS, NO_LEVEL]
    .filter((l) => (levelHc.get(l)?.avgHeadcount ?? 0) > 0 || promosByLevel.has(l))
    .map((level) => {
      const avg = levelHc.get(level)?.avgHeadcount ?? 0
      const records = promosByLevel.get(level) ?? []
      return {
        level,
        promotions: records.length,
        avgHeadcount: avg,
        rate: has ? shareOf(records.length, avg) : null,
        records: avg >= MIN_GROUP ? records : [],
      }
    })

  const deptMoves = new Map<string, { Transfer: JobChange[]; 'Lateral move': JobChange[] }>()
  for (const c of inWin) {
    if (c.changeType !== 'Transfer' && c.changeType !== 'Lateral move') continue
    const dept = moveDepartment(c, byId)
    const row = deptMoves.get(dept) ?? { Transfer: [], 'Lateral move': [] }
    row[c.changeType].push(c)
    deptMoves.set(dept, row)
  }
  const byDepartment: DeptMoveRow[] = [...deptMoves.entries()]
    .sort(
      (a, b) =>
        b[1].Transfer.length +
        b[1]['Lateral move'].length -
        (a[1].Transfer.length + a[1]['Lateral move'].length),
    )
    .flatMap(([department, r]) => [
      { department, type: 'Transfer' as const, moves: r.Transfer.length, records: r.Transfer },
      {
        department,
        type: 'Lateral move' as const,
        moves: r['Lateral move'].length,
        records: r['Lateral move'],
      },
    ])

  const active = activeAt(emps, asOf)
  const sinceGroups = new Map<string, Employee[]>()
  for (const e of active) {
    const band = sinceBand(yearsSincePromotion(p, e))
    const arr = sinceGroups.get(band)
    if (arr) arr.push(e)
    else sinceGroups.set(band, [e])
  }
  const sincePromotion: SincePromotionRow[] = SINCE_BANDS.map((band) => {
    const records = sinceGroups.get(band) ?? []
    return {
      band,
      people: records.length,
      share: active.length ? records.length / active.length : 0,
      records,
    }
  })

  const moves: MoveRow[] = inWin
    .filter(isMove)
    .map((c) => {
      const e = byId.get(c.employeeId)
      return {
        date: c.effectiveDate,
        employeeId: c.employeeId,
        name: e?.name ?? c.employeeId,
        type: c.changeType,
        fromLevel: c.fromLevel ?? null,
        toLevel: c.toLevel ?? null,
        fromDepartment: c.fromDepartment ?? null,
        toDepartment: c.toDepartment ?? null,
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)))

  const moverIds = new Set(
    inWin
      .filter(isMove)
      .filter((c) => c.changeType !== 'Demotion')
      .map((c) => c.employeeId),
  )
  const own = promotionRate(emps, changes, window, has)
  const avg = own.avgHeadcount
  const comparison = promotionComparison(p)
  const ofType = (t: MoveType) => inWin.filter((c) => c.changeType === t)
  const records: MovementRecords = {
    promotions: promos,
    transfers: ofType('Transfer'),
    lateral: ofType('Lateral move'),
    demotions: ofType('Demotion'),
    movers: [...moverIds].flatMap((id) => {
      const e = byId.get(id)
      return e ? [e] : []
    }),
  }
  return {
    promotions: own,
    companyPromotions: ctx.isCompany ? own : promotionRate(p.companyEmps, p.companyChanges, window, has),
    priorPromotions: promotionRate(emps, changes, comparison.window, has),
    priorLabel: comparison.label,
    transfers: records.transfers.length,
    lateral: records.lateral.length,
    demotions: records.demotions.length,
    mobility: { rate: has ? shareOf(moverIds.size, avg) : null, movers: moverIds.size },
    byQuarter,
    byLevel,
    byDepartment,
    sincePromotion,
    moves,
    records,
  }
}

/** The department a transfer or lateral move counts in: where the person moved to. */
export function moveDepartment(c: JobChange, byId: ReadonlyMap<string, Employee>): string {
  return c.toDepartment || byId.get(c.employeeId)?.department || 'Not recorded'
}

/** Years from the last promotion on record to asOf; null when never promoted. */
export function yearsSincePromotion(p: Prep, e: Employee): number | null {
  const last = p.history.lastPromotion(e.employeeId, p.asOf)
  return last ? daysBetween(last, p.asOf) / 365.25 : null
}

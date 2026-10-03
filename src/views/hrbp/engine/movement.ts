/**
 * Internal movement from the Job changes history: every promotion, transfer, lateral move and
 * demotion event counts (a person promoted twice counts twice). Mobility counts people, once each.
 */
import type { Employee, ISODate, JobChange } from '@/data/schema'
import { LEVELS } from '@/data/schema'
import type { Window } from '@/data/scope'
import { daysBetween } from '@/lib/dates'
import { activeAt, avgHeadcount, inWindow } from '@/lib/people'
import { type Prep, quarterBlocks } from './base'
import { annualRate, exitsByGroup } from './rates'
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
}

export interface LevelRateRow {
  level: string
  promotions: number
  avgHeadcount: number
  rate: number | null
}

export interface DeptMoveRow {
  department: string
  type: 'Transfer' | 'Lateral move'
  moves: number
}

export interface SincePromotionRow {
  band: string
  people: number
  share: number
}

export interface MoveRow {
  date: ISODate
  employeeId: string
  name: string
  type: MoveType
  fromLevel: string
  toLevel: string
  fromDepartment: string
  toDepartment: string
}

export interface PromotionRate {
  rate: number | null
  promotions: number
  avgHeadcount: number
}

export interface MovementModel {
  promotions: PromotionRate
  companyPromotions: PromotionRate
  priorPromotions: PromotionRate
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
}

export const SINCE_BANDS = [
  'Under 1 yr',
  '1-2 yrs',
  '2-3 yrs',
  '3-5 yrs',
  '5+ yrs',
  'Never promoted',
] as const

/** Promotion events in the window ÷ average headcount, annualized. Null without a Job changes dataset. */
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
  return { rate: hasJobChanges ? annualRate(promotions, avg, w) : null, promotions, avgHeadcount: avg }
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
  const { emps, window, prior, asOf, changes, ctx } = p
  const has = p.has.jobChanges
  const byId = ctx.org.byId
  const inWin = changes.filter((c) => inWindow(c.effectiveDate, window))
  const promos = inWin.filter((c) => c.changeType === 'Promotion')

  const byQuarter: PromotionQuarterRow[] = quarterBlocks(asOf, 8).map((b) => {
    const n = changes.filter((c) => c.changeType === 'Promotion' && inWindow(c.effectiveDate, b)).length
    const avg = avgHeadcount(emps, b)
    return {
      quarter: b.label,
      start: b.start,
      end: b.end,
      promotions: n,
      avgHeadcount: avg,
      rate: annualRate(n, avg, b),
    }
  })

  // Promotion rate by the level people were promoted FROM, over average headcount at that level.
  const levelHc = exitsByGroup(
    emps,
    window,
    (e) => e.level ?? NO_LEVEL,
    (e, d) => p.history.levelAt(e, d) ?? NO_LEVEL,
  )
  const promosByLevel = new Map<string, number>()
  for (const c of promos) {
    const e = byId.get(c.employeeId)
    const from = c.fromLevel ?? (e ? p.history.levelAt(e, c.effectiveDate) : null) ?? NO_LEVEL
    promosByLevel.set(from, (promosByLevel.get(from) ?? 0) + 1)
  }
  const byLevel: LevelRateRow[] = [...LEVELS, NO_LEVEL]
    .filter((l) => (levelHc.get(l)?.avgHeadcount ?? 0) > 0 || promosByLevel.has(l))
    .map((level) => {
      const avg = levelHc.get(level)?.avgHeadcount ?? 0
      const n = promosByLevel.get(level) ?? 0
      return { level, promotions: n, avgHeadcount: avg, rate: has ? annualRate(n, avg, window) : null }
    })

  const deptMoves = new Map<string, { Transfer: number; 'Lateral move': number }>()
  for (const c of inWin) {
    if (c.changeType !== 'Transfer' && c.changeType !== 'Lateral move') continue
    const dept = c.toDepartment || byId.get(c.employeeId)?.department || 'Not recorded'
    const row = deptMoves.get(dept) ?? { Transfer: 0, 'Lateral move': 0 }
    row[c.changeType]++
    deptMoves.set(dept, row)
  }
  const byDepartment: DeptMoveRow[] = [...deptMoves.entries()]
    .sort((a, b) => b[1].Transfer + b[1]['Lateral move'] - (a[1].Transfer + a[1]['Lateral move']))
    .flatMap(([department, r]) => [
      { department, type: 'Transfer' as const, moves: r.Transfer },
      { department, type: 'Lateral move' as const, moves: r['Lateral move'] },
    ])

  const active = activeAt(emps, asOf)
  const sinceCounts = new Map<string, number>()
  for (const e of active) {
    const last = p.history.lastPromotion(e.employeeId, asOf)
    const band = sinceBand(last ? daysBetween(last, asOf) / 365.25 : null)
    sinceCounts.set(band, (sinceCounts.get(band) ?? 0) + 1)
  }
  const sincePromotion: SincePromotionRow[] = SINCE_BANDS.map((band) => ({
    band,
    people: sinceCounts.get(band) ?? 0,
    share: active.length ? (sinceCounts.get(band) ?? 0) / active.length : 0,
  }))

  const moves: MoveRow[] = inWin
    .filter(isMove)
    .map((c) => {
      const e = byId.get(c.employeeId)
      return {
        date: c.effectiveDate,
        employeeId: c.employeeId,
        name: e?.name ?? c.employeeId,
        type: c.changeType,
        fromLevel: c.fromLevel ?? '—',
        toLevel: c.toLevel ?? '—',
        fromDepartment: c.fromDepartment ?? '—',
        toDepartment: c.toDepartment ?? '—',
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
  return {
    promotions: own,
    companyPromotions: ctx.isCompany ? own : promotionRate(p.companyEmps, p.companyChanges, window, has),
    priorPromotions: promotionRate(emps, changes, prior, has),
    transfers: inWin.filter((c) => c.changeType === 'Transfer').length,
    lateral: inWin.filter((c) => c.changeType === 'Lateral move').length,
    demotions: inWin.filter((c) => c.changeType === 'Demotion').length,
    mobility: { rate: has && avg >= 5 ? moverIds.size / avg : null, movers: moverIds.size },
    byQuarter,
    byLevel,
    byDepartment,
    sincePromotion,
    moves,
  }
}

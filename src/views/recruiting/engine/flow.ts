/**
 * Candidate flow for a cohort of applications (those applied in the window): how many reached
 * each stage, advanced, left (rejected, withdrawn, declined) or are still active there, the pass
 * rate, and the days each transition took. Also the "days per transition by month" grid.
 */
import type { Window } from '@/data/scope'
import { addMonths, formatMonthShort, monthKey, monthStart, monthsBetween } from '@/lib/dates'
import { median } from '@/lib/stats'
import { inWin, transitionDays } from './prepare'
import { type App, HIRED, LAST_OPEN_STAGE } from './types'

export const TRANSITIONS = [
  'Applied to screen',
  'Screen to hiring manager',
  'Hiring manager to onsite',
  'Onsite to offer',
  'Offer to hire',
] as const

export interface StageFlow {
  stage: number
  /** Reached this stage (has its date or a later one, or is at or past it). */
  entered: number
  /** Reached the next stage (for Offer: hired). */
  advanced: number
  rejected: number
  withdrawn: number
  declined: number
  /** Still active at this stage. */
  active: number
  /** Advanced or left at this stage. */
  resolved: number
  /** advanced ÷ resolved; still-active candidates don't count against the rate. */
  pass: number | null
  /** Median days to the next stage, for candidates with both dates. */
  medianDays: number | null
  nDays: number
  priorMedianDays: number | null
  deltaDays: number | null
}

export interface Flow {
  stages: StageFlow[]
  hired: number
  total: number
  left: { rejected: number; withdrawn: number; declined: number }
  active: number
}

export function cohort(apps: readonly App[], w: Pick<Window, 'start' | 'end'>): App[] {
  return apps.filter((a) => inWin(a.appliedDate, w))
}

function medianTransition(apps: readonly App[], i: number): { median: number | null; n: number } {
  const xs: number[] = []
  for (const a of apps) {
    const d = transitionDays(a, i)
    if (d != null) xs.push(d)
  }
  return { median: median(xs), n: xs.length }
}

export function stageFlow(current: readonly App[], prior: readonly App[]): Flow {
  const stages: StageFlow[] = []
  for (let i = 0; i <= LAST_OPEN_STAGE; i++) {
    let entered = 0
    let advanced = 0
    let rejected = 0
    let withdrawn = 0
    let declined = 0
    let active = 0
    for (const a of current) {
      if (a.furthest < i) continue
      entered++
      if (a.furthest > i) {
        advanced++
        continue
      }
      if (a.outcome === 'Active') active++
      else if (a.outcome === 'Rejected') rejected++
      else if (a.outcome === 'Withdrawn') withdrawn++
      else if (a.outcome === 'Declined') declined++
    }
    const resolved = advanced + rejected + withdrawn + declined
    const cur = medianTransition(current, i)
    const pri = medianTransition(prior, i)
    stages.push({
      stage: i,
      entered,
      advanced,
      rejected,
      withdrawn,
      declined,
      active,
      resolved,
      pass: resolved ? advanced / resolved : null,
      medianDays: cur.median,
      nDays: cur.n,
      priorMedianDays: pri.median,
      deltaDays:
        cur.median != null && pri.median != null && cur.n >= 5 && pri.n >= 5 ? cur.median - pri.median : null,
    })
  }
  const sum = (k: 'rejected' | 'withdrawn' | 'declined' | 'active') => stages.reduce((s, x) => s + x[k], 0)
  return {
    stages,
    hired: current.filter((a) => a.furthest === HIRED).length,
    total: current.length,
    left: { rejected: sum('rejected'), withdrawn: sum('withdrawn'), declined: sum('declined') },
    active: sum('active'),
  }
}

/** One completed transition, for the bottleneck checks. */
export interface TransitionEvent {
  app: App
  i: number
  days: number
  /** Date the transition completed (entered the next stage). */
  end: string
}

/** Transitions completed inside a window. */
export function transitionsIn(apps: readonly App[], w: Pick<Window, 'start' | 'end'>): TransitionEvent[] {
  const out: TransitionEvent[] = []
  for (const a of apps) {
    for (let i = 0; i <= LAST_OPEN_STAGE; i++) {
      const end = a.dates[i + 1]
      if (!end || !inWin(end, w)) continue
      const d = transitionDays(a, i)
      if (d != null) out.push({ app: a, i, days: d, end })
    }
  }
  return out
}

export interface SpeedCell {
  month: string
  monthLabel: string
  transition: string
  days: number | null
  n: number
}

/**
 * Median days per transition by the month the step was completed (12 months to `end`), the same
 * rule as the bottleneck check. Grouping by completion month keeps recent months honest: grouping
 * by application month would leave only the fast candidates in recent cohorts and hide a slowdown.
 */
export function speedByMonth(apps: readonly App[], end: string): SpeedCell[] {
  const months = monthsBetween(addMonths(monthStart(end), -11), end)
  const cells = new Map<string, number[]>()
  for (const m of months) for (let i = 0; i <= LAST_OPEN_STAGE; i++) cells.set(`${m}|${i}`, [])
  for (const a of apps) {
    for (let i = 0; i <= LAST_OPEN_STAGE; i++) {
      const done = a.dates[i + 1]
      if (!done || done > end) continue
      const d = transitionDays(a, i)
      if (d != null) cells.get(`${monthKey(done)}|${i}`)?.push(d)
    }
  }
  const out: SpeedCell[] = []
  for (const m of months) {
    for (let i = 0; i <= LAST_OPEN_STAGE; i++) {
      const xs = cells.get(`${m}|${i}`) ?? []
      out.push({
        month: m,
        monthLabel: formatMonthShort(`${m}-01`, true),
        transition: TRANSITIONS[i],
        days: xs.length >= 5 ? median(xs) : null,
        n: xs.length,
      })
    }
  }
  return out
}

export type FlowKind = 'advanced' | 'active' | 'rejected' | 'withdrawn' | 'declined' | 'node'

/** The applications behind one part of the river. */
export function flowMembers(apps: readonly App[], kind: FlowKind, stage: number): App[] {
  switch (kind) {
    case 'node':
      return apps.filter((a) => (stage === HIRED ? a.furthest === HIRED : a.furthest >= stage))
    case 'advanced':
      return apps.filter((a) => a.furthest > stage)
    case 'active':
      return apps.filter((a) => a.furthest === stage && a.outcome === 'Active')
    case 'rejected':
      return apps.filter((a) => a.furthest === stage && a.outcome === 'Rejected')
    case 'withdrawn':
      return apps.filter((a) => a.furthest === stage && a.outcome === 'Withdrawn')
    case 'declined':
      return apps.filter((a) => a.furthest === stage && a.outcome === 'Declined')
  }
}

/** Most common exit reason among applications, with its count. */
export function topReason(apps: readonly App[]): { reason: string; n: number } | null {
  const m = new Map<string, number>()
  for (const a of apps) if (a.reason) m.set(a.reason, (m.get(a.reason) ?? 0) + 1)
  const top = [...m].sort((x, y) => y[1] - x[1])[0]
  return top ? { reason: top[0], n: top[1] } : null
}

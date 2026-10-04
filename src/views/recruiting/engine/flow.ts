/**
 * Candidate flow for a cohort of applications (those applied in the window): how many reached
 * each stage, advanced, left (rejected, withdrawn, declined) or are still active there, the pass
 * rate, and the days each transition took. Also the "days per transition by month" grid.
 */
import type { Window } from '@/data/scope'
import { addMonths, formatMonthShort, monthKey, monthStart, monthsBetween } from '@/lib/dates'
import { median } from '@/lib/stats'
import { inWin, transitionDays } from './prepare'
import { defaultSettings } from './settings'
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

/** Applications with both dates for transition i (stage i to i + 1), with the days it took. */
export function measuredTransitions(apps: readonly App[], i: number): { app: App; days: number }[] {
  const out: { app: App; days: number }[] = []
  for (const a of apps) {
    const d = transitionDays(a, i)
    if (d != null) out.push({ app: a, days: d })
  }
  return out
}

function medianTransition(apps: readonly App[], i: number): { median: number | null; n: number } {
  const xs = measuredTransitions(apps, i).map((m) => m.days)
  return { median: median(xs), n: xs.length }
}

/**
 * The cohort's flow by stage. The change in median days shows only when both periods have at
 * least the anonymity minimum (5 by default) of measured candidates.
 */
export function stageFlow(
  current: readonly App[],
  prior: readonly App[],
  minGroup: number = defaultSettings().minGroup,
): Flow {
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
        cur.median != null && pri.median != null && cur.n >= minGroup && pri.n >= minGroup
          ? cur.median - pri.median
          : null,
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
  /** The steps measured; empty when the median is hidden (under the anonymity minimum), so it never drills. */
  steps: TransitionEvent[]
}

/**
 * Median days per transition by the month the step was completed (12 months to `end`), the same
 * rule as the bottleneck check. Grouping by completion month keeps recent months honest: grouping
 * by application month would leave only the fast candidates in recent cohorts and hide a slowdown.
 */
export function speedByMonth(
  apps: readonly App[],
  end: string,
  minGroup: number = defaultSettings().minGroup,
): SpeedCell[] {
  const months = monthsBetween(addMonths(monthStart(end), -11), end)
  const cells = new Map<string, TransitionEvent[]>()
  for (const m of months) for (let i = 0; i <= LAST_OPEN_STAGE; i++) cells.set(`${m}|${i}`, [])
  for (const a of apps) {
    for (let i = 0; i <= LAST_OPEN_STAGE; i++) {
      const done = a.dates[i + 1]
      if (!done || done > end) continue
      const d = transitionDays(a, i)
      if (d != null) cells.get(`${monthKey(done)}|${i}`)?.push({ app: a, i, days: d, end: done })
    }
  }
  const out: SpeedCell[] = []
  for (const m of months) {
    for (let i = 0; i <= LAST_OPEN_STAGE; i++) {
      const steps = cells.get(`${m}|${i}`) ?? []
      const shown = steps.length >= minGroup
      out.push({
        month: m,
        monthLabel: formatMonthShort(`${m}-01`, true),
        transition: TRANSITIONS[i],
        days: shown ? median(steps.map((e) => e.days)) : null,
        n: steps.length,
        steps: shown ? steps : [],
      })
    }
  }
  return out
}

export type FlowKind = 'advanced' | 'active' | 'rejected' | 'withdrawn' | 'declined' | 'left' | 'node'

const LEFT = new Set<string>(['Rejected', 'Withdrawn', 'Declined'])

/** Everyone in `apps` who left the process (rejected, withdrew or declined an offer). */
export const leftProcess = (apps: readonly App[]): App[] => apps.filter((a) => LEFT.has(a.outcome))

/** The applications behind one part of the river ('left': every exit at that stage). */
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
    case 'left':
      return apps.filter((a) => a.furthest === stage && LEFT.has(a.outcome))
  }
}

/** Most common exit reason among applications, with its count. */
export function topReason(apps: readonly App[]): { reason: string; n: number } | null {
  const m = new Map<string, number>()
  for (const a of apps) if (a.reason) m.set(a.reason, (m.get(a.reason) ?? 0) + 1)
  const top = [...m].sort((x, y) => y[1] - x[1])[0]
  return top ? { reason: top[0], n: top[1] } : null
}

/**
 * The Recruiter's home as data (docs/ROLES-V2.md 5.9): candidates lacking a next step by what
 * they lack (the hero's bar, painted by the worst aging tier in each), and My list's two lists:
 * the open reqs with their pipeline, and the candidates in the action queue. Every row is on the
 * recruiter's reqs (the context is scoped to them). Pure.
 */
import { inQueue } from '@/views/recruiting/engine/nextStep'
import type { ActiveItem } from '@/views/recruiting/engine/types'
import type { SplitPart } from './split'

export interface StatePart extends SplitPart {
  [key: string]: unknown
  red: number
  amber: number
  items: ActiveItem[]
}

/** The words a waiting candidate's state reads in, most waiting states first. */
const ORDER = ['Needs review', 'Needs scheduling', 'Needs decision', 'Offer pending']

/**
 * Active candidates lacking a timely next step (an aging tier), by the state they wait in, in the
 * pipeline's order; a state's segment is critical when overdue ones lead it, else watch.
 */
export function lackingParts(actives: readonly ActiveItem[]): StatePart[] {
  const lacking = actives.filter((x) => x.tier)
  const by = new Map<string, ActiveItem[]>()
  for (const x of lacking) {
    const list = by.get(x.label)
    if (list) list.push(x)
    else by.set(x.label, [x])
  }
  const keys = [...by.keys()].sort((a, b) => {
    const ia = ORDER.indexOf(a)
    const ib = ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  return keys.map((label) => {
    const items = by.get(label) ?? []
    const red = items.filter((x) => x.tier === 'red').length
    const amber = items.length - red
    return {
      key: label,
      label,
      count: items.length,
      paint: red >= amber ? 'critical' : 'warning',
      red,
      amber,
      items,
    }
  })
}

export interface QueueRow {
  [key: string]: unknown
  applicationId: string
  candidate: string
  reqId: string
  title: string | null
  stage: string
  waiting: string
  nextStep: string
  owner: string
  days: number
  aging: string
  item: ActiveItem
}

const TIER_WORD = { red: 'Overdue', amber: 'Watch' } as const

/** The candidates in the action queue (a next step someone owns), the longest wait first. */
export function queueRows(actives: readonly ActiveItem[], stageName: (i: number) => string): QueueRow[] {
  return actives
    .filter(inQueue)
    .map((x) => ({
      applicationId: x.app.id,
      candidate: x.app.name,
      reqId: x.app.reqId,
      title: x.app.title,
      stage: stageName(x.stage),
      waiting: x.label,
      nextStep: x.nextStep,
      owner: x.owner ?? 'Unassigned',
      days: x.days,
      aging: x.tier ? TIER_WORD[x.tier] : 'On time',
      item: x,
    }))
    .sort((a, b) => b.days - a.days || a.candidate.localeCompare(b.candidate))
}

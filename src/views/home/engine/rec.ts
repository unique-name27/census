/**
 * The Recruiter's home as data (docs/ROLES-V2.md 5.9): candidates lacking a next step by what
 * they lack (the hero's bar, painted by the worst aging tier in each), and My list's two lists:
 * the open reqs with their pipeline, and the candidates in the action queue. Every row is on the
 * recruiter's reqs (the context is scoped to them). Pure.
 */
import type { ISODate } from '@/data/schema'
import type { AgeBar } from '@/views/recruiting/engine/actions'
import { inQueue } from '@/views/recruiting/engine/nextStep'
import { isOpenAt } from '@/views/recruiting/engine/prepare'
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

/**
 * Active candidates on reqs open on the as-of date, and those on a req on hold (or otherwise not
 * open). The hero and the queue count only the first, as Needs attention does; the held ones are
 * said in a line, never counted as waiting on the recruiter.
 */
export function onOpenReqs(
  actives: readonly ActiveItem[],
  asOf: ISODate,
): { open: ActiveItem[]; held: ActiveItem[] } {
  const open: ActiveItem[] = []
  const held: ActiveItem[] = []
  for (const x of actives) (!x.app.req || isOpenAt(x.app.req, asOf) ? open : held).push(x)
  return { open, held }
}

/**
 * A req's Health with its age against its time-to-fill bar when it is past it ("1 lacks a next
 * step; open 165 d against a target of 45 d"), as Needs attention words it.
 */
export function healthWithAge(health: string, daysOpen: number, bar: AgeBar | null): string {
  if (!bar || daysOpen <= bar.past) return health
  const prefix = 'the target is '
  const against = bar.words.startsWith(prefix)
    ? `against a target of ${bar.words.slice(prefix.length)}`
    : `while ${bar.words}`
  // A funnel on track is not a req on track once it is past its bar: the age replaces the word.
  return health === 'On track' ? `Open ${daysOpen} d ${against}` : `${health}; open ${daysOpen} d ${against}`
}

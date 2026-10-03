/**
 * The live pipeline on the as-of date: active candidates per stage split by next-step state, the
 * waiting-time dots, and the action queue grouped by the owner of the next action.
 */
import type { Severity } from '@/components/types'
import { STAGES } from '@/data/schema'
import { median } from '@/lib/stats'
import { inQueue, STATE_NAME } from './nextStep'
import {
  type ActiveItem,
  LAST_OPEN_STAGE,
  NEXT_STATES,
  type NextState,
  type OwnerRole,
  type Tier,
} from './types'

export interface PipelineCell {
  stage: string
  stageIndex: number
  state: NextState
  stateName: string
  /** The sub-state words at this stage (Needs review, Needs scheduling, Offer pending, …). */
  label: string
  candidates: number
  /** Of these, lacking a timely next step. */
  lacking: number
  medianDaysWaiting: number | null
}

export interface PipelineStage {
  stage: string
  stageIndex: number
  active: number
  lacking: number
  medianDaysInStage: number | null
  cells: PipelineCell[]
}

export function pipelineToday(actives: readonly ActiveItem[]): PipelineStage[] {
  const out: PipelineStage[] = []
  for (let s = 0; s <= LAST_OPEN_STAGE; s++) {
    const here = actives.filter((x) => x.stage === s)
    const cells: PipelineCell[] = []
    for (const state of NEXT_STATES) {
      const list = here.filter((x) => x.state === state)
      if (!list.length) continue
      cells.push({
        stage: STAGES[s],
        stageIndex: s,
        state,
        stateName: STATE_NAME[state],
        label: list[0].label,
        candidates: list.length,
        lacking: list.filter((x) => x.tier).length,
        medianDaysWaiting: median(list.map((x) => x.days)),
      })
    }
    out.push({
      stage: STAGES[s],
      stageIndex: s,
      active: here.length,
      lacking: here.filter((x) => x.tier).length,
      medianDaysInStage: median(here.map((x) => x.daysInStage)),
      cells,
    })
  }
  return out
}

export const tierSeverity = (t: Tier | null): Severity | null =>
  t === 'red' ? 'critical' : t === 'amber' ? 'warning' : null

export const TIER_WORD: Record<Tier, string> = { red: 'Overdue', amber: 'Watch' }

export interface QueueRow {
  owner: string
  ownerRole: OwnerRole
  candidate: string
  applicationId: string
  reqId: string
  title: string
  department: string
  stage: string
  stageIndex: number
  state: NextState
  stateLabel: string
  days: number
  tier: string
  nextStep: string
  severity: Severity | null
}

export interface QueueGroup {
  owner: string
  role: OwnerRole
  items: ActiveItem[]
  red: number
  oldest: number
}

/** Queue items grouped by owner in a stable order: most items first, then by name. */
export function queueGroups(actives: readonly ActiveItem[]): QueueGroup[] {
  const m = new Map<string, QueueGroup>()
  for (const x of actives) {
    if (!inQueue(x)) continue
    const owner = x.owner ?? 'Unassigned'
    const key = `${x.ownerRole}|${owner}`
    let g = m.get(key)
    if (!g) {
      g = { owner, role: x.owner ? x.ownerRole : 'Unassigned', items: [], red: 0, oldest: 0 }
      m.set(key, g)
    }
    g.items.push(x)
    if (x.tier === 'red') g.red++
    g.oldest = Math.max(g.oldest, x.days)
  }
  const groups = [...m.values()]
  for (const g of groups) g.items.sort((a, b) => b.days - a.days || a.app.name.localeCompare(b.app.name))
  return groups.sort((a, b) => b.items.length - a.items.length || a.owner.localeCompare(b.owner))
}

export function queueRows(groups: readonly QueueGroup[]): QueueRow[] {
  return groups.flatMap((g) =>
    g.items.map((x) => ({
      owner: g.owner,
      ownerRole: g.role,
      candidate: x.app.name,
      applicationId: x.app.id,
      reqId: x.app.reqId,
      title: x.app.title,
      department: x.app.department ?? '—',
      stage: STAGES[x.stage],
      stageIndex: x.stage,
      state: x.state,
      stateLabel: x.label,
      days: x.days,
      tier: x.tier ? TIER_WORD[x.tier] : '',
      nextStep: x.nextStep,
      severity: tierSeverity(x.tier),
    })),
  )
}

export interface WaitDot {
  applicationId: string
  candidate: string
  stage: string
  days: number
  state: string
  tier: string
  tone: 'default' | 'deemph' | 'warning' | 'critical'
}

export function waitingDots(actives: readonly ActiveItem[]): WaitDot[] {
  return actives.map((x) => ({
    applicationId: x.app.id,
    candidate: x.app.name,
    stage: STAGES[x.stage],
    days: x.days,
    state: x.label,
    tier: x.tier ? TIER_WORD[x.tier] : 'On time',
    tone:
      x.tier === 'red'
        ? 'critical'
        : x.tier === 'amber'
          ? 'warning'
          : x.state === 'scheduled'
            ? 'deemph'
            : 'default',
  }))
}

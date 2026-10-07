/**
 * My team, Waiting on this org (docs/ROLES.md 2.2, docs/DESIGN-REFRESH.md 4.2): the Action
 * center's open items that the scope's leader or someone in their org owns, anywhere in the
 * company, the leader's own first. The items are the Action center's (`collectActions` for the
 * same context), kept to what Manager mode lists. Pure.
 */
import { itemShown } from '@/access/items'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { actionKpis, type Collected, compareActions, type OpenAction } from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { managerAnswers } from './sources'

/** How many items the page lists before "Open the Action center". */
export const WAITING_SHOWN = 10

/**
 * Open items owned by the leader or someone in their org (the Action center's "My team" relation),
 * that Manager mode lists, the leader's own first, then by severity and due date.
 */
export function waitingItems(
  ctx: AnalyticsContext,
  collected: Collected,
  isOpen: (id: string) => boolean,
): OpenAction[] {
  const manager = managerAnswers(ctx)
  return collected.items
    .filter((a) => (a.team === 'leader' || a.team === 'org') && isOpen(a.id) && itemShown(manager, a.item))
    .sort((a, b) => (a.team === 'leader' ? 0 : 1) - (b.team === 'leader' ? 0 : 1) || compareActions(a, b))
}

/**
 * The tile: the Action center's "Open items" count over the items the org owns, opening the same
 * items and the Action center from its label.
 */
export function waitingKpi(ctx: AnalyticsContext, items: readonly OpenAction[]): Kpi | null {
  const open = actionKpis(items, ctx).find((k) => k.metricId === ACTIONS.open)
  if (!open) return null
  const leader = items.filter((a) => a.team === 'leader').length
  return {
    ...open,
    id: 'waiting',
    // The items the org holds, not the ones about it (the masthead and Action center count both).
    label: 'Owned by people in this org',
    note: leader ? `Open items, ${leader} the leader's own` : 'Open items they hold, not those about the org',
    link: { view: 'actions', label: 'Action center' },
  }
}

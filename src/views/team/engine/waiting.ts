/**
 * My team's Needs attention (docs/ROLES-V2.md 5.12; docs/ROLES.md 2.2): the Action center's split
 * for Manager mode over the views it shows, so the page, the masthead and the Action center agree
 * (6.2, check 1). "Needs attention" is the manager's own items (interview decisions on their reqs,
 * probation decisions, the training item for their team, stay conversations); "Waiting on others"
 * holds the rest of their area, such as day-one contingencies held by People operations. Items are
 * open in this browser by the marks the Action center keeps (a changed roll-up reopens). In
 * Developer mode, previewing a leader's page, the same split is made with Manager mode's lists and
 * the leader as the manager. Pure.
 */
import { itemShown, lensOf, roleItems } from '@/access/items'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import {
  actionKpis,
  type Collected,
  foldRoleLists,
  type OpenAction,
  roleView,
  settingsOf,
} from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { managerAnswers, teamLeader } from './sources'

/** How many items the page lists before "Show all" (the Action center lists every one). */
export const WAITING_SHOWN = 10

export interface TeamLists {
  /** The manager's own open items, most pressing first. */
  needs: OpenAction[]
  /** Open items in their area that someone else holds. */
  waiting: OpenAction[]
}

/** The two lists for the org on screen, over the items open in this browser. */
export function teamLists(
  ctx: AnalyticsContext,
  collected: Collected,
  isOpen: (a: OpenAction) => boolean,
): TeamLists {
  if (ctx.access.mode === 'manager') {
    const v = roleView(collected, ctx, isOpen)
    return { needs: v.needs, waiting: v.waiting }
  }
  // A preview: Manager mode's lists, with the leader on screen as the manager.
  const leader = teamLeader(ctx)
  const answers = managerAnswers(ctx)
  const items = collected.items.filter((a) => isOpen(a) && itemShown(answers, a.item))
  const lens = {
    ...lensOf({ mode: 'manager', scope: null, lock: null }, ctx.asOf, settingsOf(ctx.metrics).escalationDays),
    me: leader,
  }
  const r = foldRoleLists(roleItems(items, lens), lens, ctx)
  return { needs: r.needs, waiting: r.waiting }
}

/** The tile: Needs attention's count, opening the same items and the Action center from its label. */
export function waitingKpi(ctx: AnalyticsContext, needs: readonly OpenAction[]): Kpi | null {
  const open = actionKpis(needs, ctx).find((k) => k.metricId === ACTIONS.open)
  if (!open) return null
  const overdue = needs.filter((a) => a.item.due && a.item.due < ctx.asOf).length
  return {
    ...open,
    id: 'waiting',
    label: 'Needs attention',
    note: needs.length
      ? `Your own open items${overdue ? `, ${overdue} overdue` : ''}`
      : 'Nothing is waiting on you',
    link: { view: 'actions', label: 'Action center' },
  }
}

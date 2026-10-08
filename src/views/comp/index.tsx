/**
 * Compensation: is pay positioned where policy says, is it fair relative to performance and the
 * market, is the merit cycle on budget, and what does the workforce cost? Ratios always; amounts
 * only with "Show pay amounts"; cost totals (Workforce cost) with the switch, or always in Finance.
 */
import { fmt } from '@/lib/format'
import type { ViewDef } from '../types'
import { compActions, compSummary } from './engine/actions'
import { costHeadline } from './engine/cost'
import { COMPA } from './engine/lineage'
import { type CompModel, compaHeadline } from './engine/model'
import { CompHeaderActions } from './HeaderActions'
import { M } from './metrics'
import { NoCompData, PayNotice, useCompModel } from './shared'
import { Cost } from './tabs/Cost'
import { Cycle } from './tabs/Cycle'
import { Market } from './tabs/Market'
import { Overview } from './tabs/Overview'
import { Performance } from './tabs/Performance'
import { Ranges } from './tabs/Ranges'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'ranges', label: 'Range position' },
  { key: 'performance', label: 'Pay for performance' },
  { key: 'market', label: 'Market' },
  { key: 'cycle', label: 'Merit cycle' },
  { key: 'cost', label: 'Workforce cost' },
]

function Body({ tab, m }: { tab: string; m: CompModel }) {
  switch (tab) {
    case 'ranges':
      return <Ranges m={m} />
    case 'performance':
      return <Performance m={m} />
    case 'market':
      return <Market m={m} />
    case 'cycle':
      return <Cycle m={m} />
    case 'cost':
      return <Cost m={m} />
    default:
      return <Overview m={m} />
  }
}

function View({ tab }: { tab: string }) {
  const m = useCompModel()
  if (!m.pop.people.length) return <NoCompData m={m} />
  return (
    <>
      <PayNotice m={m} />
      <Body tab={tab} m={m} />
    </>
  )
}

export const view: ViewDef = {
  key: 'comp',
  label: 'Compensation',
  tabs: TABS,
  View,
  // Finance sees Workforce cost only, so its tab reads the target cash cost instead of a ratio.
  headline: (ctx) =>
    ctx.access.pay === 'totals'
      ? costHeadline(ctx)
      : {
          value: fmt(compaHeadline(ctx), 'ratio'),
          label: 'median compa-ratio',
          metricId: M.compaMedian,
          uses: COMPA,
        },
  // Workforce cost reads open reqs (at range midpoint) and the optional budget (src/lib/budget.ts).
  datasets: ['comp', 'employees', 'reviews', 'jobChanges', 'requisitions', 'budget'],
  HeaderActions: CompHeaderActions,
  summary: compSummary,
  actions: compActions,
}

/**
 * Compensation: is pay positioned where policy says, is it fair relative to performance and the
 * market, and is the merit cycle on budget? Ratios always; amounts only with "Show pay amounts".
 */
import { fmt } from '@/lib/format'
import type { ViewDef } from '../types'
import { COMPA } from './engine/lineage'
import { type CompModel, compaHeadline } from './engine/model'
import { CompHeaderActions } from './HeaderActions'
import { M } from './metrics'
import { NoCompData, PayNotice, useCompModel } from './shared'
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
  headline: (ctx) => ({
    value: fmt(compaHeadline(ctx), 'ratio'),
    label: 'median compa-ratio',
    metricId: M.compaMedian,
    uses: COMPA,
  }),
  datasets: ['comp', 'employees', 'reviews', 'jobChanges'],
  HeaderActions: CompHeaderActions,
}

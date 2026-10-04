import { Button, EmptyState, goTo } from '@/components'
import { useAnalytics } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ViewDef } from '../types'
import { filterUses, peopleManagers, REPORTING_USES, refs } from './engine'
import { ORG_METRIC } from './metrics'
import { ChartTab } from './ui/ChartTab'
import { SandboxTab } from './ui/SandboxTab'

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  if (!ctx.all.employees.length) {
    return (
      <EmptyState
        title="Upload Employees to see the org chart"
        body="The chart is drawn from the Employees roster: employee ID, name, title and manager ID. Requisitions add open roles under their hiring manager, and Reviews add ratings to the detail panel."
        action={
          <Button variant="primary" size="sm" onClick={() => goTo('data')}>
            Open the Data room
          </Button>
        }
      />
    )
  }
  if (
    !ctx.all.employees.some(
      (e) => e.hireDate <= ctx.asOf && (!e.terminationDate || e.terminationDate > ctx.asOf),
    )
  ) {
    return (
      <EmptyState
        title="Nobody is active on the as-of date"
        body="Check the as-of date in the Data room. The chart shows everyone hired on or before it who has not left."
      />
    )
  }
  return tab === 'sandbox' ? <SandboxTab /> : <ChartTab />
}

export const view: ViewDef = {
  key: 'org',
  label: 'Org chart',
  tabs: [
    { key: 'chart', label: 'Chart' },
    { key: 'sandbox', label: 'Reorg sandbox' },
  ],
  View,
  headline: (ctx) => ({
    value: fmt(peopleManagers(ctx).managers, 'int'),
    label: 'people managers',
    metricId: ORG_METRIC.managers,
    // The same fields as the People managers key figure.
    uses: refs(REPORTING_USES, filterUses(ctx.filters)),
  }),
  datasets: ['employees', 'requisitions', 'reviews', 'jobChanges'],
}

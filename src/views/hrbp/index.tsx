import { Button, EmptyState, goTo } from '@/components'
import { useAnalytics } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ViewDef } from '../types'
import { hrbpHeadline } from './engine'
import { Attrition } from './ui/Attrition'
import { HeaderActions } from './ui/HeaderActions'
import { Movement } from './ui/Movement'
import { useHrbp } from './ui/model'
import { OrgDesign } from './ui/OrgDesign'
import { Overview } from './ui/Overview'
import { Workforce } from './ui/Workforce'

function Body({ tab }: { tab: string }) {
  const m = useHrbp()
  switch (tab) {
    case 'workforce':
      return <Workforce m={m} />
    case 'attrition':
      return <Attrition m={m} />
    case 'movement':
      return <Movement m={m} />
    case 'org':
      return <OrgDesign m={m} />
    default:
      return <Overview m={m} />
  }
}

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  if (!ctx.all.employees.length) {
    return (
      <EmptyState
        title="Upload Employees to see this view"
        body="Headcount, attrition, movement and org design all come from the Employees roster. Job changes and Reviews add promotions and exit ratings."
        action={
          <Button variant="primary" size="sm" onClick={() => goTo('data')}>
            Open the Data room
          </Button>
        }
      />
    )
  }
  if (!ctx.data.employees.length) {
    return (
      <EmptyState
        title="Nobody matches these filters"
        body="Widen the filters above to see this view. The leader, business unit, department, location and level filters all narrow the roster."
      />
    )
  }
  return <Body tab={tab} />
}

export const view: ViewDef = {
  key: 'hrbp',
  label: 'HR business partners',
  tabs: [
    { key: 'overview', label: 'Overview' },
    { key: 'workforce', label: 'Workforce' },
    { key: 'attrition', label: 'Attrition' },
    { key: 'movement', label: 'Movement' },
    { key: 'org', label: 'Org design' },
  ],
  View,
  headline: (ctx) => {
    const h = hrbpHeadline(ctx)
    return { value: fmt(h.value, 'int'), label: 'employees', spark: h.spark }
  },
  datasets: ['employees', 'jobChanges', 'reviews'],
  HeaderActions,
}

/**
 * Compliance and right to work (docs/VIEWS.md, Compliance): work authorizations expiring and
 * reverification, Form I-9 timeliness, export-control licenses, required training and policy
 * acknowledgments (a summary that links to Talent and Onboarding), and statutory deadlines from
 * the Hire-to-Retire Atlas calendar. Never nationality or citizenship; authorization types show
 * per person only while "Show immigration details" is on.
 */
import { useMemo } from 'react'
import { Switch } from '@/components'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import type { ViewDef } from '../types'
import { actions, compute, headline, summary } from './engine'
import { DeadlinesTab } from './ui/DeadlinesTab'
import { ExportTab } from './ui/ExportTab'
import { Overview } from './ui/Overview'
import { WorkTab } from './ui/WorkTab'

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const m = useMemo(() => compute(ctx), [ctx])
  switch (tab) {
    case 'work':
      return <WorkTab m={m} ctx={ctx} />
    case 'export':
      return <ExportTab m={m} ctx={ctx} />
    case 'deadlines':
      return <DeadlinesTab m={m} ctx={ctx} />
    default:
      return <Overview m={m} ctx={ctx} />
  }
}

/**
 * The "Show immigration details" switch (session only, never saved; Settings > Privacy holds the
 * same switch).
 */
function ComplianceHeaderActions() {
  const on = useCensus((s) => s.showImmigration)
  const set = useCensus((s) => s.setShowImmigration)
  return (
    <span data-tour="compliance-immigration-switch" className="inline-flex">
      <Switch
        checked={on}
        onChange={set}
        label={
          <span>
            Show immigration<span className="max-sm:hidden"> details</span>
          </span>
        }
      />
    </span>
  )
}

export const view: ViewDef = {
  key: 'compliance',
  label: 'Compliance',
  tabs: [
    { key: 'overview', label: 'Overview' },
    { key: 'work', label: 'Right to work' },
    { key: 'export', label: 'Export control' },
    { key: 'deadlines', label: 'Deadlines' },
  ],
  View,
  headline,
  datasets: ['employees', 'learning', 'onboardingTasks', 'rightToWork'],
  HeaderActions: ComplianceHeaderActions,
  summary,
  actions,
}

/**
 * Recruiting: are we hiring the people we need, fast enough, and where is the process stuck?
 * For TA leads preparing a weekly review with hiring leaders.
 */
import type { ViewDef } from '../types'
import { headline } from './engine/kpis'
import { OverviewTab } from './ui/OverviewTab'
import { PipelineTab } from './ui/PipelineTab'
import { RequisitionsTab } from './ui/RequisitionsTab'
import { SourcesTab } from './ui/SourcesTab'

function View({ tab }: { tab: string }) {
  switch (tab) {
    case 'pipeline':
      return <PipelineTab />
    case 'requisitions':
      return <RequisitionsTab />
    case 'sources':
      return <SourcesTab />
    default:
      return <OverviewTab />
  }
}

export const view: ViewDef = {
  key: 'recruiting',
  label: 'Recruiting',
  tabs: [
    { key: 'overview', label: 'Overview' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'requisitions', label: 'Requisitions' },
    { key: 'sources', label: 'Sources & offers' },
  ],
  View,
  headline,
  datasets: ['requisitions', 'candidates'],
}

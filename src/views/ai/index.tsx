/**
 * AI in HR: the catalog of Glean agents the HR team can use, organized by HR area, with what
 * each one is for and when not to use it (docs/VIEWS.md, AI in HR). It reads no datasets, so
 * nothing here is gated by the data standard. The catalog is kept in this browser.
 */
import type { ViewDef } from '../types'
import { catalogHeadline } from './catalog'
import { useAiAgents } from './state'
import { AgentsTab } from './ui/AgentsTab'
import { HeaderActions } from './ui/HeaderActions'

function View(_: { tab: string }) {
  return <AgentsTab />
}

export const view: ViewDef = {
  key: 'ai',
  label: 'AI in HR',
  tabs: [{ key: 'agents', label: 'Agents' }],
  View,
  headline: () => catalogHeadline(useAiAgents.getState().agents),
  datasets: [],
  HeaderActions,
}

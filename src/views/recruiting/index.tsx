import type { ViewDef } from '../types'

/** STUB: replaced by the Recruiting view builder. */
function View({ tab }: { tab: string }) {
  return <div className="p-8 text-ink-2">Recruiting — {tab || 'overview'}</div>
}

export const view: ViewDef = {
  key: 'recruiting',
  label: 'Recruiting',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline: () => ({ value: '—', label: 'coming soon' }),
  datasets: ['requisitions', 'candidates'],
}

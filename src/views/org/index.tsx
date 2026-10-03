import type { ViewDef } from '../types'

/** STUB: replaced by the Org chart builder. */
function View({ tab }: { tab: string }) {
  return <div className="p-8 text-ink-2">Org chart — {tab || 'chart'}</div>
}

export const view: ViewDef = {
  key: 'org',
  label: 'Org chart',
  tabs: [{ key: 'chart', label: 'Chart' }],
  View,
  headline: () => ({ value: '—', label: 'coming soon' }),
  datasets: ['employees'],
}

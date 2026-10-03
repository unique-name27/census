import type { ViewDef } from '../types'

/** STUB: replaced by the HR business partners view builder. */
function View({ tab }: { tab: string }) {
  return <div className="p-8 text-ink-2">HR business partners — {tab || 'overview'}</div>
}

export const view: ViewDef = {
  key: 'hrbp',
  label: 'HR business partners',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline: () => ({ value: '—', label: 'coming soon' }),
  datasets: ['employees', 'jobChanges', 'reviews'],
}

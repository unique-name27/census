import type { ViewDef } from '../types'

/** STUB: replaced by the Compensation view builder. */
function View({ tab }: { tab: string }) {
  return <div className="p-8 text-ink-2">Compensation — {tab || 'overview'}</div>
}

export const view: ViewDef = {
  key: 'comp',
  label: 'Compensation',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline: () => ({ value: '—', label: 'coming soon' }),
  datasets: ['comp', 'employees', 'reviews'],
}

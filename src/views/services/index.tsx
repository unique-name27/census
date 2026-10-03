import type { ViewDef } from '../types'

/** STUB: replaced by the Employee services view builder. */
function View({ tab }: { tab: string }) {
  return <div className="p-8 text-ink-2">Employee services — {tab || 'overview'}</div>
}

export const view: ViewDef = {
  key: 'services',
  label: 'Employee services',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline: () => ({ value: '—', label: 'coming soon' }),
  datasets: ['cases','transactions','employees'],
}

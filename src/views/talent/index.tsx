import type { ViewDef } from '../types'

/** STUB: replaced by the Talent view builder. */
function View({ tab }: { tab: string }) {
  return <div className="p-8 text-ink-2">Talent — {tab || 'overview'}</div>
}

export const view: ViewDef = {
  key: 'talent',
  label: 'Talent',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline: () => ({ value: '—', label: 'coming soon' }),
  datasets: ['reviews','succession','learning','employees','jobChanges'],
}

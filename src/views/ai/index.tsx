import type { ViewDef } from '../types'

/** STUB: replaced by the AI in HR builder. */
function View({ tab }: { tab: string }) {
  return <div className="p-8 text-ink-2">AI in HR — {tab || 'agents'}</div>
}

export const view: ViewDef = {
  key: 'ai',
  label: 'AI in HR',
  tabs: [{ key: 'agents', label: 'Agents' }],
  View,
  headline: () => ({ value: '—', label: 'coming soon' }),
  datasets: [],
}

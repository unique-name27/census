/**
 * "Report a problem": a plain-text summary of where the reader is and how the data is set up, to
 * paste into a message or ticket. It never holds people data: no names, employee IDs, file names
 * or values from the data. The leader filter is reported as set or not; org filters as how many
 * values are picked. Pure, so the privacy promise is tested.
 */
import type { PeriodPreset } from '@/data/scope'

export interface DiagnosticDataset {
  label: string
  source: 'sample' | 'upload'
  rows: number
  tier: string
}

export interface DiagnosticInput {
  viewLabel: string
  tabLabel: string | null
  /** The route as the address bar shows it, without any record IDs: "#hrbp.attrition". */
  address: string
  period: { preset: PeriodPreset; label: string }
  leaderSet: boolean
  orgFilters: { label: string; count: number }[]
  peopleInScope: number | null
  standard: string
  asOf: string
  asOfSource: 'sample' | 'data' | 'set by you'
  datasets: readonly DiagnosticDataset[]
  definitionsChanged: number
  mappingChanges: number
  switches: { label: string; on: boolean }[]
  display: string
  storage: string
  version: string
  browser: string
  windowSize: string
  at: string
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/**
 * The address with any record identifiers dropped: a metric id is fine (it names a definition),
 * a dataset panel is fine (it names a dataset), anything else after the tab is cut. The scope
 * after "?" (leader employee IDs, departments, locations) goes first, on every page.
 */
export function safeAddress(hash: string): string {
  const h = hash.startsWith('#') ? hash : `#${hash}`
  const route = h.slice(1).split('?')[0]
  const [rawView, tab = ''] = route.split('.')
  // Views are words; anything else in that place is not one.
  const view = rawView.match(/^[a-zA-Z0-9-]*/)?.[0] ?? ''
  if (!view) return '#'
  if (!tab) return `#${view}`
  // Tabs are words; metric addresses are words and slashes. Anything after them is cut.
  const clean = tab.match(/^[a-zA-Z0-9/:-]*/)?.[0] ?? ''
  return clean ? `#${view}.${clean}` : `#${view}`
}

/** The summary, one fact per line. */
export function diagnosticText(d: DiagnosticInput): string {
  const filters = [
    d.leaderSet ? 'leader set (name left out)' : null,
    ...d.orgFilters
      .filter((f) => f.count > 0)
      .map((f) => `${f.label.toLowerCase()}: ${plural(f.count, 'value')}`),
  ].filter(Boolean)
  const lines = [
    'Census problem report',
    `Created ${d.at}. No names, employee IDs, file names or values from the data are included.`,
    '',
    `Page: ${d.viewLabel}${d.tabLabel ? `, ${d.tabLabel}` : ''} (${d.address})`,
    `Period: ${d.period.label} (${d.period.preset})`,
    `Filters: ${filters.length ? filters.join('; ') : 'none'}`,
    d.peopleInScope == null ? null : `People in scope: ${d.peopleInScope.toLocaleString('en-US')}`,
    `Data standard: ${d.standard}`,
    `As of: ${d.asOf} (${d.asOfSource})`,
    `Definitions changed from defaults: ${d.definitionsChanged}`,
    `Category mapping changes: ${d.mappingChanges}`,
    `Session switches: ${d.switches.map((s) => `${s.label} ${s.on ? 'on' : 'off'}`).join('; ')}`,
    '',
    'Datasets (source, rows, tier):',
    ...d.datasets.map((x) => `- ${x.label}: ${x.source}, ${plural(x.rows, 'row')}, ${x.tier}`),
    '',
    `Display: ${d.display}`,
    `Browser storage: ${d.storage}`,
    `App version: ${d.version}`,
    `Browser: ${d.browser}`,
    `Window: ${d.windowSize}`,
    '',
    'What happened, and what did you expect to see?',
  ]
  return lines.filter((l): l is string => l != null).join('\n')
}

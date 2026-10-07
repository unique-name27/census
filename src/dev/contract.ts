/**
 * Contract checks (docs/DESIGN-REFRESH.md 4.3): every figure, KPI tile and readout finding carries
 * a metric id and `uses`, and every KPI and finding opens its records. "Run contract checks" lays
 * out every view's tabs off screen (the figure scan) and judges what each declared. Figures about
 * the app or the data itself (`gate={false}`: the Data room's, the Developer page's) are not judged.
 * Pure.
 */
import type { FigureScan, ScannedFigure } from './scanModel'

/** What an element lacks, most serious last; 'complete' when it lacks nothing. */
export type ContractStatus = 'complete' | 'no-metric' | 'no-uses' | 'no-drill'

export const CONTRACT_ORDER: readonly ContractStatus[] = ['complete', 'no-metric', 'no-uses', 'no-drill']

export const CONTRACT_LABEL: Record<ContractStatus, string> = {
  complete: 'Complete',
  'no-metric': 'Missing metric id',
  'no-uses': 'Missing uses',
  'no-drill': 'KPI or finding without a drill',
}

/** The status color each one takes (status is the subject of the coverage chart). */
export const CONTRACT_TONE: Record<ContractStatus, 'good' | 'warning' | 'serious' | 'critical'> = {
  complete: 'good',
  'no-metric': 'warning',
  'no-uses': 'serious',
  'no-drill': 'critical',
}

export type ContractKind = 'figure' | 'kpi' | 'finding'

export interface ContractElement {
  view: string
  viewLabel: string
  tab: string
  tabLabel: string
  element: ContractKind
  id: string
  /** What the reader sees: the figure title, or the strip or readout it sits in. */
  title: string
  missing: ContractStatus[]
  /** The most serious gap, or 'complete'. */
  status: ContractStatus
}

const worst = (missing: readonly ContractStatus[]): ContractStatus =>
  [...CONTRACT_ORDER].reverse().find((s) => missing.includes(s)) ?? 'complete'

function elementsOf(f: ScannedFigure): ContractElement[] {
  const base = { view: f.view, viewLabel: f.viewLabel, tab: f.tab, tabLabel: f.tabLabel }
  if (f.kind === 'figure') {
    // Figures about the app or the data itself are not people numbers: not judged.
    if (!f.gated) return []
    const missing: ContractStatus[] = []
    if (!f.metric) missing.push('no-metric')
    if (!f.uses?.length) missing.push('no-uses')
    return [{ ...base, element: 'figure', id: f.id, title: f.title, missing, status: worst(missing) }]
  }
  if (!f.items) return []
  const kind: ContractKind = f.items.kind === 'kpi' ? 'kpi' : 'finding'
  return f.items.list.map((it) => {
    const missing: ContractStatus[] = []
    if (!it.metricId) missing.push('no-metric')
    if (!it.uses) missing.push('no-uses')
    if (!it.drill) missing.push('no-drill')
    return { ...base, element: kind, id: it.id, title: f.title, missing, status: worst(missing) }
  })
}

/** Every judged element of a scan, in view and tab order. */
export const contractElements = (scan: Pick<FigureScan, 'figures'>): ContractElement[] =>
  scan.figures.flatMap(elementsOf)

export interface CoverageRow {
  view: string
  viewLabel: string
  status: ContractStatus
  statusLabel: string
  count: number
}

/** Elements per view by status, for the 100% bars; every status of every view, zeros included. */
export function contractCoverage(elements: readonly ContractElement[]): CoverageRow[] {
  const views: { view: string; viewLabel: string }[] = []
  for (const e of elements)
    if (!views.some((v) => v.view === e.view)) views.push({ view: e.view, viewLabel: e.viewLabel })
  return views.flatMap((v) =>
    CONTRACT_ORDER.map((status) => ({
      ...v,
      status,
      statusLabel: CONTRACT_LABEL[status],
      count: elements.filter((e) => e.view === v.view && e.status === status).length,
    })),
  )
}

/** The share of judged elements that are complete; null before any is judged. */
export function coverageShare(elements: readonly ContractElement[]): number | null {
  if (!elements.length) return null
  return elements.filter((e) => e.status === 'complete').length / elements.length
}

export interface CheckedRow {
  view: string
  viewLabel: string
  tabs: number
  figures: number
  kpis: number
  findings: number
  /** Not judged: figures about the app or the data itself. */
  notJudged: number
  ms: number
  failedTabs: string
}

/** What a run checked, per view, with the time the layout took. */
export function checkedRows(scan: FigureScan): CheckedRow[] {
  return scan.views.map((v) => {
    const figs = scan.figures.filter((f) => f.view === v.key)
    const count = (kind: 'kpi' | 'finding') =>
      figs.reduce((n, f) => n + (f.items?.kind === kind ? f.items.list.length : 0), 0)
    return {
      view: v.key,
      viewLabel: v.label,
      tabs: v.tabs.length,
      figures: figs.filter((f) => f.kind === 'figure' && f.gated).length,
      kpis: count('kpi'),
      findings: count('finding'),
      notJudged: figs.filter((f) => f.kind === 'figure' && !f.gated).length,
      ms: v.tabs.reduce((n, t) => n + t.ms, 0),
      failedTabs: v.tabs
        .filter((t) => t.failed)
        .map((t) => t.label)
        .join(', '),
    }
  })
}

export interface GapRow {
  view: string
  viewLabel: string
  tab: string
  tabLabel: string
  element: string
  id: string
  title: string
  missing: string
  status: ContractStatus
}

const ELEMENT_LABEL: Record<ContractKind, string> = { figure: 'Figure', kpi: 'KPI', finding: 'Finding' }

/** Every element with a gap, most serious first. */
export function gapRows(elements: readonly ContractElement[]): GapRow[] {
  return elements
    .filter((e) => e.status !== 'complete')
    .map((e) => ({
      view: e.view,
      viewLabel: e.viewLabel,
      tab: e.tab,
      tabLabel: e.tabLabel,
      element: ELEMENT_LABEL[e.element],
      id: e.id,
      title: e.title,
      missing: e.missing.map((m) => CONTRACT_LABEL[m]).join(', '),
      status: e.status,
    }))
    .sort((a, b) => CONTRACT_ORDER.indexOf(b.status) - CONTRACT_ORDER.indexOf(a.status))
}

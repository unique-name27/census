/**
 * The figure scan (docs/ROLES.md, 5.3) as data: what every view's tabs declared when they were laid
 * out off screen with `renderWholeView`, in one mode. "Scan figures" runs it in Developer mode,
 * "Scan as Manager" with Manager mode's access, and "Run contract checks" reads the same result.
 * Results stay in memory until reload. Pure: the DOM part is in `scan.ts`.
 */
import type { Mode } from '@/access/modes'
import type { FigureFacts, FigureItemFacts } from '@/charts/types'
import type { Tier } from '@/data/quality/tier'

/** One figure (or table-only registration) as a scan saw it. */
export interface ScannedFigure {
  id: string
  title: string
  view: string
  viewLabel: string
  tab: string
  tabLabel: string
  metric: string | null
  /** Fields it declares; null when it declares none. */
  uses: readonly string[] | null
  gated: boolean
  rows: number
  tier: Tier | null
  /** Below the data standard: its exports carry the reason instead of the data. */
  withheld: boolean
  image: boolean
  kind: 'figure' | 'table'
  items: { kind: 'kpi' | 'finding'; list: readonly FigureItemFacts[] } | null
}

export interface ScannedTab {
  key: string
  label: string
  /** The tab threw while it was laid out. */
  failed: boolean
  ms: number
}

export interface ScannedView {
  key: string
  label: string
  tabs: ScannedTab[]
}

export interface FigureScan {
  mode: Mode
  /** Manager mode: whose org. */
  managerId: string | null
  /** ISO date-time the scan finished. */
  at: string
  ms: number
  views: ScannedView[]
  figures: ScannedFigure[]
}

/** One tab's facts as scanned figures, in on-screen order. */
export function scannedFigures(
  view: { key: string; label: string },
  tab: { key: string; label: string },
  facts: readonly FigureFacts[],
): ScannedFigure[] {
  return [...facts]
    .sort((a, b) => a.order - b.order)
    .map((f) => ({
      id: f.id,
      title: f.title,
      view: view.key,
      viewLabel: view.label,
      tab: tab.key,
      tabLabel: tab.label,
      metric: f.metric ?? null,
      uses: f.uses?.length ? f.uses : null,
      gated: f.gated,
      rows: f.rows,
      tier: f.tier ?? null,
      withheld: !!f.withheld,
      image: f.image,
      kind: f.kind,
      items: f.items ?? null,
    }))
}

/** Figures only (no KPI strips or readouts), deduplicated by view and id: what "Figures" counts. */
export function figuresOnly(scan: Pick<FigureScan, 'figures'> | null | undefined): ScannedFigure[] {
  if (!scan) return []
  return scan.figures.filter((f) => f.kind === 'figure')
}

/** The distinct figure ids a scan found (a figure on two tabs counts once). */
export function distinctFigureIds(scan: Pick<FigureScan, 'figures'> | null | undefined): string[] {
  return [...new Set(figuresOnly(scan).map((f) => f.id))]
}

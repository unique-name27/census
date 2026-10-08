/**
 * The figure scan (docs/ROLES.md, 5.3; docs/ROLES-V2.md 5.13) as data: what every view's tabs
 * declared when they were laid out off screen with `renderWholeView`, in one mode. "Scan figures"
 * runs it in Developer mode, "Scan as role" with another mode's access (and its pick), and "Run
 * contract checks" reads the Developer result. A Developer scan lays out the Home view once per
 * role, each in its own mode: its tabs are keyed by role and its figures say which role (`as`).
 * Results stay in memory until reload. Pure: the DOM part is in `scan.ts`.
 */
import type { Mode, ModePicks } from '@/access/modes'
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
  /** The role a home was laid out as inside another mode's scan (the Developer scan's homes). */
  as?: Mode
}

export interface ScannedTab {
  key: string
  label: string
  /** The tab threw while it was laid out. */
  failed: boolean
  ms: number
  /** The role this tab was laid out as (a home in the Developer scan; the key is the mode). */
  as?: Mode
}

export interface ScannedView {
  key: string
  label: string
  tabs: ScannedTab[]
}

export interface FigureScan {
  mode: Mode
  /** The pick the mode was laid out for (only the mode's own kind; empty for a mode with none). */
  picks: Partial<ModePicks>
  /** That pick in words: "APAC", "Priya Raman's org", "every recruiter"; null for none. */
  scope: string | null
  /** ISO date-time the scan finished. */
  at: string
  ms: number
  views: ScannedView[]
  figures: ScannedFigure[]
}

/** One tab's facts as scanned figures, in on-screen order. */
export function scannedFigures(
  view: { key: string; label: string },
  tab: { key: string; label: string; as?: Mode },
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
      ...(tab.as ? { as: tab.as } : {}),
    }))
}

/** Where a scanned figure is decided: a home laid out as a role sits on the Home view's one tab. */
export const figurePlace = (f: Pick<ScannedFigure, 'view' | 'tab' | 'as'>): { view: string; tab: string } =>
  f.as ? { view: f.view, tab: 'overview' } : { view: f.view, tab: f.tab }

/** Figures only (no KPI strips or readouts), deduplicated by view and id: what "Figures" counts. */
export function figuresOnly(scan: Pick<FigureScan, 'figures'> | null | undefined): ScannedFigure[] {
  if (!scan) return []
  return scan.figures.filter((f) => f.kind === 'figure')
}

/** The distinct figure ids a scan found (a figure on two tabs counts once). */
export function distinctFigureIds(scan: Pick<FigureScan, 'figures'> | null | undefined): string[] {
  return [...new Set(figuresOnly(scan).map((f) => f.id))]
}

/**
 * Metrics by view and tier, the lead of the Data quality tab (docs/CHARTS.md, Data room): how
 * many of each practice's metrics stand at each tier. A segment narrows "Metrics by tier" below
 * to that view and tier, a bar to the view; its rows open each metric's definition.
 */
import { type Column, Figure, HBars, useChartTheme } from '@/charts'
import { TIER_LABEL, type Tier } from '@/data/quality/tier'
import { fmt, plural } from '@/lib/format'
import { METRIC_VIEW_LABEL } from '@/metrics/registry'
import type { MetricView } from '@/metrics/types'
import { DATA_METRIC } from '../roomMetrics'
import { metricTiersByView, TIER_SERIES, type ViewTierCell } from './engine/byView'
import type { MetricTierRow, UnjudgedEntry } from './engine/impact'

/**
 * What the metric lists leave out: "17 dictionary entries read no data and are not shown: 13 rules
 * and settings, 3 AI in HR metrics and 1 Data room metric". Null when nothing is left out.
 */
export function unjudgedNote(list: readonly UnjudgedEntry[], verb: 'shown' | 'listed'): string | null {
  if (!list.length) return null
  const rules = list.filter((u) => u.rule).length
  const views = new Map<MetricView, number>()
  for (const u of list) if (!u.rule) views.set(u.view, (views.get(u.view) ?? 0) + 1)
  const parts = [
    ...(rules ? [plural(rules, 'rule or setting', 'rules and settings')] : []),
    ...[...views].map(([v, n]) => plural(n, `${METRIC_VIEW_LABEL[v]} metric`)),
  ]
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  const n = list.length
  return `${plural(n, 'dictionary entry', 'dictionary entries')} read no data and ${n === 1 ? 'is' : 'are'} not ${verb}: ${what}`
}

/** What "Metrics by tier" is narrowed to: a view, and a tier within it. */
export interface MetricPick {
  view: MetricView
  viewLabel: string
  tier: Tier | null
}

const COLUMNS: Column<ViewTierCell>[] = [
  { key: 'viewLabel', label: 'View' },
  { key: 'tierLabel', label: 'Tier' },
  { key: 'metrics', label: 'Metrics', format: 'int' },
]

export function MetricsByViewFigure({
  rows,
  unjudged,
  onPick,
}: {
  rows: readonly MetricTierRow[]
  /** Entries that read no data, named in the note (a view whose metrics all read none has no bar). */
  unjudged: readonly UnjudgedEntry[]
  onPick: (pick: MetricPick) => void
}) {
  const t = useChartTheme()
  const cells = metricTiersByView(rows)
  const colors: Record<string, string> = {
    [TIER_LABEL.gold]: t.tier.gold,
    [TIER_LABEL.silver]: t.tier.silver,
    [TIER_LABEL.bronze]: t.tier.bronze,
    [TIER_LABEL.none]: t.deemph,
  }
  const below = rows.filter((r) => r.tier !== 'gold').length
  const pick = (c: ViewTierCell, tier: Tier | null) => {
    onPick({ view: c.view, viewLabel: c.viewLabel, tier })
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById('data-quality-metrics-anchor')
      ?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }
  return (
    <Figure
      id="data-quality-metrics-by-view"
      metric={DATA_METRIC.metricTiers}
      // About the data itself: the Data room never gates.
      uses={[]}
      gate={false}
      span={12}
      title="Metrics by view and tier"
      subtitle="How many of each view’s metrics stand at each tier today"
      data={cells}
      columns={COLUMNS}
      note={[
        `${fmt(below, 'int')} of ${fmt(rows.length, 'int')} metrics below gold`,
        unjudgedNote(unjudged, 'shown'),
      ]
        .filter(Boolean)
        .join(' · ')}
      empty={rows.length ? null : 'No registered metric reads data yet.'}
    >
      <HBars
        data={cells}
        y="viewLabel"
        x="metrics"
        series="tierLabel"
        stack
        seriesOrder={TIER_SERIES.map((x) => TIER_LABEL[x])}
        colors={(name) => colors[name] ?? t.deemph}
        yOrder={[...new Set(cells.map((c) => c.viewLabel))]}
        format="int"
        onSelect={(c) => pick(c, null)}
        onSelectSegment={(c) => pick(c, c.tier)}
      />
    </Figure>
  )
}

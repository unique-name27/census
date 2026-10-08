/**
 * Compensation's home (docs/ROLES-V2.md 5.6): pay position against policy, the outliers to fix,
 * and how the merit cycle is going. The share in the healthy band leads over the range position
 * of everyone with a range; then the key figures, the compa-ratio distribution and merit cycle
 * progress; Needs attention (Total rewards' items); My list, the people outside their range; and
 * where pay sits low. Amounts show only with "Show pay amounts" on (`pay: true` columns).
 */
import { useState } from 'react'
import { type Column, Figure, HBars, Heatmap, Histogram, type RefLine } from '@/charts'
import { Grid, KpiStrip, Section } from '@/components'
import type { Kpi } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { PROGRESS_COLUMNS } from '@/views/comp/columns'
import { binColumns, binItems, progressColumns } from '@/views/comp/drillColumns'
import {
  type BelowCauseRow,
  belowCauseDrill,
  type CompaCell,
  compaCellDrill,
} from '@/views/comp/engine/charts'
import { FIGURE_METRIC } from '@/views/comp/engine/definitions'
import { compaBinDrill, lazyDrill, outsideDrill, positionDrill } from '@/views/comp/engine/drill'
import { COMPA_STEP, type CompModel, compModel } from '@/views/comp/engine/model'
import type { Position } from '@/views/comp/engine/population'
import { M } from '@/views/comp/metrics'
import { emptyIf, MISSING } from '@/views/comp/shared'
import { ProgressChart, progressRows } from '@/views/comp/tabs/Cycle'
import { edges } from '@/views/comp/tabs/Overview'
import { HOME_SHOWN } from '../engine/attention'
import { type OutsideListRow, outsideList, positionParts } from '../engine/comp'
import { tile } from '../engine/kpis'
import { AttentionSection } from './Attention'
import { Hero, ListFigure, ListSwitch } from './Frames'
import { useHomeItems } from './useHomeItems'

/* ───────── in the healthy band ───────── */

function InBand({ m }: { m: CompModel }) {
  const inBand = m.kpis.find((k) => k.id === 'in-band')
  const row = m.overview.positionAll
  const parts = positionParts(row)
  const s = m.settings
  const columns: Column<(typeof parts)[number]>[] = [
    { key: 'label', label: 'Range position' },
    {
      key: 'count',
      label: 'People',
      format: 'int',
      drill: (r) => lazyDrill(r.count, () => positionDrill(m, row, r.key as Position)),
    },
    { key: 'share', label: 'Share', format: 'pct' },
  ]
  return (
    <Hero
      id="home-comp-in-band"
      metric={M.inBand}
      uses={inBand?.uses ?? m.uses['comp-position-by-bu']}
      title="In the healthy band"
      subtitle={`Compa-ratio between ${fmt(s.bandLow, 'ratio')} and ${fmt(s.bandHigh, 'ratio')}, with everyone's position in their range`}
      value={inBand?.value == null ? '—' : fmt(inBand.value, inBand.format ?? 'pct0')}
      valueDrill={inBand?.drill}
      valueLabel="Show the people in their healthy band"
      label="in their healthy band"
      line={`${plural(m.ranges.below.length, 'person', 'people')} below minimum, ${plural(m.ranges.above.length, 'person', 'people')} above maximum`}
      parts={parts}
      unit="people"
      onSegment={(key) => drill(positionDrill(m, row, key as Position))}
      ariaLabel="People by position in their salary range"
      data={parts}
      columns={columns}
      definitions={[...m.definitions['comp-position-by-bu']]}
      note={`${plural(row.n, 'person', 'people')} with a salary range · as of ${formatDate(m.asOf)}`}
      empty={m.pop.has.ranges ? (row.n ? null : 'No range data in this scope.') : MISSING.ranges}
    />
  )
}

/* ───────── compa-ratio distribution ───────── */

function Distribution({ m }: { m: CompModel }) {
  const o = m.overview
  const s = m.settings
  const lastBin = o.hist.length - 1
  const refs: RefLine[] = [{ value: 1, label: 'Midpoint 1.00' }]
  return (
    <Figure
      id="home-comp-distribution"
      uses={m.uses['comp-compa-distribution']}
      metric={FIGURE_METRIC['comp-compa-distribution']}
      title="Compa-ratio distribution"
      subtitle={`People per ${fmt(COMPA_STEP, 'ratio')} of compa-ratio, the healthy band shaded, as of ${formatDate(m.asOf)}`}
      data={o.hist}
      columns={binColumns(m, o.hist, 'compa')}
      definitions={m.definitions['comp-compa-distribution']}
      note={`${plural(o.people.length, 'person', 'people')}${o.median == null ? '' : ` · ${fmt(o.median, 'ratio')} median`}`}
      span={8}
      empty={emptyIf(o.hist, null, 'No compa-ratios in this scope.')}
    >
      <Histogram
        data={binItems(o.hist)}
        value="v"
        thresholds={edges(o.histDomain, COMPA_STEP)}
        domain={o.histDomain ?? undefined}
        format="ratio"
        band={[s.bandLow, s.bandHigh]}
        bandLabel={`Healthy band ${fmt(s.bandLow, 'ratio')}-${fmt(s.bandHigh, 'ratio')}`}
        refs={refs}
        unit="people"
        ariaLabel="Histogram of compa-ratios"
        onSelect={(b) => {
          const i = b.rows[0]?.bin
          if (i != null) drill(compaBinDrill(m, o.hist[i], i === lastBin))
        }}
      />
    </Figure>
  )
}

/* ───────── merit cycle progress ───────── */

function CycleProgress({ m }: { m: CompModel }) {
  const rows = progressRows(m)
  const t = m.cycle.progress.total
  return (
    <Figure
      id="home-comp-cycle"
      uses={m.uses['comp-cycle-progress']}
      metric={FIGURE_METRIC['comp-cycle-progress']}
      title="Merit cycle progress"
      subtitle="Proposals entered as a share of eligible people, by business unit, with spend against budget"
      data={rows}
      columns={progressColumns(m, PROGRESS_COLUMNS)}
      definitions={m.definitions['comp-cycle-progress']}
      note={`${fmt(t.proposed, 'int')} of ${fmt(t.eligible, 'int')} eligible have a proposal · as of ${formatDate(m.asOf)}`}
      span={4}
      empty={emptyIf(
        rows,
        m.pop.has.merit ? null : MISSING.merit,
        'No one in this scope is eligible this cycle.',
      )}
    >
      <ProgressChart m={m} rows={rows} />
    </Figure>
  )
}

/* ───────── my list: outside the range ───────── */

type Side = 'below' | 'above'

function OutsideList({ m }: { m: CompModel }) {
  const ctx = useAnalytics()
  const [side, setSide] = useState<Side>('below')
  const all = outsideList(m)
  const rows = all.filter((r) => r.side === side)
  const one = (r: OutsideListRow) => () =>
    outsideDrill(m, side, [r.person], `${r.name}, ${side === 'below' ? 'below minimum' : 'above maximum'}`)
  const columns: Column<OutsideListRow>[] = [
    { key: 'id', label: 'Employee ID' },
    { key: 'name', label: 'Name', drill: one },
    { key: 'job', label: 'Job' },
    { key: 'department', label: 'Department' },
    { key: 'level', label: 'Level' },
    { key: 'location', label: 'Location' },
    { key: 'compa', label: 'Compa-ratio', format: 'ratio', drill: one },
    { key: 'penetration', label: 'Range penetration', format: 'pct0' },
    {
      key: 'gapPct',
      label: side === 'below' ? 'Increase to minimum' : 'Over maximum',
      format: 'pct',
      drill: one,
    },
    { key: 'merit', label: 'Merit proposal', format: 'pct' },
    { key: 'lastIncrease', label: 'Last increase', format: 'date' },
    ...(m.promotionsShown
      ? [{ key: 'promoted', label: 'Promoted, last 12 months' } as Column<OutsideListRow>]
      : []),
    { key: 'rating', label: 'Latest rating', format: 'num1' },
    { key: 'baseUsd', label: 'Base (USD)', format: 'money', pay: true },
    { key: 'minUsd', label: 'Range minimum (USD)', format: 'money', pay: true },
    { key: 'maxUsd', label: 'Range maximum (USD)', format: 'money', pay: true },
    {
      key: 'gapUsd',
      label: side === 'below' ? 'Gap to minimum (USD)' : 'Over maximum (USD)',
      format: 'money',
      pay: true,
    },
  ]
  const below = all.filter((r) => r.side === 'below').length
  const above = all.length - below
  return (
    <ListFigure<OutsideListRow>
      metric={side === 'below' ? M.belowMin : M.aboveMax}
      uses={m.uses[side === 'below' ? 'comp-below-minimum' : 'comp-above-maximum']}
      title={side === 'below' ? 'People below their range minimum' : 'People above their range maximum'}
      subtitle={`Largest gap first, as of ${formatDate(m.asOf)}`}
      rows={rows}
      columns={columns}
      definitions={m.definitions[side === 'below' ? 'comp-below-minimum' : 'comp-above-maximum']}
      note={`${plural(below, 'person', 'people')} below minimum, ${plural(above, 'person', 'people')} above maximum${ctx.showPay ? '' : ' · amounts show with Show pay amounts on'} · a row opens the person`}
      actions={
        <ListSwitch<Side>
          value={side}
          onChange={setSide}
          options={[
            { value: 'below', label: `Below minimum (${fmt(below, 'int')})` },
            { value: 'above', label: `Above maximum (${fmt(above, 'int')})` },
          ]}
        />
      }
      onRowClick={(r) => openPerson(r.id)}
      empty={
        m.pop.has.ranges
          ? side === 'below'
            ? 'Nobody in this scope is paid below range minimum.'
            : 'Nobody in this scope is paid above range maximum.'
          : MISSING.ranges
      }
    />
  )
}

/* ───────── where pay sits low ───────── */

function Outliers({ m }: { m: CompModel }) {
  const grid = m.overview.compaGrid
  const cellDrill = (c: CompaCell) => lazyDrill(c.members.length, () => compaCellDrill(m, c))
  return (
    <Figure
      id="home-comp-outliers"
      uses={m.uses['comp-compa-location-level']}
      metric={FIGURE_METRIC['comp-compa-location-level']}
      title="Median compa-ratio by location and level"
      subtitle={`Median base salary ÷ range midpoint by level group, 1.00 at the midpoint, as of ${formatDate(m.asOf)}`}
      data={grid.cells}
      columns={[
        { key: 'location', label: 'Location', format: 'text' },
        { key: 'levelGroup', label: 'Level group', format: 'text' },
        { key: 'n', label: 'People', format: 'int', drill: cellDrill },
        { key: 'median', label: 'Median compa-ratio', format: 'ratio', drill: cellDrill },
      ]}
      definitions={m.definitions['comp-compa-location-level']}
      note={`${fmt(grid.locations.length, 'int')} locations${grid.hiddenCells ? ` · ${fmt(grid.hiddenCells, 'int')} cells under ${m.rules.minGroup} people hidden` : ''}`}
      span={6}
      empty={emptyIf(grid.cells, m.pop.has.ranges ? null : MISSING.ranges, 'No compa-ratios in this scope.')}
    >
      <Heatmap
        data={grid.cells}
        x="levelGroup"
        y="location"
        value="median"
        n="n"
        format="ratio"
        scheme="diverging"
        mid={1}
        domain={[0.85, 1.15]}
        xOrder={grid.groups}
        yOrder={grid.locations}
        rowHeight={26}
        ariaLabel="Median compa-ratio by location and level group"
        onSelect={(c) => drill(cellDrill(c))}
      />
    </Figure>
  )
}

function BelowCause({ m }: { m: CompModel }) {
  const bc = m.ranges.belowCause
  const causeDrill = (d: BelowCauseRow) =>
    lazyDrill(d.people, () => belowCauseDrill(m, bc, d.location, d.cause))
  const locationDrill = (d: { location: string }) =>
    lazyDrill(bc.totals.get(d.location)?.length, () => belowCauseDrill(m, bc, d.location, null))
  return (
    <Figure
      id="home-comp-below-cause"
      uses={m.uses['comp-below-min-cause']}
      metric={FIGURE_METRIC['comp-below-min-cause']}
      title="Below range minimum by location and cause"
      subtitle={`People paid under their range minimum, by whether they were promoted or hired in the last 12 months, as of ${formatDate(m.asOf)}`}
      data={bc.rows}
      columns={[
        { key: 'location', label: 'Location', format: 'text' },
        { key: 'cause', label: 'Cause', format: 'text' },
        { key: 'people', label: 'People', format: 'int', drill: causeDrill },
      ]}
      definitions={m.definitions['comp-below-min-cause']}
      note={`${plural(bc.total, 'person', 'people')} below minimum${m.promotionsShown ? '' : ` · promotions not shown: ${m.belowStandard.toLowerCase()}`}`}
      span={6}
      empty={emptyIf(
        bc.locations,
        m.pop.has.ranges ? null : MISSING.ranges,
        'Nobody in this scope is paid below range minimum.',
      )}
    >
      <HBars
        data={bc.rows}
        y="location"
        x="people"
        series="cause"
        stack
        seriesOrder={bc.causes}
        yOrder={bc.locations}
        format="int"
        ariaLabel="People below range minimum by location and cause"
        onSelect={(d) => drill(locationDrill(d))}
        onSelectSegment={(d) => drill(causeDrill(d))}
      />
    </Figure>
  )
}

/* ───────── page ───────── */

export function CompHome() {
  const ctx = useAnalytics()
  const m = compModel(ctx)
  const items = useHomeItems()
  const cycle = m.cycle.kpis
  const kpis: Kpi[] = [
    ...tile(m.kpis, 'median-compa', { view: 'comp', tab: 'overview', label: 'Compensation, Overview' }),
    ...tile(m.kpis, 'below-min', { view: 'comp', tab: 'ranges', label: 'Compensation, Range position' }),
    ...tile(m.kpis, 'above-max', { view: 'comp', tab: 'ranges', label: 'Compensation, Range position' }),
    ...tile(m.kpis, 'merit-spend', { view: 'comp', tab: 'cycle', label: 'Compensation, Merit cycle' }),
    ...tile(cycle, 'eligible', { view: 'comp', tab: 'cycle', label: 'Compensation, Merit cycle' }),
    ...tile(m.kpis, 'p4p', { view: 'comp', tab: 'performance', label: 'Compensation, Pay for performance' }),
  ]
  return (
    <>
      <Grid>
        <InBand m={m} />
        <KpiStrip id="home-comp-kpis" title="Key figures" kpis={kpis} span={8} />
        <Distribution m={m} />
        <CycleProgress m={m} />
      </Grid>
      <AttentionSection
        items={items}
        shown={HOME_SHOWN}
        dek="Total rewards' open items: pay below range minimum, merit spend over budget, high performers paid low in range, proposals outside the guideline or missing."
      />
      <Section
        title="My list"
        dek="The people paid outside their range, to plan moves before the cycle closes."
      >
        <OutsideList m={m} />
      </Section>
      <Section
        title="Where pay sits low"
        dek="Pay position by location and level, and why people sit below their range minimum."
      >
        <Outliers m={m} />
        <BelowCause m={m} />
      </Section>
    </>
  )
}

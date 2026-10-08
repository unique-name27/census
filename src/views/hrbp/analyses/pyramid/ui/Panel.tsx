/**
 * The Level pyramid's figures (docs/ANALYSES.md, 5.5), inside the shared frame: the workforce
 * pyramid (the lead), size against the level below, spans at each management level, how each
 * level changed in 12 months, and the level mix by business unit. Every mark and every count cell
 * opens its records; levels and business units offer Filter to.
 */
import { useState } from 'react'
import { BarList, Figure, HBars, Pyramid, RangeBars, seriesColor, useChartTheme } from '@/charts'
import type { Column } from '@/charts/types'
import { Section, Segmented } from '@/components'
import { useChartHeight } from '@/components/useNarrow'
import type { AnalyticsContext } from '@/data/context'
import type { Level } from '@/data/schema'
import { type DrillSource, drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { fmt, fmtDelta } from '@/lib/format'
import { ID } from '@/views/hrbp/metrics'
import { present } from '../../fields'
import { AnalysisFrame } from '../../shell/AnalysisFrame'
import type { AnalysisPanelProps } from '../../types'
import type { PyramidModel } from '../engine'
import {
  changeSpec,
  flowSpec,
  mixSpec,
  ratioSpec,
  rowSpec,
  segmentSpec,
  spanSpec,
  yearAgoSpec,
} from '../engine/drill'
import { PYRAMID_FIGURES as F } from '../engine/ids'
import { FLOW, MIX, PYRAMID, RATIO_BELOW, SPANS } from '../engine/lineage'
import { PYRAMID_METRIC } from '../engine/metrics'
import {
  BANDS,
  type FlowRow,
  type LevelRow,
  MAX_UNITS,
  type MixRow,
  NOT_RECORDED,
  OTHER_UNITS,
  type PyramidData,
  type RatioRow,
  type SegmentRow,
  SPLITS,
  type SpanRow,
  type SplitKey,
  splitLabel,
  TRACKS,
} from '../engine/model'

type Compare = 'yearAgo' | 'company'

/** One row of the pyramid's table and exports: a level, or a level's segment of a split (long form). */
interface PyramidTableRow {
  split: string
  level: Level
  label: string
  track: string
  segment: string
  today: number
  yearAgo: number | null
  company: number | null
  change: number | null
  growth: number | null
  shareOfTotal: number | null
  shareOfLevel: number | null
  span: number | null
  drillToday: DrillSource
  drillYearAgo: DrillSource
  drillChange: DrillSource
}

/** A level as the chart draws it: the bar, the outline in force, its segments and its drills. */
interface ChartRow extends LevelRow {
  outline: number | null
  span: number | null
  segments: SegmentRow[]
}

const ALL = 'All'

/** A median span as people count it: "6", "3.5". */
const spanText = (v: number): string => fmt(v, 'num1').replace(/\.0$/, '')

function tableRows(d: PyramidData): PyramidTableRow[] {
  const out: PyramidTableRow[] = []
  for (const r of d.main.rows)
    out.push({
      split: 'None',
      level: r.level,
      label: r.label,
      track: r.track,
      segment: ALL,
      today: r.today,
      yearAgo: r.yearAgo,
      company: r.company,
      change: r.change,
      growth: r.growth,
      shareOfTotal: r.share,
      shareOfLevel: null,
      span: d.spanByLevel.get(r.level)?.median ?? null,
      drillToday: () => rowSpec(d, r),
      drillYearAgo: r.yearAgoRecords.length ? () => yearAgoSpec(d, r) : null,
      drillChange: r.change ? () => changeSpec(d, r) : null,
    })
  const min = d.prep.set.minGroup
  for (const split of ['businessUnit', 'tenure', 'workerType'] as const)
    for (const s of d.segments[split]) {
      const change = s.yearAgo == null ? null : s.today - s.yearAgo
      out.push({
        split: splitLabel(split),
        level: s.level,
        label: (d.main.rows.find((r) => r.level === s.level) as LevelRow).label,
        track: (d.main.rows.find((r) => r.level === s.level) as LevelRow).track,
        segment: s.segment,
        today: s.today,
        yearAgo: s.yearAgo,
        company: null,
        change,
        growth: s.yearAgo != null && s.yearAgo >= min && change != null ? change / s.yearAgo : null,
        shareOfTotal: null,
        shareOfLevel: s.shareOfLevel,
        span: null,
        drillToday: s.today ? () => segmentSpec(d, s) : null,
        drillYearAgo: null,
        drillChange: null,
      })
    }
  return out
}

function PyramidLead({ model }: { model: PyramidModel }) {
  const d = model.data
  const p = d.prep
  const [split, setSplit] = useState<SplitKey>('none')
  const [compare, setCompare] = useState<Compare>('yearAgo')
  const height = useChartHeight('lead')
  const asOf = formatDate(d.asOf)
  const workers = split === 'workerType'
  const pop = workers ? d.workers : d.main
  // The company's shape is offered under an org filter (and in Manager mode); a year ago otherwise.
  const outlineIs: Compare = d.scoped && compare === 'company' ? 'company' : 'yearAgo'
  const segs = split === 'none' ? [] : d.segments[split]
  const rows: ChartRow[] = pop.rows.map((r) => ({
    ...r,
    outline: outlineIs === 'company' ? r.company : r.yearAgo,
    span: d.spanByLevel.get(r.level)?.median ?? null,
    segments: segs.filter((s) => s.level === r.level),
  }))
  const table = tableRows(d)
  const outlineWord = outlineIs === 'company' ? 'the company, scaled to this org' : 'a year ago'
  const who = workers ? 'Workers' : p.set.countContractors ? 'Employees and contractors' : 'Employees'
  const noLevel = pop.noLevel.length
  const notes = [
    `${pop.total.toLocaleString('en-US')} ${workers ? 'workers' : 'people'} with a level · as of ${asOf}`,
    ...(noLevel
      ? [
          `${noLevel.toLocaleString('en-US')} ${noLevel === 1 ? 'person' : 'people'} with no level ${noLevel === 1 ? 'is' : 'are'} not in the pyramid`,
        ]
      : []),
    ...(workers ? ['Worker type adds contractors and interns to the pyramid'] : []),
    ...(outlineIs === 'yearAgo' && d.noHistory ? [d.noHistory.replace(/\.$/, '')] : []),
    'The table and exports hold every split',
  ]
  // Business units keep the slot of their place in the company (a filter never repaints them);
  // contractors and interns keep the slots of the Workforce "Contractors and interns" figure.
  const theme = useChartTheme()
  const unitColors: Record<string, string> = Object.fromEntries([
    ...d.units.slice(0, MAX_UNITS).map((u, i) => [u, seriesColor(theme, i)]),
    [OTHER_UNITS, theme.deemph],
    [NOT_RECORDED, theme.deemph],
  ])
  const workerColors: Record<string, string> = {
    Contractors: seriesColor(theme, 0),
    Interns: seriesColor(theme, 1),
    Employees: seriesColor(theme, 2),
    'Type not recorded': theme.deemph,
  }
  const segmentDrill = (r: ChartRow, key: string) => {
    const s = r.segments.find((x) => x.segment === key)
    return s ? segmentSpec(d, s) : null
  }
  const columns: Column<PyramidTableRow>[] = [
    { key: 'split', label: 'Split', format: 'text' },
    { key: 'label', label: 'Level', format: 'text', sortValue: (r) => r.level },
    { key: 'track', label: 'Track', format: 'text' },
    { key: 'segment', label: 'Segment', format: 'text' },
    { key: 'today', label: 'Today', format: 'int', drill: (r) => r.drillToday },
    ...(d.hasHistory
      ? [
          {
            key: 'yearAgo',
            label: 'A year ago',
            format: 'int' as const,
            drill: (r: PyramidTableRow) => r.drillYearAgo,
          },
          {
            key: 'change',
            label: 'Change',
            format: 'int' as const,
            drill: (r: PyramidTableRow) => r.drillChange,
          },
          { key: 'growth', label: 'Growth', format: 'pct' as const },
        ]
      : []),
    ...(d.scoped ? [{ key: 'company', label: 'Company, scaled', format: 'num1' as const }] : []),
    { key: 'shareOfTotal', label: 'Share of employees', format: 'pct' },
    { key: 'shareOfLevel', label: 'Share of level', format: 'pct' },
    { key: 'span', label: 'Median span', format: 'num1' },
  ]
  return (
    <Figure
      id={F.pyramid}
      metric={ID.headcount}
      uses={p.uses(PYRAMID)}
      title="Workforce pyramid"
      subtitle={`${who} at each level on ${asOf}, L1 at the bottom, with ${outlineWord} outlined`}
      data={table}
      columns={columns}
      definitions={p.defs(ID.headcount, PYRAMID_METRIC.levelMix, ID.medianSpan)}
      note={notes.join(' · ')}
      span={8}
      emptyHeight={height}
      empty={
        pop.total ? null : 'No one in this scope has a level. Add Level to Employees to see the pyramid.'
      }
      actions={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Visible names, so "A year ago | Company" reads as what it compares with. */}
          <span className="flex items-center gap-2">
            <span className="text-meta text-muted" aria-hidden="true">
              Split
            </span>
            <Segmented
              label="Split"
              value={split}
              onChange={setSplit}
              options={SPLITS.map((s) => ({ value: s.key, label: s.label }))}
            />
          </span>
          {d.scoped && (
            <span className="flex items-center gap-2">
              <span className="text-meta text-muted" aria-hidden="true">
                Compare with
              </span>
              <Segmented
                label="Compare with"
                value={compare}
                onChange={setCompare}
                options={[
                  { value: 'yearAgo', label: 'A year ago' },
                  { value: 'company', label: 'Company' },
                ]}
              />
            </span>
          )}
        </div>
      }
    >
      <Pyramid
        data={rows}
        id="level"
        label="label"
        shortLabel="level"
        value="today"
        outline="outline"
        valueLabel="Today"
        outlineLabel={outlineIs === 'company' ? 'Company, scaled' : 'A year ago'}
        barLegend={split === 'none' ? 'Bar: today' : undefined}
        outlineLegend={`Outline: ${outlineWord}`}
        segments={
          split === 'none' ? undefined : (r) => r.segments.map((s) => ({ key: s.segment, value: s.today }))
        }
        seriesOrder={split === 'none' ? undefined : d.segmentOrder[split]}
        scheme={split === 'tenure' ? 'ordinal' : 'categorical'}
        colors={split === 'businessUnit' ? unitColors : split === 'workerType' ? workerColors : undefined}
        groups={TRACKS.map((t) => ({ label: t.track, keys: t.levels }))}
        columns={[
          { text: (r) => r.today.toLocaleString('en-US'), narrow: true, weight: 600 },
          ...(outlineIs === 'yearAgo' && d.hasHistory
            ? [
                {
                  text: (r: ChartRow) => (r.change == null ? null : fmtDelta(r.change, 'int')),
                  muted: true,
                  narrow: true,
                },
              ]
            : []),
          {
            text: (r) => (r.span == null ? null : `span ${spanText(r.span)}`),
            muted: true,
          },
        ]}
        notes={split === 'workerType' ? [] : model.notes}
        tipRows={(r, segment) => {
          const out = []
          if (r.change != null)
            out.push({
              value: `${fmtDelta(r.change, 'int')}${r.growth == null ? '' : ` (${fmt(r.growth, 'deltaPct')})`}`,
              label: 'Change in 12 months',
            })
          if (outlineIs === 'yearAgo' && r.company != null)
            out.push({ value: fmt(r.company, 'num1'), label: 'Company, scaled' })
          if (outlineIs === 'company' && r.yearAgo != null)
            out.push({ value: fmt(r.yearAgo, 'int'), label: 'A year ago' })
          out.push({ value: fmt(r.share, 'pct'), label: workers ? 'Share of workers' : 'Share of employees' })
          if (r.span != null) out.push({ value: spanText(r.span), label: 'Median span' })
          const s = segment ? r.segments.find((x) => x.segment === segment) : undefined
          if (s)
            out.push({
              value: `${fmt(s.today, 'int')}${s.shareOfLevel == null ? '' : ` (${fmt(s.shareOfLevel, 'pct')} of the level)`}`,
              label: s.segment,
              strong: true,
            })
          return out
        }}
        onSelect={(r) => drill(() => rowSpec(d, r, workers))}
        onSelectSegment={(r, key) => drill(() => segmentDrill(r, key))}
        ariaLabel={`Workforce pyramid, ${who.toLowerCase()} at each level, top level first`}
      />
    </Figure>
  )
}

function RatioFigure({ d }: { d: PyramidData }) {
  const p = d.prep
  const tolerance = d.prep.ctx.metrics.num(PYRAMID_METRIC.ratioBelow, 'tolerance')
  // Bottom pair last, so the list reads up the pyramid like the chart above it.
  const rows = [...d.ratios].reverse()
  const open =
    (r: RatioRow): DrillSource =>
    () =>
      ratioSpec(d, r)
  const flagged = d.ratios.filter((r) => r.inverted).length
  return (
    <Figure
      id={F.ratioBelow}
      metric={PYRAMID_METRIC.ratioBelow}
      uses={p.uses(RATIO_BELOW)}
      title="Size against the level below"
      subtitle={`People at each level for each person in the level below, ${formatDate(d.asOf)}`}
      data={rows}
      columns={[
        { key: 'key', label: 'Levels', format: 'text' },
        { key: 'ratio', label: 'Ratio', format: 'times', drill: open },
        { key: 'upperCount', label: 'People at the level', format: 'int', drill: open },
        { key: 'lowerCount', label: 'People in the level below', format: 'int', drill: open },
      ]}
      definitions={p.defs(PYRAMID_METRIC.ratioBelow)}
      note={`A warning mark on the individual track above ${fmt(1 + tolerance, 'times')}${flagged ? '' : ' (none)'} · as of ${formatDate(d.asOf)}`}
      span={6}
      empty={d.main.total ? null : 'No one in this scope has a level.'}
    >
      <BarList
        data={rows}
        label="key"
        value="ratio"
        format="times"
        sort="none"
        secondary={(r) =>
          `${r.upperCount.toLocaleString('en-US')} and ${r.lowerCount.toLocaleString('en-US')}`
        }
        ref={{ value: 1, label: 'Same size as the level below' }}
        glyphTone={(r) => (r.inverted ? 'warning' : 'default')}
        nullNote={`Hidden: the level below has fewer than ${p.set.minGroup} people`}
        onSelect={(r) => drill(open(r))}
        ariaLabel="Size of each level against the level below"
      />
    </Figure>
  )
}

function SpansFigure({ d, ctx }: { d: PyramidData; ctx: AnalyticsContext }) {
  const p = d.prep
  const { wide, narrow } = p.set.spanOutliers
  const open = (r: SpanRow): DrillSource => (r.median == null ? null : () => spanSpec(d, r))
  const any = d.spans.some((r) => r.managers > 0)
  const managersOf = (r: SpanRow) =>
    `${r.managers.toLocaleString('en-US')} ${r.managers === 1 ? 'manager' : 'managers'}`
  return (
    <Figure
      id={F.spans}
      metric={ID.medianSpan}
      uses={p.uses(SPANS)}
      title="Spans at each management level"
      subtitle={`Active direct reports per manager, every worker type, ${formatDate(d.asOf)}`}
      data={d.spans}
      columns={[
        { key: 'label', label: 'Level', format: 'text' },
        { key: 'managers', label: 'Managers', format: 'int', drill: open },
        { key: 'min', label: 'Fewest', format: 'int' },
        { key: 'q1', label: '25th percentile', format: 'num1' },
        { key: 'median', label: 'Median span', format: 'num1', drill: open },
        { key: 'q3', label: '75th percentile', format: 'num1' },
        { key: 'max', label: 'Most', format: 'int' },
      ]}
      definitions={p.defs(ID.medianSpan, ID.span)}
      note={`Levels with fewer than ${p.set.minGroup} managers show no span · Org chart band: narrow at ${narrow} or fewer, wide at ${wide} or more`}
      span={6}
      empty={
        !present(ctx, 'employees.managerId')
          ? 'Add Manager ID to Employees to see spans at each management level.'
          : any
            ? null
            : 'No managers at M1 and above in this scope.'
      }
    >
      <RangeBars
        data={d.spans}
        y="label"
        min="min"
        max="max"
        mid="median"
        q1="q1"
        q3="q3"
        format="num1"
        labels={{ min: 'Fewest', max: 'Most', mid: 'Median span' }}
        secondary={managersOf}
        glyphTone={(r) => (r.flag ? 'warning' : 'default')}
        glyphLabel={(r) => (r.flag === 'wide' ? 'Wide' : r.flag === 'narrow' ? 'Narrow' : null)}
        lockedNote={(r) => (r.median == null ? `Hidden to protect anonymity (n < ${p.set.minGroup})` : null)}
        onSelect={(r) => drill(open(r))}
        ariaLabel="Spans at each management level: the range, middle half and median of direct reports per manager"
      />
    </Figure>
  )
}

function FlowFigure({ d }: { d: PyramidData }) {
  const p = d.prep
  const cell =
    (c: Parameters<typeof flowSpec>[2]) =>
    (r: FlowRow): DrillSource => {
      const n = c === 'yearAgo' ? r.yearAgo : c === 'today' ? r.today : r[c]
      return n ? () => flowSpec(d, r, c) : null
    }
  // Top level first, as the pyramid reads.
  const rows = [...d.flow].reverse()
  return (
    <Figure
      id={F.flow}
      metric={PYRAMID_METRIC.levelFlow}
      uses={p.uses(FLOW)}
      title="How each level changed in 12 months"
      subtitle={`From ${formatDate(d.yearAgoDate)} to ${formatDate(d.asOf)}: a year ago, plus hires and promotions in, minus promotions out and leavers`}
      data={rows}
      columns={[
        { key: 'label', label: 'Level', format: 'text', sortValue: (r) => r.level },
        { key: 'yearAgo', label: 'A year ago', format: 'int', drill: cell('yearAgo') },
        { key: 'hired', label: 'Hired', format: 'int', drill: cell('hired') },
        { key: 'promotedIn', label: 'Promoted in', format: 'int', drill: cell('promotedIn') },
        { key: 'promotedOut', label: 'Promoted out', format: 'int', drill: cell('promotedOut') },
        { key: 'left', label: 'Left', format: 'int', drill: cell('left') },
        { key: 'other', label: 'Other changes', format: 'int', drill: cell('other') },
        { key: 'today', label: 'Today', format: 'int', drill: cell('today') },
        { key: 'change', label: 'Change', format: 'int' },
        { key: 'growth', label: 'Growth', format: 'pct' },
      ]}
      definitions={p.defs(PYRAMID_METRIC.levelFlow)}
      note={`Each row reconciles: a year ago + hired + promoted in − promoted out − left + other changes = today · ${p.t12.label}`}
      span={7}
      tableOnly
      empty={d.hasHistory ? null : (d.noHistory ?? 'Add Job changes to compare with a year ago.')}
    />
  )
}

function MixFigure({ d }: { d: PyramidData }) {
  const p = d.prep
  const bandOf = (r: MixRow) => BANDS.find((b) => b.key === r.band) as (typeof BANDS)[number]
  const open = (r: MixRow): DrillSource => (r.people ? () => mixSpec(d, r, bandOf(r)) : null)
  const groups = [...new Set(d.mix.map((r) => r.group))]
  const units = groups.length - 1
  return (
    <Figure
      id={F.mix}
      metric={PYRAMID_METRIC.levelMix}
      uses={p.uses(MIX)}
      title="Level mix by business unit"
      subtitle={`Share of each unit's employees in each band of levels, ${formatDate(d.asOf)}, with the company first`}
      data={d.mix}
      columns={[
        { key: 'group', label: 'Business unit', format: 'text' },
        { key: 'bandLabel', label: 'Band', format: 'text' },
        { key: 'people', label: 'People', format: 'int', drill: open },
        { key: 'share', label: 'Share of unit', format: 'pct', drill: open },
        { key: 'groupTotal', label: 'Unit total', format: 'int' },
      ]}
      definitions={p.defs(PYRAMID_METRIC.levelMix)}
      note={`Entry L1 and L2 · Career L3 and L4 · Senior L5 and L6 · Management M1 and M2 · Executive E1 to E3 · ${units} ${units === 1 ? 'unit' : 'units'}`}
      span={5}
      empty={d.main.total ? null : 'No one in this scope has a level.'}
    >
      <HBars
        data={d.mix.filter((r) => r.share != null)}
        y="group"
        x="people"
        series="bandLabel"
        stack="normalize"
        seriesOrder={BANDS.map((b) => b.label)}
        scheme="ordinal"
        yOrder={groups}
        onSelectSegment={(r) => drill(open(r))}
        onSelect={(r) => drill(open(r))}
        ariaLabel="Level mix by business unit: the share of each unit's employees in each band of levels"
      />
    </Figure>
  )
}

export function Panel({ def, model, ctx }: AnalysisPanelProps<PyramidModel>) {
  const d = model.data
  return (
    <AnalysisFrame def={def} model={model} ctx={ctx} lead={<PyramidLead model={model} />}>
      <Section
        title="Shape and spans"
        dek={`How each level compares with the one below it, and how many people each management level leads, on ${formatDate(d.asOf)}.`}
      >
        <RatioFigure d={d} />
        <SpansFigure d={d} ctx={ctx} />
      </Section>
      <Section
        title="What changed, and where"
        dek="How hiring, promotion and leaving moved each level in the last 12 months, and how the mix of levels differs by business unit."
      >
        <FlowFigure d={d} />
        <MixFigure d={d} />
      </Section>
    </AnalysisFrame>
  )
}

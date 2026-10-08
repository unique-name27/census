/**
 * Quality of hire's figures (docs/ANALYSES.md, 2.6). Every mark and table cell opens the hires it
 * is computed over (a hidden mean opens nothing); the business unit and site rows of the parts
 * figure also carry "Filter to this". No figure, table or export holds a score per person.
 */
import { useState } from 'react'
import { type Column, Figure, HBars, Heatmap, RangeBars, Scatter } from '@/charts'
import { Button, goTo, Menu, Segmented } from '@/components'
import { useRouteShown } from '@/components/RouteLink'
import { useChartHeight, useMinWidth } from '@/components/useNarrow'
import type { AnalyticsContext } from '@/data/context'
import { DEGREE_LEVELS } from '@/data/schema'
import { type DrillSource, drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { ANONYMITY } from '@/metrics/privacy'
import { missingFor } from '../../fields'
import type { Missing } from '../../types'
import { APPLICATION_COLUMNS, applicationRows } from '../engine/drill'
import {
  type CellRow,
  cellDrill,
  cellRows,
  FIRST_REVIEW,
  groupDrill,
  PART_CUTS,
  type PartCut,
  type PartsBar,
  partsBars,
  partsDrill,
  partsRows,
  type RangeRow,
  type RangeSort,
  rangeRows,
  rangeSecondary,
  ratedDrill,
  retainedDrill,
  STAYED,
} from '../engine/figures'
import { QUALITY_FIGURES as F } from '../engine/ids'
import { QID } from '../engine/metrics'
import type { QualityModel } from '../engine/model'
import { COMPARE_GROUPS, defsOf, INTERVAL_DEF } from '../engine/wording'

export interface FigureProps {
  m: QualityModel
  ctx: AnalyticsContext
  missing: readonly Missing[]
}

/** The empty state a figure shows: no cohort, no reviews, or the column it needs. */
function emptyOf(m: QualityModel, missing: readonly Missing[], id: string, needsScore = true): string | null {
  if (!m.counts.cohort)
    return `No hires from ${m.windowText} in this scope. Quality of hire needs a year of outcomes.`
  if (needsScore && !m.coverage.reviews)
    return 'Upload Reviews to score the first full review. Until then only Stayed a year shows.'
  return missingFor(missing, id)?.message ?? null
}

/** "Open the Data room" under an empty state that names a column to add. */
function DataRoomAction({ show }: { show: boolean }) {
  const shown = useRouteShown('data')
  if (!show || !shown) return null
  return (
    <Button size="sm" onClick={() => goTo('data')}>
      Open the Data room
    </Button>
  )
}

const statusTone = (r: RangeRow) =>
  r.q == null ? 'default' : r.status === 'above' ? 'good' : r.status === 'below' ? 'warning' : 'default'
const statusWord = (r: RangeRow) =>
  r.q == null || r.status === 'unclear' ? null : r.status === 'above' ? 'Above' : 'Below'

/** The table and export columns of a range chart; each number opens the hires it is over. */
function rangeColumns(m: QualityModel, groupLabel: string): Column<RangeRow>[] {
  const scored = (r: RangeRow): DrillSource => (r.q == null ? null : () => groupDrill(m.drill, r.group, r.g))
  return [
    { key: 'group', label: groupLabel, format: 'text' },
    { key: 'hires', label: 'Scored hires', format: 'int', drill: scored },
    { key: 'q', label: 'Quality of hire', format: 'num1', drill: scored },
    { key: 'low', label: 'Interval low', format: 'num1' },
    { key: 'high', label: 'Interval high', format: 'num1' },
    { key: 'expected', label: 'Expected from site and level', format: 'num1' },
    { key: 'gap', label: 'Gap to expected', format: 'num1' },
    {
      key: 'p',
      label: 'First review score',
      format: 'num1',
      drill: (r) => (r.p == null ? null : () => ratedDrill(m.drill, r.group, r.g)),
    },
    {
      key: 'r',
      label: 'Stayed a year',
      format: 'pct',
      drill: (r) => (r.r == null ? null : () => retainedDrill(m.drill, r.group, r.g)),
    },
    { key: 'statusLabel', label: 'Status', format: 'text' },
  ]
}

/** One range chart: interval track, mean dot, expected tick and the company line. */
function QualityRanges({
  m,
  rows,
  ariaLabel,
}: {
  m: QualityModel
  rows: readonly RangeRow[]
  ariaLabel: string
}) {
  // Rows of 28px let long school names wrap to two lines instead of being cut.
  const rowHeight = 28
  const company = m.company.q
  return (
    <RangeBars
      data={rows}
      y="group"
      min="low"
      max="high"
      mid="expected"
      value="q"
      format="num1"
      rowHeight={rowHeight}
      labels={{
        min: 'Interval low',
        max: 'Interval high',
        mid: 'Expected from site and level',
        value: 'Quality of hire',
        range: `${Math.round(m.s.interval * 100)}% interval`,
      }}
      ref={company == null ? undefined : { value: company, label: `Company ${fmt(company, 'num1')}` }}
      glyphTone={statusTone}
      glyphLabel={statusWord}
      secondary={rangeSecondary}
      deemph={(r) => r.kind === 'none'}
      selectable={(r) => r.q != null}
      lockedNote={(r) =>
        r.hires < m.s.minGroup
          ? `Hidden to protect anonymity (n < ${m.s.minGroup})`
          : 'Hidden with a smaller group, so that neither can be worked out from the totals'
      }
      onSelect={(r) => drill(() => groupDrill(m.drill, r.group, r.g))}
      ariaLabel={ariaLabel}
    />
  )
}

const hiredLine = (m: QualityModel, n: number, noun = 'scored hires') =>
  `${n.toLocaleString('en-US')} ${noun} · hired ${m.windowText}`

/* ───────── 2.6.1 the lead ───────── */

export function UniversityFigure({ m, ctx, missing }: FigureProps) {
  const [sort, setSort] = useState<RangeSort>('hires')
  const height = useChartHeight('lead')
  const rows = rangeRows(m.cuts.university, sort)
  const empty = emptyOf(m, missing, F.university)
  return (
    <Figure
      id={F.university}
      metric={QID.score}
      uses={m.uses.university}
      title="Quality of hire by university"
      subtitle={`Mean quality of hire per university with its ${Math.round(m.s.interval * 100)}% interval, against the score its site and level mix predicts`}
      data={rows}
      columns={rangeColumns(m, 'University')}
      definitions={[...defsOf(ctx.metrics, QID.score, QID.expected, ANONYMITY.metricId), INTERVAL_DEF]}
      note={`${hiredLine(m, m.scope.n)}. ${COMPARE_GROUPS}`}
      span={12}
      actions={
        // A visible name, so "Hires | Quality of hire" reads as the order, not the measure.
        <span className="flex items-center gap-2">
          <span className="text-meta text-muted" aria-hidden="true">
            Sort by
          </span>
          <Segmented<RangeSort>
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'hires', label: 'Hires' },
              { value: 'score', label: 'Quality of hire' },
            ]}
          />
        </span>
      }
      empty={empty}
      emptyAction={<DataRoomAction show={!!empty && m.counts.cohort > 0} />}
      emptyHeight={height}
    >
      <QualityRanges
        m={m}
        rows={rows}
        ariaLabel="Quality of hire by university: each interval, its mean and the score its site and level mix predict"
      />
    </Figure>
  )
}

/* ───────── 2.6.2 the parts by university ───────── */

export function UniversityPartsFigure({ m, ctx, missing }: FigureProps) {
  const rows = rangeRows(m.cuts.university).filter((r) => r.kind === 'value' && r.p != null && r.r != null)
  const empty =
    emptyOf(m, missing, F.universityParts) ??
    (rows.length ? null : 'No university has enough scored hires to show.')
  const height = useChartHeight('lead') + 40
  const c = m.company
  // Name the schools a reader would ask about: clearly above or below, and the ends of each axis.
  const ps = rows.map((r) => r.p as number)
  const rs = rows.map((r) => r.r as number)
  const named = (r: RangeRow) =>
    r.status !== 'unclear' ||
    r.p === Math.max(...ps) ||
    r.p === Math.min(...ps) ||
    r.r === Math.min(...rs) ||
    r.r === Math.max(...rs)
  return (
    <Figure
      id={F.universityParts}
      metric={QID.score}
      uses={m.uses.universityParts}
      title="Performance and retention by university"
      subtitle="Stayed a year against first review score, one dot per university, sized by scored hires"
      data={rows}
      columns={[
        { key: 'group', label: 'University', format: 'text' },
        {
          key: 'hires',
          label: 'Scored hires',
          format: 'int',
          drill: (r) => () => groupDrill(m.drill, r.group, r.g),
        },
        {
          key: 'r',
          label: 'Stayed a year',
          format: 'pct',
          drill: (r) => () => retainedDrill(m.drill, r.group, r.g),
        },
        {
          key: 'p',
          label: 'First review score',
          format: 'num1',
          drill: (r) => () => ratedDrill(m.drill, r.group, r.g),
        },
        {
          key: 'q',
          label: 'Quality of hire',
          format: 'num1',
          drill: (r) => () => groupDrill(m.drill, r.group, r.g),
        },
      ]}
      definitions={defsOf(ctx.metrics, QID.score, QID.performance, QID.retention)}
      note={`${hiredLine(
        m,
        rows.reduce((n, r) => n + r.hires, 0),
      )}. Other universities and Not recorded are left out.`}
      span={6}
      empty={empty}
      emptyAction={<DataRoomAction show={!!empty && m.counts.cohort > 0} />}
      emptyHeight={height}
    >
      <Scatter
        data={rows}
        x="r"
        y="p"
        r="hires"
        label="group"
        labelFilter={named}
        xFormat="pct"
        yFormat="num1"
        rFormat="int"
        xLabel="Stayed a year"
        yLabel="First review score"
        rLabel="Scored hires"
        refX={c.r == null ? undefined : { value: c.r, label: `Company ${fmt(c.r, 'pct0')}` }}
        refY={c.p == null ? undefined : { value: c.p, label: `Company ${fmt(c.p, 'num1')}` }}
        height={height}
        onSelect={(r) => drill(() => groupDrill(m.drill, r.group, r.g))}
        ariaLabel="Performance and retention by university: first review score against the share who stayed a year"
      />
    </Figure>
  )
}

/* ───────── 2.6.3 the parts by group ───────── */

/** The cut control: a segmented control where there is room, else a menu button. */
function CutControl({ cut, onChange }: { cut: PartCut; onChange: (c: PartCut) => void }) {
  const wide = useMinWidth(1200)
  const label = PART_CUTS.find((c) => c.key === cut)?.label ?? ''
  if (wide)
    return (
      <Segmented<PartCut>
        label="Group by"
        value={cut}
        onChange={onChange}
        options={PART_CUTS.map((c) => ({ value: c.key, label: c.label }))}
      />
    )
  return (
    <Menu
      align="end"
      width={220}
      trigger={
        <Button size="sm" caret>
          Group by: {label}
        </Button>
      }
      items={PART_CUTS.map((c) => ({ label: c.label, onSelect: () => onChange(c.key) }))}
    />
  )
}

export function PartsFigure({ m, ctx }: FigureProps) {
  const [cut, setCut] = useState<PartCut>('degree')
  const rows = partsRows(m)
  const bars = partsBars(rows, cut)
  // A business unit or site row carries its group as "Filter to"; the other cuts are no filter.
  const scored = partsDrill(m, 'scored')
  const rated = partsDrill(m, 'rated')
  const retained = partsDrill(m, 'retained')
  const order = [m.company.label, ...m.cuts[cut].map((g) => g.label)]
  const noScore = !m.counts.cohort
  return (
    <Figure
      id={F.parts}
      metric={QID.score}
      uses={m.uses.parts}
      title="Performance and retention by group"
      subtitle="First review score and the share who stayed a year, both on a 0 to 100 scale, with the company first"
      data={rows}
      columns={[
        { key: 'groupedBy', label: 'Grouped by', format: 'text' },
        { key: 'group', label: 'Group', format: 'text' },
        { key: 'hires', label: 'Scored hires', format: 'int', drill: scored },
        { key: 'p', label: 'First review score', format: 'num1', drill: rated },
        { key: 'rated', label: 'Rated hires', format: 'int', drill: rated },
        { key: 'r', label: 'Stayed a year', format: 'pct', drill: retained },
        { key: 'retained', label: 'Hires with a retention score', format: 'int', drill: retained },
      ]}
      definitions={defsOf(ctx.metrics, QID.performance, QID.retention, ANONYMITY.metricId)}
      note={`${hiredLine(m, m.scope.n)}. The table and exports hold every grouping.`}
      span={6}
      actions={<CutControl cut={cut} onChange={setCut} />}
      empty={
        noScore
          ? `No hires from ${m.windowText} in this scope. Quality of hire needs a year of outcomes.`
          : null
      }
    >
      <HBars<PartsBar>
        data={bars}
        y="group"
        x="value"
        series="measure"
        seriesOrder={[FIRST_REVIEW, STAYED]}
        yOrder={order}
        format="num1"
        xDomain={[0, 100]}
        onSelect={(d) => drill(scored(d.row))}
        onSelectSegment={(d) => drill(d.measure === FIRST_REVIEW ? rated(d.row) : retained(d.row))}
        selectable={(d) => d.value != null}
        ariaLabel="Performance and retention by group: first review score and the share who stayed a year"
      />
    </Figure>
  )
}

/* ───────── 2.6.4, 2.6.5 and 2.6.7 the range charts by degree, field and source ───────── */

function RangeFigure({
  m,
  ctx,
  missing,
  id,
  title,
  subtitle,
  groupLabel,
  rows,
  uses,
  span,
  note,
  detail,
}: FigureProps & {
  id: string
  title: string
  subtitle: string
  groupLabel: string
  rows: readonly RangeRow[]
  uses: QualityModel['uses'][keyof QualityModel['uses']]
  span: 5 | 7
  note: string
  detail?: { label: string; columns: readonly Column[]; rows: () => readonly object[] }
}) {
  const empty = emptyOf(m, missing, id)
  const height = useChartHeight('standard')
  return (
    <Figure
      id={id}
      metric={QID.score}
      uses={uses}
      title={title}
      subtitle={subtitle}
      data={rows}
      columns={rangeColumns(m, groupLabel)}
      definitions={[...defsOf(ctx.metrics, QID.score, QID.expected, ANONYMITY.metricId), INTERVAL_DEF]}
      note={note}
      span={span}
      empty={empty}
      emptyAction={<DataRoomAction show={!!empty && m.counts.cohort > 0} />}
      emptyHeight={height}
      detail={detail}
    >
      <QualityRanges
        m={m}
        rows={rows}
        ariaLabel={`${title}: each interval, its mean and the expected score`}
      />
    </Figure>
  )
}

export function DegreeFigure(p: FigureProps) {
  const { m } = p
  return (
    <RangeFigure
      {...p}
      id={F.degree}
      title="Quality of hire by degree level"
      subtitle="Mean quality of hire per highest degree, with its interval and expected score"
      groupLabel="Degree level"
      rows={rangeRows(m.cuts.degree)}
      uses={m.uses.degree}
      span={5}
      note={hiredLine(m, m.scope.n)}
    />
  )
}

export function FieldFigure(p: FigureProps) {
  const { m } = p
  return (
    <RangeFigure
      {...p}
      id={F.field}
      title="Quality of hire by field of study"
      subtitle="The six largest fields of study, then the rest, with each interval and expected score"
      groupLabel="Field of study"
      rows={rangeRows(m.cuts.field)}
      uses={m.uses.field}
      span={7}
      note={hiredLine(m, m.scope.n)}
    />
  )
}

export function SourceFigure(p: FigureProps) {
  const { m } = p
  const since = m.coverage.candidatesSince
  const linked = `${m.counts.linked.toLocaleString('en-US')} of ${m.counts.cohort.toLocaleString('en-US')} hires link to an application${since ? `; the candidate data starts ${formatDate(since)}` : ''}`
  return (
    <RangeFigure
      {...p}
      id={F.source}
      title="Quality of hire by source of hire"
      subtitle="Mean quality of hire by the source of the application each hire came from"
      groupLabel="Source"
      rows={rangeRows(m.cuts.source)}
      uses={m.uses.source}
      span={5}
      note={`${linked}. Hired ${m.windowText}.`}
      detail={{
        label: 'Applications',
        columns: APPLICATION_COLUMNS,
        rows: () => applicationRows(m.hires),
      }}
    />
  )
}

/* ───────── 2.6.6 degree by field ───────── */

export function DegreeFieldFigure({ m, ctx, missing }: FigureProps) {
  const rows = cellRows(m.cells)
  const empty = emptyOf(m, missing, F.degreeField)
  const height = useChartHeight('standard')
  const fields = [...new Set(rows.map((r) => r.field))]
  const company = m.company.q
  const open = (r: CellRow): DrillSource => (r.q == null ? null : () => cellDrill(m.drill, r))
  return (
    <Figure
      id={F.degreeField}
      metric={QID.score}
      uses={m.uses.degreeField}
      title="Degree level by field of study"
      subtitle={`Mean quality of hire per degree and field, above or below the company${company == null ? '' : ` (${fmt(company, 'num1')})`}`}
      data={rows}
      columns={[
        { key: 'field', label: 'Field of study', format: 'text' },
        { key: 'degree', label: 'Degree level', format: 'text' },
        { key: 'hires', label: 'Scored hires', format: 'int', drill: open },
        { key: 'q', label: 'Quality of hire', format: 'num1', drill: open },
        { key: 'p', label: 'First review score', format: 'num1' },
        { key: 'r', label: 'Stayed a year', format: 'pct' },
      ]}
      definitions={defsOf(ctx.metrics, QID.score, ANONYMITY.metricId)}
      note={`${hiredLine(m, m.scope.n)}. Cells under ${m.s.minCellHires} scored hires show no score.`}
      span={7}
      empty={
        empty ?? (rows.length ? null : 'No hires have both a degree level and a field of study recorded.')
      }
      emptyAction={<DataRoomAction show={!!empty && m.counts.cohort > 0} />}
      emptyHeight={height}
    >
      <Heatmap<CellRow>
        data={rows}
        x="degree"
        y="field"
        value="q"
        n="hires"
        format="num1"
        scheme="diverging"
        mid={company ?? 50}
        xOrder={DEGREE_LEVELS}
        yOrder={fields}
        showValues
        selectable={(r) => r.q != null}
        lockedNote={(r) =>
          !r.hires
            ? null
            : r.hires < m.s.minCellHires
              ? `Fewer than ${m.s.minCellHires} scored hires`
              : 'Hidden with a smaller cell in its row or column, so that neither can be worked out from the totals'
        }
        onSelect={(r) => drill(open(r))}
        ariaLabel="Quality of hire by degree level and field of study, above or below the company"
      />
    </Figure>
  )
}

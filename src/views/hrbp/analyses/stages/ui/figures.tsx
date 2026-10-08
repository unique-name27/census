/**
 * The six figures of Engineering by stage (docs/ANALYSES.md, 4.6.1 to 4.6.6). Each is a Figure
 * with its metric, lineage and dictionary definitions; every mark and table count opens the
 * records it counts (`../engine/figureDrills`, the same builders the tests check), and only a site
 * or business unit sets "Filter to this" (stage, job family and job function are not filter
 * dimensions). The heatmap's cut control changes the grouping, so its table and exports hold both
 * groupings in long form.
 */
import { useState } from 'react'
import {
  BulletList,
  type BulletStatus,
  type Column,
  Figure,
  Heatmap,
  TrendGrid,
  type TrendRow,
  type TrendSeries,
  trendGridRows,
} from '@/charts'
import { Segmented } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill/Drill'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { missingFor } from '../../fields'
import { STAGES } from '../engine'
import type { CapacityRow, FunctionRow, HiringRow, RatioRow, WhereCell, WhereDim } from '../engine/capacity'
import {
  capacityDrill,
  functionDrill,
  hiringDrill,
  ratioDrill,
  trendDrill,
  whereDrill,
} from '../engine/figureDrills'
import { STAGES_FIGURES as F } from '../engine/ids'
import { FUNCTIONS_USES, HIRING_USES, SID, STAGES_USES, WHERE_USES } from '../engine/metrics'
import type { StagesModel } from '../engine/model'
import { count, stageDefs } from '../engine/wording'
import { StageBars } from './StageBars'

interface FigureProps {
  m: StagesModel
  ctx: AnalyticsContext
  /** "Job family: Silicon Engineering" when one is picked; exports say what is on screen. */
  familyNote: string | null
}

const n = (v: number): string => v.toLocaleString('en-US')
const joinNote = (...parts: (string | null | false | undefined)[]): string =>
  parts.filter(Boolean).join(' · ')

const STAGE_SOURCE_DEF = {
  term: 'Stage source',
  text: 'Saved: the stage is saved on the Job functions list. Proposed: Census proposes it from keywords in the job function’s name or commonest job title until someone saves one. Not mapped: no stage, saved or proposed. Requisitions and plan lines carry no job function, so they take the most common job function of their department’s active employees (Inferred from department).',
}
const STAGES_DEF = {
  term: 'Chip development stages',
  text: 'Nine stages in lifecycle order, from architecture and spec to product and test engineering, then two that run across the lifecycle: software and firmware, and shared engineering. Fabrication and assembly are done by partners, so they are not staffed stages. Each job function has one stage, and all its people count there: where static timing and physical verification engineers sit in a Physical Design job function, they count in Physical design, not in Signoff and tape-out.',
}

/* ───────── 4.6.1 capacity (lead) ───────── */

type Measure = 'heads' | 'fte'

export function CapacityFigure({ m, ctx, familyNote, height }: FigureProps & { height: number }) {
  const [measure, setMeasure] = useState<Measure>('heads')
  const asOf = formatDate(ctx.asOf)
  const rows = m.capacity
  const employees = rows.reduce((s, r) => s + r.employees, 0)
  const contractors = rows.reduce((s, r) => s + r.contractors, 0)
  const who = m.base.set.countInterns ? 'Employees and interns' : 'Employees'
  const fte = measure === 'fte'
  const columns: Column<CapacityRow>[] = [
    { key: 'phase', label: 'Phase', format: 'text' },
    { key: 'stage', label: 'Stage', format: 'text' },
    { key: 'employees', label: who, format: 'int', drill: (r) => capacityDrill(m, r, 'employees') },
    {
      key: 'contractors',
      label: 'Contractors',
      format: 'int',
      drill: (r) => capacityDrill(m, r, 'contractors'),
    },
    { key: 'interns', label: 'Interns', format: 'int', drill: (r) => capacityDrill(m, r, 'interns') },
    {
      key: 'employeeFte',
      label: `${who} FTE`,
      format: 'num1',
      drill: (r) => capacityDrill(m, r, 'employees'),
    },
    {
      key: 'contractorFte',
      label: 'Contractor FTE',
      format: 'num1',
      drill: (r) => capacityDrill(m, r, 'contractors'),
    },
    {
      key: 'share',
      label: 'Share of engineering',
      format: 'pct',
      drill: (r) => capacityDrill(m, r, 'employees'),
    },
    // People who sit in the stage only through a proposed stage, until someone saves it in Settings.
    ...(rows.some((r) => r.proposed > 0)
      ? [
          {
            key: 'proposed',
            label: 'Stage only proposed',
            format: 'int' as const,
            drill: (r: CapacityRow) => capacityDrill(m, r, 'proposed'),
          },
          {
            key: 'proposedShare',
            label: 'Share only proposed',
            format: 'pct' as const,
            drill: (r: CapacityRow) => capacityDrill(m, r, 'proposed'),
          },
        ]
      : []),
    ...(m.hasHistory
      ? [
          {
            key: 'change',
            label: `Change since ${formatDate(m.yearAgoDate)}`,
            format: 'int' as const,
            drill: (r: CapacityRow) => capacityDrill(m, r, 'yearAgo'),
          },
        ]
      : []),
  ]
  return (
    <Figure
      id={F.capacity}
      metric={SID.capacity}
      uses={STAGES_USES}
      title="Engineering capacity by chip development stage"
      subtitle={`${fte ? 'FTE' : 'Heads'} of ${who.toLowerCase()} and contractors in each stage on ${asOf}, in lifecycle order`}
      data={rows}
      columns={columns}
      definitions={[...stageDefs(ctx.metrics, SID.capacity), STAGES_DEF, STAGE_SOURCE_DEF]}
      note={joinNote(
        `${n(employees)} ${who.toLowerCase()} and ${count(contractors, 'contractor')} · as of ${asOf}`,
        familyNote,
        m.fallback && 'Engineering departments used: no job family is marked engineering',
        !m.hasFte && 'No FTE in Employees, so each person counts as 1',
      )}
      actions={
        <Segmented<Measure>
          label="Measure"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: 'heads', label: 'Headcount' },
            { value: 'fte', label: 'FTE' },
          ]}
        />
      }
      empty={employees + contractors ? null : 'No engineering people in this scope.'}
      emptyHeight={height}
    >
      <StageBars<CapacityRow>
        rows={rows}
        rowKey={(r) => r.key}
        label={(r) => r.stage}
        across={(r) => r.across}
        format={fte ? 'num1' : 'int'}
        series={[
          {
            key: 'employees',
            label: who,
            value: (r) => (fte ? r.employeeFte : r.employees),
            color: (t) => t.series[0],
          },
          {
            key: 'contractors',
            label: 'Contractors',
            value: (r) => (fte ? r.contractorFte : r.contractors),
            color: (t) => t.series[1],
          },
        ]}
        secondary={(r) =>
          [
            r.contractors && r.contractorShare != null
              ? `${fmt(r.contractorShare, 'pct0')} contractors`
              : null,
            r.proposed > 0
              ? `${r.proposedShare != null && r.proposedShare < 1 ? `${fmt(r.proposedShare, 'pct0')} ` : ''}on a proposed stage`
              : null,
          ]
            .filter(Boolean)
            .join(', ') || null
        }
        notes={m.notes.capacity}
        onSelect={(r, part) =>
          drill(capacityDrill(m, r, part === 'employees' || part === 'contractors' ? part : 'both'))
        }
        ariaLabel="Engineering capacity by chip development stage"
      />
    </Figure>
  )
}

/* ───────── 4.6.2 hiring in flight ───────── */

export function HiringFigure({ m, ctx, familyNote }: FigureProps) {
  const rows = m.hiring
  const flight = m.flight
  const showPlanned = !!flight.planned && flight.hasPlan
  const gap = missingFor(STAGES.missing(ctx), F.hiring)
  const accepted = rows.reduce((s, r) => s + r.accepted, 0)
  const open = rows.reduce((s, r) => s + r.open, 0)
  const planned = rows.reduce((s, r) => s + (r.planned ?? 0), 0)
  const heldOpenings = flight.onHold
    .filter((r) => !m.family || r.place.family === m.family)
    .reduce((s, r) => s + Math.max(0, r.req.openings || 0), 0)
  const columns: Column<HiringRow>[] = [
    { key: 'stage', label: 'Stage', format: 'text' },
    {
      key: 'accepted',
      label: 'Accepted, not started',
      format: 'int',
      drill: (r) => hiringDrill(m, r, 'accepted'),
    },
    { key: 'open', label: 'Open openings', format: 'int', drill: (r) => hiringDrill(m, r, 'open') },
    ...(showPlanned
      ? [
          {
            key: 'planned',
            label: 'Planned, no req yet',
            format: 'int' as const,
            drill: (r: HiringRow) => hiringDrill(m, r, 'planned'),
          },
        ]
      : []),
    { key: 'total', label: 'In flight', format: 'int' },
    { key: 'today', label: 'Employees today', format: 'int' },
    { key: 'ofToday', label: 'Share of today', format: 'pct' },
  ]
  const nothing = !flight.hasReqs && !flight.hasCandidates && !flight.hasPlan
  return (
    <Figure
      id={F.hiring}
      metric={SID.hiring}
      uses={HIRING_USES}
      title="Hiring in flight by stage"
      subtitle={`Starts not yet started, open openings${showPlanned ? ' and planned starts with no req' : ''}, against each stage's size today`}
      data={rows}
      columns={columns}
      definitions={[...stageDefs(ctx.metrics, SID.hiring, SID.planned), STAGE_SOURCE_DEF]}
      note={joinNote(
        `${count(accepted, 'start')}, ${count(open, 'opening')}${
          showPlanned
            ? `, ${n(planned)} planned with no req (${formatMonth(flight.window.start)} to ${formatMonth(flight.window.end)})`
            : ''
        }`,
        heldOpenings > 0 && `${count(heldOpenings, 'opening')} on hold not counted`,
        !flight.hasPlan && 'No hiring plan loaded',
        familyNote,
      )}
      span={6}
      empty={
        nothing
          ? 'Upload Requisitions to see open reqs by stage.'
          : !flight.hasReqs && gap
            ? gap.message
            : rows.some((r) => r.total > 0)
              ? null
              : 'No engineering hiring in flight in this scope.'
      }
    >
      <StageBars<HiringRow>
        rows={rows}
        rowKey={(r) => r.key}
        label={(r) => r.stage}
        across={(r) => r.across}
        format="int"
        series={[
          {
            key: 'accepted',
            label: 'Accepted, not started',
            value: (r) => r.accepted,
            color: (t) => t.seq[600],
          },
          { key: 'open', label: 'Open reqs', value: (r) => r.open, color: (t) => t.seq[400] },
          ...(showPlanned
            ? [
                {
                  key: 'planned',
                  label: 'Planned, no req yet',
                  value: (r: HiringRow) => r.planned ?? 0,
                  color: (t: { seq: { 250: string } }) => t.seq[250],
                },
              ]
            : []),
        ]}
        totalText={(r) => (r.total ? `+${n(r.total)}` : '0')}
        secondary={(r) => (r.total && r.ofToday != null ? `${fmt(r.ofToday, 'pct0')} of today` : null)}
        notes={m.notes.hiring}
        onSelect={(r, part) => {
          if (part === 'accepted' || part === 'open' || part === 'planned') drill(hiringDrill(m, r, part))
          else
            drill(hiringDrill(m, r, 'open') ?? hiringDrill(m, r, 'accepted') ?? hiringDrill(m, r, 'planned'))
        }}
        selectable={(r, part) =>
          part === 'accepted'
            ? r.accepted > 0
            : part === 'open'
              ? r.open > 0
              : part === 'planned'
                ? (r.planned ?? 0) > 0
                : r.total > 0
        }
        ariaLabel="Hiring in flight by chip development stage"
      />
    </Figure>
  )
}

/* ───────── 4.6.3 ratios ───────── */

/**
 * Only "Below reference" carries a glyph: a ratio near its reference is not a success state (it
 * can sit up to `belowBy` under it), so it stays neutral like the rest. The word is the row's own
 * (`statusLabel`), so a ratio with no value says why.
 */
const STATUS_TONE: Record<RatioRow['status'], BulletStatus['tone']> = {
  below: 'warning',
  near: 'none',
  above: 'none',
  none: 'none',
  na: 'none',
}

export function RatiosFigure({ m, ctx, familyNote, onSetting }: FigureProps & { onSetting?: () => void }) {
  const columns: Column<RatioRow>[] = [
    { key: 'label', label: 'Ratio', format: 'text' },
    { key: 'value', label: 'Value', format: 'num2', drill: (r) => ratioDrill(m, r) },
    ...(m.base.set.ratioContractors
      ? []
      : [{ key: 'withContractors', label: 'With contractors', format: 'num2' } satisfies Column<RatioRow>]),
    { key: 'reference', label: 'Reference', format: 'num2' },
    { key: 'statusLabel', label: 'Status', format: 'text' },
    { key: 'top', label: 'People above the line', format: 'int', drill: (r) => ratioDrill(m, r) },
    { key: 'bottom', label: 'People below the line', format: 'int', drill: (r) => ratioDrill(m, r) },
  ]
  return (
    <Figure
      id={F.ratios}
      metric={SID.ratios}
      uses={STAGES_USES}
      title="Stage ratios against reference"
      subtitle="People in one stage for each person in another, all on one scale; the tick is your reference"
      data={m.ratios}
      columns={columns}
      definitions={stageDefs(ctx.metrics, SID.ratios, SID.findings)}
      note={joinNote(
        m.base.set.ratioContractors
          ? 'Employees and contractors, in heads'
          : 'Employees only, in heads; the table gives each ratio with contractors',
        'A reference of 0 means none',
        familyNote,
      )}
      span={6}
      empty={m.ratios.some((r) => r.top + r.bottom > 0) ? null : 'No engineering people in this scope.'}
    >
      <BulletList<RatioRow>
        data={m.ratios}
        label="label"
        value="value"
        target={(r) => r.reference}
        format={(_r, v) => fmt(v, 'num2')}
        status={(r) => ({ tone: STATUS_TONE[r.status], label: r.statusLabel })}
        scale="shared"
        nullNote="Too few people below the line to compare"
        onSelect={(r) => drill(ratioDrill(m, r))}
        selectable={(r) => r.value != null}
        onSelectLabel={onSetting ? () => onSetting() : undefined}
        ariaLabel="Stage ratios against their references"
      />
    </Figure>
  )
}

/* ───────── 4.6.4 where each stage is staffed ───────── */

export function WhereFigure({ m, ctx, familyNote }: FigureProps) {
  const [dim, setDim] = useState<WhereDim>('location')
  const cells = m.where.cells
  const shown = cells.filter((c) => c.dim === dim)
  const columns: Column<WhereCell>[] = [
    { key: 'groupedBy', label: 'Grouped by', format: 'text' },
    { key: 'stage', label: 'Stage', format: 'text' },
    { key: 'group', label: 'Site or business unit', format: 'text' },
    { key: 'people', label: 'People', format: 'int', drill: (c) => whereDrill(m, c) },
    { key: 'share', label: 'Share of the stage', format: 'pct', drill: (c) => whereDrill(m, c) },
  ]
  return (
    <Figure
      id={F.where}
      metric={SID.capacity}
      uses={WHERE_USES}
      title="Where each stage is staffed"
      subtitle={`Share of each stage's ${m.base.set.countInterns ? 'employees and interns' : 'employees'} at each ${
        dim === 'location' ? 'site, the eight largest then Other' : 'business unit'
      }, on ${formatDate(ctx.asOf)}`}
      data={cells}
      columns={columns}
      definitions={[...stageDefs(ctx.metrics, SID.capacity, SID.findings), STAGES_DEF]}
      note={joinNote('Each row adds up to 100%', 'the table and exports hold every grouping', familyNote)}
      actions={
        <Segmented<WhereDim>
          label="Group by"
          value={dim}
          onChange={setDim}
          options={[
            { value: 'location', label: 'Site' },
            { value: 'businessUnit', label: 'Business unit' },
          ]}
        />
      }
      empty={shown.length ? null : 'No engineering employees in this scope.'}
    >
      <Heatmap<WhereCell>
        data={shown}
        x="group"
        y="stage"
        value="share"
        n="people"
        format="pct0"
        scheme="sequential"
        domain={[0, 1]}
        xOrder={m.where.columns[dim]}
        yOrder={m.where.rows}
        showValues
        blankZero
        detail={(c) => `${n(c.people)} of ${n(c.stageTotal)} in ${c.stage}`}
        onSelect={(c) => drill(whereDrill(m, c))}
        selectable={(c) => c.records.length > 0}
        ariaLabel="Share of each stage by site or business unit"
      />
    </Figure>
  )
}

/* ───────── 4.6.5 stage headcount over time ───────── */

/** Shorter stage names for the small cells of the trend grid; the tooltip and table keep the full name. */
const SHORT_STAGE: Readonly<Partial<Record<string, string>>> = {
  architecture: 'Architecture',
  ams: 'Analog and mixed-signal',
  verification: 'Verification',
  signoff: 'Signoff',
  postSilicon: 'Post-silicon validation',
  productTest: 'Product and test',
  software: 'Software',
}

export function TrendFigure({ m, ctx, familyNote }: FigureProps) {
  const series: TrendSeries[] = m.trend.map((t) => ({
    id: t.key,
    name: t.name,
    ...(SHORT_STAGE[t.key] ? { short: SHORT_STAGE[t.key] } : {}),
    values: t.values,
    periods: t.periods,
    format: 'int',
  }))
  const byName = new Map(m.trend.map((t) => [t.name, t]))
  const rows = trendGridRows(series)
  const columns: Column<TrendRow>[] = [
    { key: 'series', label: 'Stage', format: 'text' },
    { key: 'period', label: 'Quarter end', format: 'date' },
    {
      key: 'value',
      label: m.base.set.countInterns ? 'Employees and interns' : 'Employees',
      format: 'int',
      drill: (r) => trendDrill(m, r.series, byName.get(r.series)?.periods.indexOf(r.period) ?? -1),
    },
  ]
  return (
    <Figure
      id={F.trend}
      metric={SID.capacity}
      uses={STAGES_USES}
      title="Stage headcount over time"
      subtitle="Employees in each stage at the last 8 quarter ends, each cell on its own scale"
      data={rows}
      columns={columns}
      definitions={[
        ...stageDefs(ctx.metrics, SID.capacity),
        {
          term: 'Stage over time',
          text: 'Each person counts in the stage of their current job function at every quarter end: the job history does not record moves between job functions.',
        },
      ]}
      note={joinNote(
        m.hasHistory
          ? null
          : 'No termination dates in Employees, so earlier quarters count only people still here',
        familyNote,
      )}
      empty={series.length ? null : 'No engineering employees in this scope.'}
    >
      <TrendGrid
        series={series}
        onSelect={(s, i) => drill(trendDrill(m, s.name, i))}
        selectable={(s, i) => (byName.get(s.name)?.records[i]?.length ?? 0) > 0}
        ariaLabel="Stage headcount at each quarter end"
      />
    </Figure>
  )
}

/* ───────── 4.6.6 job functions behind the stages ───────── */

export function FunctionsFigure({ m, ctx, familyNote }: FigureProps) {
  const showPlanned = !!m.flight.planned
  const columns: Column<FunctionRow>[] = [
    { key: 'family', label: 'Job family', format: 'text' },
    { key: 'jobFunction', label: 'Job function', format: 'text' },
    { key: 'stage', label: 'Stage', format: 'text' },
    { key: 'source', label: 'Stage source', format: 'text' },
    { key: 'employees', label: 'Employees', format: 'int', drill: (r) => functionDrill(m, r, 'employees') },
    {
      key: 'contractors',
      label: 'Contractors',
      format: 'int',
      drill: (r) => functionDrill(m, r, 'contractors'),
    },
    {
      key: 'employeeFte',
      label: 'Employee FTE',
      format: 'num1',
      drill: (r) => functionDrill(m, r, 'employees'),
    },
    {
      key: 'contractorFte',
      label: 'Contractor FTE',
      format: 'num1',
      drill: (r) => functionDrill(m, r, 'contractors'),
    },
    { key: 'openings', label: 'Open openings', format: 'int', drill: (r) => functionDrill(m, r, 'openings') },
    ...(showPlanned
      ? [
          {
            key: 'planned',
            label: 'Planned, no req yet',
            format: 'int' as const,
            drill: (r: FunctionRow) => functionDrill(m, r, 'planned'),
          },
        ]
      : []),
  ]
  const proposed = m.functions.filter((r) => r.source === 'Proposed').length
  const unmapped = m.functions.filter((r) => r.source === 'Not mapped').length
  return (
    <Figure
      id={F.functions}
      metric={SID.mapped}
      uses={FUNCTIONS_USES}
      title="Job functions behind the stages"
      subtitle={`Engineering job functions, their stage and how it was set, people on ${formatDate(ctx.asOf)}`}
      data={m.functions}
      columns={columns}
      definitions={[...stageDefs(ctx.metrics, SID.mapped, SID.capacity), STAGE_SOURCE_DEF]}
      note={joinNote(
        count(m.functions.length, 'job function'),
        proposed > 0 && `${n(proposed)} only proposed`,
        unmapped > 0 && `${n(unmapped)} with no stage`,
        familyNote,
      )}
      tableOnly
      empty={m.functions.length ? null : 'No engineering job functions in this scope.'}
    />
  )
}

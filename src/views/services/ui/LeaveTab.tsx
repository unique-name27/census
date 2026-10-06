/**
 * HR ops > Leave & return: who is on leave and for how long, whether returns are handled well
 * (Atlas LV-03), and whether people stay after they come back. Readers: the leave and
 * accommodation team and HRBPs.
 *
 * The tab is for HR. A leave reason only appears in grouped numbers (they drill to groups, never
 * to people), exits around leave are listed here and nowhere else, and a whole-view export
 * leaves the tab out (it renders a short note when laid out off screen for one).
 */
import { type ReactNode, type RefObject, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BarList, type Column, Figure, HBars, Lines, RangeBars } from '@/charts'
import {
  Button,
  cx,
  Grid,
  goTo,
  KpiStrip,
  Readout,
  Section,
  Segmented,
  type Severity,
  StatusPill,
  spanClass,
} from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { Drill, drill } from '@/drill'
import type { LeaveGroupRow } from '@/drill/types'
import { addDays, daysBetween, formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { median } from '@/lib/stats'
import type { ServicesModel } from '../engine'
import { metricDefinition, servicesDefinitions } from '../engine/definitions'
import { asOfSub, type DrillScope } from '../engine/drills'
import {
  ALL_LEAVES,
  type LeaveFact,
  type LengthRow,
  type OnLeaveRow,
  OTHER_REASONS,
  type QuarterRow,
  type ReasonRow,
  type RetentionRow,
  type ReturnStatus,
  type UpcomingReturn,
} from '../engine/leave'
import { groupRow, leaveDrill, leaveGroupsDrill, leaversDrill, upcomingDrill } from '../engine/leaveDrills'
import { retentionGroupsDrill, retentionLabel, returnsLabel } from '../engine/leaveModel'
import type { Refs } from '../engine/lineage'
import { pctWords } from '../engine/settings'
import { returnSurvey, type SurveyHeadline } from '../engine/survey'
import { FIGURE_METRIC } from '../metrics'
import { type AtlasColumn, AtlasTable } from './AtlasTable'
import { leaveUnitSegment, onLeaveUnitDrill } from './drill'
import { asOfNote, count, NeedData, NO_TX, period, rateTone } from './shared'

const STATUS_SEVERITY: Record<ReturnStatus, Severity> = {
  Ready: 'good',
  'Entered, not processed': 'warning',
  'Not entered': 'critical',
}

/** True while the tab is laid out off screen for a whole-view export (null before it knows). */
function useOffscreen(): [RefObject<HTMLDivElement | null>, boolean | null] {
  const ref = useRef<HTMLDivElement>(null)
  const [off, setOff] = useState<boolean | null>(null)
  useLayoutEffect(() => {
    setOff(!!ref.current?.closest('[data-census-offscreen]'))
  }, [])
  return [ref, off]
}

/** "Fewer than 5 people …, so … hidden to protect anonymity." */
const hidden = (k: number, what: string) =>
  `Fewer than ${k} people are behind ${what} in this scope, so it is hidden to protect anonymity. Widen the filters to see it.`

/** A list of people opened from a row already shown one by one: only the scope gate applies. */
const listedScope = (s: DrillScope): DrillScope => ({ ...s, minGroup: 1 })

export function LeaveTab({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const [ref, offscreen] = useOffscreen()
  const survey = useMemo(() => returnSurvey(ctx), [ctx])
  let body: ReactNode = null
  if (offscreen === false) body = <LeaveBody m={m} ctx={ctx} survey={survey} />
  if (offscreen === true)
    body = (
      <p className="text-[13px] text-muted">
        Leave & return is for HR and is left out of whole-view exports. Export it from its own tab.
      </p>
    )
  return (
    <div ref={ref} className="contents">
      {body}
    </div>
  )
}

function LeaveBody({
  m,
  ctx,
  survey,
}: {
  m: ServicesModel
  ctx: AnalyticsContext
  survey: SurveyHeadline | null
}) {
  const l = m.leave
  if (!m.hasTx) return <NeedData {...NO_TX} />
  if (!l.hasLeave)
    return (
      <NeedData
        title="Upload HR transactions with leave starts to see this"
        body="This tab pairs Leave start and Return from leave transactions per person. Add HR transactions with those types in the Data room; a leave reason and a planned return date make the reason cuts and the returns list work."
      />
    )
  return (
    <>
      <Grid>
        <KpiStrip kpis={l.kpis} />
        <div className={cx(spanClass(4), 'flex flex-col gap-4')}>
          <Readout findings={l.findings} span={12} />
          <SurveyFigure m={withSurveyUses(m, survey)} ctx={ctx} survey={survey} />
        </div>
        <div className={cx(spanClass(8), 'flex flex-col gap-4')}>
          <OnLeaveFigure m={m} ctx={ctx} />
          <ReturnsFigure m={m} ctx={ctx} />
        </div>
      </Grid>

      <Section
        title="Length and return rate"
        dek="How long leaves last, by reason, and how many end in a return to work rather than an exit."
      >
        <LengthFigure m={m} ctx={ctx} />
        <ReturnRateFigure m={m} ctx={ctx} />
      </Section>

      <Section
        title="After the return"
        dek="Whether people stay after they come back. Exits around leave are shown here for HR only, never by name in the readout."
      >
        <RetentionFigure m={m} ctx={ctx} />
        <ExitsFigure m={m} ctx={ctx} />
      </Section>
      <p className="mt-6 max-w-[80ch] text-[12px] text-muted">
        This tab is for HR. Leave reasons show only in grouped numbers, and whole-view exports leave the tab
        out; use Export, This tab, to share it.
      </p>
    </>
  )
}

/** The survey figure's fields come from Listening's headline when it has one. */
function withSurveyUses(m: ServicesModel, survey: SurveyHeadline | null): ServicesModel {
  if (!survey?.uses.length) return m
  return { ...m, uses: { ...m.uses, 'services-leave-survey': survey.uses as Refs } }
}

/* ───────────── on leave now ───────────── */

type Mode = 'reason' | 'unit'

function OnLeaveFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const l = m.leave
  const s = m.scope
  const k = l.min
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const [picked, setMode] = useState<Mode>('reason')
  const mode: Mode = l.hasReasons ? picked : 'unit'
  const asOf = formatDate(m.asOf)

  /** Reason × business unit counts for one reason, or for one unit: grouped, never named. */
  const groups = (pick: (r: OnLeaveRow) => boolean, title: string) => () => {
    const rows: LeaveGroupRow[] = l.onLeave.filter(pick).map((r) =>
      groupRow({
        groupBy: 'Leave reason and business unit',
        group: r.unit,
        reason: r.reason,
        measure: null,
        value: null,
        rows: r.records,
        min: k,
      }),
    )
    return leaveGroupsDrill(s, rows, title, { subtitle: asOfSub(s) })
  }
  /** Median days on leave so far, for a group of people on leave now. */
  const soFar = (facts: readonly LeaveFact[]) => median(facts.map((f) => daysBetween(f.start, m.asOf)))
  const reasonDrill = (r: ReasonRow) => () => {
    const label = r.reason === OTHER_REASONS ? OTHER_REASONS : r.reason
    const row = (groupBy: string, group: string, facts: readonly LeaveFact[]) =>
      groupRow({
        groupBy,
        group,
        reason: label,
        measure: 'Median days on leave so far',
        value: soFar(facts),
        format: 'days',
        rows: facts,
        min: k,
      })
    const units = new Map<string, LeaveFact[]>()
    for (const f of r.records) {
      const u = f.businessUnit ?? 'Unknown business unit'
      units.set(u, [...(units.get(u) ?? []), f])
    }
    const rows = [
      row('Whole scope', s.scope, r.records),
      ...[...units].map(([u, facts]) => row('Business unit', u, facts)),
    ]
    return leaveGroupsDrill(s, rows, `On leave now, ${label.toLowerCase()}`, {
      subtitle: asOfSub(s),
      note: `The whole scope, then each business unit; a unit with fewer than ${k} people shows no counts.`,
    })
  }
  // A unit's people carry the unit as their filter ("Filter to Silicon Engineering"); so do a
  // reason segment's grouped counts, which keep their number beside the unit's other reasons.
  const unitPeople = onLeaveUnitDrill(s)
  const unitReasons = leaveUnitSegment((r: OnLeaveRow) =>
    groups((x) => x.unit === r.unit, `On leave now, ${r.unit}, by reason`),
  )
  const segment = (r: OnLeaveRow) => (r.reason === ALL_LEAVES ? unitPeople(r) : unitReasons(r))

  const empty = !l.now.length
    ? `Nobody is on leave at ${asOf}.`
    : !l.nowShown
      ? hidden(k, 'the people on leave')
      : null
  const note = asOfNote(m.asOf, l.nowShown ? `${count(l.now.length, 'person', 'people')} on leave` : null)
  const detailRows = () =>
    l.now.map((f) => ({
      employeeId: f.employeeId,
      name: f.name,
      businessUnit: f.businessUnit,
      department: f.department,
      location: f.location,
      start: f.start,
      expected: f.expected,
    }))
  const detail =
    l.nowShown && s.on
      ? {
          label: 'People on leave',
          columns: [
            { key: 'employeeId', label: 'Employee ID' },
            { key: 'name', label: 'Name' },
            { key: 'businessUnit', label: 'Business unit' },
            { key: 'department', label: 'Department' },
            { key: 'location', label: 'Site' },
            { key: 'start', label: 'Leave started', format: 'date' as const },
            { key: 'expected', label: 'Expected return', format: 'date' as const },
          ],
          rows: detailRows,
        }
      : undefined
  const definitions = [D.onLeave, D.leavePairing, D.leaveReasons, D.leaveGroups]
  const toggle = l.hasReasons ? (
    <Segmented<Mode>
      label="Cut people on leave by"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'reason', label: 'Reason' },
        { value: 'unit', label: 'Business unit' },
      ]}
    />
  ) : null

  const byReason = mode === 'reason'
  const reasonColumns: Column<ReasonRow>[] = [
    { key: 'reason', label: 'Leave reason' },
    { key: 'people', label: 'People on leave', format: 'int', drill: reasonDrill },
  ]
  const unitColumns: Column<OnLeaveRow>[] = [
    { key: 'unit', label: 'Business unit' },
    ...(l.hasReasons ? [{ key: 'reason', label: 'Leave reason' }] : []),
    { key: 'people', label: 'People on leave', format: 'int', drill: (r: OnLeaveRow) => segment(r) },
  ]
  const data: readonly object[] = byReason ? l.byReason : l.onLeave
  const columns = (byReason ? reasonColumns : unitColumns) as Column[]
  return (
    <Figure
      id="services-leave-on-leave"
      uses={m.uses['services-leave-on-leave']}
      metric={FIGURE_METRIC['services-leave-on-leave']}
      span={12}
      title={
        byReason
          ? 'On leave now by reason'
          : l.hasReasons
            ? 'On leave now by business unit and reason'
            : 'On leave now by business unit'
      }
      subtitle={
        byReason
          ? `People on leave at ${asOf}, by the Atlas leave category; reasons shared by fewer than ${k} people are grouped`
          : l.hasReasons
            ? `People on leave at ${asOf}; a reason is named in a unit only when ${k} or more share it`
            : `People on leave at ${asOf}. No leave reasons loaded, so there is no reason split`
      }
      data={data}
      columns={columns}
      definitions={definitions}
      note={note}
      actions={toggle}
      empty={empty}
      detail={detail}
    >
      {byReason ? (
        <BarList
          data={l.byReason}
          label="reason"
          value="people"
          format="int"
          sort="none"
          tone={(d) => (d.reason === OTHER_REASONS ? 'deemph' : 'default')}
          onSelect={(d) => drill(reasonDrill(d))}
        />
      ) : (
        <HBars
          data={l.onLeave}
          y="unit"
          x="people"
          series={l.hasReasons ? 'reason' : undefined}
          stack={l.hasReasons}
          seriesOrder={l.series}
          format="int"
          onSelect={(d) => drill(unitPeople(d))}
          onSelectSegment={(d) => drill(segment(d))}
        />
      )}
    </Figure>
  )
}

/* ───────────── length and return rate ───────────── */

type LengthDatum = Pick<LengthRow, 'reason' | 'median' | 'q1' | 'q3' | 'p10' | 'p90' | 'n' | 'records'>

function LengthFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const l = m.leave
  const s = m.scope
  const k = l.min
  const per = period(ctx)
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const rows: LengthDatum[] = l.hasReasons
    ? l.lengthByReason
    : [{ reason: 'All leaves', ...l.length, records: l.returns }]
  const shown = rows.filter((r) => r.median != null)
  const open = (r: LengthDatum) => {
    if (r.median == null) return null
    if (!l.hasReasons)
      return () =>
        leaveDrill(s, r.records, {
          title: `Returns from leave, ${per}`,
          subtitle: `${m.window.label} · ${s.scope}`,
          columns: ['returned', 'days'],
          order: (a, b) => (b.days ?? 0) - (a.days ?? 0),
        })
    return () => {
      const base = {
        groupBy: 'Leave reason',
        group: r.reason,
        reason: r.reason,
        rows: r.records,
        min: k,
        format: 'days' as const,
      }
      return leaveGroupsDrill(
        s,
        [
          groupRow({ ...base, measure: 'Median days on leave', value: r.median }),
          groupRow({ ...base, measure: '25th percentile', value: r.q1 }),
          groupRow({ ...base, measure: '75th percentile', value: r.q3 }),
        ],
        `Leave length, ${r.reason}`,
        { note: 'Grouped by leave reason, never by person.' },
      )
    }
  }
  const columns: Column<LengthDatum>[] = [
    { key: 'reason', label: 'Leave reason' },
    { key: 'n', label: 'Returns', format: 'int', drill: open },
    { key: 'median', label: 'Median days', format: 'days', drill: open },
    { key: 'q1', label: '25th percentile', format: 'days' },
    { key: 'q3', label: '75th percentile', format: 'days' },
  ]
  return (
    <Figure
      id="services-leave-length"
      uses={m.uses['services-leave-length']}
      metric={FIGURE_METRIC['services-leave-length']}
      span={6}
      title={l.hasReasons ? 'Leave length by reason' : 'Leave length'}
      subtitle={`Days from leave start to return, for returns in the ${per}: middle half, median and 10th to 90th percentile`}
      data={rows}
      columns={columns}
      definitions={[D.leaveLength, D.leaveReasons, D.leaveGroups]}
      note={asOfNote(
        m.asOf,
        count(l.returns.length, 'return'),
        l.hasReasons ? null : 'no leave reasons loaded',
      )}
      empty={
        !l.returns.length
          ? 'Nobody came back from leave in this period.'
          : shown.length
            ? null
            : hidden(k, 'each reason')
      }
    >
      <RangeBars
        data={shown}
        y="reason"
        min="p10"
        max="p90"
        q1="q1"
        q3="q3"
        mid="median"
        format="days"
        labels={{ min: '10th percentile', max: '90th percentile', mid: 'Median', range: 'Middle 50%' }}
        onSelect={(d) => drill(open(d))}
      />
    </Figure>
  )
}

function ReturnRateFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const l = m.leave
  const s = m.scope
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const rows = l.quarters
  const shown = rows.filter((r) => r.rate != null)
  const list = (r: QuarterRow, pick: (f: LeaveFact) => boolean, what: string) =>
    r.rate == null || !r.records.some(pick)
      ? null
      : () =>
          leaveDrill(s, r.records.filter(pick), {
            title: `${what}, ${r.quarter}`,
            subtitle: `${formatDate(r.start)} to ${formatDate(r.end)} · ${s.scope}`,
            gate: r.records,
            columns: ['returned', 'ended', 'exit'],
            note:
              what === 'Leaves that ended'
                ? `Rate = ${fmt(r.returned, 'int')} returned ÷ ${plural(r.n, 'leave')} that ended.`
                : `Out of ${plural(r.n, 'leave')} that ended.`,
          })
  const all = (r: QuarterRow) => list(r, () => true, 'Leaves that ended')
  const columns: Column<QuarterRow>[] = [
    { key: 'quarter', label: 'Quarter' },
    { key: 'n', label: 'Leaves ended', format: 'int', drill: all },
    {
      key: 'returned',
      label: 'Returned',
      format: 'int',
      drill: (r) => list(r, (f) => f.end === 'returned', 'Returns'),
    },
    {
      key: 'left',
      label: 'Left during leave',
      format: 'int',
      drill: (r) => list(r, (f) => f.end === 'left', 'Left during leave'),
    },
    { key: 'rate', label: 'Return rate', format: 'pct', drill: all },
  ]
  const lo = Math.min(...shown.map((r) => r.rate as number), 1)
  return (
    <Figure
      id="services-leave-return-rate"
      uses={m.uses['services-leave-return-rate']}
      metric={FIGURE_METRIC['services-leave-return-rate']}
      span={6}
      title="Return rate by quarter"
      subtitle={`Leaves that ended in a return, of those that ended in a return or an exit, ${rows[0]?.quarter} to ${rows[rows.length - 1]?.quarter}`}
      data={rows}
      columns={columns}
      definitions={[D.returnRate, D.leavePairing, D.leaveGroups]}
      note={asOfNote(
        m.asOf,
        `${count(
          rows.reduce((a, r) => a + r.n, 0),
          'leave',
        )} ended`,
        'the latest quarter runs to the as-of date',
      )}
      empty={shown.length ? null : hidden(l.min, 'each quarter')}
    >
      <Lines
        data={shown}
        x="start"
        y="rate"
        format="pct"
        xTicks="quarter"
        yDomain={[Math.max(0, Math.floor(lo * 20) / 20 - 0.05), 1]}
        height={240}
        onSelect={(d) => drill(all(d))}
      />
    </Figure>
  )
}

/* ───────────── returns coming up ───────────── */

interface ReturnRow {
  leaveId: string
  employeeId: string
  name: string
  businessUnit: string | null
  expected: string
  daysAway: number
  status: ReturnStatus
  returnTx: string | null
  u: UpcomingReturn
}

function ReturnsFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const l = m.leave
  const s = m.scope
  const cfg = m.settings.leave
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const rows: ReturnRow[] = l.upcomingShown
    ? l.upcoming.map((u) => ({
        leaveId: u.fact.leaveId,
        employeeId: u.fact.employeeId,
        name: u.fact.name ?? u.fact.employeeId,
        businessUnit: u.fact.businessUnit,
        expected: u.expected,
        daysAway: u.daysAway,
        status: u.status,
        returnTx: u.fact.ret?.transactionId ?? null,
        u,
      }))
    : []
  const one = (r: ReturnRow) =>
    s.on ? () => upcomingDrill(listedScope(s), [r.u], `Return from leave, ${r.name}`) : null
  const notReady = l.upcoming.filter((u) => !u.ready)
  const columns: Column<ReturnRow>[] = [
    { key: 'name', label: 'Name', drill: one },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'expected', label: 'Planned return', format: 'date' },
    { key: 'daysAway', label: 'Days away', format: 'days' },
    { key: 'status', label: 'LV-03 check' },
    { key: 'returnTx', label: 'Return transaction' },
  ]
  const screen: AtlasColumn<ReturnRow>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (r) => (
        <>
          <Drill spec={one(r)} label={`Show the return from leave for ${r.name}`} className="text-left">
            {r.name}
          </Drill>
          <div className="mt-0.5 text-[12px] text-muted">{r.businessUnit ?? 'Unknown business unit'}</div>
        </>
      ),
    },
    {
      key: 'expected',
      label: 'Planned return',
      className: 'whitespace-nowrap',
      render: (r) => formatDate(r.expected),
    },
    { key: 'daysAway', label: 'Days away', align: 'right', render: (r) => fmt(r.daysAway, 'days') },
    {
      key: 'status',
      label: 'LV-03 check',
      className: 'whitespace-nowrap',
      render: (r) => (
        <StatusPill severity={r.u.urgent ? 'critical' : STATUS_SEVERITY[r.status]} label={r.status} />
      ),
    },
    {
      key: 'returnTx',
      label: 'Return transaction',
      render: (r) =>
        r.returnTx ? (
          <span className="font-mono text-[12px] text-ink-2">{r.returnTx}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ]
  const allDrill =
    l.upcomingShown && s.on ? () => upcomingDrill(s, l.upcoming, returnsLabel(cfg.aheadDays)) : null
  return (
    <Figure
      id="services-leave-returns-soon"
      uses={m.uses['services-leave-returns-soon']}
      metric={FIGURE_METRIC['services-leave-returns-soon']}
      span={12}
      title={returnsLabel(cfg.aheadDays)}
      subtitle={`Open leaves with a planned return by ${formatDate(addDays(m.asOf, cfg.aheadDays))}, not ready first; critical when due within ${plural(cfg.urgentDays, 'day')}`}
      data={rows}
      columns={columns}
      definitions={[D.returnsSoon, D.systemsReady, D.leavePairing]}
      note={asOfNote(
        m.asOf,
        l.upcomingShown
          ? `${fmt(notReady.length, 'int')} of ${count(l.upcoming.length, 'return')} not ready`
          : null,
      )}
      image={false}
      tableToggle={false}
      empty={
        !l.hasExpected
          ? 'No planned return dates are loaded. Map an expected return date for leave starts in the Data room.'
          : !l.upcoming.length
            ? `Nobody is due back from leave in the next ${plural(cfg.aheadDays, 'day')}.`
            : l.upcomingShown
              ? null
              : hidden(l.min, 'the upcoming returns')
      }
    >
      <AtlasTable
        rows={rows}
        columns={screen}
        rowKey={(r) => r.leaveId}
        caption={returnsLabel(cfg.aheadDays)}
      />
      {allDrill && (
        <p className="mt-2 text-[12px] text-muted">
          <Drill spec={allDrill}>Open all {count(l.upcoming.length, 'return')}</Drill> with days on leave so
          far.
        </p>
      )}
    </Figure>
  )
}

function SurveyFigure({
  m,
  ctx,
  survey,
}: {
  m: ServicesModel
  ctx: AnalyticsContext
  survey: SurveyHeadline | null
}) {
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const listening =
    survey?.metricId && ctx.metrics.def(survey.metricId)
      ? metricDefinition(ctx.metrics, survey.metricId)
      : null
  const rows = survey
    ? [{ survey: 'Return to work', measure: survey.label, value: survey.value, valueFormat: survey.format }]
    : []
  // Answers loaded but none in this scope (a filter) is not the same as none loaded at all.
  const loaded = ctx.all.surveyResponses.some((r) => r.survey === 'Return to work')
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'survey', label: 'Survey' },
    { key: 'measure', label: 'Measure' },
    {
      key: 'value',
      label: 'Result',
      format: () => survey?.format ?? 'num1',
      drill: () => survey?.drill ?? null,
    },
  ]
  return (
    <Figure
      id="services-leave-survey"
      uses={m.uses['services-leave-survey']}
      metric={FIGURE_METRIC['services-leave-survey']}
      span={12}
      title="Return to work survey"
      subtitle="Sent 30 days after a return: was it smooth, with systems ready and a manager check-in"
      data={rows}
      columns={columns}
      definitions={listening ? [D.returnSurvey, listening] : [D.returnSurvey]}
      note={survey ? 'From Listening, grouped results only' : undefined}
      image={false}
      tableToggle={false}
      empty={
        survey
          ? null
          : loaded
            ? 'No Return to work answers in this scope.'
            : 'No Return to work survey results yet. They show here, linked to Listening, once survey answers are loaded.'
      }
    >
      {survey && (
        <div className="flex h-full flex-col gap-3">
          <div>
            <div className="cut-head text-[40px] leading-none font-semibold text-ink">
              <Drill spec={survey.drill}>{fmt(survey.value, survey.format)}</Drill>
            </div>
            <div className="mt-1.5 text-[13px] text-ink-2">{survey.label}</div>
          </div>
          <div>
            <Button size="sm" onClick={() => goTo('listening', 'services')}>
              Open in Listening
            </Button>
          </div>
        </div>
      )}
    </Figure>
  )
}

/* ───────────── after the return ───────────── */

function RetentionFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const l = m.leave
  const s = m.scope
  const r = l.retention
  const target = m.settings.leave.retentionTarget
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const rows: RetentionRow[] = l.hasReasons ? r.byReason : [r.overall]
  const shown = rows.filter((x) => x.rate != null)
  const open = (x: RetentionRow, pick?: (f: LeaveFact) => boolean, what?: string) => {
    if (x.rate == null) return null
    if (l.hasReasons) return () => retentionGroupsDrill(l, { scope: s })
    const list = pick ? x.records.filter(pick) : x.records
    if (!list.length) return null
    return () =>
      leaveDrill(s, list, {
        title: what ?? `Returners ${formatDate(r.from)} to ${formatDate(r.to)}`,
        subtitle: `Returns ${formatDate(r.from)} to ${formatDate(r.to)} · ${s.scope}`,
        gate: x.records,
        columns: ['returned', 'retained', 'exit'],
        months: r.months,
      })
  }
  const columns: Column<RetentionRow>[] = [
    { key: 'group', label: l.hasReasons ? 'Leave reason' : 'Leaves' },
    { key: 'returners', label: 'Returners', format: 'int', drill: (x) => open(x) },
    {
      key: 'retained',
      label: 'Still employed',
      format: 'int',
      drill: (x) => open(x, (f) => !f.exit, 'Still employed'),
    },
    {
      key: 'left',
      label: 'Left',
      format: 'int',
      drill: (x) => open(x, (f) => !!f.exit, 'Left after returning'),
    },
    { key: 'rate', label: 'Retention', format: 'pct', drill: (x) => open(x) },
  ]
  const months = plural(r.months, 'month')
  return (
    <Figure
      id="services-leave-retention"
      uses={m.uses['services-leave-retention']}
      metric={FIGURE_METRIC['services-leave-retention']}
      span={6}
      title={l.hasReasons ? `${retentionLabel(r.months)} by reason` : retentionLabel(r.months)}
      subtitle={`People who returned ${formatDate(r.from)} to ${formatDate(r.to)} and were still employed ${months} later, against the ${pctWords(target)} target`}
      data={rows}
      columns={columns}
      definitions={[D.retention, D.leaveReasons, D.leaveGroups]}
      note={asOfNote(
        m.asOf,
        count(r.overall.returners, 'returner'),
        `target ${pctWords(target)}`,
        l.hasReasons ? null : 'no leave reasons loaded',
      )}
      empty={
        !r.overall.returners
          ? 'Nobody returned from leave in the cohort window.'
          : shown.length
            ? null
            : hidden(l.min, 'each group')
      }
    >
      <BarList
        data={shown}
        label="group"
        value="rate"
        format="pct"
        sort="none"
        domain={[0, 1]}
        ref={{ value: target, label: `Target ${pctWords(target)}` }}
        secondary={(d) => `${fmt(d.retained, 'int')} of ${fmt(d.returners, 'int')}`}
        tone={(d) => rateTone(d.rate, target)}
        onSelect={(d) => drill(open(d))}
      />
    </Figure>
  )
}

interface ExitRow {
  measure: string
  people: number | null
  resigned: number | null
  base: number
  baseLabel: string
  share: number | null
  key: 'soon' | 'during'
}

function ExitsFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const l = m.leave
  const s = m.scope
  const e = l.exits
  const k = l.min
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const months = plural(e.months, 'month')
  const soonOk = e.soonBase.length > 0 && new Set(e.soonBase.map((f) => f.person)).size >= k
  const duringOk = e.duringBase.length > 0 && new Set(e.duringBase.map((f) => f.person)).size >= k
  const vol = (types: readonly (string | null)[]) => types.filter((t) => t === 'Voluntary').length
  const soonPeople = e.soon.length
  const rows: ExitRow[] = [
    {
      key: 'soon',
      measure: `Left within ${months} of returning`,
      people: soonOk ? soonPeople : null,
      resigned: soonOk ? vol(e.soon.map((x) => x.exitType)) : null,
      base: e.soonBase.length,
      baseLabel: `Returns in the period or the ${months} before`,
      share: soonOk && e.soonBase.length ? soonPeople / new Set(e.soonBase.map((f) => f.person)).size : null,
    },
    {
      key: 'during',
      measure: 'Left during leave',
      people: duringOk ? e.during.length : null,
      resigned: duringOk ? vol(e.during.map((f) => f.exitType)) : null,
      base: e.duringBase.length,
      baseLabel: 'Leaves that ended in the period',
      share: duringOk && e.duringBase.length ? e.during.length / e.duringBase.length : null,
    },
  ]
  const people = (r: ExitRow, voluntaryOnly = false) => {
    if (r.people == null || !r.people) return null
    if (r.key === 'soon') {
      const list = e.soon.filter((x) => !voluntaryOnly || x.exitType === 'Voluntary')
      if (!list.length) return null
      return () =>
        leaversDrill(s, list, ctx.org.byId, `Left within ${months} of returning from leave`, {
          gate: e.soonBase,
          note: 'Shown to HR only. Never by name in a finding.',
        })
    }
    const list = e.during.filter((f) => !voluntaryOnly || f.exitType === 'Voluntary')
    if (!list.length) return null
    return () =>
      leaversDrill(
        s,
        list.map((f) => ({ fact: f, exit: f.exit as string })),
        ctx.org.byId,
        'Left during leave',
        { gate: e.duringBase, note: 'Shown to HR only. Never by name in a finding.' },
      )
  }
  const base = (r: ExitRow) => {
    const rows = r.key === 'soon' ? e.soonBase : e.duringBase
    const ok = r.key === 'soon' ? soonOk : duringOk
    if (!ok) return null
    return () =>
      leaveDrill(s, rows, {
        title: r.baseLabel,
        subtitle: `${m.window.label} · ${s.scope}`,
        columns: ['returned', 'ended', 'exit'],
      })
  }
  const columns: Column<ExitRow>[] = [
    { key: 'measure', label: 'Measure' },
    { key: 'people', label: 'People', format: 'int', drill: (r) => people(r) },
    { key: 'resigned', label: 'Of whom resigned', format: 'int', drill: (r) => people(r, true) },
    { key: 'base', label: 'Out of', format: 'int', drill: base },
    { key: 'baseLabel', label: 'Base' },
    { key: 'share', label: 'Share', format: 'pct' },
  ]
  return (
    <Figure
      id="services-leave-exits"
      uses={m.uses['services-leave-exits']}
      metric={FIGURE_METRIC['services-leave-exits']}
      span={6}
      title="Exits around leave"
      subtitle={`Shown to HR only: people who left in the ${period(ctx)} soon after returning, or during a leave`}
      data={rows}
      columns={columns}
      definitions={[D.exitsAfterReturn, D.exitsDuringLeave, D.hrOnly, D.leaveGroups]}
      note={asOfNote(m.asOf, 'counts open the people for HR')}
      tableOnly
      empty={!soonOk && !duringOk ? hidden(k, 'these counts') : null}
    />
  )
}

/**
 * My team, Hiring: the org's pipeline today (Recruiting's figure), starts by week and readiness,
 * the open reqs and the upcoming starts one by one (Onboarding's and Recruiting's records).
 */
import { type Column, Columns, Figure, useChartTheme } from '@/charts'
import { RouteLink, Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { dayOneTasksDrill, startsDrill, tasksDrill } from '@/views/onboarding/engine/drills'
import { TASK_OWNER, TASKS, UPCOMING, union } from '@/views/onboarding/engine/lineage'
import type { ReadyStatus } from '@/views/onboarding/engine/starts'
import { M as ONB } from '@/views/onboarding/metrics'
import { defs, READY_SEVERITY } from '@/views/onboarding/ui/shared'
import {
  activeDrill,
  lackingKpiDrill,
  nextStateDrill,
  pipelineCellDrill,
  pipelineStageDrill,
  reqRowDrill,
} from '@/views/recruiting/engine/drills'
import { FIGURE_USES } from '@/views/recruiting/engine/lineage'
import { FIGURE_METRICS } from '@/views/recruiting/engine/metricLinks'
import { STATE_NAME } from '@/views/recruiting/engine/nextStep'
import type { PipelineCell } from '@/views/recruiting/engine/pipeline'
import { NEXT_STATES } from '@/views/recruiting/engine/types'
import { RM } from '@/views/recruiting/metrics'
import { PipelineBars } from '@/views/recruiting/ui/PipelineBars'
import {
  openReqRows,
  READY_ORDER,
  type ReqRow,
  type StartRow,
  startCalendar,
  startRows,
  startsAfterCalendar,
  type TeamSources,
  type WeekRow,
} from '../engine'

const LINK = 'text-meta font-medium text-link underline-offset-2 hover:underline'

/** Starts drawn in the table before "Show all"; the export holds every one. */
const STARTS_SHOWN = 8

export function HiringSection({ s }: { s: TeamSources }) {
  const ctx = useAnalytics()
  const t = useChartTheme()
  const r = s.recruiting
  const b = r.base
  const o = s.onboarding
  const ob = o.base
  const asOf = formatDate(ctx.asOf)

  /* Pipeline today (Recruiting's figure and records). */
  const pipelineRows = r.pipeline.flatMap((stage) =>
    NEXT_STATES.flatMap((state) => {
      const c = stage.cells.find((x) => x.state === state)
      return c
        ? [{ stage: c.stage, state: c.label, candidates: c.candidates, lacking: c.lacking, cell: c }]
        : []
    }),
  )
  type PipelineRow = (typeof pipelineRows)[number]
  const cellDrill = (c: PipelineCell) => () => pipelineCellDrill(b, c)
  const pipelineColumns: Column<PipelineRow>[] = [
    { key: 'stage', label: 'Stage' },
    { key: 'state', label: 'Next step state' },
    { key: 'candidates', label: 'Candidates', format: 'int', drill: (x) => cellDrill(x.cell) },
    {
      key: 'lacking',
      label: 'Lacking a next step',
      format: 'int',
      drill: (x) =>
        x.lacking
          ? () =>
              pipelineCellDrill(b, {
                ...x.cell,
                label: `${x.cell.label}, lacking a next step`,
                items: x.cell.items.filter((i) => i.tier),
              })
          : null,
    },
  ]

  /* Starts by week and readiness. */
  const weeks = startCalendar(o)
  const later = startsAfterCalendar(o)
  const drawnStarts = weeks.reduce((n, w) => n + w.starts, 0)
  const statuses = READY_ORDER.filter((st) => weeks.some((w) => w.status === st && w.starts > 0))
  // The chart draws the states someone is in (every week keeps its place on the axis); the table
  // view and the export keep a row for every week and state.
  const drawn = statuses.length ? statuses : READY_ORDER.slice(0, 1)
  const chartWeeks = weeks.filter((w) => drawn.includes(w.status))
  const readyColor: Record<ReadyStatus, string> = {
    Ready: t.status.good,
    'On track': t.series[0],
    Behind: t.status.warning,
    'Not ready': t.status.critical,
    'No tasks': t.deemph,
  }
  const weekLabelOf = new Map(weeks.map((w) => [w.weekOf, w.week]))
  const weekDrill = (weekOf: string) => () => {
    const week = weekLabelOf.get(weekOf)
    return startsDrill(
      ob,
      weeks.filter((w) => w.weekOf === weekOf).flatMap((w) => w.people),
      `Starts in the week of ${week ? formatDate(week) : weekOf}`,
      { uses: UPCOMING },
    )
  }
  const segmentDrill = (w: WeekRow) => () =>
    startsDrill(ob, w.people, `${w.status}: starts in the week of ${formatDate(w.week)}`, {
      uses: union(UPCOMING, TASKS),
    })

  /* Open reqs. */
  const reqs = openReqRows(r)
  const reqName = (x: ReqRow) => (x.title ? `${x.reqId} ${x.title}` : x.reqId)
  const reqDrill = (x: ReqRow) => () => reqRowDrill(b, x.row, 'req')
  const activeOf = (x: ReqRow) =>
    x.active ? () => activeDrill(b, x.row.items, { title: `${reqName(x)}: active candidates` }) : null
  const reqColumns: Column<ReqRow>[] = [
    { key: 'reqId', label: 'Req', width: 12, drill: reqDrill },
    { key: 'title', label: 'Job title' },
    { key: 'daysOpen', label: 'Days open', format: 'int', drill: reqDrill },
    { key: 'active', label: 'Active candidates', format: 'int', drill: activeOf },
    {
      key: 'lacking',
      label: 'Lacking a next step',
      format: 'int',
      drill: (x) => (x.lacking ? () => reqRowDrill(b, x.row, 'lacking') : null),
    },
    {
      key: 'health',
      label: 'Health',
      drill: (x) => (x.health === 'Empty funnel' || x.lacking ? () => reqRowDrill(b, x.row, 'health') : null),
    },
  ]

  /* Upcoming starts. */
  const starts = startRows(o)
  const taskUses = union(UPCOMING, TASKS)
  const personDrill = (x: StartRow) => () => startsDrill(ob, [x.r.start], x.name, { uses: UPCOMING })
  const startColumns: Column<StartRow>[] = [
    { key: 'name', label: 'Person', drill: personDrill },
    { key: 'role', label: 'Role' },
    { key: 'startDate', label: 'Start date', format: 'date' },
    { key: 'daysToGo', label: 'Days to go', format: 'days', drill: personDrill },
    {
      key: 'readiness',
      label: 'Day-one tasks',
      drill: (x) =>
        x.r.readiness.tasks.length
          ? () => dayOneTasksDrill(ob, x.r.readiness, x.name, { uses: taskUses })
          : null,
    },
    { key: 'status', label: 'Readiness' },
    {
      key: 'blocking',
      label: 'Blocking item',
      drill: (x) => {
        const blocking = x.r.readiness.blocking
        return blocking
          ? () => tasksDrill(ob, [blocking], `${blocking.name}, ${x.name}`, { uses: taskUses })
          : null
      },
    },
    { key: 'hiringManager', label: 'Hiring manager' },
  ]

  return (
    <Section
      title="Hiring"
      dek="Open roles, candidates waiting on a step, and who starts soon."
      align="start"
    >
      <Figure
        id="team-pipeline"
        uses={FIGURE_USES['recruiting-pipeline-today']}
        metric={FIGURE_METRICS['recruiting-pipeline-today']}
        title="Pipeline today"
        subtitle={`Active candidates on the org's reqs by stage and next step on ${formatDate(b.asOf)}`}
        data={pipelineRows}
        columns={pipelineColumns}
        definitions={defs(ctx.metrics, [RM.activeCandidates, RM.lackingNextStep])}
        note={`${plural(b.actives.length, 'active candidate')} · as of ${asOf}`}
        span={7}
        actions={
          <RouteLink view="recruiting" tab="pipeline" className={LINK}>
            Open Pipeline
          </RouteLink>
        }
        emptyHeight={240}
        empty={b.actives.length ? null : 'No active candidates on the org’s reqs on the as-of date.'}
      >
        <PipelineBars
          stages={r.pipeline}
          cellDrill={cellDrill}
          stageDrill={(stage, lackingOnly) => () => pipelineStageDrill(b, stage, lackingOnly)}
          stateDrill={(state) => () => nextStateDrill(b, state, STATE_NAME[state])}
          lackingDrill={() => lackingKpiDrill(b)}
        />
      </Figure>
      <Figure
        id="team-start-calendar"
        uses={union(UPCOMING, TASKS)}
        metric={ONB.calendar}
        title="Starts by week"
        subtitle={`Upcoming starts in each of the next ${o.upcoming.weeks.length} weeks, by day-one readiness`}
        data={weeks}
        columns={[
          { key: 'week', label: 'Week of', format: 'date' },
          { key: 'status', label: 'Readiness', format: 'text' },
          {
            key: 'starts',
            label: 'Starts',
            format: 'int',
            drill: (w) => (w.starts ? segmentDrill(w) : null),
          },
        ]}
        definitions={defs(ctx.metrics, [ONB.calendar, ONB.readiness])}
        note={[
          plural(drawnStarts, 'start'),
          later ? `${fmt(later, 'int')} later, not drawn` : '',
          `as of ${asOf}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        span={5}
        emptyHeight={240}
        empty={drawnStarts ? null : 'Nobody in the org starts in the next weeks.'}
      >
        <Columns<WeekRow>
          data={chartWeeks}
          x="weekOf"
          y="starts"
          series="status"
          stack
          seriesOrder={drawn}
          colors={readyColor}
          xOrder={[...new Set(weeks.map((w) => w.weekOf))]}
          format="int"
          onSelect={(d) => drill(weekDrill(d.weekOf))}
          onSelectSegment={(d) => drill(d.starts ? segmentDrill(d) : weekDrill(d.weekOf))}
          ariaLabel="Starts per week by day-one readiness"
        />
      </Figure>
      <Figure
        id="team-open-reqs"
        uses={FIGURE_USES['recruiting-open-requisitions']}
        metric={FIGURE_METRICS['recruiting-open-requisitions']}
        title="Open reqs"
        subtitle={`Reqs open on ${asOf} with their active candidates and health, the ones that need attention first`}
        data={reqs}
        columns={reqColumns}
        definitions={defs(ctx.metrics, [RM.openReqs, RM.emptyFunnel, RM.lackingNextStep])}
        note={`${plural(reqs.length, 'open req')} · as of ${asOf}`}
        span={6}
        tableOnly
        table={{
          rowTone: (x) => x.severity,
          maxRows: 8,
          onRowClick: (x) => drill(activeOf(x) ?? reqDrill(x)),
        }}
        empty={reqs.length ? null : 'No open reqs in the org on the as-of date.'}
      />
      <Figure
        id="team-starts-table"
        uses={union(UPCOMING, TASKS, TASK_OWNER, ['requisitions.hiringManager'])}
        metric={ONB.readiness}
        title="Upcoming starts"
        subtitle="Each person's day-one tasks, readiness and the item blocking it"
        data={starts}
        columns={startColumns}
        definitions={defs(ctx.metrics, [ONB.readiness, ONB.starts])}
        note={`${plural(starts.length, 'start')} · as of ${asOf}`}
        span={6}
        tableOnly
        table={{
          rowTone: (x) => (x.r.readiness.status ? READY_SEVERITY[x.r.readiness.status] : null),
          maxRows: STARTS_SHOWN,
          onRowClick: (x) =>
            x.r.start.employee ? openPerson(x.r.start.employee.employeeId) : drill(personDrill(x)),
        }}
        empty={starts.length ? null : 'Nobody in the org starts after the as-of date.'}
      />
    </Section>
  )
}

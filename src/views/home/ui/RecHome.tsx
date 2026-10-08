/**
 * The Recruiter's home (docs/ROLES-V2.md 5.9): the recruiter's own desk. Who lacks a next step,
 * which offers are out, which reqs are stuck, and who starts soon. Candidates lacking a next step
 * lead over what they wait on; then the key figures (compared with all reqs), the pipeline today
 * and waiting time by stage; Needs attention (the recruiter's own steps); My list, the open reqs
 * (or the candidates in the queue); and req age against the pipeline and the countdown to day one.
 */
import { useState } from 'react'
import { type Column, DotStrip, Figure, Heatmap } from '@/charts'
import { KpiStrip, Section } from '@/components'
import type { Kpi } from '@/components/types'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { ONBOARDING_OWNERS, STAGES } from '@/data/schema'
import { drill } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { computeOnboarding } from '@/views/onboarding/engine'
import { countdownDrill, startsDrill } from '@/views/onboarding/engine/drills'
import { TASK_OWNER, TASKS, UPCOMING, union } from '@/views/onboarding/engine/lineage'
import {
  type CountdownCell,
  type CountdownRow,
  countdownGrid,
  countdownRows,
  NOTHING_OPEN,
} from '@/views/onboarding/engine/upcoming'
import { M as ONBOARDING } from '@/views/onboarding/metrics'
import { computeRecruiting, type RecruitingModel } from '@/views/recruiting/engine'
import { ageBars } from '@/views/recruiting/engine/actions'
import { activeDrill, activeKpiDrill, candidateDrill, reqRowDrill } from '@/views/recruiting/engine/drills'
import { FIGURE_USES } from '@/views/recruiting/engine/lineage'
import { FIGURE_METRICS } from '@/views/recruiting/engine/metricLinks'
import type { WaitDot } from '@/views/recruiting/engine/pipeline'
import type { OpenReqRow } from '@/views/recruiting/engine/reqs'
import { LAST_OPEN_STAGE } from '@/views/recruiting/engine/types'
import { RM } from '@/views/recruiting/metrics'
import { defOf } from '@/views/recruiting/ui/common'
import { PipelineToday } from '@/views/scorecard/ui/Sections'
import { HOME_SHOWN, reqOfItem, severityByRecord } from '../engine/attention'
import { tile } from '../engine/kpis'
import { healthWithAge, lackingParts, onOpenReqs, type QueueRow, queueRows } from '../engine/rec'
import { recHomeCopy } from '../engine/title'
import { AttentionSection } from './Attention'
import { ReqRisk } from './Figures'
import { Hero, ListFigure, ListSwitch } from './Frames'
import { HomeTop } from './HomeTop'
import { type HomeItems, useHomeItems } from './useHomeItems'

/* ───────── lacking a next step ───────── */

function NextStep({ m }: { m: RecruitingModel }) {
  const b = m.base
  // Candidates on a held req wait on nobody: counted apart, as Needs attention leaves them out.
  const { open: actives, held } = onOpenReqs(b.actives, b.asOf)
  const parts = lackingParts(actives)
  const lacking = parts.reduce((n, p) => n + p.count, 0)
  const seg = (key: string) => {
    const p = parts.find((x) => x.key === key)
    return p
      ? () => activeDrill(b, p.items, { title: `Lacking a next step: ${p.label.toLowerCase()}` })
      : null
  }
  return (
    <Hero
      id="home-rec-next-step"
      metric={RM.lackingNextStep}
      uses={FIGURE_USES['recruiting-pipeline-today']}
      title="Lacking a next step"
      subtitle="Active candidates past the usual time for their step, by what they wait on"
      value={b.actives.length ? fmt(lacking, 'int') : '—'}
      valueDrill={
        lacking
          ? () =>
              activeDrill(
                b,
                actives.filter((x) => x.tier),
                { title: 'Lacking a next step' },
              )
          : null
      }
      valueLabel="Show the candidates lacking a next step"
      label={`of ${plural(actives.length, 'active candidate')} on open reqs`}
      line={[
        `${fmt(
          parts.reduce((n, p) => n + p.red, 0),
          'int',
        )} overdue, ${fmt(
          parts.reduce((n, p) => n + p.amber, 0),
          'int',
        )} to watch`,
        held.length ? `${plural(held.length, 'candidate')} on a req on hold, not counted` : '',
        `as of ${formatDate(b.asOf)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      parts={parts}
      unit="candidates"
      onSegment={(key) => drill(seg(key))}
      ariaLabel="Candidates lacking a next step by what they wait on"
      data={parts}
      columns={[
        { key: 'label', label: 'Waiting on' },
        { key: 'count', label: 'Candidates', format: 'int', drill: (r) => seg(r.key) },
        { key: 'red', label: 'Overdue', format: 'int' },
        { key: 'amber', label: 'Watch', format: 'int' },
      ]}
      definitions={[defOf(b, RM.lackingNextStep)]}
      note={`${plural(actives.length, 'active candidate')} on open reqs · as of ${formatDate(b.asOf)}`}
      empty={b.apps.length ? null : 'Upload Candidates to see this.'}
    />
  )
}

/* ───────── waiting time ───────── */

function Waiting({ m }: { m: RecruitingModel }) {
  const b = m.base
  const dotDrill = (d: WaitDot) => () => candidateDrill(b, d.item)
  const lacking = b.actives.filter((x) => x.tier).length
  return (
    <Figure
      id="home-rec-waiting"
      uses={FIGURE_USES['recruiting-waiting-time']}
      metric={FIGURE_METRICS['recruiting-waiting-time']}
      title="Waiting time by stage"
      subtitle={`Days each active candidate has waited, ${formatDate(b.asOf)}`}
      data={m.waiting}
      columns={[
        { key: 'candidate', label: 'Candidate', drill: dotDrill },
        { key: 'applicationId', label: 'Application' },
        { key: 'stage', label: 'Stage' },
        { key: 'state', label: 'State' },
        { key: 'days', label: 'Days waiting', format: 'int', drill: dotDrill },
        { key: 'tier', label: 'Aging' },
      ]}
      definitions={[defOf(b, RM.daysWaiting)]}
      note={`${plural(m.waiting.length, 'active candidate')} · ${plural(lacking, 'lacks a next step', 'lack a next step')}`}
      span={4}
      empty={
        b.apps.length
          ? m.waiting.length
            ? null
            : 'No active candidates on the as-of date.'
          : 'Upload Candidates to see this.'
      }
    >
      <DotStrip
        data={m.waiting}
        x="days"
        y="stage"
        id="applicationId"
        label="candidate"
        tone={(d) => d.tone}
        xFormat="days"
        yOrder={STAGES.slice(0, LAST_OPEN_STAGE + 1)}
        median
        onSelect={(d) => drill(dotDrill(d))}
        ariaLabel="Waiting time by stage"
      />
    </Figure>
  )
}

/* ───────── my list ───────── */

type ListKey = 'reqs' | 'queue'

function MyList({ m, items }: { m: RecruitingModel; items: HomeItems | null }) {
  const ctx = useAnalytics()
  const say = recHomeCopy(ctx)
  const b = m.base
  const [list, setList] = useState<ListKey>('reqs')
  // A req reads with the worst severity Needs attention gives it, and says its age past target.
  const severity = severityByRecord(items?.collected.items ?? [], reqOfItem)
  const barOf = ageBars(b)
  const reqs = b.req.rows.map((r) => ({ ...r, health: healthWithAge(r.health, r.daysOpen, barOf(r.level)) }))
  const { open, held } = onOpenReqs(b.actives, b.asOf)
  const queue = queueRows(open, (i) => STAGES[i])
  const actions = (
    <ListSwitch<ListKey>
      value={list}
      onChange={setList}
      options={[
        { value: 'reqs', label: say.reqs(fmt(reqs.length, 'int')) },
        { value: 'queue', label: say.queue(fmt(queue.length, 'int')) },
      ]}
    />
  )
  if (list === 'queue') {
    const one = (r: QueueRow) => () => candidateDrill(b, r.item)
    const columns: Column<QueueRow>[] = [
      { key: 'candidate', label: 'Candidate', drill: one },
      { key: 'reqId', label: 'Req' },
      { key: 'title', label: 'Job title' },
      { key: 'stage', label: 'Stage' },
      { key: 'waiting', label: 'Waiting on' },
      { key: 'nextStep', label: 'Next step' },
      { key: 'owner', label: 'Owner' },
      { key: 'days', label: 'Days waiting', format: 'days', drill: one },
      { key: 'aging', label: 'Aging' },
    ]
    return (
      <ListFigure<QueueRow>
        metric={RM.lackingNextStep}
        uses={FIGURE_USES['recruiting-pipeline-today']}
        title={say.queueTitle}
        subtitle="Candidates whose next step someone owns and is past the usual time, the longest wait first"
        rows={queue}
        columns={columns}
        definitions={[defOf(b, RM.lackingNextStep)]}
        note={[
          plural(queue.length, 'candidate'),
          held.length ? `${plural(held.length, 'candidate')} on a req on hold not listed` : '',
          `as of ${formatDate(b.asOf)}`,
          'a row opens the application',
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={actions}
        rowTone={(r) => (r.aging === 'Overdue' ? 'critical' : r.aging === 'Watch' ? 'warning' : null)}
        onRowClick={(r) => drill(one(r))}
        empty="Nobody in the queue: every candidate on these reqs has a timely next step."
      />
    )
  }
  const cell = (measure: Parameters<typeof reqRowDrill>[2]) => (r: OpenReqRow) => () =>
    reqRowDrill(b, r, measure)
  const columns: Column<OpenReqRow>[] = [
    { key: 'reqId', label: 'Req', drill: cell('req') },
    { key: 'title', label: 'Job title' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'level', label: 'Level' },
    { key: 'priority', label: 'Priority' },
    { key: 'hiringManager', label: 'Hiring manager' },
    { key: 'daysOpen', label: 'Days open', format: 'int' },
    {
      key: 'applied',
      label: 'Applied',
      format: 'int',
      drill: (r) => (r.applied ? cell('applied')(r) : null),
    },
    { key: 'screen', label: 'Screen', format: 'int', drill: (r) => (r.screen ? cell('screen')(r) : null) },
    {
      key: 'hiringManagerStage',
      label: 'Hiring manager',
      format: 'int',
      drill: (r) => (r.hiringManagerStage ? cell('hiringManagerStage')(r) : null),
    },
    { key: 'onsite', label: 'Onsite', format: 'int', drill: (r) => (r.onsite ? cell('onsite')(r) : null) },
    { key: 'offer', label: 'Offer', format: 'int', drill: (r) => (r.offer ? cell('offer')(r) : null) },
    {
      key: 'lacking',
      label: 'Lacking a next step',
      format: 'int',
      drill: (r) => (r.lacking ? cell('lacking')(r) : null),
    },
    { key: 'health', label: 'Health', drill: cell('health') },
  ]
  return (
    <ListFigure<OpenReqRow>
      metric={RM.openReqs}
      uses={FIGURE_USES['recruiting-req-age-vs-pipeline']}
      title={say.reqsTitle}
      subtitle={`Each open req with its active candidates by stage, the oldest first, as of ${formatDate(b.asOf)}`}
      rows={[...reqs].sort((a, x) => x.daysOpen - a.daysOpen || a.reqId.localeCompare(x.reqId))}
      columns={columns}
      definitions={[defOf(b, RM.openReqs), defOf(b, RM.emptyFunnel)]}
      note={`${plural(reqs.length, 'open req')}${b.req.onHold.length ? ` · ${plural(b.req.onHold.length, 'req')} on hold not listed` : ''} · ${ctx.scopeLabel}`}
      actions={actions}
      rowTone={(r) => severity.get(r.reqId) ?? r.severity}
      onRowClick={(r) => drill(cell('req')(r))}
      empty={b.reqs.length ? 'No open reqs on the as-of date.' : 'Upload Requisitions to see this.'}
    />
  )
}

/* ───────── countdown to day one ───────── */

function Starts({ ctx }: { ctx: AnalyticsContext }) {
  const o = computeOnboarding(ctx)
  const b = o.base
  const horizon = b.settings.readinessHorizonDays
  const rows = countdownRows(o.upcoming.rows, horizon, b.masked)
  const owners = [...ONBOARDING_OWNERS, NOTHING_OPEN]
  const grid = countdownGrid(rows, b.asOf, horizon, owners)
  const uses = union(UPCOMING, TASKS, TASK_OWNER)
  const open = (r: CountdownRow) => () =>
    countdownDrill(b, r.row.readiness, r.name, { masked: b.masked, uses })
  const cellDrill = (c: CountdownCell): (() => DrillSpec | null) | null => {
    if (!c.starts) return null
    const one = c.rows.length === 1 ? c.rows[0] : null
    if (one) return one.row.readiness.total ? open(one) : null
    const held = c.owner === NOTHING_OPEN ? 'with nothing open' : `held by ${c.owner}`
    return () =>
      startsDrill(
        b,
        c.rows.map((r) => r.row.start),
        `Starts in the week of ${formatDate(c.week)}, ${held}`,
        { note: c.readiness, uses },
      )
  }
  const notReady = rows.filter((r) => r.status === 'Not ready').length
  return (
    <Figure
      id="home-rec-starts"
      uses={uses}
      metric={ONBOARDING.readiness}
      title="Countdown to day one"
      subtitle={recHomeCopy(ctx).startsSubtitle(fmt(horizon, 'days'))}
      data={rows}
      columns={[
        { key: 'name', label: 'Person', drill: (r) => (r.row.readiness.total ? open(r) : null) },
        { key: 'startDate', label: 'Start date', format: 'date' },
        { key: 'daysToGo', label: 'Days to go', format: 'days' },
        { key: 'owner', label: 'Held by' },
        { key: 'blocking', label: 'Blocking item' },
        { key: 'status', label: 'Readiness' },
      ]}
      note={`${plural(rows.length, 'start')} · ${fmt(notReady, 'int')} not ready · as of ${formatDate(b.asOf)}`}
      span={6}
      empty={rows.length ? null : `Nobody starts in the next ${fmt(horizon, 'days')}.`}
      table={{ maxRows: 15 }}
    >
      <Heatmap<CountdownCell>
        data={grid}
        x="weekLabel"
        y="owner"
        value="starts"
        format="int"
        xOrder={[...new Set(grid.map((c) => c.weekLabel))]}
        yOrder={owners}
        detail={(c) => (c.starts ? c.readiness : null)}
        cellText={(c) => (c.starts ? fmt(c.starts, 'int') : '')}
        selectable={(c) => cellDrill(c) !== null}
        onSelect={(c) => drill(cellDrill(c))}
        ariaLabel="Starts by start week and the team holding the blocking item"
      />
    </Figure>
  )
}

/* ───────── page ───────── */

export function RecHome() {
  const ctx = useAnalytics()
  const say = recHomeCopy(ctx)
  const m = computeRecruiting(ctx)
  const b = m.base
  const items = useHomeItems()
  const offersOut = b.actives.filter((x) => x.state === 'offer-out')
  // The pipeline counts every active candidate, as Recruiting's Pipeline tab does, and says which wait on a held req.
  const heldCount = onOpenReqs(b.actives, b.asOf).held.length
  const heldNote = heldCount ? plural(heldCount, 'on a req on hold', 'on reqs on hold') : undefined
  const kpis: Kpi[] = [
    ...tile(m.kpis, 'open-reqs', {
      view: 'recruiting',
      tab: 'requisitions',
      label: 'Recruiting, Requisitions',
    }),
    {
      id: 'active',
      metricId: RM.activeCandidates,
      label: 'Active candidates',
      value: b.apps.length ? b.actives.length : null,
      format: 'int',
      note: plural(b.actives.filter((x) => x.tier).length, 'lacks a next step', 'lack a next step'),
      drill: b.actives.length ? () => activeKpiDrill(b) : undefined,
      uses: FIGURE_USES['recruiting-pipeline-today'],
      link: { view: 'recruiting', tab: 'pipeline', label: 'Recruiting, Pipeline' },
    },
    {
      id: 'offers-out',
      metricId: RM.offersWaiting,
      label: 'Offers out',
      value: b.apps.length ? offersOut.length : null,
      format: 'int',
      note: 'Waiting on an answer',
      drill: offersOut.length
        ? () => activeDrill(b, offersOut, { title: 'Offers out, waiting on an answer' })
        : undefined,
      uses: FIGURE_USES['recruiting-pipeline-today'],
      link: { view: 'recruiting', tab: 'pipeline', label: 'Recruiting, Pipeline' },
    },
    ...tile(m.kpis, 'hires', { view: 'recruiting', tab: 'overview', label: 'Recruiting, Overview' }),
    ...tile(m.kpis, 'time-to-fill', {
      view: 'recruiting',
      tab: 'requisitions',
      label: 'Recruiting, Requisitions',
    }),
    ...tile(m.kpis, 'offer-acceptance', {
      view: 'recruiting',
      tab: 'sources',
      label: 'Recruiting, Sources & offers',
    }),
  ]
  return (
    <>
      <HomeTop
        hero={<NextStep m={m} />}
        overview={
          <>
            <KpiStrip id="home-rec-kpis" title="Key figures" kpis={kpis} span={8} />
            <PipelineToday id="home-rec-pipeline" span={8} extraNote={heldNote} />
            <Waiting m={m} />
          </>
        }
        attention={<AttentionSection items={items} shown={HOME_SHOWN} dek={say.attentionDek} />}
      />
      <Section title="My list" dek={say.listDek}>
        <MyList m={m} items={items} />
      </Section>
      <Section title="Reqs and starts" dek="Which reqs are stuck, and who starts soon.">
        <ReqRisk id="home-rec-req-age" span={6} />
        <Starts ctx={ctx} />
      </Section>
    </>
  )
}

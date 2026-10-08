/**
 * HR ops' home (docs/ROLES-V2.md 5.8): are employees getting answers on time, are transactions
 * processed on time, who is returning from leave, and which day-one and I-9 tasks are open. The
 * resolution SLA leads over where every open case stands against its target; then the key
 * figures, the backlog by age and the SLA by month; Needs attention (the role's queues); My list,
 * the open case queue (or transactions in flight, or returns in 30 days); and transactions on time
 * by type and day-one readiness by owner. Employee relations cases are counted, never listed.
 */
import { useState } from 'react'
import { BarList, type Column, Columns, Figure, Lines } from '@/charts'
import { Grid, KpiStrip, Section } from '@/components'
import type { Kpi, Severity } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { compute as complianceModel } from '@/views/compliance/engine'
import { computeOnboarding } from '@/views/onboarding/engine'
import { tasksDrill } from '@/views/onboarding/engine/drills'
import { TASK_OWNER, TASKS, UPCOMING, union } from '@/views/onboarding/engine/lineage'
import type { OwnerReadinessRow } from '@/views/onboarding/engine/upcoming'
import { M as ONBOARDING } from '@/views/onboarding/metrics'
import { computeCached, type ServicesModel } from '@/views/services/engine'
import {
  AGE_BUCKETS,
  BACKLOG_STATUSES,
  type BacklogRow,
  type MonthSlaRow,
  type OpenCaseRow,
  openCaseRows,
} from '@/views/services/engine/cases'
import { servicesDefinitions } from '@/views/services/engine/definitions'
import { drillWhen, oneCaseDrill, openDrill, resolutionDrill, txDrill } from '@/views/services/engine/drills'
import { leaveDrill } from '@/views/services/engine/leaveDrills'
import { pctWords } from '@/views/services/engine/settings'
import { finalPayKpi } from '@/views/services/engine/summary'
import type { TypeRow } from '@/views/services/engine/transactions'
import { FIGURE_METRIC, M as SERVICES } from '@/views/services/metrics'
import { onTimeCells } from '@/views/services/ui/drill'
import { rateTone } from '@/views/services/ui/shared'
import { HOME_SHOWN } from '../engine/attention'
import { tile } from '../engine/kpis'
import { type ReturnRow, returnsSoon, slaParts, type TxRow, txInFlight } from '../engine/ops'
import { AttentionSection } from './Attention'
import { Hero, ListFigure, ListSwitch } from './Frames'
import { useHomeItems } from './useHomeItems'

const SLA_TONE: Record<string, Severity | null> = {
  'Past target': 'critical',
  'Due within 24 h': 'warning',
  'Within target': null,
  'No target': null,
}

/* ───────── resolution SLA ───────── */

function Sla({ m }: { m: ServicesModel }) {
  const ctx = useAnalytics()
  const sla = m.kpis.find((k) => k.id === 'resolution-sla')
  const parts = slaParts(m.cases, m.asOf, !m.smallScope)
  const open = parts.reduce((n, p) => n + p.count, 0)
  const privates = parts.reduce((n, p) => n + p.private, 0)
  const target = m.settings.resolutionTarget
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const seg = (key: string) => {
    const p = parts.find((x) => x.key === key)
    return p
      ? drillWhen(m.scope, p.facts, () => openDrill(m.scope, p.facts, `Open cases, ${p.label.toLowerCase()}`))
      : null
  }
  return (
    <Hero
      id="home-ops-sla"
      metric={SERVICES.resolutionSla}
      uses={sla?.uses ?? m.uses['services-backlog-by-age']}
      title="Resolution SLA met"
      subtitle="Cases resolved within target, and where every open case stands against its target"
      value={sla?.value == null ? '—' : fmt(sla.value, 'pct')}
      valueDrill={sla?.drill}
      valueLabel="Show the cases judged on the resolution SLA"
      label={`met, target ${pctWords(target)}`}
      line={
        privates
          ? `${plural(privates, 'employee relations case')} counted in the bar, never listed`
          : `Resolution SLA over cases resolved in the period`
      }
      parts={parts}
      unit="open cases"
      onSegment={(key) => drill(seg(key))}
      ariaLabel="Open cases by where they stand against their resolution target"
      data={parts}
      columns={[
        { key: 'label', label: 'Against target' },
        { key: 'count', label: 'Open cases', format: 'int', drill: (r) => seg(r.key) },
        { key: 'private', label: 'Employee relations (counted)', format: 'int' },
      ]}
      definitions={[D.resolutionSla, D.backlog]}
      note={`${plural(open, 'open case')} at the end of ${formatDate(m.asOf)}`}
      empty={m.hasCases ? null : 'Upload HR cases to see this.'}
    />
  )
}

/* ───────── backlog and SLA trend ───────── */

function Backlog({ m }: { m: ServicesModel }) {
  const ctx = useAnalytics()
  const s = m.scope
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const cell = (d: BacklogRow) =>
    drillWhen(s, d.records, () =>
      openDrill(s, d.records, `Open cases aged ${d.age}, ${d.status.toLowerCase()}`),
    )
  const ageRecords = (age: string) => m.backlog.filter((r) => r.age === age).flatMap((r) => r.records)
  const age = (a: string) =>
    drillWhen(s, ageRecords(a), () => openDrill(s, ageRecords(a), `Open cases aged ${a}`))
  return (
    <Figure
      id="home-ops-backlog"
      uses={m.uses['services-backlog-by-age']}
      metric={FIGURE_METRIC['services-backlog-by-age']}
      title="Open backlog by age"
      subtitle="Cases open at the as-of date, by days since they were opened and by status"
      data={m.backlog}
      columns={[
        { key: 'age', label: 'Age' },
        { key: 'status', label: 'Status' },
        { key: 'cases', label: 'Open cases', format: 'int', drill: cell },
      ]}
      definitions={[D.backlog]}
      note={`${plural(m.backlogTotal, 'open case')} · as of ${formatDate(m.asOf)}`}
      span={8}
      empty={m.backlogTotal ? null : 'No open cases at the as-of date.'}
    >
      <Columns
        data={m.backlog}
        x="age"
        y="cases"
        series="status"
        stack
        xOrder={AGE_BUCKETS}
        seriesOrder={BACKLOG_STATUSES}
        onSelect={(d) => drill(age(d.age))}
        onSelectSegment={(d) => drill(cell(d))}
        selectable={(d, segment) => !!(segment ? cell(d) : age(d.age))}
      />
    </Figure>
  )
}

function SlaTrend({ m }: { m: ServicesModel }) {
  const ctx = useAnalytics()
  const s = m.scope
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const target = m.settings.resolutionTarget
  const rows = m.slaMonths.filter((r) => r.opened > 0)
  const values = rows.flatMap((r) => (r.slaRate == null ? [] : [r.slaRate]))
  const low = Math.min(target, ...values)
  const floor = Math.max(0, Math.floor((low - 0.05) * 10) / 10)
  const month = (d: MonthSlaRow) =>
    d.slaRate == null
      ? null
      : () =>
          resolutionDrill(
            s,
            d.records,
            `Cases judged on resolution SLA, opened ${formatMonth(`${d.month}-01`)}`,
            `${formatMonth(`${d.month}-01`)} · ${s.scope}`,
          )
  return (
    <Figure
      id="home-ops-sla-trend"
      uses={m.uses['services-sla-by-month']}
      metric={FIGURE_METRIC['services-sla-by-month']}
      title="Resolution SLA by month"
      subtitle="Share of cases opened each month that were resolved within target"
      data={m.slaMonths}
      columns={[
        { key: 'month', label: 'Month' },
        { key: 'opened', label: 'Cases opened', format: 'int' },
        { key: 'slaRate', label: 'Resolved within target', format: 'pct', drill: month },
      ]}
      definitions={[D.resolutionSla, D.anonymity]}
      note={`Target ${pctWords(target)} · the latest month still has cases inside their target · as of ${formatDate(m.asOf)}`}
      span={4}
      empty={
        !m.caseCols.resolvedAt
          ? 'Upload HR cases with a resolved time to see this.'
          : values.length
            ? null
            : `Months under ${m.settings.minGroup} cases are hidden.`
      }
    >
      <Lines
        data={rows}
        x="month"
        y="slaRate"
        format="pct"
        ref={{ value: target, label: `Target ${pctWords(target)}` }}
        yDomain={[floor, 1]}
        xTicks="quarter"
        onSelect={(d) => drill(month(d))}
      />
    </Figure>
  )
}

/* ───────── my list ───────── */

type ListKey = 'cases' | 'tx' | 'returns'

function MyList({ m }: { m: ServicesModel }) {
  const [list, setList] = useState<ListKey>('cases')
  const s = m.scope
  const cases = openCaseRows({ cases: m.cases, asOf: m.asOf, small: m.small, smallScope: m.smallScope })
  const tx = m.small ? [] : txInFlight(m.tx, m.asOf)
  const returns = m.leave.upcomingShown ? returnsSoon(m.leave.upcoming) : []
  const actions = (
    <ListSwitch<ListKey>
      value={list}
      onChange={setList}
      options={[
        { value: 'cases', label: `Open cases (${fmt(cases.rows.length, 'int')})` },
        { value: 'tx', label: `Transactions in flight (${fmt(tx.length, 'int')})` },
        { value: 'returns', label: `Returns in 30 days (${fmt(returns.length, 'int')})` },
      ]}
    />
  )
  if (list === 'tx') {
    const one = (r: TxRow) => () =>
      txDrill(s, [r.fact], {
        title: `Transaction ${r.transactionId}`,
        subtitle: `As of ${formatDate(m.asOf)} · ${s.scope}`,
      })
    const columns: Column<TxRow>[] = [
      { key: 'transactionId', label: 'Transaction ID', drill: one },
      { key: 'type', label: 'Type' },
      { key: 'employee', label: 'Employee' },
      { key: 'location', label: 'Location' },
      { key: 'submitted', label: 'Submitted', format: 'date' },
      { key: 'effective', label: 'Effective', format: 'date' },
      { key: 'due', label: 'Due', format: 'date' },
      { key: 'dueState', label: 'Due state' },
      { key: 'daysLate', label: 'Days late', format: 'days' },
    ]
    return (
      <ListFigure<TxRow>
        metric={SERVICES.onTime}
        uses={m.uses['services-tx-on-time-by-type']}
        title="Transactions in flight"
        subtitle="HR transactions submitted and not completed by the as-of date, the most overdue first"
        rows={tx}
        columns={columns}
        note={`${plural(tx.length, 'transaction')} · as of ${formatDate(m.asOf)}`}
        actions={actions}
        rowTone={(r) =>
          r.dueState === 'Overdue' ? 'critical' : r.dueState === 'Due within 7 d' ? 'warning' : null
        }
        onRowClick={(r) => drill(one(r))}
        empty={
          m.small
            ? `Fewer than ${m.settings.minGroup} people in this scope, so transactions are not listed.`
            : 'No transactions in flight.'
        }
      />
    )
  }
  if (list === 'returns') {
    const one = (r: ReturnRow) => () =>
      leaveDrill(s, [r.ret.fact], {
        title: `Return from leave, ${r.employee}`,
        subtitle: `As of ${formatDate(m.asOf)} · ${s.scope}`,
        columns: ['expected', 'status'],
        status: new Map([[r.ret.fact.leaveId, r.ret.status]]),
      })
    const columns: Column<ReturnRow>[] = [
      { key: 'employee', label: 'Employee', drill: one },
      { key: 'department', label: 'Department' },
      { key: 'location', label: 'Location' },
      { key: 'expected', label: 'Planned return', format: 'date' },
      { key: 'daysAway', label: 'Days away', format: 'days' },
      { key: 'status', label: 'Systems ready (LV-03)' },
    ]
    return (
      <ListFigure<ReturnRow>
        metric={SERVICES.returnsSoon}
        uses={m.leave.uses.retention}
        title="Returns in 30 days"
        subtitle="People whose planned return from leave falls in the next 30 days, soonest first; the leave reason is never shown"
        rows={returns}
        columns={columns}
        note={`${plural(returns.length, 'planned return')} · as of ${formatDate(m.asOf)}`}
        actions={actions}
        rowTone={(r) => (r.status === 'Ready' ? null : r.ret.urgent ? 'critical' : 'warning')}
        onRowClick={(r) => drill(one(r))}
        empty={
          m.leave.upcomingShown
            ? 'No planned returns in the next 30 days.'
            : `Fewer than ${m.settings.minGroup} returns, so they are not listed.`
        }
      />
    )
  }
  const columns: Column<OpenCaseRow>[] = [
    { key: 'caseId', label: 'Case ID', drill: (r) => () => oneCaseDrill(s, r.fact) },
    { key: 'category', label: 'Category' },
    { key: 'processId', label: 'Atlas process' },
    { key: 'team', label: 'Team' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'priority', label: 'Priority' },
    { key: 'opened', label: 'Opened', format: 'date' },
    { key: 'ageDays', label: 'Age', format: 'days' },
    { key: 'sla', label: 'SLA state' },
    { key: 'channel', label: 'Channel' },
  ]
  return (
    <ListFigure<OpenCaseRow>
      metric={SERVICES.backlog}
      uses={m.uses['services-backlog-by-age']}
      title="Open cases"
      subtitle="Every case open at the end of the as-of day, oldest first, with where it stands against its target"
      rows={cases.rows}
      columns={columns}
      note={[cases.privateNote, `as of ${formatDate(m.asOf)}`].filter(Boolean).join(' · ')}
      actions={actions}
      rowTone={(r) => SLA_TONE[r.sla] ?? null}
      onRowClick={(r) => drill(() => oneCaseDrill(s, r.fact))}
      empty={
        m.small
          ? `Fewer than ${m.settings.minGroup} people in this scope, so cases are not listed.`
          : 'No open cases.'
      }
    />
  )
}

/* ───────── transactions and day one ───────── */

function TxByType({ m }: { m: ServicesModel }) {
  const ctx = useAnalytics()
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const target = m.settings.onTimeTarget
  const cell = onTimeCells<TypeRow>(m.scope, 'Transactions', (r) => r.type)
  return (
    <Figure
      id="home-ops-tx"
      uses={m.uses['services-tx-on-time-by-type']}
      metric={FIGURE_METRIC['services-tx-on-time-by-type']}
      title="On time by transaction type"
      subtitle={`Transactions due in the period completed by their due date, against the ${pctWords(target)} target`}
      data={m.types}
      columns={[
        { key: 'type', label: 'Transaction type' },
        { key: 'due', label: 'Due in period', format: 'int', drill: cell.all },
        { key: 'onTime', label: 'On time', format: 'int', drill: cell.onTime },
        { key: 'late', label: 'Completed late', format: 'int', drill: cell.completedLate },
        { key: 'open', label: 'Open past due', format: 'int', drill: cell.overdue },
        { key: 'rate', label: 'On time %', format: 'pct', drill: cell.all },
      ]}
      definitions={[D.onTime, D.anonymity]}
      note={`Target ${pctWords(target)} · as of ${formatDate(m.asOf)}`}
      span={6}
      empty={m.types.length ? null : 'No transactions were due in this period.'}
    >
      <BarList
        data={m.types}
        label="type"
        value="rate"
        format="pct"
        sort="none"
        domain={[0, 1]}
        ref={{ value: target, label: `Target ${pctWords(target)}` }}
        secondary={(d) => `${fmt(d.due, 'int')} due`}
        tone={(d) => rateTone(d.rate, target)}
        onSelect={(d) => drill(cell.all(d))}
      />
    </Figure>
  )
}

function DayOne() {
  const ctx = useAnalytics()
  const o = computeOnboarding(ctx)
  const u = o.upcoming
  const b = o.base
  const uses = union(UPCOMING, TASKS, TASK_OWNER)
  const open = (r: OwnerReadinessRow) =>
    r.open
      ? () =>
          tasksDrill(
            b,
            r.items.flatMap((x) => x.tasks),
            `Open tasks, ${r.owner}`,
            { uses },
          )
      : null
  return (
    <Figure
      id="home-ops-day-one"
      uses={uses}
      metric={ONBOARDING.readinessByOwner}
      title="Day-one readiness by owner"
      subtitle={`Share of each team's day-one tasks done or not needed, starts by ${formatDate(u.horizonEnd)}`}
      data={u.byOwner}
      columns={[
        { key: 'owner', label: 'Owner' },
        { key: 'tasks', label: 'Tasks', format: 'int' },
        { key: 'done', label: 'Done or not needed', format: 'int' },
        { key: 'open', label: 'Open', format: 'int', drill: open },
        { key: 'pastDue', label: 'Past due', format: 'int', drill: open },
        { key: 'share', label: 'Ready', format: 'pct' },
      ]}
      note={`Lowest first · as of ${formatDate(b.asOf)}`}
      span={6}
      empty={u.byOwner.length ? null : 'No day-one tasks for the starts in this window.'}
    >
      <BarList
        data={u.byOwner}
        label="owner"
        value="share"
        format="pct"
        domain={[0, 1]}
        sort="none"
        secondary={(d) => `${fmt(d.open, 'int')} open`}
        glyphTone={(d) => (d.pastDue ? 'warning' : 'default')}
        onSelect={(d) => drill(open(d))}
      />
    </Figure>
  )
}

/* ───────── page ───────── */

export function OpsHome() {
  const ctx = useAnalytics()
  const m = computeCached(ctx)
  const items = useHomeItems()
  const o = computeOnboarding(ctx).kpis.upcoming
  const c = complianceModel(ctx).kpis
  const kpis: Kpi[] = [
    ...tile(m.kpis, 'open-backlog', { view: 'services', tab: 'cases', label: 'HR ops, Cases' }),
    ...tile(m.kpis, 'tx-on-time', {
      view: 'services',
      tab: 'transactions',
      label: 'HR ops, HR transactions',
    }),
    finalPayKpi(m, ctx),
    ...tile(m.leave.kpis, 'leave-returns-soon', {
      view: 'services',
      tab: 'leave',
      label: 'HR ops, Leave & return',
    }),
    ...tile(o, 'day-minus-3', { view: 'onboarding', tab: 'upcoming', label: 'Onboarding, Upcoming starts' }),
    ...tile(c, 'compliance-i9', { view: 'compliance', tab: 'rtw', label: 'Compliance, Right to work' }),
  ]
  return (
    <>
      <Grid>
        <Sla m={m} />
        <KpiStrip id="home-ops-kpis" title="Key figures" kpis={kpis} span={8} />
        <Backlog m={m} />
        <SlaTrend m={m} />
      </Grid>
      <AttentionSection
        items={items}
        shown={HOME_SHOWN}
        dek="HR ops' queues: cases past target, transactions past due, returns from leave without systems ready, I-9s, reverifications, export licenses and day-one tasks."
      />
      <Section
        title="My list"
        dek="The open case queue, the transactions in flight and the returns from leave coming up."
      >
        <MyList m={m} />
      </Section>
      <Section
        title="Processing and day one"
        dek="Transactions on time by type, and how ready each team's day-one tasks are."
      >
        <TxByType m={m} />
        <DayOne />
      </Section>
    </>
  )
}

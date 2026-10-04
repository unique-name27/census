import { BarList, type Column, Figure, HBars, Heatmap, RangeBars } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import {
  type AgedCaseRow,
  type ArrivalRow,
  type CategoryRow,
  type ChannelRow,
  isRowPrivate,
  openedIn,
  type ReopenRow,
  type ResolveRow,
} from '../engine/cases'
import { RESOLUTION_SLA_TARGET } from '../engine/catalog'
import {
  caseDrill,
  csatDrill,
  drillWhen,
  escalateDrill,
  firstContactDrill,
  oneCaseDrill,
  openDrill,
  reopenDrill,
  resolutionDrill,
  resolutionOutcomeDrill,
  resolveTimeDrill,
  responseDrill,
} from '../engine/drills'
import type { CaseFact } from '../engine/facts'
import { duration, isOther, WEEKDAYS } from '../engine/util'
import {
  asOfNote,
  count,
  DEF,
  NeedData,
  NO_CASES,
  period,
  rateTone,
  SMALL_SCOPE,
  titled,
  useProcessHref,
} from './shared'

const CASE_DETAIL_COLUMNS = [
  { key: 'caseId', label: 'Case ID' },
  { key: 'category', label: 'Category' },
  { key: 'processId', label: 'Atlas process' },
  { key: 'team', label: 'Team' },
  { key: 'channel', label: 'Channel' },
  { key: 'status', label: 'Status' },
  { key: 'opened', label: 'Opened', format: 'date' as const },
  { key: 'resolved', label: 'Resolved', format: 'date' as const },
  { key: 'resolutionTarget', label: 'Target (hours)', format: 'int' as const },
  { key: 'resolutionHours', label: 'Hours to resolve', format: 'num1' as const },
  { key: 'sla', label: 'Resolution SLA' },
]

const WEEKDAY_NAMES: Record<string, string> = {
  Mon: 'Mondays',
  Tue: 'Tuesdays',
  Wed: 'Wednesdays',
  Thu: 'Thursdays',
  Fri: 'Fridays',
  Sat: 'Saturdays',
  Sun: 'Sundays',
}

/**
 * Case rows for a detail export: no requester or subcategory is ever included, and employee
 * relations cases are left out entirely (counts and timeliness only).
 */
const caseDetail = (rows: readonly CaseFact[]) => () =>
  rows
    .filter((f) => !isRowPrivate(f))
    .map((f) => ({
      ...f,
      sla: f.resolutionMet == null ? 'Not yet due' : f.resolutionMet ? 'Met' : 'Missed',
    }))

/** Real groups by a rate, lowest first (no rate last); the folded "Other (k)" always last. */
function lowestFirst<T>(rows: readonly T[], label: (r: T) => string, rate: (r: T) => number | null): T[] {
  const real = rows.filter((r) => !isOther(label(r)))
  real.sort((a, b) => (rate(a) ?? 2) - (rate(b) ?? 2))
  return [...real, ...rows.filter((r) => isOther(label(r)))]
}

export function CasesTab({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const processHref = useProcessHref()
  if (!m.hasCases) return <NeedData {...NO_CASES} />
  const s = m.scope
  const per = period(ctx)
  const asOf = formatDate(m.asOf)
  const opened = openedIn(m.cases, m.window)
  const categories = lowestFirst(
    m.categories,
    (r) => r.category,
    (r) => r.slaRate,
  )
  const hours = [...new Set(m.arrivals.map((r) => r.hour))]
  const days = WEEKDAYS.filter((d) => m.arrivals.some((r) => r.weekday === d))
  const overallCsat = m.summary.csat.mean
  const channelGap = (c: (typeof m.channels)[number]) => {
    const others = m.channels.filter((o) => o !== c && o.csat != null)
    const n = others.reduce((a, o) => a + o.responses, 0)
    if (c.csat == null || !n) return 0
    return others.reduce((a, o) => a + (o.csat as number) * o.responses, 0) / n - c.csat
  }
  const reopenLong = m.reopen.flatMap((r) => [
    { category: r.category, measure: 'Reopened', rate: r.reopenRate, row: r },
    { category: r.category, measure: 'Escalated', rate: r.escalateRate, row: r },
  ])
  const teams = m.teams.map((t) => {
    const d = duration(t.medianHours)
    return { ...t, median: d.value, medianFormat: d.format }
  })
  type TeamOut = (typeof teams)[number]

  /* Drill sources, shared by the charts and their table views. */
  const slaCategory = (d: CategoryRow) =>
    d.slaRate == null
      ? null
      : () => resolutionDrill(s, d.records, titled('Cases judged on resolution SLA', d.category, per))
  const responseCategory = (d: CategoryRow) =>
    d.responseRate == null
      ? null
      : () => responseDrill(s, d.records, titled('Cases judged on first response SLA', d.category, per))
  const resolveCategory = (d: ResolveRow) => () =>
    resolveTimeDrill(s, d.records, titled('Cases resolved', d.category, per))
  const arrivalCell = (d: ArrivalRow) =>
    d.share == null
      ? null
      : drillWhen(s, d.records, () =>
          caseDrill(s, d.records, {
            title: titled(
              `Cases opened on ${WEEKDAY_NAMES[d.weekday] ?? d.weekday}`,
              `${d.hour}:00 to ${d.hour}:59`,
              per,
            ),
          }),
        )
  const channelCsat = (d: ChannelRow) =>
    d.csat == null
      ? null
      : () => csatDrill(s, d.resolvedRecords, titled('Cases rated for satisfaction', d.channel, per))
  const reopened = (d: ReopenRow) =>
    d.reopenRate == null ? null : () => reopenDrill(s, d.records, titled('Reopened cases', d.category, per))
  const escalated = (d: ReopenRow) =>
    d.escalateRate == null
      ? null
      : () => escalateDrill(s, d.records, titled('Escalated cases', d.category, per))
  const categoryOpened = (d: ReopenRow) =>
    drillWhen(s, d.records, () =>
      caseDrill(s, d.records, {
        title: titled('Cases opened', d.category, per),
        flags: ['reopened', 'escalated'],
      }),
    )

  const teamColumns: Column<TeamOut>[] = [
    { key: 'team', label: 'Team' },
    {
      key: 'opened',
      label: 'Cases opened',
      format: 'int',
      drill: (r) =>
        drillWhen(s, r.openedRecords, () =>
          caseDrill(s, r.openedRecords, { title: titled('Cases opened', r.team, per) }),
        ),
    },
    {
      key: 'resolved',
      label: 'Resolved',
      format: 'int',
      drill: (r) =>
        drillWhen(s, r.resolvedRecords, () =>
          caseDrill(s, r.resolvedRecords, { title: titled('Cases resolved', r.team, per) }),
        ),
    },
    {
      key: 'open',
      label: 'Open now',
      format: 'int',
      drill: (r) =>
        drillWhen(s, r.openRecords, () =>
          openDrill(s, r.openRecords, titled('Open cases', r.team, `at ${asOf}`)),
        ),
    },
    {
      key: 'slaRate',
      label: 'Resolution SLA met',
      format: 'pct',
      drill: (r) =>
        r.slaRate == null
          ? null
          : () => resolutionDrill(s, r.openedRecords, titled('Cases judged on resolution SLA', r.team, per)),
    },
    {
      key: 'median',
      label: 'Median time to resolve',
      format: (r) => r.medianFormat,
      drill: (r) =>
        r.median == null
          ? null
          : () => resolveTimeDrill(s, r.resolvedRecords, titled('Cases resolved', r.team, per)),
    },
    {
      key: 'csat',
      label: 'Satisfaction',
      format: 'num1',
      drill: (r) =>
        r.csat == null
          ? null
          : () => csatDrill(s, r.resolvedRecords, titled('Cases rated for satisfaction', r.team, per)),
    },
    {
      key: 'firstContact',
      label: 'First-contact resolution',
      format: 'pct',
      drill: (r) =>
        r.firstContact == null
          ? null
          : () => firstContactDrill(s, r.resolvedRecords, titled('First-contact resolution', r.team, per)),
    },
  ]
  const slaColumns: Column<CategoryRow>[] = [
    { key: 'category', label: 'Category' },
    { key: 'processId', label: 'Atlas process', href: (r) => processHref(r.processId) },
    { key: 'slaN', label: 'Cases with an outcome', format: 'int', drill: slaCategory },
    {
      key: 'slaMet',
      label: 'Met target',
      format: 'int',
      drill: (r) =>
        r.slaMet
          ? () =>
              resolutionOutcomeDrill(
                s,
                r.records,
                true,
                titled('Cases that met the resolution SLA', r.category, per),
              )
          : null,
    },
    { key: 'slaRate', label: 'Resolution SLA met', format: 'pct', drill: slaCategory },
    { key: 'responseRate', label: 'First response SLA met', format: 'pct', drill: responseCategory },
  ]
  const resolveDrill = (r: ResolveRow) => resolveCategory(r)
  const resolveColumns: Column<ResolveRow>[] = [
    { key: 'category', label: 'Category' },
    { key: 'n', label: 'Cases resolved', format: 'int', drill: resolveDrill },
    { key: 'targetDays', label: 'Target (d)', format: 'num1' },
    { key: 'p10', label: '10th percentile (d)', format: 'num1', drill: resolveDrill },
    { key: 'q1', label: '25th percentile (d)', format: 'num1', drill: resolveDrill },
    { key: 'median', label: 'Median (d)', format: 'num1', drill: resolveDrill },
    { key: 'q3', label: '75th percentile (d)', format: 'num1', drill: resolveDrill },
    { key: 'p90', label: '90th percentile (d)', format: 'num1', drill: resolveDrill },
    { key: 'medianShare', label: 'Median, share of target', format: 'pct0', drill: resolveDrill },
    { key: 'p90Share', label: '90th percentile, share of target', format: 'pct0', drill: resolveDrill },
  ]
  const channelColumns: Column<ChannelRow>[] = [
    { key: 'channel', label: 'Channel' },
    {
      key: 'cases',
      label: 'Cases opened',
      format: 'int',
      drill: (r) =>
        drillWhen(s, r.records, () =>
          caseDrill(s, r.records, { title: titled('Cases opened', r.channel, per) }),
        ),
    },
    { key: 'responses', label: 'Responses', format: 'int', drill: channelCsat },
    { key: 'csat', label: 'Satisfaction', format: 'num2', drill: channelCsat },
    {
      key: 'slaRate',
      label: 'Resolution SLA met',
      format: 'pct',
      drill: (r) =>
        r.slaRate == null
          ? null
          : () => resolutionDrill(s, r.records, titled('Cases judged on resolution SLA', r.channel, per)),
    },
  ]
  const reopenColumns: Column<ReopenRow>[] = [
    { key: 'category', label: 'Category' },
    { key: 'opened', label: 'Cases opened', format: 'int', drill: categoryOpened },
    {
      key: 'resolved',
      label: 'Resolved',
      format: 'int',
      drill: (r) =>
        drillWhen(s, r.records, () =>
          caseDrill(
            s,
            r.records.filter((f) => f.resolved != null),
            {
              title: titled('Cases resolved', r.category, per),
              gate: r.records,
              flags: ['reopened', 'escalated'],
            },
          ),
        ),
    },
    { key: 'reopened', label: 'Reopened', format: 'int', drill: reopened },
    { key: 'reopenRate', label: 'Reopen rate', format: 'pct', drill: reopened },
    { key: 'escalated', label: 'Escalated', format: 'int', drill: escalated },
    { key: 'escalateRate', label: 'Escalation rate', format: 'pct', drill: escalated },
  ]
  const agedColumns: Column<AgedCaseRow>[] = [
    { key: 'caseId', label: 'Case ID', drill: (r) => (s.on ? () => oneCaseDrill(s, r.fact) : null) },
    { key: 'category', label: 'Category' },
    { key: 'processId', label: 'Atlas process', href: (r) => processHref(r.processId) },
    { key: 'status', label: 'Case status' },
    { key: 'team', label: 'Team' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'opened', label: 'Opened', format: 'date' },
    { key: 'ageDays', label: 'Age (d)', format: 'int' },
    { key: 'targetDays', label: 'Target (d)', format: 'num1' },
    { key: 'daysPastTarget', label: 'Days past target', format: 'int' },
  ]
  // Employee relations cases this old are given as a count only (and not at all in a small scope).
  const erAged = m.small ? 0 : m.agedPrivate.reduce((a, r) => a + r.cases, 0)
  const erNote = erAged ? `plus ${count(erAged, 'employee relations case')}, not listed` : null

  return (
    <>
      <Section
        title="Service levels by category"
        dek={`Which categories met their resolution target for cases opened in the ${per}, and how long cases took against each category's own target.`}
      >
        <Figure
          id="services-sla-by-category"
          span={6}
          title="Resolution SLA by category"
          subtitle={`Share of cases opened in the ${per} resolved within the category target, lowest first`}
          data={categories}
          columns={slaColumns}
          definitions={[
            DEF.resolutionSla,
            {
              term: 'Cases with an outcome',
              text: 'Cases resolved, plus open cases already past their target. Open cases still inside their target have no outcome yet.',
            },
            DEF.anonymity,
          ]}
          note={asOfNote(
            m.asOf,
            count(m.summary.resolution.n, 'case'),
            `target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}`,
          )}
          empty={m.caseCols.resolvedAt ? null : 'Upload HR cases with a resolved time to see this.'}
          detail={
            m.small ? undefined : { label: 'Cases', columns: CASE_DETAIL_COLUMNS, rows: caseDetail(opened) }
          }
        >
          <BarList
            data={categories}
            label="category"
            value="slaRate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            ref={{ value: RESOLUTION_SLA_TARGET, label: `Target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}` }}
            secondary={(d) => count(d.slaN, 'case')}
            tone={(d) => rateTone(d.slaRate, RESOLUTION_SLA_TARGET)}
            onSelect={(d) => drill(slaCategory(d))}
          />
        </Figure>
        <Figure
          id="services-time-to-resolve"
          span={6}
          title="Time to resolve against target"
          subtitle={`Time from opened to resolved as a share of each category's resolution target (100% = on target), cases resolved in the ${per}`}
          data={m.resolve}
          columns={resolveColumns}
          definitions={[
            DEF.timeToResolve,
            {
              term: 'Share of target',
              text: "Each case's time to resolve divided by its resolution target, so a 30-day employee relations case and a 2-day payroll case read on one axis. 100% is on target; past 100% missed it. The table view has the days.",
              formula: '(resolvedAt − openedAt) ÷ resolution target',
            },
            DEF.anonymity,
          ]}
          note={asOfNote(
            m.asOf,
            count(m.summary.medianHours.n, 'case resolved', 'cases resolved'),
            'bars: middle half, tick: median, line: 10th to 90th percentile',
          )}
          empty={
            m.resolve.length ? null : 'No category had cases resolved for 5 or more people in this period.'
          }
        >
          <RangeBars
            data={m.resolve}
            y="category"
            min="p10Share"
            max="p90Share"
            q1="q1Share"
            q3="q3Share"
            mid="medianShare"
            markers={[{ key: 'targetShare', label: 'Target (100%)' }]}
            format="pct0"
            labels={{ min: '10th percentile', max: '90th percentile', mid: 'Median', range: 'Middle 50%' }}
            onSelect={(d) => drill(resolveCategory(d))}
          />
        </Figure>
      </Section>

      <Section
        title="When and how cases arrive"
        dek={`Cases opened in the ${per} by weekday and hour, and how requesters rated each channel.`}
      >
        <Figure
          id="services-arrivals"
          span={8}
          title="When cases arrive"
          subtitle={`Cases opened in the ${per} by weekday and hour of the opened time`}
          data={m.arrivals}
          columns={[
            { key: 'weekday', label: 'Weekday' },
            { key: 'hour', label: 'Hour' },
            { key: 'cases', label: 'Cases opened', format: 'int', drill: arrivalCell },
            { key: 'share', label: 'Share of cases', format: 'pct', drill: arrivalCell },
          ]}
          definitions={[
            {
              term: 'Hour',
              text: 'The hour of the opened timestamp as the help desk recorded it (local time of the system). Hours with no cases at either end are trimmed.',
            },
          ]}
          note={asOfNote(m.asOf, count(m.summary.opened, 'case'))}
          empty={
            !m.arrivals.length
              ? 'Upload HR cases with an opened time (date and hour) to see this.'
              : m.arrivals.every((r) => r.share == null)
                ? 'Fewer than 5 people are behind these cases, so their arrival times are hidden to protect anonymity.'
                : null
          }
        >
          <Heatmap
            data={m.arrivals}
            x="hour"
            y="weekday"
            value="cases"
            format="int"
            xOrder={hours}
            yOrder={days}
            rowHeight={32}
            onSelect={(d) => drill(arrivalCell(d))}
          />
        </Figure>
        <Figure
          id="services-csat-by-channel"
          span={4}
          title="Satisfaction by channel"
          subtitle={`Mean score (1 to 5) on cases resolved in the ${per}`}
          data={m.channels}
          columns={channelColumns}
          definitions={[DEF.csat, DEF.anonymity]}
          note={asOfNote(m.asOf, count(m.summary.csat.n, 'response'))}
          empty={m.caseCols.csat ? null : 'Upload HR cases with a satisfaction column to see this.'}
        >
          <BarList
            data={m.channels}
            label="channel"
            value="csat"
            format="num1"
            domain={[1, 5]}
            ref={
              overallCsat == null
                ? undefined
                : { value: overallCsat, label: `All ${fmt(overallCsat, 'num1')}` }
            }
            secondary={(d) => count(d.responses, 'response')}
            tone={(d) => (channelGap(d) >= 0.5 ? 'warning' : 'default')}
            onSelect={(d) => drill(channelCsat(d))}
          />
        </Figure>
      </Section>

      <Section
        title="Quality and workload"
        dek="Where first fixes did not hold, where cases went up a tier, and how the work spread across the teams."
      >
        <Figure
          id="services-reopen-escalate"
          span={12}
          title="Reopened and escalated by category"
          subtitle={`Cases opened in the ${per}: reopened after resolution, and escalated to a higher tier`}
          data={m.reopen}
          columns={reopenColumns}
          definitions={[DEF.reopen, DEF.escalation, DEF.anonymity]}
          note={asOfNote(m.asOf, count(m.summary.opened, 'case'))}
          empty={
            m.caseCols.reopened || m.caseCols.escalated
              ? null
              : 'Upload HR cases with reopened and escalated columns to see this.'
          }
        >
          <HBars
            data={reopenLong}
            y="category"
            x="rate"
            series="measure"
            seriesOrder={['Reopened', 'Escalated']}
            yOrder={m.reopen.map((r) => r.category)}
            format="pct"
            onSelect={(d) => drill(categoryOpened(d.row))}
            onSelectSegment={(d) => drill(d.measure === 'Reopened' ? reopened(d.row) : escalated(d.row))}
          />
        </Figure>
        <Figure
          id="services-team-workload"
          span={12}
          title="Team workload"
          subtitle={`Cases by owning team, ${per}; open count at the as-of date`}
          data={teams}
          columns={teamColumns}
          definitions={[DEF.resolutionSla, DEF.timeToResolve, DEF.csat, DEF.firstContact, DEF.anonymity]}
          note={asOfNote(
            m.asOf,
            count(m.summary.opened, 'case'),
            'median time in hours below 48 h, days above',
          )}
          tableOnly
          table={{ defaultSort: { key: 'opened', dir: 'desc' } }}
        />
      </Section>

      <Section
        title="Aging cases"
        dek="Every case still open more than 14 days after it was opened, oldest first. Past 30 days is marked critical. Employee relations cases are counted, never listed."
      >
        <Figure
          id="services-aged-cases"
          span={12}
          title="Cases open longer than 14 days"
          subtitle="Open at the as-of date, with the days past the category resolution target"
          data={m.aged}
          columns={agedColumns}
          definitions={[
            DEF.backlog,
            {
              term: 'Employee relations',
              text: 'Employee relations cases are reported as counts and timeliness only, so they never appear row by row here or in detail exports.',
            },
          ]}
          note={asOfNote(m.asOf, count(m.aged.length, 'case'), erNote)}
          tableOnly
          table={{
            rowTone: (r) => (r.ageDays > 30 ? 'critical' : 'warning'),
            search: 'Search cases',
            maxRows: 20,
          }}
          empty={
            m.small
              ? SMALL_SCOPE
              : m.aged.length
                ? null
                : erAged
                  ? `No case outside employee relations has been open longer than 14 days (${count(erAged, 'employee relations case')} ${erAged === 1 ? 'has' : 'have'}, not listed).`
                  : 'No case has been open longer than 14 days.'
          }
        />
      </Section>
    </>
  )
}

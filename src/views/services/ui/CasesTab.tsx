import { BarList, type Column, Figure, HBars, Heatmap, RangeBars } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import { isRowPrivate, openedIn } from '../engine/cases'
import { RESOLUTION_SLA_TARGET } from '../engine/catalog'
import type { CaseFact } from '../engine/facts'
import { duration, isOther, WEEKDAYS } from '../engine/util'
import { asOfNote, count, DEF, NeedData, NO_CASES, period, rateTone, SMALL_SCOPE } from './shared'

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
  if (!m.hasCases) return <NeedData {...NO_CASES} />
  const per = period(ctx)
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
    { category: r.category, measure: 'Reopened', rate: r.reopenRate },
    { category: r.category, measure: 'Escalated', rate: r.escalateRate },
  ])
  const teams = m.teams.map((t) => {
    const d = duration(t.medianHours)
    return { ...t, median: d.value, medianFormat: d.format }
  })
  type TeamOut = (typeof teams)[number]
  const teamColumns: Column<TeamOut>[] = [
    { key: 'team', label: 'Team' },
    { key: 'opened', label: 'Cases opened', format: 'int' },
    { key: 'resolved', label: 'Resolved', format: 'int' },
    { key: 'open', label: 'Open now', format: 'int' },
    { key: 'slaRate', label: 'Resolution SLA met', format: 'pct' },
    { key: 'median', label: 'Median time to resolve', format: (r) => r.medianFormat },
    { key: 'csat', label: 'Satisfaction', format: 'num1' },
    { key: 'firstContact', label: 'First-contact resolution', format: 'pct' },
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
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'processId', label: 'Atlas process' },
            { key: 'slaN', label: 'Cases with an outcome', format: 'int' },
            { key: 'slaMet', label: 'Met target', format: 'int' },
            { key: 'slaRate', label: 'Resolution SLA met', format: 'pct' },
            { key: 'responseRate', label: 'First response SLA met', format: 'pct' },
          ]}
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
          />
        </Figure>
        <Figure
          id="services-time-to-resolve"
          span={6}
          title="Time to resolve against target"
          subtitle={`Time from opened to resolved as a share of each category's resolution target (100% = on target), cases resolved in the ${per}`}
          data={m.resolve}
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'n', label: 'Cases resolved', format: 'int' },
            { key: 'targetDays', label: 'Target (d)', format: 'num1' },
            { key: 'p10', label: '10th percentile (d)', format: 'num1' },
            { key: 'q1', label: '25th percentile (d)', format: 'num1' },
            { key: 'median', label: 'Median (d)', format: 'num1' },
            { key: 'q3', label: '75th percentile (d)', format: 'num1' },
            { key: 'p90', label: '90th percentile (d)', format: 'num1' },
            { key: 'medianShare', label: 'Median, share of target', format: 'pct0' },
            { key: 'p90Share', label: '90th percentile, share of target', format: 'pct0' },
          ]}
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
            { key: 'cases', label: 'Cases opened', format: 'int' },
            { key: 'share', label: 'Share of cases', format: 'pct' },
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
          />
        </Figure>
        <Figure
          id="services-csat-by-channel"
          span={4}
          title="Satisfaction by channel"
          subtitle={`Mean score (1 to 5) on cases resolved in the ${per}`}
          data={m.channels}
          columns={[
            { key: 'channel', label: 'Channel' },
            { key: 'cases', label: 'Cases opened', format: 'int' },
            { key: 'responses', label: 'Responses', format: 'int' },
            { key: 'csat', label: 'Satisfaction', format: 'num2' },
            { key: 'slaRate', label: 'Resolution SLA met', format: 'pct' },
          ]}
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
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'opened', label: 'Cases opened', format: 'int' },
            { key: 'resolved', label: 'Resolved', format: 'int' },
            { key: 'reopened', label: 'Reopened', format: 'int' },
            { key: 'reopenRate', label: 'Reopen rate', format: 'pct' },
            { key: 'escalated', label: 'Escalated', format: 'int' },
            { key: 'escalateRate', label: 'Escalation rate', format: 'pct' },
          ]}
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
          columns={[
            { key: 'caseId', label: 'Case ID' },
            { key: 'category', label: 'Category' },
            { key: 'processId', label: 'Atlas process' },
            { key: 'status', label: 'Case status' },
            { key: 'team', label: 'Team' },
            { key: 'assignee', label: 'Assignee' },
            { key: 'opened', label: 'Opened', format: 'date' },
            { key: 'ageDays', label: 'Age (d)', format: 'int' },
            { key: 'targetDays', label: 'Target (d)', format: 'num1' },
            { key: 'daysPastTarget', label: 'Days past target', format: 'int' },
          ]}
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

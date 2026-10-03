import { BarList, Figure, HBars, Heatmap, RangeBars } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import { openedIn } from '../engine/cases'
import { RESOLUTION_SLA_TARGET } from '../engine/catalog'
import type { CaseFact } from '../engine/facts'
import { WEEKDAYS } from '../engine/util'
import { asOfNote, count, DEF, NeedData, NO_CASES, period, rateTone } from './shared'

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

/** Case rows for a detail export; no requester or subcategory is ever included. */
const caseDetail = (rows: readonly CaseFact[]) => () =>
  rows.map((f) => ({
    ...f,
    sla: f.resolutionMet == null ? 'Not yet due' : f.resolutionMet ? 'Met' : 'Missed',
  }))

export function CasesTab({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  if (!m.hasCases) return <NeedData {...NO_CASES} />
  const per = period(ctx)
  const opened = openedIn(m.cases, m.window)
  const categories = m.categories.slice().sort((a, b) => (a.slaRate ?? 2) - (b.slaRate ?? 2))
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
  const teams = m.teams.map((t) => ({ ...t, medianDays: t.medianHours == null ? null : t.medianHours / 24 }))

  return (
    <>
      <Section
        title="Service levels by category"
        dek={`Which categories met their resolution target for cases opened in the ${per}, and how long cases took from opened to resolved.`}
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
            { key: 'slaN', label: 'Cases judged', format: 'int' },
            { key: 'slaMet', label: 'Met target', format: 'int' },
            { key: 'slaRate', label: 'Resolution SLA met', format: 'pct' },
            { key: 'responseRate', label: 'First response SLA met', format: 'pct' },
          ]}
          definitions={[DEF.resolutionSla, DEF.anonymity]}
          note={asOfNote(
            m.asOf,
            count(m.summary.resolution.n, 'case'),
            `target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}`,
          )}
          empty={m.caseCols.resolvedAt ? null : 'Upload HR cases with a resolved time to see this.'}
          detail={{ label: 'Cases', columns: CASE_DETAIL_COLUMNS, rows: caseDetail(opened) }}
        >
          <BarList
            data={categories}
            label="category"
            value="slaRate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            ref={{ value: RESOLUTION_SLA_TARGET, label: `Target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}` }}
            secondary={(d) => `n = ${fmt(d.slaN, 'int')}`}
            tone={(d) => rateTone(d.slaRate, RESOLUTION_SLA_TARGET)}
          />
        </Figure>
        <Figure
          id="services-time-to-resolve"
          span={6}
          title="Time to resolve by category"
          subtitle={`Days from opened to resolved, cases resolved in the ${per}: middle half, median and 10th to 90th percentile`}
          data={m.resolve}
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'n', label: 'Cases resolved', format: 'int' },
            { key: 'p10', label: '10th percentile (d)', format: 'num1' },
            { key: 'q1', label: '25th percentile (d)', format: 'num1' },
            { key: 'median', label: 'Median (d)', format: 'num1' },
            { key: 'q3', label: '75th percentile (d)', format: 'num1' },
            { key: 'p90', label: '90th percentile (d)', format: 'num1' },
            { key: 'targetDays', label: 'Target (d)', format: 'num1' },
          ]}
          definitions={[DEF.timeToResolve, DEF.anonymity]}
          note={asOfNote(
            m.asOf,
            count(m.summary.medianHours.n, 'case resolved', 'cases resolved'),
            'categories under 5 cases left out',
          )}
          empty={m.resolve.length ? null : 'No cases were resolved in this period.'}
        >
          <RangeBars
            data={m.resolve}
            y="category"
            min="p10"
            max="p90"
            q1="q1"
            q3="q3"
            mid="median"
            markers={[{ key: 'targetDays', label: 'Target' }]}
            format="days"
            labels={{ min: '10th percentile', max: '90th percentile', mid: 'Median' }}
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
            m.arrivals.length ? null : 'Upload HR cases with an opened time (date and hour) to see this.'
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
          definitions={[DEF.csat]}
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
            secondary={(d) => `n = ${fmt(d.responses, 'int')}`}
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
          span={6}
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
          span={6}
          title="Team workload"
          subtitle={`Cases by owning team, ${per}; open count at the as-of date`}
          data={teams}
          columns={[
            { key: 'team', label: 'Team' },
            { key: 'opened', label: 'Opened', format: 'int' },
            { key: 'resolved', label: 'Resolved', format: 'int' },
            { key: 'open', label: 'Open now', format: 'int' },
            { key: 'slaRate', label: 'SLA met', format: 'pct' },
            { key: 'medianDays', label: 'Median to resolve', format: 'days' },
            { key: 'csat', label: 'CSAT', format: 'num1' },
            { key: 'firstContact', label: 'First-contact', format: 'pct' },
          ]}
          definitions={[DEF.resolutionSla, DEF.timeToResolve, DEF.csat, DEF.firstContact, DEF.anonymity]}
          note={asOfNote(m.asOf, count(m.summary.opened, 'case'))}
          tableOnly
          table={{ defaultSort: { key: 'opened', dir: 'desc' } }}
        />
      </Section>

      <Section
        title="Aging cases"
        dek="Every case still open more than 14 days after it was opened, oldest first. Past 30 days is marked critical."
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
          definitions={[DEF.backlog]}
          note={asOfNote(m.asOf, count(m.aged.length, 'case'))}
          tableOnly
          table={{
            rowTone: (r) => (r.ageDays > 30 ? 'critical' : 'warning'),
            search: 'Search cases',
            maxRows: 20,
          }}
          empty={m.aged.length ? null : 'No case has been open longer than 14 days.'}
        />
      </Section>
    </>
  )
}

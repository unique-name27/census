/**
 * Overview: the headline numbers, the readout, the live pipeline, hiring volume and offer
 * acceptance, and where requisitions sit. Every number opens the records behind it.
 */
import { useMemo } from 'react'
import { BarList, type ChartNote, type Column, Columns, Figure, Lines, shortNote } from '@/charts'
import { Button, cx, Grid, goTo, KpiStrip, Readout, Section, spanClass } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  hiresMonthDrill,
  lackingKpiDrill,
  monthEndReqsDrill,
  nextStateDrill,
  openReqsDrill,
  pipelineCellDrill,
  pipelineStageDrill,
  quarterOffersDrill,
} from '../engine/drills'
import { FIGURE_USES } from '../engine/lineage'
import { FIGURE_METRICS } from '../engine/metricLinks'
import { STATE_NAME } from '../engine/nextStep'
import type { PipelineCell } from '../engine/pipeline'
import { type MonthEndReqRow, type OpenByDeptRow, OTHER_SERIES, type TtfRow } from '../engine/reqs'
import type { QuarterAcceptance } from '../engine/sources'
import { NEXT_STATES } from '../engine/types'
import { RM } from '../metrics'
import { overviewKpis } from '../plan'
import { useRecruitingUi } from '../state'
import {
  asOfNote,
  defOf,
  drillIf,
  NEED_CANDIDATES,
  NEED_REQS,
  NoRecruitingData,
  TABLET_FULL,
  ttfSpan,
  windowText,
} from './common'
import { openReqsByMonthEndDrill, openReqsDepartmentDrill, ttfDrill } from './drill'
import { useRecruiting } from './hooks'
import { PipelineBars } from './PipelineBars'

export function OverviewTab() {
  const m = useRecruiting()
  const ctx = useAnalytics()
  // The engine's tiles, then Hires vs plan: Onboarding's plan number, opening its Hiring plan tab.
  const kpis = useMemo(() => overviewKpis(ctx), [ctx])
  const b = m.base
  const openQueue = useRecruitingUi((s) => s.openQueue)
  if (!b.apps.length && !b.reqs.length) return <NoRecruitingData />
  const { minGroup, oldReqDays } = b.settings

  const pipelineRows = m.pipeline.flatMap((s) =>
    NEXT_STATES.flatMap((state) => {
      const c = s.cells.find((x) => x.state === state)
      return c
        ? [
            {
              stage: c.stage,
              state: c.label,
              candidates: c.candidates,
              lacking: c.lacking,
              medianDaysWaiting: c.medianDaysWaiting,
              cell: c,
            },
          ]
        : []
    }),
  )
  type PipelineRow = (typeof pipelineRows)[number]
  const cellDrill = (c: PipelineCell) => () => pipelineCellDrill(b, c)
  const pipelineColumns: Column<PipelineRow>[] = [
    { key: 'stage', label: 'Stage' },
    { key: 'state', label: 'Next step state' },
    { key: 'candidates', label: 'Candidates', format: 'int', drill: (r) => cellDrill(r.cell) },
    {
      key: 'lacking',
      label: 'Lacking a next step',
      format: 'int',
      drill: (r) =>
        drillIf(r.lacking, () =>
          pipelineCellDrill(b, {
            ...r.cell,
            label: `${r.cell.label}, lacking a next step`,
            items: r.cell.items.filter((x) => x.tier),
          }),
        ),
    },
    {
      key: 'medianDaysWaiting',
      label: 'Median days waiting',
      format: 'days',
      drill: (r) => cellDrill(r.cell),
    },
  ]
  const accRows = m.acceptanceByQuarter.map((q) => ({
    quarterEnd: q.end,
    quarter: q.label,
    rate: q.rate,
    hired: q.hired,
    declined: q.declined,
    q,
  }))
  type AccRow = (typeof accRows)[number]
  // Hidden quarters and levels (under the anonymity minimum) carry no records, so they never drill.
  const quarterDrill = (q: QuarterAcceptance, only?: 'Hired' | 'Declined') =>
    drillIf(only ? q.apps.some((a) => a.outcome === only) : q.apps.length, () =>
      quarterOffersDrill(b, q, only),
    )
  // A department's open reqs and a level's filled reqs carry their group as the drill's filter
  // ("Filter to Design Verification"); month and quarter points carry their period.
  const deptDrill = openReqsDepartmentDrill(b)
  const levelDrill = ttfDrill(b, 'level')
  // An open req older than the old req setting (Open req age) marks its department amber.
  const ageTone = (d: { oldest: number }) => (d.oldest > oldReqDays ? 'warning' : 'default')
  const hiresTotal = m.hiresByMonth.reduce((s, r) => s + r.hires, 0)
  // Annotations: the chart says what the readout says. Offer acceptance takes its note from the
  // finding that cites it; the monthly offers mark their busiest month when it is the latest.
  const accFinding = m.findings.find((f) => f.id === 'rec-offer-acceptance')
  const accText = accFinding ? shortNote(accFinding.title, 'Offer acceptance') : null
  const lastQuarter = accRows.at(-1)
  const accNotes: ChartNote[] =
    accText && lastQuarter?.rate != null ? [{ at: lastQuarter.quarterEnd, text: accText }] : []
  const peak = m.hiresByMonth.reduce<(typeof m.hiresByMonth)[number] | null>(
    (best, r) => (!best || r.hires > best.hires ? r : best),
    null,
  )
  const hiresNotes: ChartNote[] =
    peak && peak === m.hiresByMonth.at(-1) && m.hiresByMonth.length >= 12 && peak.hires > 0
      ? [{ at: peak.month, text: `${fmt(peak.hires, 'int')}, the most in ${m.hiresByMonth.length} months` }]
      : []
  // Open reqs at each month end, stacked by business unit (by department inside one unit). A
  // segment opens that group's reqs open on the date, with the group as the filter; a click
  // elsewhere in a column opens every req open on the date.
  const monthEnd = m.openReqsMonthEnd
  const dimWord = monthEnd.dim === 'department' ? 'Department' : 'Business unit'
  const monthEndDrill = openReqsByMonthEndDrill(b, monthEnd.dim)
  const columnDrill = (r: Pick<MonthEndReqRow, 'month'>) => {
    const t = monthEnd.totals.find((x) => x.month === r.month)
    return drillIf(t?.reqs, () => (t ? monthEndReqsDrill(b, t.date, t.list) : null))
  }
  const openPeak = monthEnd.totals.reduce<(typeof monthEnd.totals)[number] | null>(
    (best, t) => (!best || t.reqs > best.reqs ? t : best),
    null,
  )
  const openNotes: ChartNote[] =
    openPeak && openPeak.reqs > 0 && openPeak !== monthEnd.totals[0]
      ? [{ at: openPeak.month, text: `${fmt(openPeak.reqs, 'int')} open on ${formatDate(openPeak.date)}` }]
      : []

  return (
    <Grid>
      <KpiStrip kpis={kpis} />
      {/* Full width on tablets (the right column is too), and sticky on desktop so a readout
          shorter than the right column doesn't leave a hole under it. */}
      {/* Phones: the lead figure comes first, then the readout, then the sections (max-md:order). */}
      <Readout
        findings={m.findings}
        span={4}
        className={cx(TABLET_FULL, 'lg:sticky lg:top-4 max-md:order-1')}
      />
      {/* The right column stacks the lead figure and two short sections, so it runs as long as the readout. */}
      <div className={cx(spanClass(8), 'min-w-0 max-md:contents')}>
        <Grid>
          <Figure
            id="recruiting-pipeline-today"
            uses={FIGURE_USES['recruiting-pipeline-today']}
            metric={FIGURE_METRICS['recruiting-pipeline-today']}
            title="Pipeline today"
            subtitle={`Active candidates by stage and next step on ${formatDate(b.asOf)}`}
            data={pipelineRows}
            columns={pipelineColumns}
            span={12}
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  openQueue()
                  goTo('recruiting', 'pipeline')
                }}
              >
                Action queue
              </Button>
            }
            empty={
              b.apps.length
                ? b.actives.length
                  ? null
                  : 'No active candidates on the as-of date.'
                : NEED_CANDIDATES
            }
            definitions={[
              defOf(b, RM.activeCandidates),
              {
                term: 'No step booked',
                text: 'Nothing is on the calendar and no interview is waiting on a decision: the application needs review, an interview needs scheduling, or the candidate is at the offer stage with no offer sent yet. A state, not an alarm.',
              },
              { term: 'Needs decision', text: 'The interview happened and the stage has not moved since.' },
              { term: 'Offer extended', text: 'The offer is out and the candidate has not answered.' },
              {
                term: 'Scheduled',
                text: 'An interview or call is booked after the as-of date. In motion.',
              },
              defOf(b, RM.lackingNextStep, {
                term: 'Lacks a next step',
                extra: 'The chart marks these candidates with the diamond.',
              }),
            ]}
            note={`${plural(b.actives.length, 'active candidate')} · ${asOfNote(b.asOf)}`}
          >
            <PipelineBars
              stages={m.pipeline}
              cellDrill={cellDrill}
              stageDrill={(s, lackingOnly) => () => pipelineStageDrill(b, s, lackingOnly)}
              stateDrill={(state) => () => nextStateDrill(b, state, STATE_NAME[state])}
              lackingDrill={() => lackingKpiDrill(b)}
            />
          </Figure>
        </Grid>

        <Section
          title="Hiring"
          className="max-md:order-2"
          dek={`How many offers were accepted each month, and whether candidates are saying yes as often as before. Two years to ${formatDate(b.window.end)}.`}
        >
          <Figure
            id="recruiting-hires-by-month"
            uses={FIGURE_USES['recruiting-hires-by-month']}
            metric={FIGURE_METRICS['recruiting-hires-by-month']}
            title="Offers accepted by month"
            subtitle="Candidates hired, by the month the offer was accepted, last 24 months"
            data={m.hiresByMonth}
            columns={[
              { key: 'month', label: 'Month' },
              {
                key: 'hires',
                label: 'Offers accepted',
                format: 'int',
                drill: (r) => drillIf(r.hires, () => hiresMonthDrill(b, r)),
              },
            ]}
            span={7}
            empty={b.apps.length ? null : NEED_CANDIDATES}
            definitions={[
              defOf(b, RM.offersAccepted, { extra: 'Each month counts the offers accepted in that month.' }),
            ]}
            note={`${plural(hiresTotal, 'offer accepted', 'offers accepted')} in 24 months · ${asOfNote(b.asOf)}`}
          >
            <Columns
              data={m.hiresByMonth}
              x="month"
              y="hires"
              xType="month"
              format="int"
              labels={false}
              notes={hiresNotes}
              onSelect={(d) => drill(() => hiresMonthDrill(b, d))}
              ariaLabel="Offers accepted by month"
            />
          </Figure>
          <Figure
            id="recruiting-offer-acceptance-quarter"
            uses={FIGURE_USES['recruiting-offer-acceptance-quarter']}
            metric={FIGURE_METRICS['recruiting-offer-acceptance-quarter']}
            title="Offer acceptance by quarter"
            subtitle="Offers accepted ÷ offers resolved, last 8 quarters"
            data={accRows}
            columns={
              [
                { key: 'quarter', label: 'Quarter' },
                { key: 'rate', label: 'Offer acceptance', format: 'pct', drill: (r) => quarterDrill(r.q) },
                { key: 'hired', label: 'Accepted', format: 'int', drill: (r) => quarterDrill(r.q, 'Hired') },
                {
                  key: 'declined',
                  label: 'Declined',
                  format: 'int',
                  drill: (r) => quarterDrill(r.q, 'Declined'),
                },
              ] satisfies Column<AccRow>[]
            }
            span={5}
            className={TABLET_FULL}
            empty={
              !b.apps.length
                ? NEED_CANDIDATES
                : b.cov.hasDeclined
                  ? null
                  : 'No declined offers in the data, so acceptance can’t be measured.'
            }
            definitions={[
              defOf(b, RM.offerAcceptance, {
                settings: false,
                extra: `Each quarter counts the offers resolved in it. Quarters with fewer than ${minGroup} resolved offers show no rate.`,
              }),
            ]}
            note={asOfNote(b.asOf)}
          >
            <Lines
              data={accRows}
              x="quarterEnd"
              y="rate"
              format="pct0"
              xTicks="quarter"
              notes={accNotes}
              onSelect={(d) => drill(quarterDrill(d.q))}
              ariaLabel="Offer acceptance by quarter"
            />
          </Figure>
        </Section>

        <Section
          title="Requisitions"
          className="max-md:order-2"
          align="start"
          dek={`Open reqs on ${formatDate(b.asOf)}, and how long reqs filled ${windowText(b.window)} took.`}
        >
          <Figure
            id="recruiting-open-reqs-month-end"
            uses={FIGURE_USES['recruiting-open-reqs-month-end']}
            metric={FIGURE_METRICS['recruiting-open-reqs-month-end']}
            title={`Open reqs at month end by ${dimWord.toLowerCase()}`}
            subtitle={`Requisitions open on each of the last 24 month ends, ending ${formatDate(b.asOf)}`}
            data={monthEnd.rows}
            columns={
              [
                { key: 'date', label: 'Month end', format: 'date' },
                { key: 'group', label: dimWord },
                { key: 'reqs', label: 'Open reqs', format: 'int', drill: monthEndDrill },
              ] satisfies Column<MonthEndReqRow>[]
            }
            span={12}
            empty={
              b.reqs.length
                ? monthEnd.rows.length
                  ? null
                  : 'No req was open on any of the last 24 month ends.'
                : NEED_REQS
            }
            definitions={[
              defOf(b, RM.openReqs, {
                term: 'Open reqs at month end',
                extra: monthEnd.groups.includes(OTHER_SERIES)
                  ? 'Each column counts the reqs open on that month end; the last column is the as-of date. The smallest groups are combined as Other.'
                  : 'Each column counts the reqs open on that month end; the last column is the as-of date.',
              }),
            ]}
            note={`Reqs on hold not counted · ${asOfNote(b.asOf)}`}
          >
            <Columns
              data={monthEnd.rows}
              x="month"
              y="reqs"
              series="group"
              seriesOrder={monthEnd.groups}
              stack
              xType="month"
              format="int"
              labels={false}
              notes={openNotes}
              selectable={(d) =>
                d.reqs > 0 || (monthEnd.totals.find((x) => x.month === d.month)?.reqs ?? 0) > 0
              }
              onSelect={(d) => drill(columnDrill(d))}
              onSelectSegment={(d) => drill(monthEndDrill(d))}
              ariaLabel={`Open reqs at month end by ${dimWord.toLowerCase()}`}
            />
          </Figure>
          <Figure
            id="recruiting-open-reqs-department"
            uses={FIGURE_USES['recruiting-open-reqs-department']}
            metric={FIGURE_METRICS['recruiting-open-reqs-department']}
            title="Open reqs by department"
            subtitle={`Open requisitions on ${formatDate(b.asOf)}, marked by the age of the oldest`}
            data={m.openByDepartment}
            columns={
              [
                { key: 'department', label: 'Department' },
                { key: 'open', label: 'Open reqs', format: 'int', drill: deptDrill },
                { key: 'oldest', label: 'Oldest (days open)', format: 'days', drill: deptDrill },
                { key: 'medianAge', label: 'Median days open', format: 'days', drill: deptDrill },
              ] satisfies Column<OpenByDeptRow>[]
            }
            span={6}
            empty={
              b.reqs.length
                ? m.openByDepartment.length
                  ? null
                  : 'No open reqs on the as-of date.'
                : NEED_REQS
            }
            definitions={[
              defOf(b, RM.openReqs, { term: 'Open req' }),
              {
                term: 'Amber',
                text: `The department's oldest open req has been open more than ${plural(oldReqDays, 'day')} (the old req setting of Open req age).`,
              },
            ]}
            note={`${plural(b.req.open.length, 'open req')} · ${asOfNote(b.asOf)}`}
          >
            <BarList
              data={m.openByDepartment}
              label="department"
              value="open"
              format="int"
              top={12}
              glyphTone={ageTone}
              secondary={(d) => `oldest ${fmt(d.oldest, 'days')}`}
              onSelect={(d) => drill(deptDrill(d))}
              onSelectOther={(rows) =>
                drill(() =>
                  openReqsDrill(
                    b,
                    rows.flatMap((r) => r.reqs),
                    `Open reqs, ${plural(rows.length, 'other department')}`,
                  ),
                )
              }
              ariaLabel="Open reqs by department"
            />
          </Figure>
          <Figure
            id="recruiting-time-to-fill-level"
            uses={FIGURE_USES['recruiting-time-to-fill-level']}
            metric={FIGURE_METRICS['recruiting-time-to-fill-level']}
            title="Time to fill by level"
            subtitle={`Median days from ${ttfSpan(b)}, reqs filled ${windowText(b.window)}`}
            data={m.ttfByLevel}
            columns={
              [
                { key: 'group', label: 'Level' },
                { key: 'days', label: 'Median days to fill', format: 'days', drill: levelDrill },
                { key: 'reqs', label: 'Reqs filled', format: 'int', drill: levelDrill },
              ] satisfies Column<TtfRow>[]
            }
            span={6}
            empty={
              !b.reqs.length
                ? NEED_REQS
                : !b.cov.hasFilledDate
                  ? 'Filled date is missing from Requisitions.'
                  : m.ttfByLevel.length
                    ? null
                    : 'No reqs filled in this period.'
            }
            definitions={[
              defOf(b, RM.timeToFill, {
                term: 'Time to fill',
                extra: `Levels with fewer than ${minGroup} filled reqs show no median.`,
              }),
            ]}
            note={`${plural(b.filled.length, 'req')} filled · company median ${fmt(m.companyTtf, 'days')} · ${asOfNote(b.asOf)}`}
          >
            <BarList
              data={m.ttfByLevel}
              label="group"
              value="days"
              format="days"
              sort="none"
              secondary={(d) => `${d.reqs} filled`}
              ref={
                m.companyTtf != null
                  ? { value: m.companyTtf, label: `Company ${fmt(m.companyTtf, 'days')}` }
                  : undefined
              }
              nullNote={`Fewer than ${minGroup} reqs filled`}
              onSelect={(d) => drill(levelDrill(d))}
              ariaLabel="Time to fill by level"
            />
          </Figure>
        </Section>
      </div>
    </Grid>
  )
}

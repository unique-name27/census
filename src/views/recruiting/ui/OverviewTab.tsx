/**
 * Overview: the headline numbers, the readout, the live pipeline, hiring volume and offer
 * acceptance, and where requisitions sit. Every number opens the records behind it.
 */
import { BarList, type Column, Columns, Figure, Lines } from '@/charts'
import { Button, cx, Grid, goTo, KpiStrip, Readout, Section, spanClass } from '@/components'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  hiresMonthDrill,
  lackingKpiDrill,
  nextStateDrill,
  openReqsDrill,
  pipelineCellDrill,
  pipelineStageDrill,
  quarterOffersDrill,
  ttfGroupDrill,
} from '../engine/drills'
import { FIGURE_USES } from '../engine/lineage'
import { FIGURE_METRICS } from '../engine/metricLinks'
import { STATE_NAME } from '../engine/nextStep'
import type { PipelineCell } from '../engine/pipeline'
import type { OpenByDeptRow, TtfRow } from '../engine/reqs'
import type { QuarterAcceptance } from '../engine/sources'
import { NEXT_STATES } from '../engine/types'
import { RM } from '../metrics'
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
import { useRecruiting } from './hooks'
import { PipelineBars } from './PipelineBars'

export function OverviewTab() {
  const m = useRecruiting()
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
  const deptDrill = (d: OpenByDeptRow) => () => openReqsDrill(b, d.reqs, `Open reqs, ${d.department}`)
  const levelDrill = (d: TtfRow) => drillIf(d.filled.length, () => ttfGroupDrill(b, d))
  // An open req older than the old req setting (Open req age) marks its department amber.
  const ageTone = (d: { oldest: number }) => (d.oldest > oldReqDays ? 'warning' : 'default')
  const hiresTotal = m.hiresByMonth.reduce((s, r) => s + r.hires, 0)

  return (
    <Grid>
      <KpiStrip kpis={m.kpis} />
      {/* Full width on tablets (the right column is too), and sticky on desktop so a readout
          shorter than the right column doesn't leave a hole under it. */}
      <Readout findings={m.findings} span={4} className={cx(TABLET_FULL, 'lg:sticky lg:top-4')} />
      {/* The right column stacks the lead figure and two short sections, so it runs as long as the readout. */}
      <div className={cx(spanClass(8), 'min-w-0')}>
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
            note={`${plural(b.actives.length, 'active candidate')} · click a segment or a count to see the candidates · ${asOfNote(b.asOf)}`}
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
              onSelect={(d) => drill(quarterDrill(d.q))}
              ariaLabel="Offer acceptance by quarter"
            />
          </Figure>
        </Section>

        <Section
          title="Requisitions"
          dek={`Open reqs on ${formatDate(b.asOf)}, and how long reqs filled ${windowText(b.window)} took.`}
        >
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
              tone={ageTone}
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

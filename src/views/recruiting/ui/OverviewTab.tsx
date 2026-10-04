/**
 * Overview: the headline numbers, the readout, the live pipeline, hiring volume and offer
 * acceptance, and where requisitions sit.
 */
import { BarList, Columns, Figure, Lines } from '@/charts'
import { cx, Grid, goTo, KpiStrip, Readout, Section, spanClass } from '@/components'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { NEXT_STATES } from '../engine/types'
import { useRecruitingUi } from '../state'
import { asOfNote, NEED_CANDIDATES, NEED_REQS, NoRecruitingData, TABLET_FULL, windowText } from './common'
import { useRecruiting } from './hooks'
import { PipelineBars } from './PipelineBars'

/** An open req older than this marks its department amber. */
const OLD_REQ_DAYS = 120

export function OverviewTab() {
  const m = useRecruiting()
  const b = m.base
  const openQueue = useRecruitingUi((s) => s.openQueue)
  if (!b.apps.length && !b.reqs.length) return <NoRecruitingData />

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
            },
          ]
        : []
    }),
  )
  const accRows = m.acceptanceByQuarter.map((q) => ({
    quarterEnd: q.end,
    quarter: q.label,
    rate: q.rate,
    hired: q.hired,
    declined: q.declined,
  }))
  const ageTone = (d: { oldest: number }) => (d.oldest > OLD_REQ_DAYS ? 'warning' : 'default')
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
            title="Pipeline today"
            subtitle={`Active candidates by stage and next step on ${formatDate(b.asOf)}`}
            data={pipelineRows}
            columns={[
              { key: 'stage', label: 'Stage' },
              { key: 'state', label: 'Next step state' },
              { key: 'candidates', label: 'Candidates', format: 'int' },
              { key: 'lacking', label: 'Lacking a next step', format: 'int' },
              { key: 'medianDaysWaiting', label: 'Median days waiting', format: 'days' },
            ]}
            span={12}
            empty={
              b.apps.length
                ? b.actives.length
                  ? null
                  : 'No active candidates on the as-of date.'
                : NEED_CANDIDATES
            }
            definitions={[
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
              {
                term: 'Lacks a next step',
                text: 'The alarm (the diamond): no step booked for more than 1.5× the usual days for the stage, a decision pending more than 2 days after the interview, or an offer out more than 5 days. These candidates make up the action queue.',
              },
            ]}
            note={`${plural(b.actives.length, 'active candidate')} · click a segment to open the ones that lack a next step in the action queue · ${asOfNote(b.asOf)}`}
          >
            <PipelineBars
              stages={m.pipeline}
              onOpen={(stage, state) => {
                openQueue(stage, state)
                goTo('recruiting', 'pipeline')
              }}
            />
          </Figure>
        </Grid>

        <Section
          title="Hiring"
          dek={`How many offers were accepted each month, and whether candidates are saying yes as often as before. Two years to ${formatDate(b.window.end)}.`}
        >
          <Figure
            id="recruiting-hires-by-month"
            title="Hires by month"
            subtitle="Offers accepted per month, last 24 months"
            data={m.hiresByMonth}
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'hires', label: 'Hires', format: 'int' },
            ]}
            span={7}
            empty={b.apps.length ? null : NEED_CANDIDATES}
            definitions={[
              {
                term: 'Hire',
                text: 'A candidate with status Hired, counted in the month the offer was accepted.',
              },
            ]}
            note={`${plural(hiresTotal, 'hire')} in 24 months · ${asOfNote(b.asOf)}`}
          >
            <Columns
              data={m.hiresByMonth}
              x="month"
              y="hires"
              xType="month"
              format="int"
              labels={false}
              ariaLabel="Hires by month"
            />
          </Figure>
          <Figure
            id="recruiting-offer-acceptance-quarter"
            title="Offer acceptance by quarter"
            subtitle="Offers accepted ÷ offers resolved, last 8 quarters"
            data={accRows}
            columns={[
              { key: 'quarter', label: 'Quarter' },
              { key: 'rate', label: 'Offer acceptance', format: 'pct' },
              { key: 'hired', label: 'Accepted', format: 'int' },
              { key: 'declined', label: 'Declined', format: 'int' },
            ]}
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
              {
                term: 'Offer acceptance',
                text: 'Offers accepted ÷ offers accepted or declined, by the date each offer was resolved. Quarters with fewer than 5 resolved offers show no rate.',
                formula: 'hired ÷ (hired + declined)',
              },
            ]}
            note={asOfNote(b.asOf)}
          >
            <Lines
              data={accRows}
              x="quarterEnd"
              y="rate"
              format="pct0"
              xTicks="quarter"
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
            title="Open reqs by department"
            subtitle={`Open requisitions on ${formatDate(b.asOf)}, marked by the age of the oldest`}
            data={m.openByDepartment}
            columns={[
              { key: 'department', label: 'Department' },
              { key: 'open', label: 'Open reqs', format: 'int' },
              { key: 'oldest', label: 'Oldest (days open)', format: 'days' },
              { key: 'medianAge', label: 'Median days open', format: 'days' },
            ]}
            span={6}
            empty={
              b.reqs.length
                ? m.openByDepartment.length
                  ? null
                  : 'No open reqs on the as-of date.'
                : NEED_REQS
            }
            definitions={[
              {
                term: 'Open req',
                text: 'Open on the as-of date: opened by then and not yet filled, closed or cancelled. Reqs on hold are not counted.',
              },
              {
                term: 'Amber',
                text: `The department's oldest open req has been open more than ${OLD_REQ_DAYS} days.`,
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
              ariaLabel="Open reqs by department"
            />
          </Figure>
          <Figure
            id="recruiting-time-to-fill-level"
            title="Time to fill by level"
            subtitle={`Median days from opened to offer accepted, reqs filled ${windowText(b.window)}`}
            data={m.ttfByLevel}
            columns={[
              { key: 'group', label: 'Level' },
              { key: 'days', label: 'Median days to fill', format: 'days' },
              { key: 'reqs', label: 'Reqs filled', format: 'int' },
            ]}
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
              {
                term: 'Time to fill',
                text: 'Days from the date the req opened to the date its offer was accepted. Levels with fewer than 5 filled reqs show no median.',
                formula: 'filled date − opened date',
              },
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
              nullNote="Fewer than 5 reqs filled"
              ariaLabel="Time to fill by level"
            />
          </Figure>
        </Section>
      </div>
    </Grid>
  )
}

/**
 * Requisitions: every open req with its pipeline and health, how old the open reqs are, how long
 * reqs take to fill by department, monthly volume, and recruiter load.
 */
import { BarList, Columns, Figure, Histogram } from '@/charts'
import { Section } from '@/components'
import { daysBetween, formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { median } from '@/lib/stats'
import { EMPTY_FUNNEL_DAYS, type RecruiterRow } from '../engine/reqs'
import { asOfNote, NEED_REQS, NoRecruitingData, TABLET_FULL, windowText } from './common'
import { useRecruiting } from './hooks'

/** Open req age bins: equal 15-day steps so bar heights compare. */
const AGE_STEP = 15

export function RequisitionsTab() {
  const m = useRecruiting()
  const b = m.base
  if (!b.apps.length && !b.reqs.length) return <NoRecruitingData />

  const rows = b.req.rows
  const empties = b.req.emptyFunnel.length
  const lackingReqs = rows.filter((r) => r.severity === 'warning').length
  const onHoldAges = b.req.onHold.map((r) => Math.max(0, daysBetween(r.openedDate, b.asOf)))
  const maxAge = Math.max(0, ...m.openAges)
  const edges = Array.from(
    { length: Math.max(2, Math.ceil((maxAge + 1) / AGE_STEP) + 1) },
    (_, i) => i * AGE_STEP,
  )
  const medianAge = median(m.openAges)
  const flagged = m.recruiters.filter((r) => r.flagged).length

  return (
    <>
      <Section
        title="Open requisitions"
        dek={`Every open req on ${formatDate(b.asOf)} with its active candidates by stage. Reqs that need attention come first.`}
      >
        <Figure
          id="recruiting-open-requisitions"
          title="Open requisitions"
          subtitle={`Status Open on ${formatDate(b.asOf)}, with active candidates per stage and health`}
          data={rows}
          columns={[
            { key: 'reqId', label: 'Req', width: 12 },
            { key: 'title', label: 'Job title' },
            { key: 'health', label: 'Health' },
            { key: 'daysOpen', label: 'Days open', format: 'int' },
            { key: 'priority', label: 'Priority' },
            { key: 'department', label: 'Department' },
            { key: 'location', label: 'Location' },
            { key: 'level', label: 'Level' },
            { key: 'hiringManager', label: 'Hiring manager' },
            { key: 'recruiter', label: 'Recruiter' },
            { key: 'applied', label: 'Applied', format: 'int' },
            { key: 'screen', label: 'Screen', format: 'int' },
            { key: 'hiringManagerStage', label: 'HM', format: 'int' },
            { key: 'onsite', label: 'Onsite', format: 'int' },
            { key: 'offer', label: 'Offer', format: 'int' },
          ]}
          tableOnly
          span={12}
          table={{ rowTone: (r) => r.severity, search: 'Search reqs, titles or people', maxRows: 15 }}
          empty={b.reqs.length ? (rows.length ? null : 'No open reqs on the as-of date.') : NEED_REQS}
          definitions={[
            {
              term: 'Empty funnel',
              text: `Open more than ${EMPTY_FUNNEL_DAYS} days and no candidate has ever reached the hiring manager stage.`,
            },
            {
              term: 'Lack a next step',
              text: 'Active candidates on the req with no timely next step (see the Pipeline tab).',
            },
            { term: 'Stage columns', text: 'Active candidates waiting at each stage today.' },
          ]}
          note={`${plural(rows.length, 'open req')} · ${fmt(empties, 'int')} with an empty funnel · ${fmt(lackingReqs, 'int')} with candidates lacking a next step · ${fmt(b.req.onHold.length, 'int')} on hold not shown · ${asOfNote(b.asOf)}`}
        />
      </Section>

      <Section
        title="Age and volume"
        dek="How long today’s open reqs have been open, and how many reqs opened and filled each month."
      >
        <Figure
          id="recruiting-open-req-age"
          title="Open req age"
          subtitle={`Days since each open req opened, ${formatDate(b.asOf)}`}
          data={rows.map((r) => ({
            reqId: r.reqId,
            title: r.title,
            department: r.department,
            daysOpen: r.daysOpen,
          }))}
          columns={[
            { key: 'reqId', label: 'Req', width: 12 },
            { key: 'title', label: 'Job title' },
            { key: 'department', label: 'Department' },
            { key: 'daysOpen', label: 'Days open', format: 'int' },
          ]}
          span={5}
          className={TABLET_FULL}
          empty={b.reqs.length ? (rows.length ? null : 'No open reqs on the as-of date.') : NEED_REQS}
          definitions={[
            {
              term: 'Open req age',
              text: 'As-of date minus the date the req opened, for reqs with status Open.',
            },
            { term: 'On hold', text: 'Reqs on hold are left out and summarized in the note.' },
          ]}
          note={`${plural(rows.length, 'open req')} · median ${fmt(medianAge, 'days')}${onHoldAges.length ? ` · ${plural(onHoldAges.length, 'req')} on hold, median ${fmt(median(onHoldAges), 'days')} open` : ''}`}
        >
          <Histogram
            values={m.openAges}
            thresholds={edges}
            format="days"
            unit="reqs"
            refs={medianAge != null ? [{ value: medianAge, label: `Median ${fmt(medianAge, 'days')}` }] : []}
            ariaLabel="Open req age"
          />
        </Figure>
        <Figure
          id="recruiting-reqs-opened-filled"
          title="Reqs opened and filled by month"
          subtitle={`Requisitions opened and filled per month, 12 months to ${formatDate(b.window.end)}`}
          data={m.openedFilled}
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'series', label: 'Measure' },
            { key: 'reqs', label: 'Reqs', format: 'int' },
          ]}
          span={7}
          empty={b.reqs.length ? null : NEED_REQS}
          definitions={[
            { term: 'Opened', text: 'Reqs by the month they opened.' },
            {
              term: 'Filled',
              text: 'Reqs by the month their (last) offer was accepted. Cancelled reqs are not counted.',
            },
          ]}
          note={asOfNote(b.asOf)}
        >
          <Columns
            data={m.openedFilled}
            x="month"
            y="reqs"
            series="series"
            seriesOrder={['Opened', 'Filled']}
            xType="month"
            format="int"
            ariaLabel="Reqs opened and filled by month"
          />
        </Figure>
      </Section>

      <Section
        title="Time to fill and recruiter load"
        dek={`How long reqs filled ${windowText(b.window)} took by department, and how the open work spreads across recruiters.`}
      >
        <Figure
          id="recruiting-time-to-fill-department"
          title="Time to fill by department"
          subtitle={`Median days from opened to offer accepted, reqs filled ${windowText(b.window)}`}
          data={m.ttfByDepartment}
          columns={[
            { key: 'group', label: 'Department' },
            { key: 'days', label: 'Median days to fill', format: 'days' },
            { key: 'reqs', label: 'Reqs filled', format: 'int' },
          ]}
          span={6}
          empty={
            !b.reqs.length
              ? NEED_REQS
              : !b.cov.hasFilledDate
                ? 'Filled date is missing from Requisitions.'
                : m.ttfByDepartment.length
                  ? null
                  : 'No reqs filled in this period.'
          }
          definitions={[
            {
              term: 'Time to fill',
              text: 'Days from the date the req opened to the date its offer was accepted. Departments with fewer than 5 filled reqs show no median.',
              formula: 'filled date − opened date',
            },
          ]}
          note={`${plural(b.filled.length, 'req')} filled · median ${fmt(m.ttf, 'days')} · ${asOfNote(b.asOf)}`}
        >
          <BarList
            data={m.ttfByDepartment}
            label="group"
            value="days"
            format="days"
            secondary={(d) => `${d.reqs} filled`}
            ref={m.ttf != null ? { value: m.ttf, label: `All ${fmt(m.ttf, 'days')}` } : undefined}
            tone={(d) => (d.days != null && m.ttf != null && d.days >= 1.5 * m.ttf ? 'warning' : 'default')}
            nullNote="Fewer than 5 reqs filled"
            ariaLabel="Time to fill by department"
          />
        </Figure>
        <Figure
          id="recruiting-recruiter-load"
          title="Recruiter load"
          subtitle={`Open reqs and active candidates on ${formatDate(b.asOf)}, hires ${windowText(b.window)}`}
          data={m.recruiters}
          columns={[
            { key: 'recruiter', label: 'Recruiter' },
            { key: 'openReqs', label: 'Open reqs', format: 'int' },
            { key: 'active', label: 'Active candidates', format: 'int' },
            { key: 'hires', label: 'Hires', format: 'int' },
            { key: 'medianWait', label: 'Median days waiting', format: 'days' },
            { key: 'lacking', label: 'Lacking a next step', format: 'int' },
          ]}
          tableOnly
          span={6}
          table={{ rowTone: (r: RecruiterRow) => (r.flagged ? 'warning' : null), maxRows: 12 }}
          empty={
            b.reqs.length || b.apps.length
              ? m.recruiters.length
                ? null
                : 'No recruiters in this scope.'
              : NEED_REQS
          }
          definitions={[
            {
              term: 'Median days waiting',
              text: 'Median days in the current stage across the recruiter’s active candidates.',
            },
            {
              term: 'Flag',
              text: `Median wait more than 1.5× the team median (${fmt(m.teamMedianWait, 'days')}).`,
            },
          ]}
          note={`${plural(m.recruiters.length, 'recruiter')} · ${fmt(flagged, 'int')} flagged · ${asOfNote(b.asOf)}`}
        />
      </Section>
    </>
  )
}

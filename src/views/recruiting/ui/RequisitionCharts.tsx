/**
 * Two Requisitions figures from the design refresh (docs/CHARTS.md, Recruiting):
 *
 *  - Open reqs by age and candidates past the screen: one dot per open req, days open against
 *    active candidates at the hiring manager, onsite or offer stage, colored by those same two
 *    numbers: red in the risky corner (older than the empty-funnel age, nobody past the screen
 *    now), which holds every empty funnel. A dot opens its req; the table's counts open the
 *    candidates. A req is not a group, so nothing offers "Filter to".
 *  - Median time to fill by quarter: all reqs and two level bands over 8 quarters against the
 *    target. A point opens the reqs filled that quarter, with the quarter as the period and, for a
 *    band, its levels ("Filter to L5 and above").
 */
import { type Column, Figure, Legend, Lines, Scatter, toneColor, useChartTheme } from '@/charts'
import { useChartHeight } from '@/components/useNarrow'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { pastScreenDrill, reqActiveDrill, reqRowDrill } from '../engine/drills'
import { FIGURE_USES } from '../engine/lineage'
import { FIGURE_METRICS } from '../engine/metricLinks'
import { ALL_REQS, type ReqAgeDot, reqAgeDots, TTF_BANDS, type TtfQuarterRow } from '../engine/reqs'
import { RM } from '../metrics'
import { asOfNote, defOf, drillIf, NEED_REQS, ttfSpan } from './common'
import { ttfQuarterGroupDrill } from './drill'
import type { useRecruiting } from './hooks'

type Model = ReturnType<typeof useRecruiting>

/** Open reqs by age against active candidates past the screen. */
export function ReqAgeScatter({ m, span }: { m: Model; span: 7 | 12 }) {
  const b = m.base
  const theme = useChartTheme()
  const height = useChartHeight('lead')
  const emptyDays = b.settings.emptyFunnelDays
  const dots = reqAgeDots(b.req.rows, emptyDays)
  const corner = dots.filter((d) => d.corner).length
  // The four oldest reqs in the corner are named on the chart; the table lists every one.
  const named = new Set(
    dots
      .filter((d) => d.corner)
      .sort((a, b) => b.daysOpen - a.daysOpen)
      .slice(0, 4)
      .map((d) => d.reqId),
  )
  const empties = dots.filter((d) => d.health === 'Empty funnel').length
  const one = (d: ReqAgeDot) => () => reqRowDrill(b, d.row, 'req')
  const columns: Column<ReqAgeDot>[] = [
    { key: 'reqId', label: 'Req', width: 12, drill: one },
    { key: 'title', label: 'Job title' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'level', label: 'Level' },
    { key: 'priority', label: 'Priority' },
    { key: 'daysOpen', label: 'Days open', format: 'int', drill: one },
    {
      key: 'pastScreen',
      label: 'Past the screen',
      format: 'int',
      drill: (d) => drillIf(d.pastScreen, () => pastScreenDrill(b, d.row)),
    },
    {
      key: 'active',
      label: 'Active',
      format: 'int',
      drill: (d) => drillIf(d.active, () => reqActiveDrill(b, d.row)),
    },
    { key: 'health', label: 'Health' },
  ]
  return (
    <Figure
      id="recruiting-req-age-vs-pipeline"
      uses={FIGURE_USES['recruiting-req-age-vs-pipeline']}
      metric={FIGURE_METRICS['recruiting-req-age-vs-pipeline']}
      title="Open reqs by age and candidates past the screen"
      subtitle={`Each open req on ${formatDate(b.asOf)}: days open against active candidates at the hiring manager, onsite or offer stage`}
      data={dots}
      columns={columns}
      span={span}
      table={{ rowTone: (d) => (d.tone === 'default' ? null : d.tone), maxRows: 15 }}
      empty={b.reqs.length ? (dots.length ? null : 'No open reqs on the as-of date.') : NEED_REQS}
      emptyHeight={height}
      definitions={[
        defOf(b, RM.emptyFunnel),
        defOf(b, RM.reqAge, { settings: false }),
        {
          term: 'Past the screen',
          text: 'Active candidates waiting at the hiring manager, onsite or offer stage on the as-of date. Candidates who reached those stages and then left are not counted, so a req can sit at 0 without being an empty funnel.',
        },
        {
          term: 'Color',
          text: `Color follows the two numbers plotted. Red is a req open more than ${fmt(emptyDays, 'days')} with nobody past the screen now (the four oldest are named on the chart): every empty funnel, where nobody ever reached the hiring manager, and reqs whose later candidates have left. Amber is a req with candidates who lack a next step. The table view gives each req’s health in words.`,
        },
      ]}
      note={`${plural(dots.length, 'open req')} · ${fmt(corner, 'int')} open over ${fmt(emptyDays, 'days')} with nobody past the screen, ${fmt(empties, 'int')} of them an empty funnel · ${asOfNote(b.asOf)}`}
    >
      <Legend
        className="mb-2"
        spec={{
          kind: 'swatch',
          items: [
            {
              label: `Over ${fmt(emptyDays, 'days')}, nobody past the screen`,
              color: toneColor(theme, 'critical'),
              shape: 'dot',
            },
            { label: 'Lacks a next step', color: toneColor(theme, 'warning'), shape: 'dot' },
            { label: 'Other open reqs', color: toneColor(theme, 'default'), shape: 'dot' },
          ],
        }}
      />
      <Scatter
        data={dots}
        x="daysOpen"
        y="pastScreen"
        tone={(d) => d.tone}
        label="label"
        labelFilter={(d) => named.has(d.reqId)}
        labelCount={4}
        xFormat="days"
        yFormat="int"
        xLabel="Days open"
        yLabel="Past the screen"
        refX={{ value: emptyDays, label: `Empty funnel age ${fmt(emptyDays, 'days')}` }}
        height={height}
        onSelect={(d) => drill(one(d))}
        ariaLabel="Open reqs by age and candidates past the screen"
      />
    </Figure>
  )
}

/** Median time to fill by quarter, all reqs and by level band, against the target. */
export function TtfByQuarter({ m, span }: { m: Model; span: 7 | 12 }) {
  const b = m.base
  const rows = m.ttfByQuarter
  const target = b.metrics.target(RM.timeToFill)
  const { minGroup } = b.settings
  const pointDrill = ttfQuarterGroupDrill(b)
  const last = rows.filter((r) => r.series === ALL_REQS).at(-1)
  const columns: Column<TtfQuarterRow>[] = [
    { key: 'quarter', label: 'Quarter' },
    { key: 'series', label: 'Reqs' },
    { key: 'days', label: 'Median days to fill', format: 'days', drill: pointDrill },
    { key: 'reqs', label: 'Reqs filled', format: 'int', drill: pointDrill },
  ]
  return (
    <Figure
      id="recruiting-time-to-fill-quarter"
      uses={FIGURE_USES['recruiting-time-to-fill-quarter']}
      metric={FIGURE_METRICS['recruiting-time-to-fill-quarter']}
      title="Median time to fill by quarter"
      subtitle={`Median days from ${ttfSpan(b)}, by the quarter the req was filled, last 8 quarters`}
      data={rows}
      columns={columns}
      span={span}
      empty={
        !b.reqs.length
          ? NEED_REQS
          : !b.cov.hasFilledDate
            ? 'Filled date is missing from Requisitions.'
            : rows.some((r) => r.days != null)
              ? null
              : 'No quarter has enough filled reqs to show a median.'
      }
      definitions={[
        defOf(b, RM.timeToFill, {
          term: 'Time to fill',
          extra: `A quarter with fewer than ${minGroup} filled reqs in a line shows no median, so the line has a gap.`,
        }),
        ...TTF_BANDS.map((band) => ({ term: band.name, text: `Reqs at ${band.levels.join(', ')}.` })),
      ]}
      note={`${last ? `${plural(last.reqs, 'req')} filled in ${last.quarter} · ` : ''}${asOfNote(b.asOf)}`}
    >
      <Lines
        data={rows}
        x="quarterEnd"
        y="days"
        series="series"
        seriesOrder={[ALL_REQS, ...TTF_BANDS.map((band) => band.name)]}
        format="days"
        xTicks="quarter"
        endLabels
        zero
        ref={
          target
            ? {
                value: target.value,
                label: `Target ${target.comparator === '<=' ? 'at most ' : ''}${fmt(target.value, 'days')}`,
              }
            : undefined
        }
        onSelect={(d) => drill(pointDrill(d))}
        ariaLabel="Median time to fill by quarter"
      />
    </Figure>
  )
}

import { BarList, Columns, Figure } from '@/charts'
import { Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import { addMonths, formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import { otherLabel } from '../engine/base'
import { type HighShareRow, RATING_ORDER } from '../engine/performance'
import { FIGURE_METRIC, highRangeText, highRatingText, TALENT_METRIC as M } from '../engine/settings'
import { RatingByReviewer, RatingChange } from './ChartFigures'
import { CycleLines } from './CycleLines'
import {
  calibrationColumns,
  cycleColumns,
  exitByRatingColumns,
  highShareColumns,
  mixColumns,
  ratingOf,
} from './columns'
import { Dumbbell } from './Dumbbell'
import { defsFor, TERM } from './defs'
import { RatingMix } from './RatingMix'

/**
 * The chart keeps the first `top` groups and folds the rest (with any small groups the engine
 * already folded) into one "Other (k)" row: the combined share of high performers, not an average
 * of shares. The table and exports keep every group. `rest` is what the chart's own "Other" row
 * combines; it shows its numbers only at the anonymity minimum (`min`) or more.
 */
function topWithOther(
  rows: readonly HighShareRow[],
  top: number,
  min: number,
): { rows: HighShareRow[]; other: HighShareRow | null; rest: HighShareRow[] } {
  if (rows.length <= top + 1) return { rows: [...rows], other: null, rest: [] }
  const rest = rows.slice(top)
  const rated = rest.reduce((s, r) => s + r.rated, 0)
  const high = rest.reduce((s, r) => s + (r.high ?? 0), 0)
  const groups = rest.reduce((s, r) => s + (r.groups ?? 1), 0)
  const other: HighShareRow = {
    group: otherLabel(groups),
    rated,
    high: rated >= min ? high : null,
    share: rated >= min ? high / rated : null,
    other: true,
    groups,
  }
  return { rows: [...rows.slice(0, top), other], other, rest }
}

export function PerformanceTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const perf = m.performance
  const s = m.settings
  const rule = s.findings
  const hi = highRatingText(s.highRating)
  const range = highRangeText(s.highRating)
  const guideRef = { value: s.highGuideline, label: `Guideline ${fmt(s.highGuideline, 'pct0')}` }
  const cycle = perf.cycle?.cycle ?? 'the latest cycle'
  const noReviews = !m.has.reviews ? 'Upload Reviews to see this.' : null
  const ratedNote = `${plural(perf.rated, 'person', 'people')} rated in ${cycle}${perf.ratedLeft ? `, including ${fmt(perf.ratedLeft)} who ${perf.ratedLeft === 1 ? 'has' : 'have'} left since` : ''} · as of ${asOf}`
  const tone = (d: HighShareRow) =>
    d.other
      ? ('deemph' as const)
      : d.share != null && d.share - s.highGuideline > rule.inflationPts && d.rated >= rule.inflationMinRated
        ? ('warning' as const)
        : ('default' as const)
  const calRows = perf.calibration.map((c) => ({ label: c.businessUnit, a: c.proposed, b: c.final, n: c.n }))
  const departments = topWithOther(perf.byDepartment, 14, s.minGroup)
  // The share of high performers opens the people rated high behind it.
  const highOf = (dim: 'department' | 'level', d: HighShareRow) =>
    dim === 'department' && d.other && d.group === departments.other?.group
      ? m.drill.highShare(dim, d, 'high', departments.rest)
      : m.drill.highShare(dim, d, 'high')
  const exitCycle = perf.exitCycle
  // A steady 2.5-4 scale (widened when needed) so small moves in an average don't look dramatic.
  const means = perf.cycles.map((c) => c.mean).filter((v): v is number => v != null)
  const meanDomain: [number, number] = [
    Math.min(2.5, Math.floor((Math.min(...means, 2.5) - 0.1) * 10) / 10),
    Math.max(4, Math.ceil((Math.max(...means, 4) + 0.1) * 10) / 10),
  ]

  return (
    <>
      <Section
        title="Where ratings run high"
        dek={`The ${cycle} ratings by department and business unit, against the guideline of ${fmt(s.highGuideline, 'pct0')} rated ${hi}. Groups more than ${+(rule.inflationPts * 100).toFixed(1)} pts above it are marked.`}
      >
        <Figure
          id="talent-high-share-by-department"
          uses={m.uses['talent-high-share-by-department']}
          metric={FIGURE_METRIC['talent-high-share-by-department']}
          title={`Share rated ${range} by department`}
          subtitle={`People rated ${hi} as a share of people rated, ${cycle}`}
          data={perf.byDepartment}
          columns={highShareColumns('Department', m.drill, 'department', range)}
          definitions={defsFor(ctx.metrics, [M.highPerformers, M.ratingDistribution, M.inflationRule])}
          note={`${ratedNote} · departments under ${s.minGroup} rated are folded into Other`}
          span={6}
          empty={
            noReviews ??
            (perf.byDepartment.length ? null : 'Nobody in this scope is rated in the latest cycle.')
          }
        >
          <BarList
            data={departments.rows}
            label="group"
            value="share"
            format="pct"
            sort="none"
            ref={guideRef}
            tone={tone}
            secondary={(d) => `n = ${fmt(d.rated)}`}
            onSelect={(d) => drill(highOf('department', d))}
            ariaLabel={`Share rated ${hi} by department`}
          />
        </Figure>
        <Figure
          id="talent-rating-mix"
          uses={m.uses['talent-rating-mix']}
          metric={FIGURE_METRIC['talent-rating-mix']}
          title="Rating mix by business unit"
          subtitle={`Share of people at each rating, ${cycle}, with the guideline on top`}
          data={perf.mix}
          columns={mixColumns(m.drill)}
          definitions={defsFor(ctx.metrics, [M.ratingDistribution])}
          note={ratedNote}
          span={6}
          empty={noReviews ?? (perf.mix.length ? null : 'Nobody in this scope is rated in the latest cycle.')}
        >
          <RatingMix
            data={perf.mix.map((r) => ({
              group: r.businessUnit,
              rated: r.rated,
              shares: [r.r1, r.r2, r.r3, r.r4, r.r5],
            }))}
            drillFor={(group, rating) => m.drill.mix(group, rating)}
            guideline={s.guideline}
            minGroup={s.minGroup}
            ariaLabel="Rating mix by business unit compared with the guideline"
          />
        </Figure>
      </Section>

      <Section
        title="Calibration"
        dek="How far calibration moved manager-proposed ratings in the latest cycle, and how average ratings have moved across cycles."
      >
        <Figure
          id="talent-calibration-shift"
          uses={m.uses['talent-calibration-shift']}
          metric={FIGURE_METRIC['talent-calibration-shift']}
          title="Calibration shift by business unit"
          subtitle={`Average manager-proposed rating and average final rating, ${cycle}`}
          data={perf.calibration}
          columns={calibrationColumns(m.drill)}
          definitions={defsFor(ctx.metrics, [M.calibrationShift], [], [M.calibrationRule])}
          note={
            perf.calibrationCompany
              ? `All business units: shift ${fmt(perf.calibrationCompany.shift, 'num2')}, n = ${fmt(perf.calibrationCompany.n)} · as of ${asOf}`
              : `As of ${asOf}`
          }
          span={6}
          empty={
            noReviews ??
            (!m.has.preCalibration
              ? 'Upload Reviews with a pre-calibration (manager-proposed) rating to see this.'
              : calRows.length
                ? null
                : 'Nobody in this scope has a proposed and a final rating.')
          }
        >
          <Dumbbell
            data={calRows}
            aLabel="Manager proposed"
            bLabel="Final"
            drillFor={(r) => m.drill.calibration(r.label, 'all')}
            minGroup={s.minGroup}
            ariaLabel="Average proposed and final rating by business unit"
          />
        </Figure>
        <Figure
          id="talent-average-rating-by-cycle"
          uses={m.uses['talent-average-rating-by-cycle']}
          metric={FIGURE_METRIC['talent-average-rating-by-cycle']}
          title="Average rating by cycle"
          subtitle="Mean final rating per business unit in each review cycle"
          data={perf.cycles}
          columns={cycleColumns(m.drill)}
          definitions={defsFor(ctx.metrics, [M.averageRating], [TERM.latestCycle], [M.inflationRule])}
          note={`${
            perf.outlierUnit
              ? perf.outlierWhy === 'inflation'
                ? `${perf.outlierUnit} is highlighted: its share rated ${range} runs above the guideline. `
                : `${perf.outlierUnit} is highlighted: its average strays furthest from the rest. `
              : ''
          }Groups under ${s.minGroup} rated are hidden`}
          span={6}
          empty={noReviews ?? (perf.cycles.length ? null : 'No review cycles have closed yet.')}
        >
          <CycleLines
            data={perf.cycles}
            emphasize={perf.outlierUnit}
            yDomain={meanDomain}
            drillFor={(c, bu) => m.drill.cycleUnit(c, bu)}
            height={260}
            ariaLabel="Average rating by cycle and business unit"
          />
        </Figure>
        <RatingByReviewer m={m} />
      </Section>

      <Section
        title="Ratings, levels and exits"
        dek="Whether high ratings cluster at some levels, how often people at each rating left in the year after they were rated, and how sticky ratings are from one annual cycle to the next."
      >
        <Figure
          id="talent-high-share-by-level"
          uses={m.uses['talent-high-share-by-level']}
          metric={FIGURE_METRIC['talent-high-share-by-level']}
          title={`Share rated ${range} by level`}
          subtitle={`People rated ${hi} as a share of people rated, ${cycle}`}
          data={perf.byLevel}
          columns={highShareColumns('Level', m.drill, 'level', range)}
          definitions={defsFor(ctx.metrics, [M.highPerformers, M.ratingDistribution, M.inflationRule])}
          note={`${ratedNote} · levels under ${s.minGroup} rated are folded into Other`}
          span={4}
          empty={
            noReviews ?? (perf.byLevel.length ? null : 'Nobody in this scope is rated in the latest cycle.')
          }
        >
          <BarList
            data={perf.byLevel}
            label="group"
            value="share"
            format="pct"
            sort="none"
            ref={guideRef}
            tone={tone}
            secondary={(d) => `n = ${fmt(d.rated)}`}
            onSelect={(d) => drill(highOf('level', d))}
            ariaLabel={`Share rated ${hi} by level`}
          />
        </Figure>
        <Figure
          id="talent-exit-by-rating"
          uses={m.uses['talent-exit-by-rating']}
          metric={FIGURE_METRIC['talent-exit-by-rating']}
          title="Exit rate within 12 months by rating"
          subtitle={
            exitCycle
              ? `People rated in ${exitCycle.cycle} who left by ${formatDate(addMonths(exitCycle.cycleDate, 12))}`
              : 'People who left within 12 months of being rated'
          }
          data={perf.exitByRating}
          columns={exitByRatingColumns(m.drill)}
          definitions={defsFor(ctx.metrics, [M.exitByRating])}
          note={
            exitCycle
              ? `Uses the latest cycle with a full year of follow-up · ratings held by fewer than ${s.minGroup} people are hidden, counts included`
              : undefined
          }
          span={4}
          empty={
            noReviews ??
            (!exitCycle
              ? 'No review cycle has 12 months of follow-up yet.'
              : !m.has.terminationType
                ? 'Upload Employees with a termination type to split exits.'
                : perf.exitByRating.every((r) => r.rate == null)
                  ? `Fewer than ${s.minGroup} people hold each rating in this scope, so the exit rates are hidden.`
                  : null)
          }
        >
          <Columns
            data={perf.exitByRatingLong.filter((r) => r.rate != null)}
            x="rating"
            y="rate"
            series="type"
            stack
            seriesOrder={['Voluntary', 'Involuntary']}
            xOrder={RATING_ORDER}
            format="pct"
            height={260}
            onSelect={(d) => drill(m.drill.exitCohort(ratingOf(d.rating), 'left'))}
            onSelectSegment={(d) => drill(m.drill.exitCohort(ratingOf(d.rating), d.type))}
            ariaLabel="Exit rate within 12 months by rating"
          />
        </Figure>
        <RatingChange m={m} />
      </Section>
    </>
  )
}

/** Pay for performance: compa-ratio and merit by rating, the merit matrix, differentiation, bonus and equity. */
import { BarList, Columns, DotStrip, Figure, Heatmap } from '@/charts'
import { Section } from '@/components'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import {
  BONUS_COLUMNS,
  DEF_COMPA,
  DEF_DIFFERENTIATION,
  DEF_LATEST_RATING,
  DEF_POSITION,
  DIFFERENTIATION_COLUMNS,
  EQUITY_COLUMNS,
  guidelineDefinition,
  MATRIX_COLUMNS,
  MERIT_BY_RATING_COLUMNS,
  RATING_DOT_COLUMNS,
} from '../columns'
import type { CompModel } from '../engine/model'
import { DIFFERENTIATION_FLOOR, type DifferentiationRow, RATING_ORDER } from '../engine/performance'
import { POSITIONS } from '../engine/population'
import { emptyIf, MISSING, note } from '../shared'

const RATING_TOP_DOWN = RATING_ORDER.slice().reverse()
const flatTone = (d: DifferentiationRow) =>
  d.ratio != null && d.ratio < DIFFERENTIATION_FLOOR ? 'warning' : 'default'

export function Performance({ m }: { m: CompModel }) {
  const p = m.performance
  const s = m.settings
  const asOf = formatDate(m.asOf)
  const noReviews = m.pop.has.reviews ? null : MISSING.reviews
  const noMerit = noReviews ?? (m.pop.has.merit ? null : MISSING.merit)
  const meritChart = p.meritByRating.flatMap((r) => [
    { rating: r.rating, series: 'Proposed, mean', value: r.mean },
    { rating: r.rating, series: 'Guideline', value: r.guideline },
  ])
  const meritN = p.meritByRating.reduce((a, r) => a + r.n, 0)
  const cycle = m.pop.latestCycle ? `latest rating (${m.pop.latestCycle})` : 'latest rating'

  return (
    <div>
      <Section
        title="Pay and ratings"
        dek={`Whether pay position and this cycle's merit proposals follow performance, using each person's ${cycle}. Promotion increases are kept out of merit.`}
      >
        <Figure
          id="comp-compa-by-rating"
          title="Compa-ratio by rating"
          subtitle={`One dot per person, tick at the median, as of ${asOf}`}
          data={p.ratingDots}
          columns={RATING_DOT_COLUMNS}
          definitions={[DEF_COMPA, DEF_LATEST_RATING]}
          note={note(m, p.ratingDots.length)}
          span={6}
          empty={emptyIf(p.ratingDots, noReviews, 'Nobody in this scope has a rating.')}
        >
          <DotStrip
            data={p.ratingDots}
            x="compa"
            y="rating"
            id="id"
            label="name"
            xFormat="ratio"
            yOrder={RATING_TOP_DOWN}
            ref={{ value: 1, label: 'Midpoint' }}
            median
          />
        </Figure>
        <Figure
          id="comp-merit-by-rating"
          title="Merit by rating against the guideline"
          subtitle="Mean proposed merit % next to the guideline for each rating, this cycle"
          data={p.meritByRating}
          columns={MERIT_BY_RATING_COLUMNS}
          definitions={[guidelineDefinition(s), DEF_LATEST_RATING]}
          note={note(m, meritN, 'proposals')}
          span={6}
          empty={emptyIf(p.meritByRating, noMerit, 'No rated merit proposals in this scope.')}
        >
          <Columns
            data={meritChart}
            x="rating"
            y="value"
            series="series"
            seriesOrder={['Proposed, mean', 'Guideline']}
            xOrder={RATING_ORDER}
            format="pct"
          />
        </Figure>
      </Section>

      <Section
        title="Merit matrix and differentiation"
        dek="A merit matrix shows whether proposals favor people low in their range at the same rating. Differentiation compares what top performers get with what solid performers get."
      >
        <Figure
          id="comp-merit-matrix"
          title="Merit matrix"
          subtitle="Mean merit minus the guideline, by rating and range position; blue above guideline, red below"
          data={p.matrix}
          columns={MATRIX_COLUMNS}
          definitions={[guidelineDefinition(s), DEF_POSITION, DEF_LATEST_RATING]}
          note={`${note(
            m,
            p.matrix.reduce((a, c) => a + c.n, 0),
            'proposals',
          )} · cells under 5 people are hidden`}
          span={7}
          empty={emptyIf(
            p.matrix,
            noMerit ?? (m.pop.has.ranges ? null : MISSING.ranges),
            'No rated merit proposals in this scope.',
          )}
        >
          <Heatmap
            data={p.matrix}
            x="position"
            y="rating"
            value="diff"
            n="n"
            format="pts"
            scheme="diverging"
            mid={0}
            xOrder={POSITIONS}
            yOrder={RATING_TOP_DOWN}
          />
        </Figure>
        <Figure
          id="comp-differentiation-by-department"
          title="Differentiation by department"
          subtitle="Mean merit for ratings 4-5 ÷ mean merit for rating 3, lowest first"
          data={p.byDepartment}
          columns={DIFFERENTIATION_COLUMNS}
          definitions={[DEF_DIFFERENTIATION, DEF_LATEST_RATING]}
          note={`Company ${fmt(p.companyDifferentiation.ratio, 'num2')}× · needs 5 people on each side · as of ${asOf}`}
          span={5}
          empty={emptyIf(p.byDepartment, noMerit, 'No rated merit proposals in this scope.')}
        >
          <BarList
            data={p.byDepartment}
            label="group"
            value="ratio"
            format="num2"
            sort="asc"
            ref={{ value: DIFFERENTIATION_FLOOR, label: `Floor ${fmt(DIFFERENTIATION_FLOOR, 'num2')}` }}
            tone={flatTone}
            rowHeight={26}
            nullNote="Fewer than 5 people rated 3 or rated 4-5"
          />
        </Figure>
      </Section>

      <Section
        title="Bonus and equity"
        dek="Short- and long-term incentives by rating, as shares so no amounts are shown."
      >
        <Figure
          id="comp-bonus-by-rating"
          title="Bonus payout by rating"
          subtitle={`Mean last payout as a share of target, by ${m.pop.annualCycle ?? 'annual'} rating`}
          data={p.bonus}
          columns={BONUS_COLUMNS}
          definitions={[
            {
              term: 'Payout of target',
              text: 'Last bonus paid divided by the target bonus. 100% is paid at target. People hired after the last payout have none.',
            },
            {
              term: 'Annual rating',
              text: 'The rating from the latest annual cycle, the one the payout followed.',
            },
          ]}
          note={note(
            m,
            p.bonus.reduce((a, r) => a + r.n, 0),
          )}
          span={6}
          empty={emptyIf(
            p.bonus,
            noReviews ?? (m.pop.has.bonusPayout ? null : MISSING.bonus),
            'No bonus payouts with an annual rating in this scope.',
          )}
        >
          <Columns
            data={p.bonus}
            x="rating"
            y="mean"
            xOrder={RATING_ORDER}
            format="pct"
            ref={{ value: 1, label: 'Target' }}
          />
        </Figure>
        <Figure
          id="comp-equity-by-rating"
          title="Equity by rating"
          subtitle="Median annual equity as a share of base salary, both in USD"
          data={p.equity}
          columns={EQUITY_COLUMNS}
          definitions={[
            {
              term: 'Equity share',
              text: 'Annualized equity grant value divided by base salary, both in US dollars.',
              formula: 'annualEquityUsd ÷ (base × fxToUsd)',
            },
            DEF_LATEST_RATING,
          ]}
          note={note(
            m,
            p.equity.reduce((a, r) => a + r.n, 0),
            'people',
            true,
          )}
          span={6}
          empty={emptyIf(
            p.equity,
            noReviews ?? (m.pop.has.equity ? null : MISSING.equity),
            'No equity grants with a rating in this scope.',
          )}
        >
          <Columns data={p.equity} x="rating" y="median" xOrder={RATING_ORDER} format="pct" />
        </Figure>
      </Section>
    </div>
  )
}

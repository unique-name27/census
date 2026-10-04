/**
 * Pay for performance: compa-ratio and merit by rating, the merit matrix, differentiation, bonus
 * and equity. Ratings, cells and departments open the proposals behind them; a dot opens the person.
 */
import { BarList, Columns, DotStrip, Figure, Heatmap } from '@/charts'
import { Section } from '@/components'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { MeritGuideline } from '../charts/MeritGuideline'
import {
  DEF_COMPA,
  DEF_DIFFERENTIATION,
  DEF_LATEST_RATING,
  DEF_POSITION,
  guidelineDefinition,
  RATING_DOT_COLUMNS,
} from '../columns'
import {
  bonusColumns,
  differentiationColumns,
  equityColumns,
  matrixColumns,
  meritRatingColumns,
} from '../drillColumns'
import { bonusDrill, differentiationDrill, equityDrill, matrixDrill, meritRatingDrill } from '../engine/drill'
import type { CompModel } from '../engine/model'
import { DIFFERENTIATION_FLOOR, type DifferentiationRow, RATING_ORDER } from '../engine/performance'
import { POSITIONS } from '../engine/population'
import { asOfNote, emptyIf, MISSING, note } from '../shared'

const RATING_TOP_DOWN = RATING_ORDER.slice().reverse()
const flatTone = (d: DifferentiationRow) =>
  d.ratio != null && d.ratio < DIFFERENTIATION_FLOOR ? 'warning' : 'default'
/** Person rows open that person's card. */
const personRow = (r: { id: string }) => openPerson(r.id)

export function Performance({ m }: { m: CompModel }) {
  const p = m.performance
  const s = m.settings
  const asOf = formatDate(m.asOf)
  const noReviews = m.pop.has.reviews ? null : MISSING.reviews
  const noMerit = noReviews ?? (m.pop.has.merit ? null : MISSING.merit)
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
          uses={m.uses['comp-compa-by-rating']}
          title="Compa-ratio by rating"
          subtitle={`One dot per person, tick at the median, as of ${asOf}`}
          data={p.ratingDots}
          columns={RATING_DOT_COLUMNS}
          definitions={[DEF_COMPA, DEF_LATEST_RATING]}
          note={note(m, p.ratingDots.length)}
          span={6}
          empty={emptyIf(p.ratingDots, noReviews, 'Nobody in this scope has a rating.')}
          table={{ onRowClick: personRow, search: 'Search people' }}
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
            onSelect={personRow}
          />
        </Figure>
        <Figure
          id="comp-merit-by-rating"
          uses={m.uses['comp-merit-by-rating']}
          title="Merit by rating against the guideline"
          subtitle="Mean proposed merit % by rating, with the guideline for each rating marked, this cycle"
          data={p.meritByRating}
          columns={meritRatingColumns(m)}
          definitions={[guidelineDefinition(s), DEF_LATEST_RATING]}
          note={note(m, meritN, 'proposals')}
          span={6}
          empty={emptyIf(p.meritByRating, noMerit, 'No rated merit proposals in this scope.')}
        >
          <MeritGuideline
            rows={p.meritByRating}
            order={RATING_ORDER}
            ariaLabel="Mean proposed merit by rating against the guideline"
            onSelect={(row) => drill(meritRatingDrill(m, row))}
          />
        </Figure>
      </Section>

      <Section
        title="Merit matrix and differentiation"
        dek="A merit matrix shows whether proposals favor people low in their range at the same rating. Differentiation compares what top performers get with what solid performers get."
      >
        <Figure
          id="comp-merit-matrix"
          uses={m.uses['comp-merit-matrix']}
          title="Merit matrix"
          subtitle="Mean merit minus the guideline, by rating and range position; blue above guideline, red below"
          data={p.matrix}
          columns={matrixColumns(m)}
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
            onSelect={(cell) => drill(matrixDrill(m, cell))}
          />
        </Figure>
        <Figure
          id="comp-differentiation-by-department"
          uses={m.uses['comp-differentiation-by-department']}
          title="Differentiation by department"
          subtitle="Mean merit for ratings 4-5 ÷ mean merit for rating 3, lowest first"
          data={p.byDepartment}
          columns={differentiationColumns(m)}
          definitions={[DEF_DIFFERENTIATION, DEF_LATEST_RATING]}
          note={`Company ${fmt(p.companyDifferentiation.ratio, 'times')} · needs 5 people on each side · ${asOfNote(m)}`}
          span={5}
          empty={emptyIf(p.byDepartment, noMerit, 'No rated merit proposals in this scope.')}
        >
          <BarList
            data={p.byDepartment}
            label="group"
            value="ratio"
            format="times"
            sort="asc"
            ref={{ value: DIFFERENTIATION_FLOOR, label: `Floor ${fmt(DIFFERENTIATION_FLOOR, 'times')}` }}
            tone={flatTone}
            rowHeight={26}
            nullNote="Fewer than 5 people rated 3 or rated 4-5"
            onSelect={(d) => drill(differentiationDrill(m, d, d.group, null))}
          />
        </Figure>
      </Section>

      <Section
        title="Bonus and equity"
        dek="Short- and long-term incentives by rating, as shares so no amounts are shown."
      >
        <Figure
          id="comp-bonus-by-rating"
          uses={m.uses['comp-bonus-by-rating']}
          title="Bonus payout by rating"
          subtitle={`Mean last payout as a share of target, by ${m.pop.annualCycle ?? 'annual'} rating`}
          data={p.bonus}
          columns={bonusColumns(m)}
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
            onSelect={(d) => drill(bonusDrill(m, d))}
          />
        </Figure>
        <Figure
          id="comp-equity-by-rating"
          uses={m.uses['comp-equity-by-rating']}
          title="Equity by rating"
          subtitle="Median annual equity as a share of base salary, both in USD"
          data={p.equity}
          columns={equityColumns(m)}
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
          <Columns
            data={p.equity}
            x="rating"
            y="median"
            xOrder={RATING_ORDER}
            format="pct"
            onSelect={(d) => drill(equityDrill(m, d))}
          />
        </Figure>
      </Section>
    </div>
  )
}

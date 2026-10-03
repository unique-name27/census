import { Columns, Figure, HBars } from '@/charts'
import { Grid, goTo, KpiStrip, Readout, Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import { COVERAGE_ORDER } from '../engine/succession'
import { COVERAGE_COLUMNS, DISTRIBUTION_COLUMNS, RISK_PERSON_COLUMNS } from './columns'
import { DEF } from './defs'
import { NineBoxFigure } from './NineBoxFigure'

export function OverviewTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const perf = m.performance
  const succ = m.succession
  const cycle = perf.cycle?.cycle
  const top10 = m.retention.keyTalent.slice(0, 10)

  return (
    <>
      <Grid>
        <KpiStrip id="talent-key-figures" kpis={m.kpis} />
        <Readout
          id="talent-readout"
          findings={m.findings}
          span={4}
          emptyText="Nothing unusual in this scope as of the latest data."
        />
        <NineBoxFigure m={m} span={8} />
      </Grid>

      <Section
        title="Ratings and succession"
        dek="How the latest ratings compare with the guideline, and how ready each business unit's bench is for its critical and key roles."
      >
        <Figure
          id="talent-rating-distribution"
          title="Rating distribution vs guideline"
          subtitle={
            cycle ? `Share of people rated at each level, ${cycle}` : 'Share of people rated at each level'
          }
          data={perf.distribution}
          columns={DISTRIBUTION_COLUMNS}
          definitions={[DEF.latestCycle, DEF.guideline, DEF.highPerformer]}
          note={`${plural(perf.rated, 'person', 'people')} rated · as of ${asOf}`}
          span={6}
          empty={
            !m.has.reviews
              ? 'Upload Reviews to see the rating distribution.'
              : perf.rated < 5
                ? 'Fewer than 5 people are rated in this scope, so the distribution is hidden to protect anonymity.'
                : null
          }
        >
          <Columns
            data={perf.distributionLong}
            x="rating"
            y="share"
            series="series"
            seriesOrder={['Actual', 'Guideline']}
            format="pct0"
            height={260}
            ariaLabel="Rating distribution compared with the guideline"
          />
        </Figure>
        <Figure
          id="talent-succession-coverage"
          title="Succession coverage by business unit"
          subtitle="Critical and key roles by the readiness of their best successor, as of the latest plans"
          data={succ.coverageByUnit.filter((r) => r.roles > 0)}
          columns={COVERAGE_COLUMNS}
          definitions={[DEF.coverage, DEF.roleStatus]}
          note={`${plural(succ.roles.length, 'role')} planned, ${succ.critical} critical · ${fmt(succ.coverage, 'pct')} of critical roles covered · as of ${asOf}`}
          span={6}
          empty={
            !m.has.succession
              ? 'Upload Succession to see coverage.'
              : succ.roles.length
                ? null
                : 'No succession plans cover roles in this scope.'
          }
        >
          <HBars
            data={succ.coverageByUnit}
            y="businessUnit"
            x="roles"
            series="coverage"
            stack
            seriesOrder={COVERAGE_ORDER}
            onSelect={() => goTo('talent', 'succession')}
            ariaLabel="Roles by best successor readiness, per business unit"
          />
        </Figure>
      </Section>

      <Section
        title="Key talent at risk"
        dek="People rated 4 or 5 whose flight-risk score is in the top 10% company-wide, highest scores first. The Retention risk tab explains the score and lists everyone."
      >
        <Figure
          id="talent-key-talent-top"
          title="Key talent at risk, top 10"
          subtitle={`Rated 4-5 and in the high flight-risk band, scored as of ${asOf}`}
          data={top10}
          columns={RISK_PERSON_COLUMNS}
          definitions={[DEF.keyTalent, DEF.flightRisk, DEF.bands]}
          note={`${plural(m.retention.keyTalent.length, 'person', 'people')} in total · scores use the last 12 months of exits`}
          tableOnly
          table={{ maxRows: 10, onRowClick: () => goTo('talent', 'retention') }}
          empty={
            !m.has.reviews
              ? 'Upload Reviews to see who is rated 4 or 5.'
              : top10.length
                ? null
                : 'Nobody rated 4 or 5 is in the high flight-risk band in this scope.'
          }
        />
      </Section>
    </>
  )
}

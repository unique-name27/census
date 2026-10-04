import { Figure, HBars, useChartTheme } from '@/charts'
import { Grid, KpiStrip, Readout, Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import { COVERAGE_ORDER } from '../engine/succession'
import { readinessColors } from './colors'
import { coverageColumns, distributionColumns, riskPersonColumns } from './columns'
import { DEF } from './defs'
import { GuidelineColumns } from './GuidelineColumns'
import { NineBoxFigure } from './NineBoxFigure'

export function OverviewTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const t = useChartTheme()
  const asOf = formatDate(ctx.asOf)
  const perf = m.performance
  const succ = m.succession
  const cycle = perf.cycle?.cycle
  const top10 = m.retention.keyTalent.slice(0, 10)
  const left = perf.ratedLeft

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
          subtitle={cycle ? `Share of people at each rating, ${cycle}` : 'Share of people at each rating'}
          data={perf.distribution}
          columns={distributionColumns(m.drill)}
          definitions={[DEF.latestCycle, DEF.guideline, DEF.highPerformer]}
          note={`${plural(perf.rated, 'person', 'people')} rated${left ? `, including ${fmt(left)} who ${left === 1 ? 'has' : 'have'} left since` : ''} · as of ${asOf}`}
          span={6}
          empty={
            !m.has.reviews
              ? 'Upload Reviews to see the rating distribution.'
              : perf.rated < 5
                ? 'Fewer than 5 people are rated in this scope, so the distribution is hidden to protect anonymity.'
                : null
          }
        >
          <GuidelineColumns
            data={perf.distribution}
            drillFor={(d) => m.drill.rating(d.rating)}
            height={260}
            ariaLabel="Rating distribution compared with the guideline"
          />
        </Figure>
        <Figure
          id="talent-succession-coverage"
          title="Succession coverage by business unit"
          subtitle="Critical and key roles by the readiness of their best successor, as of the latest plans"
          data={succ.coverageByUnit.filter((r) => r.roles > 0)}
          columns={coverageColumns(m.drill)}
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
            colors={readinessColors(t)}
            onSelect={(d) => drill(m.drill.coverageCell(d.businessUnit, null))}
            onSelectSegment={(d) => drill(m.drill.coverageCell(d.businessUnit, d.coverage))}
            ariaLabel="Roles by best successor readiness, per business unit"
          />
        </Figure>
      </Section>

      <Section
        title="Key talent at risk"
        dek={`People rated 4 or 5 whose flight-risk score is in the high band (the top ${fmt(m.risk.highShare, 'pct0')} of scores company-wide), highest scores first. The Retention risk tab explains the score and lists everyone.`}
      >
        <Figure
          id="talent-key-talent-top"
          title="Key talent at risk, top 10"
          subtitle={`Rated 4-5 and in the high flight-risk band, scored as of ${asOf}`}
          data={top10}
          columns={riskPersonColumns(top10, { full: false })}
          definitions={[DEF.keyTalent, DEF.flightRisk, DEF.mainReason, DEF.bands]}
          note={`${plural(m.retention.keyTalent.length, 'person', 'people')} in total · points learned from the last two years of exits`}
          tableOnly
          table={{ maxRows: 10, onRowClick: (r) => openPerson(r.employeeId) }}
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

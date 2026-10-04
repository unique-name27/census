/**
 * Market: base pay against the market median by job family, location and level, and the jobs
 * furthest below. Every bar and count opens the people behind it with their market ratio.
 */
import { BarList, Figure } from '@/charts'
import { Section, type Severity } from '@/components'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { jobsColumns, marketDrillColumns } from '../drillColumns'
import { FIGURE_METRIC } from '../engine/definitions'
import { marketDrill } from '../engine/drill'
import type { JobMarketRow, MarketRow } from '../engine/market'
import type { CompModel } from '../engine/model'
import { marketFlag } from '../engine/rules'
import { settingPct } from '../engine/text'
import { asOfNote, emptyIf, MISSING, note } from '../shared'

/** Families at or below the below-market threshold ('comp.market.belowMarket') get the diamond. */
const gapTone = (flag: number) => (d: MarketRow) =>
  d.median != null && d.median <= flag + 1e-9 ? 'warning' : 'default'
/**
 * Every listed job is below market, so only the deepest gaps (the 'comp.market.gap' jobs setting,
 * 10% by default) carry a status.
 */
const jobTone =
  (watch: number) =>
  (r: JobMarketRow): Severity | null =>
    r.median != null && r.median <= 1 - watch + 1e-9 ? 'warning' : null
const nText = (d: MarketRow) => `n = ${fmt(d.n, 'int')}`

export function Market({ m }: { m: CompModel }) {
  const k = m.market
  const asOf = formatDate(m.asOf)
  const missing = m.pop.has.market ? null : MISSING.market
  const ref =
    k.total.gap == null
      ? undefined
      : { value: k.total.gap, label: `${m.isCompany ? 'Company' : 'Scope'} ${fmt(k.total.gap, 'pct')}` }
  const sub = `Median base ÷ market median minus 1, as of ${asOf}`
  const onBar = (d: MarketRow) => drill(marketDrill(m, d))
  const tone = gapTone(marketFlag(m.rules))
  const { minFamily, jobWatch } = m.rules.marketGap

  return (
    <div>
      <Section
        title="Base pay against the market"
        dek={`How base salary compares with the market median for each job. Bars left of zero are below market; the diamond marks a gap of ${settingPct(m.rules.belowMarket.threshold)} or more.`}
      >
        <Figure
          id="comp-market-by-family"
          uses={m.uses['comp-market-by-family']}
          metric={FIGURE_METRIC['comp-market-by-family']}
          title="Gap to market by job family"
          subtitle={`The 15 families of ${fmt(minFamily, 'int')} or more people furthest below market, median base ÷ market median minus 1, as of ${asOf}`}
          data={k.familyChart}
          columns={marketDrillColumns('Job family', m)}
          definitions={m.definitions['comp-market-by-family']}
          note={note(m, k.total.n)}
          span={6}
          empty={emptyIf(k.familyChart, missing, 'No market medians in this scope.')}
        >
          <BarList
            data={k.familyChart}
            label="group"
            value="gap"
            format="pct"
            sort="none"
            ref={ref}
            tone={tone}
            secondary={nText}
            rowHeight={26}
            onSelect={onBar}
          />
        </Figure>
        <Figure
          id="comp-market-by-location"
          uses={m.uses['comp-market-by-location']}
          metric={FIGURE_METRIC['comp-market-by-location']}
          title="Gap to market by location"
          subtitle={sub}
          data={k.byLocation}
          columns={marketDrillColumns('Location', m)}
          definitions={m.definitions['comp-market-by-location']}
          note={note(m, k.total.n)}
          span={6}
          empty={emptyIf(k.byLocation, missing, 'No market medians in this scope.')}
        >
          <BarList
            data={k.byLocation}
            label="group"
            value="gap"
            format="pct"
            sort="asc"
            ref={ref}
            tone={tone}
            secondary={nText}
            onSelect={onBar}
          />
        </Figure>
      </Section>

      <Section
        title="By level and job"
        dek="Where the gap sits by career level, and the job family and level pairs furthest below market."
      >
        <Figure
          id="comp-market-by-level"
          uses={m.uses['comp-market-by-level']}
          metric={FIGURE_METRIC['comp-market-by-level']}
          title="Gap to market by level"
          subtitle={sub}
          data={k.byLevel}
          columns={marketDrillColumns('Level', m)}
          definitions={m.definitions['comp-market-by-level']}
          note={note(m, k.total.n)}
          span={5}
          empty={emptyIf(k.byLevel, missing, 'No market medians in this scope.')}
        >
          <BarList
            data={k.byLevel}
            label="group"
            value="gap"
            format="pct"
            sort="none"
            ref={ref}
            tone={tone}
            secondary={nText}
            onSelect={onBar}
          />
        </Figure>
        <Figure
          id="comp-jobs-below-market"
          uses={m.uses['comp-jobs-below-market']}
          metric={FIGURE_METRIC['comp-jobs-below-market']}
          title="Jobs furthest below market"
          subtitle={`Job family and level pairs with ${fmt(m.rules.minGroup, 'int')} or more people, lowest market ratio first; ${settingPct(jobWatch)} or more below market is marked, as of ${asOf}`}
          data={k.jobs}
          columns={jobsColumns(m)}
          definitions={m.definitions['comp-jobs-below-market']}
          note={`Top ${fmt(k.jobs.length, 'int')} below market · ${asOfNote(m)}`}
          span={7}
          tableOnly
          table={{ rowTone: jobTone(jobWatch), maxRows: 15 }}
          empty={emptyIf(k.jobs, missing, 'No job in this scope is below market.')}
        />
      </Section>
    </div>
  )
}

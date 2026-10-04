/**
 * Market: base pay against the market median by job family, location and level, and the jobs
 * furthest below. Every bar and count opens the people behind it with their market ratio.
 */
import { BarList, Figure } from '@/charts'
import { Section, type Severity } from '@/components'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { DEF_MARKET, DEF_MARKET_MID, DEF_POPULATION } from '../columns'
import { jobsColumns, marketDrillColumns } from '../drillColumns'
import { marketDrill } from '../engine/drill'
import { type JobMarketRow, MARKET_CHART_MIN, MARKET_FLAG, type MarketRow } from '../engine/market'
import type { CompModel } from '../engine/model'
import { asOfNote, emptyIf, MISSING, note } from '../shared'

const gapTone = (d: MarketRow) => (d.median != null && d.median <= MARKET_FLAG + 1e-9 ? 'warning' : 'default')
/** Every listed job is below market, so only the deepest gaps (10% or more) carry a status. */
const JOB_WATCH = 0.9
const jobTone = (r: JobMarketRow): Severity | null =>
  r.median != null && r.median <= JOB_WATCH + 1e-9 ? 'warning' : null
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
  const defs = [DEF_MARKET, DEF_MARKET_MID, DEF_POPULATION]
  const onBar = (d: MarketRow) => drill(marketDrill(m, d))

  return (
    <div>
      <Section
        title="Base pay against the market"
        dek={`How base salary compares with the market median for each job. Bars left of zero are below market; the diamond marks a gap of ${fmt(1 - MARKET_FLAG, 'pct0')} or more.`}
      >
        <Figure
          id="comp-market-by-family"
          uses={m.uses['comp-market-by-family']}
          title="Gap to market by job family"
          subtitle={`The 15 families of ${MARKET_CHART_MIN} or more people furthest below market, median base ÷ market median minus 1, as of ${asOf}`}
          data={k.familyChart}
          columns={marketDrillColumns('Job family', m)}
          definitions={defs}
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
            tone={gapTone}
            secondary={nText}
            rowHeight={26}
            onSelect={onBar}
          />
        </Figure>
        <Figure
          id="comp-market-by-location"
          uses={m.uses['comp-market-by-location']}
          title="Gap to market by location"
          subtitle={sub}
          data={k.byLocation}
          columns={marketDrillColumns('Location', m)}
          definitions={defs}
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
            tone={gapTone}
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
          title="Gap to market by level"
          subtitle={sub}
          data={k.byLevel}
          columns={marketDrillColumns('Level', m)}
          definitions={defs}
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
            tone={gapTone}
            secondary={nText}
            onSelect={onBar}
          />
        </Figure>
        <Figure
          id="comp-jobs-below-market"
          uses={m.uses['comp-jobs-below-market']}
          title="Jobs furthest below market"
          subtitle={`Job family and level pairs with 5 or more people, lowest market ratio first; 10% or more below market is marked, as of ${asOf}`}
          data={k.jobs}
          columns={jobsColumns(m)}
          definitions={defs}
          note={`Top ${fmt(k.jobs.length, 'int')} below market · ${asOfNote(m)}`}
          span={7}
          tableOnly
          table={{ rowTone: jobTone, maxRows: 15 }}
          empty={emptyIf(k.jobs, missing, 'No job in this scope is below market.')}
        />
      </Section>
    </div>
  )
}

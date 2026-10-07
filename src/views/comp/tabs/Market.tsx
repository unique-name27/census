/**
 * Market: base pay against the market median by job family, location and level, and the jobs
 * furthest below. Every bar and count opens the people behind it with their market ratio.
 */
import { BarList, Figure, Scatter } from '@/charts'
import { Section, type Severity } from '@/components'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { jobsColumns, marketDrillColumns } from '../drillColumns'
import { type FamilyPositionRow, familyPositionDrill } from '../engine/charts'
import { FIGURE_METRIC } from '../engine/definitions'
import { lazyDrill, marketDrill } from '../engine/drill'
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
  const fp = k.familyPosition
  const familyDrill = (d: FamilyPositionRow) => lazyDrill(d.members.length, () => familyPositionDrill(m, d))
  const fpHidden = fp.hidden
    ? ` · ${fmt(fp.hidden, 'int')} ${fp.hidden === 1 ? 'family' : 'families'} under ${fmt(m.rules.minGroup, 'int')} people not drawn`
    : ''
  const unpriced = fp.unpriced
    ? ` · ${fmt(fp.unpriced, 'int')} of ${fmt(fp.total, 'int')} people have no market median`
    : ''

  return (
    <div>
      <Section
        title="Pay or the range"
        dek="When a job family is paid below market, whether people sit low in their range or the range itself trails the market. Right of 1.00 the range trails the market; below 1.00 pay sits low in the range."
      >
        <Figure
          id="comp-market-vs-range"
          uses={m.uses['comp-market-vs-range']}
          metric={FIGURE_METRIC['comp-market-vs-range']}
          title="Is it pay or the range? Job families against the market"
          subtitle={`Market median ÷ range midpoint (across) against median compa-ratio (up), one dot per job family, as of ${asOf}`}
          data={fp.rows}
          columns={[
            { key: 'family', label: 'Job family', format: 'text' },
            { key: 'n', label: 'People with a market median', format: 'int', drill: familyDrill },
            { key: 'marketVsMid', label: 'Market median ÷ midpoint', format: 'ratio', drill: familyDrill },
            { key: 'compa', label: 'Median compa-ratio', format: 'ratio', drill: familyDrill },
            { key: 'marketRatio', label: 'Median market ratio', format: 'ratio' },
          ]}
          definitions={m.definitions['comp-market-vs-range']}
          note={`${fmt(fp.rows.length, 'int')} job families${fpHidden}${unpriced} · ${asOfNote(m)}`}
          span={7}
          empty={emptyIf(fp.rows, missing, 'No job family has enough people with a market median.')}
        >
          <Scatter
            data={fp.rows}
            x="marketVsMid"
            y="compa"
            r="n"
            label="family"
            labelCount={4}
            xFormat="ratio"
            yFormat="ratio"
            rFormat="int"
            xLabel="Market median ÷ range midpoint"
            yLabel="Median compa-ratio"
            rLabel="People"
            refX={{ value: 1, label: 'Range at market 1.00' }}
            refY={{ value: 1, label: 'Midpoint 1.00' }}
            ariaLabel="Job families: market median against range midpoint and median compa-ratio"
            onSelect={(d) => drill(familyDrill(d))}
          />
        </Figure>
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
            glyphTone={tone}
            secondary={nText}
            onSelect={onBar}
          />
        </Figure>
      </Section>

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
            glyphTone={tone}
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
            glyphTone={tone}
            secondary={nText}
            onSelect={onBar}
          />
        </Figure>
      </Section>

      <Section title="By job" dek="The job family and level pairs furthest below market.">
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
          tableOnly
          table={{ rowTone: jobTone(jobWatch), maxRows: 15 }}
          empty={emptyIf(k.jobs, missing, 'No job in this scope is below market.')}
        />
      </Section>
    </div>
  )
}

/**
 * Headline tiles for the Overview and the Merit cycle tabs. Compensation is a snapshot, so tiles
 * compare with the company when an org filter is on, and merit spend compares with the budget.
 */
import type { Kpi } from '@/components/types'
import { MIN_GROUP } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ExceptionRow, PromotionRow, SpendSummary } from './cycle'
import { marketTotal } from './market'
import type { CompModel } from './model'
import { differentiation } from './performance'
import type { Population } from './population'
import { compaRow } from './ranges'
import { pct2, times } from './text'

type Core = Pick<CompModel, 'asOf' | 'pop' | 'company' | 'isCompany' | 'settings' | 'performance' | 'market'>

/** A "vs company" delta, material when it clears a domain threshold. */
function vsCompany(
  isCompany: boolean,
  value: number | null,
  company: number | null,
  threshold: number,
): Pick<Kpi, 'delta' | 'deltaLabel' | 'deltaMaterial'> {
  if (isCompany || value == null || company == null) return {}
  const delta = value - company
  return { delta, deltaLabel: 'vs company', deltaMaterial: Math.abs(delta) >= threshold }
}

const share = (n: number, d: number): number | null => (d >= MIN_GROUP ? n / d : null)
const count = (n: number) => `${fmt(n, 'int')} ${n === 1 ? 'person' : 'people'}`

export function buildKpis(m: Core, spend: SpendSummary): Kpi[] {
  const s = m.settings
  const scope = compaRow('scope', m.pop.people, s)
  const all = m.isCompany ? scope : compaRow('company', m.company.people, s)
  const placed = m.pop.people.filter((p) => p.position != null).length
  const placedAll = m.company.people.filter((p) => p.position != null).length
  const belowShare = share(scope.belowMin, placed)
  const aboveShare = share(scope.aboveMax, placed)
  const diff = m.performance.differentiation
  const diffAll = m.isCompany ? diff : differentiation(m.company.people)
  const mkt = m.market.total
  const mktAll = m.isCompany ? mkt : marketTotal(m.company.people)
  const band = `${fmt(s.bandLow, 'ratio')} to ${fmt(s.bandHigh, 'ratio')}`
  const small = scope.n > 0 && scope.n < MIN_GROUP
  // A delta that rounds to "+0.0 pts" says nothing; the note carries the exact figures instead.
  const spendDelta = spend.delta != null && Math.abs(spend.delta) >= 0.0005 ? spend.delta : null

  return [
    {
      id: 'median-compa',
      label: 'Median compa-ratio',
      value: scope.median,
      format: 'ratio',
      suppressed: small,
      note: `${count(scope.n)} · as of ${formatDate(m.asOf)}`,
      tab: 'ranges',
      definition:
        'Base salary divided by the salary range midpoint, median across active employees with a comp record.',
      ...vsCompany(m.isCompany, scope.median, all.median, 0.03),
    },
    {
      id: 'in-band',
      label: 'In healthy band',
      value: scope.inBand,
      format: 'pct',
      goodDirection: 'up',
      suppressed: small,
      note: `Compa-ratio ${band}`,
      tab: 'ranges',
      definition: `Share of people with a compa-ratio from ${band}, inclusive. Change the band in Cycle settings.`,
      ...vsCompany(m.isCompany, scope.inBand, all.inBand, 0.05),
    },
    {
      id: 'below-min',
      label: 'Below range minimum',
      value: belowShare,
      format: 'pct',
      goodDirection: 'down',
      suppressed: placed > 0 && placed < MIN_GROUP,
      note: count(scope.belowMin),
      tab: 'ranges',
      definition: 'Share of people whose base salary is below the minimum of their salary range.',
      ...vsCompany(m.isCompany, belowShare, share(all.belowMin, placedAll), 0.02),
    },
    {
      id: 'above-max',
      label: 'Above range maximum',
      value: aboveShare,
      format: 'pct',
      goodDirection: 'down',
      suppressed: placed > 0 && placed < MIN_GROUP,
      note: count(scope.aboveMax),
      tab: 'ranges',
      definition: 'Share of people whose base salary is above the maximum of their salary range.',
      ...vsCompany(m.isCompany, aboveShare, share(all.aboveMax, placedAll), 0.02),
    },
    {
      id: 'merit-spend',
      label: 'Merit spend',
      value: spend.spendPct,
      format: 'pct',
      goodDirection: 'down',
      delta: spendDelta,
      deltaLabel: `vs ${pct2(s.meritBudget)} budget`,
      deltaMaterial: spend.delta != null && Math.abs(spend.delta) >= 0.001,
      suppressed: spend.priced > 0 && spend.priced < MIN_GROUP,
      note:
        spend.spendPct == null
          ? 'No merit proposals'
          : `${pct2(spend.spendPct)} of eligible base vs ${pct2(s.meritBudget)} budget`,
      tab: 'cycle',
      definition:
        'Proposed merit as a share of eligible base salary, both in USD. Eligible means the person has a merit proposal. Promotion increases are not included.',
    },
    {
      id: 'p4p',
      label: 'Pay for performance',
      value: diff.ratio,
      format: 'num2',
      goodDirection: 'up',
      note:
        diff.ratio == null
          ? 'Needs 5 or more rated 3 and rated 4-5'
          : `Rating 4-5 merit is ${times(diff.ratio)} rating 3`,
      tab: 'performance',
      definition:
        'Mean merit % for people rated 4-5 divided by mean merit % for people rated 3, using the latest rating. 1.15 or more shows real differentiation.',
      ...vsCompany(m.isCompany, diff.ratio, diffAll.ratio, 0.15),
    },
    {
      id: 'market',
      label: 'Median market ratio',
      value: mkt.median,
      format: 'ratio',
      suppressed: mkt.n > 0 && mkt.n < MIN_GROUP,
      note: m.pop.has.market ? `${count(mkt.n)} with a market median` : 'No market medians in the data',
      tab: 'market',
      definition:
        'Base salary divided by the market median for the job, median across people with a market median.',
      ...vsCompany(m.isCompany, mkt.median, mktAll.median, 0.03),
    },
  ]
}

export function buildCycleKpis(
  pop: Population,
  c: {
    spend: SpendSummary
    promotions: { rows: PromotionRow[]; median: number | null }
    exceptions: ExceptionRow[]
  },
): Kpi[] {
  const rules = c.exceptions.filter((e) => e.kind !== 'outlier').length
  const outliers = c.exceptions.length - rules
  return [
    {
      id: 'eligible',
      label: 'Merit proposals',
      value: pop.has.merit ? c.spend.eligible : null,
      format: 'int',
      note: `of ${count(pop.people.length)}`,
      definition:
        'People with a merit proposal in the comp data. People without one are treated as not eligible this cycle.',
    },
    {
      id: 'spend',
      label: 'Merit spend',
      value: c.spend.spendPct,
      format: 'pct',
      note: `${pct2(c.spend.spendPct)} vs ${pct2(c.spend.budgetPct)} budget`,
      definition: 'Σ(base × merit %) ÷ Σ base over eligible people, both in USD.',
    },
    {
      id: 'guideline-spend',
      label: 'Spend at guideline',
      value: c.spend.guidelinePct,
      format: 'pct',
      note: `${pct2(c.spend.guidelinePct)}, prorated for service`,
      definition:
        'What the merit guideline would cost: each rated person at the guideline for their rating, prorated by the share of the last 12 months they were employed, as a share of eligible base.',
    },
    {
      id: 'promotions',
      label: 'Promotions proposed',
      value: pop.has.promotion || pop.has.merit ? c.promotions.rows.length : null,
      format: 'int',
      note:
        c.promotions.median == null
          ? 'Kept apart from merit'
          : `Median increase ${fmt(c.promotions.median, 'pct')}, kept apart from merit`,
      definition:
        'People with a promotion increase in this cycle. Promotion % is reported on its own and never counted as merit.',
    },
    {
      id: 'exceptions',
      label: 'Guideline exceptions',
      value: pop.has.merit ? rules : null,
      format: 'int',
      goodDirection: 'down',
      note: `${fmt(outliers, 'int')} more unusual for their rating`,
      definition:
        'Proposals that break the guideline rules: rating 5 with merit under 2%, or rating 1-2 with merit over 3%. Unusual proposals sit more than 3.5 robust deviations from the median merit for their rating.',
    },
  ]
}

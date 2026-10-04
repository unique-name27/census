/**
 * Headline tiles for the Overview and the Merit cycle tabs. Compensation is a snapshot, so tiles
 * compare with the company when an org filter is on, and merit spend compares with the budget.
 */
import type { Kpi } from '@/components/types'
import { MIN_GROUP } from '@/data/schema'
import type { DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { MetricsApi } from '@/metrics/types'
import { type CompMetricId, M } from '../metrics'
import type { ExceptionRow, PromotionRow, SpendSummary } from './cycle'
import { metricText } from './definitions'
import {
  atPosition,
  compaGroupDrill,
  type DrillScope,
  differentiationDrill,
  exceptionsDrill,
  guidelineSpendDrill,
  lazyDrill,
  marketDrill,
  outsideDrill,
  peopleDrill,
  promotionsDrill,
  ruleExceptions,
  scopeLine,
  spendDrill,
} from './drill'
import { tagKpis } from './drillUses'
import { COMPA, FX, MARKET, MERIT, POPULATION, POSITION, PROMOTION, RATING, refs } from './lineage'
import { marketTotal } from './market'
import type { CompModel } from './model'
import { coverageParts } from './notes'
import { differentiation } from './performance'
import type { Population } from './population'
import { compaRow } from './ranges'
import type { CompRules } from './rules'
import { pts2, settingPct, shownGap } from './text'

type Core = Pick<
  CompModel,
  | 'asOf'
  | 'payAsOf'
  | 'payStale'
  | 'scopeLabel'
  | 'pop'
  | 'company'
  | 'isCompany'
  | 'settings'
  | 'rules'
  | 'metrics'
  | 'performance'
  | 'market'
>

/**
 * A "vs company" delta, material when it clears a domain threshold. The change opens the
 * company's records behind the same measure (`companyDrill`).
 */
function vsCompany(
  isCompany: boolean,
  value: number | null,
  company: number | null,
  threshold: number,
  companyDrill?: () => DrillSpec | null,
): Pick<Kpi, 'delta' | 'deltaLabel' | 'deltaMaterial' | 'deltaDrill'> {
  if (isCompany || value == null || company == null) return {}
  const delta = value - company
  return {
    delta,
    deltaLabel: 'vs company',
    deltaMaterial: Math.abs(delta) >= threshold,
    deltaDrill: companyDrill,
  }
}

const count = (n: number) => `${fmt(n, 'int')} ${n === 1 ? 'person' : 'people'}`
const pct2 = (v: number | null | undefined) => fmt(v, 'pct2')

/**
 * Averages over fewer priced proposals than the anonymity minimum are hidden, like every other
 * rate (null, never the exact value).
 */
export const smallSpend = (spend: Pick<SpendSummary, 'priced'>, min = MIN_GROUP): boolean =>
  spend.priced > 0 && spend.priced < min

/** "latest rating (2026 Mid-year)": the rating merit proposals are drafted against. */
export const ratingBasis = (latestCycle: string | null): string =>
  latestCycle ? `latest rating (${latestCycle})` : 'latest rating'

export function buildKpis(m: Core, spend: SpendSummary): Kpi[] {
  const s = m.settings
  const r = m.rules
  const min = r.minGroup
  const text = (id: CompMetricId) => metricText(m.metrics, r, id)
  const share = (n: number, d: number): number | null => (d >= min ? n / d : null)
  const scope = compaRow('scope', m.pop.people, s, min)
  const all = m.isCompany ? scope : compaRow('company', m.company.people, s, min)
  const placed = m.pop.people.filter((p) => p.position != null).length
  const placedAll = m.company.people.filter((p) => p.position != null).length
  const belowShare = share(scope.belowMin, placed)
  const aboveShare = share(scope.aboveMax, placed)
  const diff = m.performance.differentiation
  const diffAll = m.isCompany ? diff : differentiation(m.company.people, min)
  const mkt = m.market.total
  const mktAll = m.isCompany ? mkt : marketTotal(m.company.people, 'All', min)
  const band = `${fmt(s.bandLow, 'ratio')} to ${fmt(s.bandHigh, 'ratio')}`
  const small = scope.n > 0 && scope.n < min
  const hideSpend = smallSpend(spend, min)
  // A delta that rounds to "+0.0 pts" says nothing; the value carries the exact figure instead.
  const spendDelta = !hideSpend && spend.delta != null && Math.abs(spend.delta) >= 0.0005 ? spend.delta : null
  const below = atPosition(m.pop.people, 'Below minimum')
  const above = atPosition(m.pop.people, 'Above maximum')
  const rate = (k: number, what: string) =>
    `Rate = ${fmt(k, 'int')} ${what} ÷ ${fmt(placed, 'int')} people with a salary range.`
  // The company's records behind a "vs company" change: the same drills over everyone.
  const co = { ...m, scopeLabel: 'Whole company' }
  const belowAll = atPosition(m.company.people, 'Below minimum')
  const aboveAll = atPosition(m.company.people, 'Above maximum')
  const rateAll = (k: number, what: string) =>
    `Rate = ${fmt(k, 'int')} ${what} ÷ ${fmt(placedAll, 'int')} people with a salary range, whole company.`
  const spendRow = { ...spend, group: null }

  return tagKpis([
    {
      id: 'median-compa',
      metricId: M.compaMedian,
      uses: COMPA,
      label: 'Median compa-ratio',
      value: scope.median,
      format: 'ratio',
      suppressed: small,
      note: [count(scope.n), `as of ${formatDate(m.asOf)}`, ...coverageParts(m)].join(' · '),
      tab: 'ranges',
      definition: text(M.compaMedian),
      drill: lazyDrill(scope.n, () => compaGroupDrill(m, scope, 'measured', true)),
      // "1,450 people": everyone measured.
      noteDrill: small ? null : lazyDrill(scope.n, () => compaGroupDrill(m, scope, 'measured', true)),
      ...vsCompany(m.isCompany, scope.median, all.median, r.compaMedian.material, () =>
        compaGroupDrill(co, all, 'measured', true),
      ),
    },
    {
      id: 'in-band',
      metricId: M.inBand,
      uses: COMPA,
      label: 'In healthy band',
      value: scope.inBand,
      format: 'pct',
      goodDirection: 'up',
      suppressed: small,
      note: `Compa-ratio ${band}`,
      tab: 'ranges',
      definition: text(M.inBand),
      drill: lazyDrill(scope.inBand, () => compaGroupDrill(m, scope, 'inBand', true)),
      ...vsCompany(m.isCompany, scope.inBand, all.inBand, r.inBand.material, () =>
        compaGroupDrill(co, all, 'inBand', true),
      ),
    },
    {
      id: 'below-min',
      metricId: M.belowMin,
      uses: POSITION,
      label: 'Below range minimum',
      value: belowShare,
      format: 'pct',
      goodDirection: 'down',
      suppressed: placed > 0 && placed < min,
      note: count(scope.belowMin),
      tab: 'ranges',
      definition: text(M.belowMin),
      drill: lazyDrill(below.length, () =>
        outsideDrill(m, 'below', below, 'Below range minimum', rate(below.length, 'below minimum')),
      ),
      // "78 people": the same people.
      noteDrill:
        placed > 0 && placed < min
          ? null
          : lazyDrill(below.length, () =>
              outsideDrill(m, 'below', below, 'Below range minimum', rate(below.length, 'below minimum')),
            ),
      ...vsCompany(m.isCompany, belowShare, share(all.belowMin, placedAll), r.belowMin.material, () =>
        outsideDrill(co, 'below', belowAll, 'Below range minimum', rateAll(belowAll.length, 'below minimum')),
      ),
    },
    {
      id: 'above-max',
      metricId: M.aboveMax,
      uses: POSITION,
      label: 'Above range maximum',
      value: aboveShare,
      format: 'pct',
      goodDirection: 'down',
      suppressed: placed > 0 && placed < min,
      note: count(scope.aboveMax),
      tab: 'ranges',
      definition: text(M.aboveMax),
      drill: lazyDrill(above.length, () =>
        outsideDrill(m, 'above', above, 'Above range maximum', rate(above.length, 'above maximum')),
      ),
      noteDrill:
        placed > 0 && placed < min
          ? null
          : lazyDrill(above.length, () =>
              outsideDrill(m, 'above', above, 'Above range maximum', rate(above.length, 'above maximum')),
            ),
      ...vsCompany(m.isCompany, aboveShare, share(all.aboveMax, placedAll), r.aboveMax.material, () =>
        outsideDrill(co, 'above', aboveAll, 'Above range maximum', rateAll(aboveAll.length, 'above maximum')),
      ),
    },
    {
      id: 'merit-spend',
      metricId: M.spend,
      uses: refs(MERIT, FX),
      label: 'Merit spend',
      value: hideSpend ? null : spend.spendPct,
      format: 'pct2',
      goodDirection: 'down',
      delta: spendDelta,
      deltaLabel: `vs ${pct2(s.meritBudget)} budget`,
      deltaMaterial: spend.delta != null && Math.abs(spend.delta) >= r.overBudget.material,
      suppressed: hideSpend,
      note:
        spend.spendPct == null
          ? 'No merit proposals'
          : `${fmt(spend.eligible, 'int')} proposals · budget ${pct2(s.meritBudget)}`,
      tab: 'cycle',
      definition: text(M.spend),
      drill: lazyDrill(spend.priced, () => spendDrill(m, spendRow, 'priced')),
      // "1,300 proposals": every proposal (the budget is a setting, not records).
      noteDrill: hideSpend ? null : lazyDrill(spend.eligible, () => spendDrill(m, spendRow, 'eligible')),
    },
    {
      id: 'p4p',
      metricId: M.differentiation,
      uses: refs(MERIT, RATING),
      label: 'Pay for performance',
      value: diff.ratio,
      format: 'times',
      goodDirection: 'up',
      note:
        diff.ratio == null
          ? `Needs ${fmt(min, 'int')} or more rated 3 and rated 4-5`
          : `Rated 4-5 vs rated 3, ${ratingBasis(m.pop.latestCycle)}`,
      tab: 'performance',
      definition: text(M.differentiation),
      drill: lazyDrill(diff.ratio, () => differentiationDrill(m, diff, null, null)),
      ...vsCompany(m.isCompany, diff.ratio, diffAll.ratio, r.differentiation.material, () =>
        differentiationDrill(co, diffAll, null, null),
      ),
    },
    {
      id: 'market',
      metricId: M.marketMedian,
      uses: MARKET,
      label: 'Median market ratio',
      value: mkt.median,
      format: 'ratio',
      suppressed: mkt.n > 0 && mkt.n < min,
      note: m.pop.has.market ? `${count(mkt.n)} with a market median` : 'No market medians in the data',
      tab: 'market',
      definition: text(M.marketMedian),
      drill: lazyDrill(mkt.median, () => marketDrill(m, mkt, true)),
      // "1,200 people with a market median": the same people.
      noteDrill: mkt.n > 0 && mkt.n < min ? null : lazyDrill(mkt.median, () => marketDrill(m, mkt, true)),
      ...vsCompany(m.isCompany, mkt.median, mktAll.median, r.marketMedian.material, () =>
        marketDrill(co, mktAll, true),
      ),
    },
  ])
}

/**
 * "0.15 pts above it" / "level with it": actual spend against the guideline cost, from the two
 * values as the tiles show them, so the gap is the difference a reader can check.
 */
export function againstGuideline(actual: number | null, guideline: number | null, min = MIN_GROUP): string {
  const d = shownGap(actual, guideline)
  if (d == null) return `Needs ${fmt(min, 'int')} or more rated proposals`
  const gap = pts2(Math.abs(d)).replace('+', '')
  if (!/[1-9]/.test(gap)) return 'Actual spend is level with it'
  return `Actual spend is ${gap} ${d > 0 ? 'above' : 'below'} it`
}

export function buildCycleKpis(
  pop: Population,
  c: {
    spend: SpendSummary
    promotions: { rows: PromotionRow[]; share: number | null; median: number | null }
    exceptions: ExceptionRow[]
  },
  scope: DrillScope,
  dict: { rules: CompRules; metrics: Pick<MetricsApi, 'def'> },
): Kpi[] {
  const r = dict.rules
  const min = r.minGroup
  const text = (id: CompMetricId) => metricText(dict.metrics, r, id)
  const x = r.exceptions
  const ruleText = `Rating 5 with merit under ${settingPct(x.topRatingFloor)}, or rating 1-2 with merit over ${settingPct(x.lowRatingCap)}`
  const unusualText = `More than ${fmt(x.outlierZ, 'num1')} robust deviations from the median merit for their rating`
  const ruleRows = ruleExceptions(c.exceptions)
  const rules = ruleRows.length
  const outliers = c.exceptions.length - rules
  const spendRow = { ...c.spend, group: null }
  const hideSpend = smallSpend(c.spend, min)
  const hideGuide = c.spend.rated > 0 && c.spend.rated < min
  const spendPct = hideSpend ? null : c.spend.spendPct
  const guidePct = hideGuide ? null : c.spend.guidelinePct
  const promo = c.promotions
  const promoNote = [
    promo.share == null ? null : `${fmt(promo.share, 'pct')} of eligible`,
    promo.median == null ? null : `median increase ${fmt(promo.median, 'pct')}`,
  ].filter(Boolean)
  const outlierRows = c.exceptions.filter((r) => r.kind === 'outlier')
  return tagKpis([
    {
      id: 'eligible',
      metricId: M.proposals,
      uses: MERIT,
      label: 'Merit proposals',
      value: pop.has.merit ? c.spend.eligible : null,
      format: 'int',
      note: `of ${count(pop.people.length)}`,
      definition: text(M.proposals),
      drill: lazyDrill(c.spend.eligible, () => spendDrill(scope, spendRow, 'eligible')),
      // "of 1,450 people": everyone in the comp population.
      noteDrill: lazyDrill(pop.people.length, () =>
        peopleDrill({
          title: 'People with a comp record',
          subtitle: scopeLine(scope),
          people: pop.people,
          note: `Active employees with a comp record. ${fmt(c.spend.eligible, 'int')} of them have a merit proposal.`,
        }),
      ),
    },
    {
      id: 'spend',
      metricId: M.spend,
      uses: refs(MERIT, FX),
      label: 'Merit spend',
      value: spendPct,
      format: 'pct2',
      suppressed: hideSpend,
      note:
        spendPct == null || c.spend.delta == null
          ? `Budget ${pct2(c.spend.budgetPct)}`
          : `${pts2(c.spend.delta)} vs the ${pct2(c.spend.budgetPct)} budget`,
      definition: text(M.spend),
      drill: lazyDrill(spendPct, () => spendDrill(scope, spendRow, 'priced')),
    },
    {
      id: 'guideline-spend',
      metricId: M.guidelineSpend,
      uses: refs(MERIT, FX, RATING),
      label: 'Spend at guideline',
      value: guidePct,
      format: 'pct2',
      suppressed: hideGuide,
      note: againstGuideline(spendPct, guidePct, min),
      definition: text(M.guidelineSpend),
      drill: lazyDrill(guidePct, () => guidelineSpendDrill(scope, c.spend.members, guidePct)),
    },
    {
      id: 'promotions',
      metricId: M.promotions,
      uses: refs(PROMOTION, pop.has.merit && 'comp.meritPct', POPULATION),
      label: 'Promotions proposed',
      value: pop.has.promotion || pop.has.merit ? promo.rows.length : null,
      format: 'int',
      note: promoNote.length ? promoNote.join(' · ') : 'Kept apart from merit',
      definition: text(M.promotions),
      drill: lazyDrill(promo.rows.length, () => promotionsDrill(scope, promo.rows)),
      noteDrill: promoNote.length
        ? lazyDrill(promo.rows.length, () => promotionsDrill(scope, promo.rows))
        : null,
    },
    {
      id: 'exceptions',
      metricId: M.exceptions,
      uses: refs(MERIT, RATING),
      label: 'Guideline exceptions',
      value: pop.has.merit ? rules : null,
      format: 'int',
      goodDirection: 'down',
      note: `${fmt(outliers, 'int')} more unusual for their rating`,
      definition: text(M.exceptions),
      drill: lazyDrill(rules, () =>
        exceptionsDrill(
          scope,
          ruleRows,
          'Proposals that break the guideline rules',
          `${ruleText}. Proposals that are only unusual for their rating are listed in the exceptions table.`,
        ),
      ),
      // "25 more unusual for their rating": those proposals.
      noteDrill: lazyDrill(outliers, () =>
        exceptionsDrill(
          scope,
          outlierRows,
          'Proposals unusual for their rating',
          `${unusualText}, without breaking a guideline rule.`,
        ),
      ),
    },
  ])
}

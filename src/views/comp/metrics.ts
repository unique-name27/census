/**
 * The comp view's metric dictionary entries (docs/METRICS.md): one per KPI, figure measure and
 * readout rule the view shows. The wording here is what the KPI info popovers and the figure
 * definitions show (with your changes), and every threshold the engine uses is a setting here,
 * read through `ctx.metrics` (`engine/rules.ts`), never a constant.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'. The cycle settings live on three of these metrics (`COMP_CYCLE` in
 * '@/metrics/compCycle'): merit budget on 'comp.merit.spend', the healthy band on
 * 'comp.compa.inBand' and the merit guideline on 'comp.merit.guidelineSpend'.
 */
import { HEALTHY_BAND_PARAM, MERIT_BUDGET_PARAM, MERIT_GUIDELINE_PARAM } from '@/metrics/compCycle'
import { defineMetrics } from '@/metrics/define'
import type { MetricDef, ParamDef } from '@/metrics/types'
import {
  BY,
  COMPA,
  FX,
  MARKET,
  MARKET_VS_MID,
  MERIT,
  PAY_REASON,
  POPULATION,
  POSITION,
  PROMOTED,
  PROMOTION,
  RATING,
  refs,
  VOLUNTARY_ATTRITION,
} from './engine/fields'

/** Every breakdown a comp finding can name (it declares the ones it shows). */
const ANY_GROUP = refs(...Object.values(BY), PROMOTED)

/** Every Compensation metric id, by what the engine calls it. */
export const M = {
  compaMedian: 'comp.compa.median',
  compaRatio: 'comp.compa.ratio',
  inBand: 'comp.compa.inBand',
  lowCompa: 'comp.compa.lowGroup',
  positionMix: 'comp.position.mix',
  penetration: 'comp.position.penetration',
  belowMin: 'comp.position.belowMin',
  aboveMax: 'comp.position.aboveMax',
  increaseToMin: 'comp.position.increaseToMin',
  overMax: 'comp.position.overMax',
  compression: 'comp.compression.gap',
  meritPct: 'comp.merit.pct',
  spend: 'comp.merit.spend',
  overBudget: 'comp.merit.overBudget',
  guidelineSpend: 'comp.merit.guidelineSpend',
  vsGuideline: 'comp.merit.vsGuideline',
  proposals: 'comp.merit.proposals',
  promotions: 'comp.merit.promotions',
  exceptions: 'comp.merit.exceptions',
  differentiation: 'comp.merit.differentiation',
  bonus: 'comp.bonus.payout',
  equity: 'comp.equity.share',
  mix: 'comp.rewards.mix',
  marketMedian: 'comp.market.median',
  marketGap: 'comp.market.gap',
  marketVsMid: 'comp.market.vsMidpoint',
  belowMarket: 'comp.market.belowMarket',
} as const

export type CompMetricId = (typeof M)[keyof typeof M]

const OWNER = 'People analytics'
/** Merit budget, guideline and healthy band are pay policy. */
const REWARDS = 'Total rewards'

const POP =
  'Active employees on the as-of date with a comp record and a base salary. Contractors and interns are not included.'
const SNAPSHOT = 'A snapshot on the as-of date; the period picker does not apply.'
const CYCLE = 'The current merit cycle, as of the as-of date.'

const VS_COMPANY =
  'With an org filter on, a gap to the company this large or larger is colored on the tile. Smaller gaps show in gray.'

/** "Change worth coloring": how large a tile's change must be before it is colored. */
function material(
  def: number,
  format: ParamDef['format'],
  max: number,
  step: number,
  description = VS_COMPANY,
): ParamDef {
  return {
    key: 'material',
    label: 'Change worth coloring',
    description,
    type: format === 'pts' || format === 'pts2' ? 'percent' : 'number',
    default: def,
    min: 0,
    max,
    step,
    format,
  }
}

/**
 * Settings registered on another metric that change a number (its `dependsOn`), so "Definition
 * changed" marks follow them: the healthy band, the merit budget, the guideline and the exception
 * rules feed the readout, and People stats sets how voluntary attrition is measured.
 */
const DEPENDS_ON: Readonly<Record<string, readonly string[]>> = {
  [M.compaRatio]: [M.inBand],
  [M.lowCompa]: [M.inBand, 'hrbp.attrition.voluntary'],
  [M.overBudget]: [M.spend],
  [M.vsGuideline]: [M.guidelineSpend],
  [M.differentiation]: [M.exceptions],
}

export const metrics: MetricDef[] = defineMetrics('comp', [
  /* ───────── compa-ratio ───────── */
  {
    id: M.compaMedian,
    name: 'Median compa-ratio',
    definition:
      'Base salary divided by the salary range midpoint, median across active employees with a comp record.',
    formula: 'median(baseSalary ÷ rangeMid)',
    population: POP,
    window: SNAPSHOT,
    unit: 'ratio',
    goodDirection: null,
    uses: COMPA,
    owner: OWNER,
    params: [material(0.03, 'num2', 0.5, 0.01)],
  },
  {
    id: M.compaRatio,
    name: 'Compa-ratio',
    definition:
      'Base salary divided by the midpoint of the salary range for the job and location. 1.00 is paid at the midpoint.',
    formula: 'baseSalary ÷ rangeMid',
    population: POP,
    window: SNAPSHOT,
    unit: 'ratio',
    goodDirection: null,
    uses: COMPA,
    owner: OWNER,
  },
  {
    id: M.inBand,
    name: 'In healthy band',
    definition: 'Share of people with a compa-ratio inside the healthy band, inclusive.',
    formula: 'people with a compa-ratio in the band ÷ people with a compa-ratio',
    population: POP,
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: 'up',
    // A common benchmark: four in five people paid inside the healthy band.
    target: { value: 0.8, comparator: '>=' },
    uses: COMPA,
    owner: REWARDS,
    params: [
      HEALTHY_BAND_PARAM,
      material(0.05, 'pts', 0.5, 0.005),
      {
        key: 'goodShare',
        label: 'Good news from',
        description:
          'When at least this share is inside the band and nothing in the readout is critical, the readout says so.',
        type: 'percent',
        default: 0.75,
        min: 0.5,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    id: M.lowCompa,
    name: 'Low compa-ratio group',
    definition:
      'A location or department whose median compa-ratio, read at two decimals, is at or below the low compa-ratio threshold. The readout adds its voluntary attrition against the company, measured as on People stats (its population and annualizing settings), and marks it critical when that attrition is higher by the escalation gap or more.',
    formula: 'median(compa-ratio in the group) ≤ threshold',
    population: `${POP} Groups under the anonymity minimum and Other are not raised.`,
    window: 'Compa-ratio on the as-of date; voluntary attrition over the period picker.',
    unit: 'ratio',
    goodDirection: 'up',
    // The readout adds voluntary attrition, pay as the exit reason and range minimums when they meet the standard.
    uses: refs(COMPA, BY.location, BY.department, VOLUNTARY_ATTRITION, PAY_REASON, POSITION),
    owner: OWNER,
    params: [
      {
        key: 'threshold',
        label: 'Low compa-ratio',
        description:
          'A location or department with a median compa-ratio at or below this is raised in the readout and marked on the compa-ratio charts.',
        type: 'number',
        default: 0.92,
        min: 0.5,
        max: 1.5,
        step: 0.01,
        format: 'ratio',
      },
      {
        key: 'attritionGap',
        label: 'Critical when attrition is higher by',
        description:
          'The finding turns critical when voluntary attrition in the group is above the company by this much or more.',
        type: 'percent',
        default: 0.03,
        min: 0,
        max: 0.5,
        step: 0.005,
        format: 'pts',
      },
    ],
  },

  /* ───────── range position ───────── */
  {
    id: M.positionMix,
    name: 'Range position',
    definition:
      'Share of people below minimum, in each quarter of the range (Q1 lowest to Q4 highest) and above maximum. Pay equal to the minimum or maximum counts as inside the range.',
    formula: 'people at the position ÷ people with a salary range',
    population: `${POP} Only people with a salary range.`,
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: null,
    uses: POSITION,
    owner: OWNER,
  },
  {
    id: M.penetration,
    name: 'Range penetration',
    definition:
      'How far into the range base salary sits: 0% at the minimum, 100% at the maximum. Not capped, so below 0% is under the minimum.',
    formula: '(base − rangeMin) ÷ (rangeMax − rangeMin)',
    population: `${POP} Only people with a salary range.`,
    window: SNAPSHOT,
    unit: 'pct0',
    goodDirection: null,
    uses: POSITION,
    owner: OWNER,
  },
  {
    id: M.belowMin,
    name: 'Below range minimum',
    definition: 'Share of people whose base salary is below the minimum of their salary range.',
    formula: 'people below minimum ÷ people with a salary range',
    population: `${POP} Only people with a salary range.`,
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: 'down',
    target: { value: 0.02, comparator: '<=' },
    // The readout lists each person's department and where the gap concentrates.
    uses: refs(POSITION, ANY_GROUP, FX),
    owner: OWNER,
    params: [
      material(0.02, 'pts', 0.5, 0.005),
      {
        key: 'criticalShare',
        label: 'Critical from',
        description:
          'The readout marks people below minimum critical when they are at least this share of people with a salary range.',
        type: 'percent',
        default: 0.05,
        min: 0,
        max: 1,
        step: 0.005,
      },
      {
        key: 'criticalCount',
        label: 'Critical needs at least',
        description: 'Below this many people, the finding stays a warning whatever the share.',
        type: 'number',
        default: 10,
        min: 1,
        max: 500,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.aboveMax,
    name: 'Above range maximum',
    definition: 'Share of people whose base salary is above the maximum of their salary range.',
    formula: 'people above maximum ÷ people with a salary range',
    population: `${POP} Only people with a salary range.`,
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: 'down',
    uses: refs(POSITION, BY.level, BY.tenureBand),
    owner: OWNER,
    params: [material(0.02, 'pts', 0.5, 0.005)],
  },
  {
    id: M.increaseToMin,
    name: 'Increase to minimum',
    definition: 'The raise that brings base salary up to the range minimum.',
    formula: '(rangeMin − base) ÷ base',
    population: 'People paid below the minimum of their salary range.',
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: 'down',
    uses: POSITION,
    owner: OWNER,
    params: [
      {
        key: 'largeGap',
        label: 'Large gap from',
        description: 'People who need an increase this large or larger are marked critical in the table.',
        type: 'percent',
        default: 0.1,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    id: M.overMax,
    name: 'Over maximum',
    definition: 'How far base salary sits above the range maximum.',
    formula: '(base − rangeMax) ÷ rangeMax',
    population: 'People paid above the maximum of their salary range.',
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: 'down',
    uses: POSITION,
    owner: OWNER,
  },
  {
    id: M.compression,
    name: 'Pay compression',
    definition:
      'Median compa-ratio of people hired in the last 12 months against people already in the same department and level.',
    formula: 'median(compa | new hires) − median(compa | incumbents)',
    population: POP,
    window: 'New hires joined in the 12 months to the as-of date; incumbents joined before.',
    unit: 'num2',
    goodDirection: 'down',
    uses: refs(COMPA, BY.department, BY.level, BY.tenureBand),
    owner: OWNER,
    params: [
      {
        key: 'minGroup',
        label: 'Smallest side compared',
        description:
          'A department and level is compared only when new hires and incumbents each have at least this many people. It can be raised, never lowered below 5.',
        type: 'number',
        default: 5,
        min: 5,
        max: 50,
        step: 1,
        format: 'int',
        locked: 'raiseOnly',
      },
      {
        key: 'gap',
        label: 'Gap flagged',
        description: 'New hires this far or further above incumbents, in compa-ratio points, are flagged.',
        type: 'number',
        default: 0.05,
        min: 0.01,
        max: 0.5,
        step: 0.01,
        format: 'num2',
      },
      {
        key: 'findingMin',
        label: 'Readout needs on each side',
        description: 'The readout raises a flagged gap only when both sides have at least this many people.',
        type: 'number',
        default: 10,
        min: 5,
        max: 100,
        step: 1,
        format: 'int',
      },
    ],
  },

  /* ───────── merit cycle ───────── */
  {
    id: M.meritPct,
    name: 'Merit %',
    definition:
      'The merit increase proposed this cycle as a share of base salary. Promotion increases are reported apart and never counted as merit.',
    population: 'People with a merit proposal.',
    window: CYCLE,
    unit: 'pct2',
    goodDirection: null,
    uses: MERIT,
    owner: REWARDS,
  },
  {
    id: M.spend,
    name: 'Merit spend',
    definition:
      'Proposed merit as a share of eligible base salary, both in USD. Eligible means the person has a merit proposal. Promotion increases are not included.',
    formula: 'Σ(base × fxToUsd × merit %) ÷ Σ(base × fxToUsd), people with a merit proposal',
    population: 'People with a merit proposal and an FX rate.',
    window: CYCLE,
    unit: 'pct2',
    goodDirection: 'down',
    uses: refs(MERIT, FX),
    owner: REWARDS,
    params: [MERIT_BUDGET_PARAM],
  },
  {
    id: M.overBudget,
    name: 'Over merit budget',
    definition:
      'A business unit, or the whole scope, whose merit spend is over the merit budget by the flag gap or more. It turns critical from the critical gap.',
    formula: 'merit spend − merit budget, in points',
    population:
      'People with a merit proposal and an FX rate. Business units under the anonymity minimum are folded into Other and not raised.',
    window: CYCLE,
    unit: 'pts2',
    goodDirection: 'down',
    uses: refs(MERIT, FX, BY.businessUnit),
    owner: REWARDS,
    params: [
      material(
        0.001,
        'pts2',
        0.05,
        0.0005,
        'On the merit spend tile, a gap to the budget this large or larger is colored. Smaller gaps show in gray.',
      ),
      {
        key: 'flag',
        label: 'Flag from',
        description: 'Spend this far or further over the budget is flagged in the readout and on the chart.',
        type: 'percent',
        default: 0.002,
        min: 0,
        max: 0.05,
        step: 0.0005,
        format: 'pts2',
      },
      {
        key: 'critical',
        label: 'Critical from',
        description: 'Spend this far or further over the budget makes the finding critical.',
        type: 'percent',
        default: 0.01,
        min: 0,
        max: 0.1,
        step: 0.0005,
        format: 'pts2',
      },
    ],
  },
  {
    id: M.guidelineSpend,
    name: 'Spend at guideline',
    definition:
      'What the merit guideline would cost: each rated proposal at the guideline for its rating, weighted by base salary in USD like the actual spend. Not prorated, so it compares like with like with the proposals and the budget.',
    formula: 'Σ(base × guideline for the rating) ÷ Σ base, rated proposals in USD',
    population: 'People with a merit proposal, a latest rating and an FX rate.',
    window: CYCLE,
    unit: 'pct2',
    goodDirection: null,
    uses: refs(MERIT, FX, RATING),
    owner: REWARDS,
    params: [MERIT_GUIDELINE_PARAM],
  },
  {
    id: M.vsGuideline,
    name: 'Merit against the guideline',
    definition:
      'Mean proposed merit % minus the merit guideline for the rating, in points. Above zero is over the guideline.',
    formula: 'mean(merit %) − guideline for the rating',
    population: 'People with a merit proposal and a latest rating.',
    window: CYCLE,
    unit: 'pts',
    goodDirection: null,
    uses: refs(MERIT, RATING),
    owner: REWARDS,
  },
  {
    id: M.proposals,
    name: 'Merit proposals',
    definition:
      'People with a merit proposal in the comp data. People without one are treated as not eligible this cycle.',
    formula: 'count of people with a merit %',
    population: POP,
    window: CYCLE,
    unit: 'int',
    goodDirection: null,
    uses: MERIT,
    owner: REWARDS,
  },
  {
    id: M.promotions,
    name: 'Promotions proposed',
    definition:
      'People with a promotion increase in this cycle. Promotion % is reported on its own and never counted as merit.',
    formula: 'count of people with a promotion %',
    population: POP,
    window: CYCLE,
    unit: 'int',
    goodDirection: null,
    uses: refs(PROMOTION, POPULATION, 'comp.meritPct'),
    owner: REWARDS,
  },
  {
    id: M.exceptions,
    name: 'Guideline exceptions',
    definition:
      'Proposals that break the guideline rules: rating 5 with merit under the rating 5 floor, or rating 1-2 with merit over the rating 1-2 cap. Proposals that break neither rule but sit far from the typical merit for the rating across the company are listed as unusual.',
    formula: 'distance = 0.6745 × (merit − median) ÷ MAD, within the rating',
    population: 'People with a merit proposal and a latest rating.',
    window: CYCLE,
    unit: 'int',
    goodDirection: 'down',
    uses: refs(MERIT, RATING),
    owner: REWARDS,
    params: [
      {
        key: 'topRatingFloor',
        label: 'Rating 5 floor',
        description: 'A rating 5 proposal with merit under this breaks the guideline rules.',
        type: 'percent',
        default: 0.02,
        min: 0,
        max: 0.3,
        step: 0.0025,
      },
      {
        key: 'lowRatingCap',
        label: 'Rating 1-2 cap',
        description: 'A rating 1 or 2 proposal with merit over this breaks the guideline rules.',
        type: 'percent',
        default: 0.03,
        min: 0,
        max: 0.3,
        step: 0.0025,
      },
      {
        key: 'outlierZ',
        label: 'Unusual beyond',
        description:
          'Proposals more than this many robust deviations from the median merit for their rating, either way, are listed as unusual.',
        type: 'number',
        default: 3.5,
        min: 1,
        max: 10,
        step: 0.5,
        format: 'num1',
      },
      {
        key: 'outlierMinPeers',
        label: 'Smallest rating group tested',
        description:
          'Ratings with fewer proposals than this across the company get no unusual-proposal test.',
        type: 'number',
        default: 10,
        min: 5,
        max: 200,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.differentiation,
    name: 'Pay for performance',
    definition:
      'Mean merit % for people rated 4-5 divided by mean merit % for people rated 3, using each person’s latest rating, the one merit proposals are drafted against.',
    formula: 'mean(merit | rating 4-5) ÷ mean(merit | rating 3)',
    population: 'People with a merit proposal and a latest rating, with the anonymity minimum on each side.',
    window: CYCLE,
    unit: 'times',
    goodDirection: 'up',
    uses: refs(MERIT, RATING, BY.department),
    owner: OWNER,
    params: [
      {
        key: 'floor',
        label: 'Differentiation floor',
        description:
          'Below this ratio, ratings make little difference to pay: departments under it are raised in the readout and marked on the chart.',
        type: 'number',
        default: 1.15,
        min: 1,
        max: 3,
        step: 0.05,
        format: 'times',
      },
      {
        key: 'strong',
        label: 'Good news from',
        description: 'At this ratio or above across the scope, the readout says merit follows performance.',
        type: 'number',
        default: 1.3,
        min: 1,
        max: 5,
        step: 0.05,
        format: 'times',
      },
      material(0.15, 'times', 2, 0.05),
    ],
  },
  {
    id: M.bonus,
    name: 'Bonus payout of target',
    definition:
      'Last bonus paid divided by the target bonus, by the rating in the latest annual cycle. 100% is paid at target. People hired after the last payout have none.',
    formula: 'mean(last payout ÷ target bonus), by annual rating',
    population: 'People with a bonus payout and an annual rating.',
    window: 'The last bonus payout and the latest annual cycle on or before the as-of date.',
    unit: 'pct',
    goodDirection: null,
    uses: refs('comp.bonusPayoutPct', RATING, 'reviews.cycle', POPULATION),
    owner: OWNER,
  },
  {
    id: M.equity,
    name: 'Equity share',
    definition: 'Annualized equity grant value divided by base salary, both in US dollars.',
    formula: 'annualEquityUsd ÷ (base × fxToUsd)',
    population: 'People with an equity grant, a latest rating and an FX rate.',
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: null,
    uses: refs('comp.annualEquityUsd', FX, RATING, POPULATION),
    owner: OWNER,
  },
  {
    id: M.mix,
    name: 'Total rewards mix',
    definition:
      'Share of target pay from base salary, target bonus and annualized equity, all in US dollars. Shares only, so no amounts are shown.',
    formula: 'each part ÷ (base + base × target bonus % + annual equity)',
    population: 'People with a target bonus and an FX rate.',
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: null,
    uses: refs('comp.targetBonusPct', 'comp.annualEquityUsd', FX, BY.level, POPULATION),
    owner: OWNER,
  },

  /* ───────── market ───────── */
  {
    id: M.marketMedian,
    name: 'Median market ratio',
    definition:
      'Base salary divided by the market median for the job, median across people with a market median.',
    formula: 'median(baseSalary ÷ marketP50)',
    population: `${POP} Only people with a market median.`,
    window: SNAPSHOT,
    unit: 'ratio',
    goodDirection: null,
    uses: MARKET,
    owner: OWNER,
    params: [material(0.03, 'num2', 0.5, 0.01)],
  },
  {
    id: M.marketGap,
    name: 'Gap to market',
    definition:
      'Median market ratio minus 1. Market ratio is base salary divided by the market median (50th percentile) for the job, so below zero is below market.',
    formula: 'median(baseSalary ÷ marketP50) − 1',
    population: `${POP} Only people with a market median.`,
    window: SNAPSHOT,
    unit: 'pct',
    goodDirection: 'up',
    uses: MARKET,
    owner: OWNER,
    params: [
      {
        key: 'minFamily',
        label: 'Smallest job family ranked',
        description:
          'The job family chart ranks only families with at least this many people with a market median, and the readout raises only those. Smaller families fold into Other.',
        type: 'number',
        default: 10,
        min: 5,
        max: 100,
        step: 1,
        format: 'int',
      },
      {
        key: 'jobWatch',
        label: 'Jobs marked from',
        description:
          'Job family and level pairs this far or further below market are marked in the jobs table.',
        type: 'percent',
        default: 0.1,
        min: 0,
        max: 0.5,
        step: 0.01,
      },
    ],
  },
  {
    id: M.marketVsMid,
    name: 'Market median ÷ midpoint',
    definition:
      'How the salary range tracks the market. Above 1.00 means the market pays more than the range midpoint.',
    formula: 'marketP50 ÷ rangeMid',
    population: 'People with a market median and a range midpoint.',
    window: SNAPSHOT,
    unit: 'ratio',
    goodDirection: null,
    uses: MARKET_VS_MID,
    owner: OWNER,
  },
  {
    id: M.belowMarket,
    name: 'Below market',
    definition:
      'A job family whose median market ratio is at or below 1 minus the below-market threshold. When market medians sit above the range midpoints by the range gap or more, the ranges trail the market; otherwise pay sits low in the range.',
    formula: 'median(baseSalary ÷ marketP50) ≤ 1 − threshold',
    population: `${POP} Only job families ranked on the job family chart.`,
    window: SNAPSHOT,
    unit: 'ratio',
    goodDirection: 'up',
    uses: refs(MARKET, MARKET_VS_MID, 'employees.jobFamily', BY.department),
    owner: OWNER,
    params: [
      {
        key: 'threshold',
        label: 'Below market from',
        description:
          'A job family this far or further below market is raised in the readout and marked on the market charts.',
        type: 'percent',
        default: 0.05,
        min: 0,
        max: 0.5,
        step: 0.01,
      },
      {
        key: 'rangeGap',
        label: 'Ranges trail the market from',
        description:
          'When the market medians sit this far or further above the range midpoints, the finding points to the ranges instead of pay position in the range.',
        type: 'percent',
        default: 0.05,
        min: 0,
        max: 0.5,
        step: 0.01,
      },
    ],
  },
]).map((d) => (DEPENDS_ON[d.id] ? { ...d, dependsOn: DEPENDS_ON[d.id] } : d))

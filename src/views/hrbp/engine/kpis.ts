/**
 * Overview KPI tiles. Rates compare with the company when an org filter is active ("vs
 * company") and with the prior window otherwise. Delta color uses the earlier HRBP
 * dashboard's materiality floor: |Δ| ≥ 2% of the reference + 0.15 pts.
 */
import type { Kpi } from '@/components/types'
import type { PeriodPreset } from '@/data/scope'
import { addDays, formatDate } from '@/lib/dates'
import { attrition, headcountAt, hiresIn, type RateResult } from '@/lib/people'
import { type CohortSummary, cohortSummary } from './attrition'
import { isMaterialGap, type Prep, quarterBlocks } from './base'
import type { MovementModel } from './movement'
import { annualRate, exitsByGroup } from './rates'

export interface KpiModel {
  kpis: Kpi[]
  vol: RateResult
  all: RateResult
  regretted: RateResult
  companyVol: number | null
  firstYear: CohortSummary
  headcount: number
  headcountYearAgo: number
  hires: number
}

export function priorLabel(period: PeriodPreset, months: number): string {
  if (period === 'ytd') return 'vs same period last year'
  if (period === 'lastQuarter') return 'vs prior quarter'
  if (period === 'custom') return 'vs prior period'
  return `vs prior ${Math.round(months)} months`
}

/** "the last 12 months", "the year to date", or the dates of a custom range. */
export function windowPhrase(p: Prep): string {
  switch (p.ctx.filters.period) {
    case 't12m':
      return 'the last 12 months'
    case 't6m':
      return 'the last 6 months'
    case 't3m':
      return 'the last 3 months'
    case 'ytd':
      return 'the year to date'
    case 'lastQuarter':
      return 'the last full quarter'
    default:
      return p.window.label.replace(' – ', ' to ')
  }
}

export function computeKpis(p: Prep, movement: MovementModel): KpiModel {
  const { emps, companyEmps, window, prior, asOf, ctx } = p
  const vsCompany = !ctx.isCompany
  const compareLabel = vsCompany ? 'vs company' : priorLabel(ctx.filters.period, window.months)
  const typed = p.has.terminationType
  const blocks = quarterBlocks(asOf, 8)
  const qGroups = blocks.map((b) => exitsByGroup(emps, b, () => 'all').get('all'))

  const yearAgo = addDays(p.t12.start, -1)
  const headcount = headcountAt(emps, asOf)
  const headcountYearAgo = headcountAt(emps, yearAgo)
  const hires = hiresIn(emps, window).length
  const priorHires = hiresIn(emps, prior).length

  const rate = (kind: 'all' | 'voluntary' | 'regretted') => {
    const own = attrition(emps, window, kind)
    const ok = kind === 'all' || (typed && (kind !== 'regretted' || p.has.regrettable))
    const value = ok ? own.rate : null
    const ref = vsCompany ? attrition(companyEmps, window, kind).rate : attrition(emps, prior, kind).rate
    return { own: { ...own, rate: value }, ref: ok ? ref : null }
  }
  const all = rate('all')
  const vol = rate('voluntary')
  const reg = rate('regretted')

  const rateKpi = (
    id: string,
    label: string,
    r: { own: RateResult; ref: number | null },
    spark: (number | null)[],
    definition: string,
    missing: string,
    noun: string,
  ): Kpi => {
    const suppressed = r.own.avgHeadcount > 0 && r.own.avgHeadcount < 5
    const value = suppressed ? null : r.own.rate
    const delta = value != null && r.ref != null ? value - r.ref : null
    return {
      id,
      label,
      value,
      format: 'pct',
      delta,
      deltaLabel: compareLabel,
      goodDirection: 'down',
      deltaMaterial: isMaterialGap(delta, r.ref),
      spark,
      note:
        value == null && !suppressed
          ? missing
          : `${r.own.events.toLocaleString('en-US')} ${noun}, annualized over ${Math.round(r.own.avgHeadcount).toLocaleString('en-US')} avg headcount`,
      suppressed,
      tab: 'attrition',
      definition,
    }
  }

  const sparkRate = (pick: (g: NonNullable<(typeof qGroups)[number]>) => number, enabled: boolean) =>
    qGroups.map((g, i) => (enabled && g ? annualRate(pick(g), g.avgHeadcount, blocks[i]) : null))

  const firstYear = cohortSummary(emps, asOf)
  const fyRef = vsCompany ? cohortSummary(companyEmps, asOf).rate : cohortSummary(emps, prior.end).rate
  const fySuppressed = firstYear.cohort > 0 && firstYear.cohort < 5
  const fyDelta = firstYear.rate != null && fyRef != null ? firstYear.rate - fyRef : null

  const promo = movement.promotions
  const promoRef = vsCompany ? movement.companyPromotions.rate : movement.priorPromotions.rate
  const promoDelta = promo.rate != null && promoRef != null ? promo.rate - promoRef : null
  const promoSuppressed = promo.avgHeadcount > 0 && promo.avgHeadcount < 5

  const contingent = p.people.filter(
    (e) =>
      e.employmentType !== 'Employee' &&
      e.hireDate <= asOf &&
      (!e.terminationDate || e.terminationDate > asOf),
  ).length

  const kpis: Kpi[] = [
    {
      id: 'headcount',
      label: 'Headcount',
      value: headcount,
      format: 'int',
      delta: headcount - headcountYearAgo,
      deltaLabel: 'vs 12 months earlier',
      goodDirection: null,
      spark: blocks.map((b) => headcountAt(emps, b.end)),
      note: contingent
        ? contingent === 1
          ? 'Plus 1 contractor or intern'
          : `Plus ${contingent.toLocaleString('en-US')} contractors and interns`
        : undefined,
      tab: 'workforce',
      definition: `Employees active on ${formatDate(asOf)}. Contractors and interns are counted separately.`,
    },
    {
      id: 'hires',
      label: 'Hires',
      value: hires,
      format: 'int',
      delta: hires - priorHires,
      deltaLabel: priorLabel(ctx.filters.period, window.months),
      goodDirection: null,
      spark: blocks.map((b) => hiresIn(emps, b).length),
      note: `${window.label}`,
      tab: 'workforce',
      definition: 'Employees whose hire date falls in the period. Contractors and interns are not included.',
    },
    rateKpi(
      'attrition',
      'Attrition',
      all,
      sparkRate((g) => g.exits, true),
      'All employee exits in the period ÷ average headcount (mean of month-end snapshots), annualized.',
      'No headcount in this period',
      'exits',
    ),
    rateKpi(
      'voluntary',
      'Voluntary attrition',
      vol,
      sparkRate((g) => g.voluntary, typed),
      'Voluntary exits in the period ÷ average headcount, annualized.',
      'Add Termination type to Employees to see this',
      'voluntary exits',
    ),
    rateKpi(
      'regretted',
      'Regretted attrition',
      reg,
      sparkRate((g) => g.regretted, typed && p.has.regrettable),
      'Voluntary exits marked regrettable ÷ average headcount, annualized.',
      'Add Regrettable to Employees to see this',
      'regretted exits',
    ),
    {
      id: 'first-year',
      label: 'First-year attrition',
      value: fySuppressed ? null : firstYear.rate,
      format: 'pct',
      delta: fySuppressed ? null : fyDelta,
      deltaLabel: vsCompany ? 'vs company' : 'vs a year earlier',
      goodDirection: 'down',
      deltaMaterial: isMaterialGap(fyDelta, fyRef),
      note: `Cohort n = ${firstYear.cohort.toLocaleString('en-US')} hired ${formatDate(addDays(firstYear.from, 1))} to ${formatDate(firstYear.to)}`,
      suppressed: fySuppressed,
      tab: 'attrition',
      definition:
        'Of employees hired 12 to 24 months ago, the share who left within 365 days of their hire date.',
    },
    {
      id: 'promotion-rate',
      label: 'Promotion rate',
      value: promoSuppressed ? null : promo.rate,
      format: 'pct',
      delta: promoSuppressed ? null : promoDelta,
      deltaLabel: compareLabel,
      goodDirection: null,
      deltaMaterial: isMaterialGap(promoDelta, promoRef),
      spark: movement.byQuarter.map((q) => q.rate),
      note: p.has.jobChanges
        ? `${promo.promotions.toLocaleString('en-US')} promotions, every event counted`
        : 'Upload Job changes to see this',
      suppressed: promoSuppressed,
      tab: 'movement',
      definition: 'Promotion events in the period from Job changes ÷ average headcount, annualized.',
    },
  ]

  return {
    kpis,
    vol: vol.own,
    all: all.own,
    regretted: reg.own,
    companyVol: vsCompany ? vol.ref : vol.own.rate,
    firstYear,
    headcount,
    headcountYearAgo,
    hires,
  }
}

/**
 * Overview KPI tiles. Rates compare with the company when an org filter is active ("vs
 * company") and with the prior window otherwise. Delta color uses the earlier HRBP
 * dashboard's materiality floor: |Δ| ≥ 2% of the reference + 0.15 pts.
 *
 * Exit rates are null (never 0) when no Employees row has a termination date: an active-only
 * roster export says nothing about who left.
 */
import type { Kpi } from '@/components/types'
import { type Employee, type JobChange, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { drillSpec } from '@/drill/types'
import { addDays, addMonths, formatDate } from '@/lib/dates'
import { activeAt, attrition, exitsIn, headcountAt, hiresIn, inWindow, type RateResult } from '@/lib/people'
import { type CohortSummary, cohortSummary, firstYearCohort } from './attrition'
import { count, isMaterialGap, NO_HISTORY, NO_LEAVERS, type Prep, priorLabel, quarterBlocks } from './base'
import {
  changesSpec,
  employeesOnSpec,
  firstYearSpec,
  hiresSpec,
  leaversSpec,
  periodName,
  rateNote,
  scopeLine,
  scopePart,
  shareNote,
  titled,
  WORKER_HIDE,
} from './drill'
import { tagKpis } from './drillUses'
import {
  ATTRITION,
  FIRST_YEAR,
  HEADCOUNT,
  HIRES,
  type Lineage,
  PROMOTION_RATE,
  REGRETTED,
  VOLUNTARY,
} from './lineage'
import { type MovementModel, promotionComparison } from './movement'
import { annualRate, exitsByGroup, leftInFirstYear } from './rates'

export { priorLabel } from './base'

export interface KpiModel {
  kpis: Kpi[]
  vol: RateResult
  all: RateResult
  regretted: RateResult
  companyVol: number | null
  firstYear: CohortSummary
  headcount: number
  /** Null when no row has a termination date (the past would count only today's survivors). */
  headcountYearAgo: number | null
  hires: number
  /** The people behind the tiles (each tile's `drill` opens them). */
  records: KpiRecords
}

export interface KpiRecords {
  /** Employees on asOf. */
  active: Employee[]
  hires: Employee[]
  /** Every employee exit in the window; voluntary and regretted are subsets. */
  exits: Employee[]
  voluntary: Employee[]
  regretted: Employee[]
  /** The first-year cohort's leavers (left within 365 days of hire). */
  firstYear: Employee[]
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

const avgText = (avg: number) => Math.round(avg).toLocaleString('en-US')

type ExitKind = 'all' | 'voluntary' | 'regretted'

/** Employee exits of one kind in a window (the events of `attrition`). */
export function exitsOf(emps: readonly Employee[], w: Window, kind: ExitKind): Employee[] {
  return exitsIn(emps, w).filter(
    (e) =>
      kind === 'all' ||
      (e.terminationType === 'Voluntary' && (kind === 'voluntary' || e.regrettable === true)),
  )
}

/** Promotion events in a window. */
const promotionsIn = (changes: readonly JobChange[], w: Window): JobChange[] =>
  changes.filter((c) => c.changeType === 'Promotion' && inWindow(c.effectiveDate, w))

/**
 * The promotions a promotion rate's change compares with: the company's in the same window under
 * an org filter, else this scope's in the comparison window.
 */
export function promotionsComparisonSpec(p: Prep, movement: MovementModel) {
  const vsCompany = !p.ctx.isCompany
  if (vsCompany) {
    const ref = movement.companyPromotions
    return drillSpec({
      kind: 'jobChanges',
      title: titled('Promotions', 'whole company', periodName(p)),
      subtitle: `${p.window.label} · Whole company`,
      rows: promotionsIn(p.companyChanges, p.window),
      note: shareNote(ref.promotions, ['promotion', 'promotions'], ref.avgHeadcount),
    })
  }
  const w = promotionComparison(p).window
  const ref = movement.priorPromotions
  return changesSpec(p, titled('Promotions', 'comparison period'), promotionsIn(p.changes, w), {
    when: w.label,
    note: shareNote(ref.promotions, ['promotion', 'promotions'], ref.avgHeadcount),
  })
}

/** First-year attrition at asOf, null when no row has a termination date. */
export function firstYearSummary(p: Prep, emps = p.emps, asOf = p.asOf): CohortSummary {
  const s = cohortSummary(emps, asOf)
  return p.has.terminationDate ? s : { ...s, rate: null }
}

export function computeKpis(p: Prep, movement: MovementModel): KpiModel {
  const { emps, companyEmps, window, prior, asOf, ctx } = p
  const vsCompany = !ctx.isCompany
  const compareLabel = vsCompany ? 'vs company' : priorLabel(ctx.filters.period, window.months)
  const left = p.has.terminationDate
  const typed = left && p.has.terminationType
  const blocks = quarterBlocks(asOf, 8)
  const qGroups = blocks.map((b) => exitsByGroup(emps, b, () => 'all').get('all'))

  const yearAgo = addDays(p.t12.start, -1)
  const active = activeAt(emps, asOf)
  const headcount = active.length
  const headcountYearAgo = left ? headcountAt(emps, yearAgo) : null
  const hireList = hiresIn(emps, window)
  const hires = hireList.length
  const priorHires = hiresIn(emps, prior).length
  const exits = exitsIn(emps, window)
  const voluntaryExits = exits.filter((e) => e.terminationType === 'Voluntary')
  const records: KpiRecords = {
    active,
    hires: hireList,
    exits,
    voluntary: voluntaryExits,
    regretted: voluntaryExits.filter((e) => e.regrettable === true),
    firstYear: firstYearCohort(emps, asOf).filter(leftInFirstYear),
  }
  const period = periodName(p)
  const scope = scopePart(p)

  // What a delta compares with: the company over the same window, or this scope's prior window.
  const cmp = vsCompany
    ? { emps: companyEmps, window, part: 'whole company', subtitle: `${window.label} · Whole company` }
    : { emps, window: prior, part: 'prior period', subtitle: scopeLine(p, prior.label) }

  const rate = (kind: ExitKind) => {
    const own = attrition(emps, window, kind)
    const ok = kind === 'all' ? left : typed && (kind !== 'regretted' || p.has.regrettable)
    const value = ok ? own.rate : null
    const refResult = attrition(cmp.emps, cmp.window, kind)
    return { own: { ...own, rate: value }, ref: ok ? refResult.rate : null, refResult, kind }
  }
  const all = rate('all')
  const vol = rate('voluntary')
  const reg = rate('regretted')

  const rateKpi = (
    id: string,
    label: string,
    r: { own: RateResult; ref: number | null; refResult: RateResult; kind: ExitKind },
    spark: (number | null)[],
    definition: string,
    missing: string,
    noun: [string, string],
    leavers: { title: string; rows: Employee[] },
    lineage: Lineage,
  ): Kpi => {
    const suppressed = r.own.avgHeadcount > 0 && r.own.avgHeadcount < MIN_GROUP
    const value = suppressed ? null : r.own.rate
    const delta = value != null && r.ref != null ? value - r.ref : null
    // The leavers in the rate's numerator; nothing behind a hidden or missing rate.
    const drill =
      value == null
        ? undefined
        : () =>
            leaversSpec(p, titled(leavers.title, scope, period), leavers.rows, {
              note: rateNote(r.own.events, noun, r.own.avgHeadcount, window.months),
            })
    return {
      drill,
      // The comparison's leavers: the company's in the same window, or the prior window's.
      deltaDrill:
        delta == null
          ? undefined
          : () =>
              leaversSpec(p, titled(leavers.title, cmp.part), exitsOf(cmp.emps, cmp.window, r.kind), {
                subtitle: cmp.subtitle,
                note: rateNote(r.refResult.events, noun, r.refResult.avgHeadcount, cmp.window.months),
              }),
      // "57 exits over an average headcount of 304": the 57 exits.
      noteDrill: drill,
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
          ? left
            ? missing
            : NO_LEAVERS
          : `${count(r.own.events, noun[0], noun[1])} over an average headcount of ${avgText(r.own.avgHeadcount)}, annualized`,
      suppressed,
      tab: 'attrition',
      definition,
      uses: p.uses(lineage),
    }
  }

  const sparkRate = (pick: (g: NonNullable<(typeof qGroups)[number]>) => number, enabled: boolean) =>
    qGroups.map((g, i) => (enabled && g ? annualRate(pick(g), g.avgHeadcount, blocks[i]) : null))

  // The cohort is defined on the as-of date, not on the window: compare with the cohort a year
  // earlier in every period (the prior window of a 3-month period is only 3 months back).
  const firstYear = firstYearSummary(p)
  const fyRefEmps = vsCompany ? companyEmps : emps
  const fyRefAsOf = vsCompany ? asOf : addMonths(asOf, -12)
  const fyRef = firstYearSummary(p, fyRefEmps, fyRefAsOf).rate
  const fySuppressed = firstYear.cohort > 0 && firstYear.cohort < MIN_GROUP
  const fyDelta = firstYear.rate != null && fyRef != null ? firstYear.rate - fyRef : null

  const promo = movement.promotions
  const promoRef = vsCompany ? movement.companyPromotions.rate : movement.priorPromotions.rate
  const promoDelta = promo.rate != null && promoRef != null ? promo.rate - promoRef : null
  const promoSuppressed = promo.avgHeadcount > 0 && promo.avgHeadcount < MIN_GROUP

  const contingent = p.people.filter(
    (e) =>
      e.employmentType !== 'Employee' &&
      e.hireDate <= asOf &&
      (!e.terminationDate || e.terminationDate > asOf),
  )

  const kpis: Kpi[] = [
    {
      id: 'headcount',
      label: 'Headcount',
      value: headcount,
      format: 'int',
      delta: headcountYearAgo == null ? null : headcount - headcountYearAgo,
      deltaLabel: 'vs 12 months earlier',
      goodDirection: null,
      spark: left ? blocks.map((b) => headcountAt(emps, b.end)) : undefined,
      note: !left
        ? NO_HISTORY
        : contingent.length
          ? contingent.length === 1
            ? 'Plus 1 contractor or intern'
            : `Plus ${contingent.length.toLocaleString('en-US')} contractors and interns`
          : undefined,
      tab: 'workforce',
      definition: `Employees active on ${formatDate(asOf)}. Contractors and interns are counted separately.`,
      drill: () => employeesOnSpec(p, asOf, { rows: active }),
      deltaDrill:
        headcountYearAgo == null
          ? undefined
          : () =>
              employeesOnSpec(p, yearAgo, {
                note: `Employees active 12 months earlier, shown with their current record. The comparison for the ${count(headcount, 'employee', 'employees')} on ${formatDate(asOf)}.`,
              }),
      noteDrill:
        left && contingent.length
          ? () =>
              drillSpec({
                kind: 'employees',
                title: titled('Contractors and interns', scope),
                subtitle: scopeLine(p, `As of ${formatDate(asOf)}`),
                rows: contingent,
                hide: WORKER_HIDE,
                note: 'Active contractors and interns. Headcount counts employees only.',
              })
          : undefined,
      uses: p.uses(HEADCOUNT),
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
      note: `Started ${window.label}`,
      tab: 'workforce',
      definition:
        'Employees who started in the period (hire date in the Employees data). Contractors and interns are not included. Recruiting counts offers accepted by the accept date instead, so the two numbers can differ.',
      drill: () => hiresSpec(p, titled('Hires', scope, period), hireList),
      deltaDrill: priorHires
        ? () =>
            hiresSpec(p, titled('Hires', scope, 'prior period'), hiresIn(emps, prior), { when: prior.label })
        : undefined,
      uses: p.uses(HIRES),
    },
    rateKpi(
      'attrition',
      'Attrition',
      all,
      sparkRate((g) => g.exits, left),
      'All employee exits in the period ÷ average headcount (mean of month-end snapshots), annualized.',
      'No headcount in this period',
      ['exit', 'exits'],
      { title: 'Leavers', rows: records.exits },
      ATTRITION,
    ),
    rateKpi(
      'voluntary',
      'Voluntary attrition',
      vol,
      sparkRate((g) => g.voluntary, typed),
      'Voluntary exits in the period ÷ average headcount, annualized.',
      'Add Termination type to Employees to see this',
      ['voluntary exit', 'voluntary exits'],
      { title: 'Voluntary leavers', rows: records.voluntary },
      VOLUNTARY,
    ),
    rateKpi(
      'regretted',
      'Regretted attrition',
      reg,
      sparkRate((g) => g.regretted, typed && p.has.regrettable),
      'Voluntary exits marked regrettable ÷ average headcount, annualized.',
      'Add Regrettable to Employees to see this',
      ['regretted exit', 'regretted exits'],
      { title: 'Regretted leavers', rows: records.regretted },
      REGRETTED,
    ),
    {
      id: 'first-year',
      label: 'First-year attrition',
      drill:
        fySuppressed || firstYear.rate == null
          ? undefined
          : () =>
              firstYearSpec(p, titled('Left within their first year', scope), records.firstYear, {
                size: firstYear.cohort,
                from: addDays(firstYear.from, 1),
                to: firstYear.to,
              }),
      deltaDrill:
        fySuppressed || fyDelta == null
          ? undefined
          : () => {
              const s = firstYearSummary(p, fyRefEmps, fyRefAsOf)
              return firstYearSpec(
                p,
                titled('Left within their first year', vsCompany ? 'whole company' : 'a year earlier'),
                firstYearCohort(fyRefEmps, fyRefAsOf).filter(leftInFirstYear),
                { size: s.cohort, from: addDays(s.from, 1), to: s.to },
                vsCompany ? 'Whole company' : ctx.scopeLabel,
              )
            },
      // "Cohort n = 270 hired ...": the whole cohort, with who left within their first year.
      noteDrill:
        fySuppressed || firstYear.rate == null || !firstYear.cohort
          ? undefined
          : () =>
              drillSpec({
                kind: 'employees',
                title: titled('Hired 12 to 24 months ago', scope),
                subtitle: `Hired ${formatDate(addDays(firstYear.from, 1))} to ${formatDate(firstYear.to)} · ${ctx.scopeLabel}`,
                rows: firstYearCohort(emps, asOf),
                hide: ['employmentType'],
                note: `${count(firstYear.leavers, 'person', 'people')} of these ${count(firstYear.cohort, 'employee', 'employees')} left within 365 days of their hire date.`,
                extra: {
                  columns: [{ key: 'leftFirstYear', label: 'Left within first year' }],
                  values: (e) => ({ leftFirstYear: leftInFirstYear(e) ? 'Yes' : 'No' }),
                },
              }),
      value: fySuppressed ? null : firstYear.rate,
      format: 'pct',
      delta: fySuppressed ? null : fyDelta,
      deltaLabel: vsCompany ? 'vs company' : 'vs a year earlier',
      goodDirection: 'down',
      deltaMaterial: isMaterialGap(fyDelta, fyRef),
      note: left
        ? `Cohort n = ${firstYear.cohort.toLocaleString('en-US')} hired ${formatDate(addDays(firstYear.from, 1))} to ${formatDate(firstYear.to)}`
        : NO_LEAVERS,
      suppressed: fySuppressed,
      tab: 'attrition',
      definition:
        'Of employees hired 12 to 24 months ago, the share who left within 365 days of their hire date.',
      uses: p.uses(FIRST_YEAR),
    },
    {
      id: 'promotion-rate',
      label: 'Promotion rate',
      drill:
        promoSuppressed || promo.rate == null
          ? undefined
          : () =>
              changesSpec(p, titled('Promotions', scope, period), movement.records.promotions, {
                note: shareNote(promo.promotions, ['promotion', 'promotions'], promo.avgHeadcount),
              }),
      deltaDrill:
        promoSuppressed || promoDelta == null ? undefined : () => promotionsComparisonSpec(p, movement),
      noteDrill:
        promoSuppressed || promo.rate == null || !promo.promotions
          ? undefined
          : () =>
              changesSpec(p, titled('Promotions', scope, period), movement.records.promotions, {
                note: shareNote(promo.promotions, ['promotion', 'promotions'], promo.avgHeadcount),
              }),
      value: promoSuppressed ? null : promo.rate,
      format: 'pct',
      delta: promoSuppressed ? null : promoDelta,
      deltaLabel: vsCompany ? 'vs company' : movement.priorLabel,
      goodDirection: null,
      deltaMaterial: isMaterialGap(promoDelta, promoRef),
      spark: movement.byQuarter.map((q) => q.rate),
      note: p.has.jobChanges
        ? `${count(promo.promotions, 'promotion', 'promotions')} over an average headcount of ${avgText(promo.avgHeadcount)}`
        : 'Upload Job changes to see this',
      suppressed: promoSuppressed,
      tab: 'movement',
      definition:
        'Promotion events in the period from Job changes ÷ average headcount. Not annualized, because promotions come in cycles.',
      uses: p.uses(PROMOTION_RATE),
    },
  ]

  return {
    kpis: tagKpis(kpis),
    vol: vol.own,
    all: all.own,
    regretted: reg.own,
    companyVol: vsCompany ? vol.ref : vol.own.rate,
    firstYear,
    headcount,
    headcountYearAgo,
    hires,
    records,
  }
}

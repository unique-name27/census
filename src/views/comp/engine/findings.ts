/**
 * The Compensation readout: findings a comp partner would raise with a leader, most severe first.
 * Counts and ratios always; dollar amounts only when pay amounts are switched on. Pure.
 *
 * Data standard: a finding's `uses` are what it actually says. A secondary clause or segment that
 * reads fields below the standard (pay as an exit reason, recent promotions) is left out and said
 * so, rather than hiding a finding whose headline number meets the standard.
 */
import type { Finding, FindingPerson, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Employee } from '@/data/schema'
import { levelIndex } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { type Dimension, decomposeRate } from '@/lib/decompose'
import { fmt } from '@/lib/format'
import { exitsIn } from '@/views/hrbp/engine/population'
import { peopleStatsAttrition, peopleStatsCounts } from '@/views/hrbp/engine/settings'
import { M } from '../metrics'
import { overBudgetSeverity } from './cycle'
import {
  compaGroupDrill,
  differentiationDrill,
  exceptionsDrill,
  HIDE_POSITION,
  inBandOf,
  marketDrill,
  outsideDrill,
  peopleDrill,
  scopeLine,
  spendDrill,
  X_HIRED,
  X_TENURE,
} from './drill'
import { filtered } from './groupFilter'
import { safeMedian, values } from './groups'
import {
  BY,
  COMPA,
  dimUses,
  FX,
  jobUses,
  MARKET,
  MARKET_VS_MID,
  MERIT,
  type Meets,
  meetsFor,
  PAY_REASON,
  POSITION,
  RATING,
  refs,
  VOLUNTARY_ATTRITION,
} from './lineage'
import type { CompModel } from './model'
import type { CompPerson } from './population'
import { defaultRules, lowCompaAt, marketFlag } from './rules'
import {
  isAre,
  joinAnd,
  levelSpan,
  people as peopleText,
  pts2,
  sentence,
  settingPct,
  windowPhrase,
} from './text'

/*
 * Every threshold here is a setting in the metric dictionary, read through `m.rules`: the low
 * compa-ratio threshold and attrition escalation ('comp.compa.lowGroup'), when below minimum is
 * critical ('comp.position.belowMin'), compression ('comp.compression.gap'), the over-budget flags
 * ('comp.merit.overBudget'), the guideline rules ('comp.merit.exceptions'), below market
 * ('comp.market.belowMarket'), differentiation ('comp.merit.differentiation') and the good-news
 * share in the band ('comp.compa.inBand'). Each finding links to its metric with `metricId`.
 */

/**
 * At or below the low compa-ratio threshold, judged at the precision people read (two decimals),
 * so a bar labeled 0.92 is flagged at a 0.92 threshold.
 */
export const isLowCompa = (
  median: number | null | undefined,
  threshold = defaultRules().lowCompa.threshold,
): boolean => lowCompaAt(median, threshold)
const PAY_REASONS = new Set(['Base salary', 'Equity, bonus or total rewards'])

export type FindingsInput = Omit<CompModel, 'kpis' | 'findings' | 'uses'>

interface Ranked extends Finding {
  /** People affected, for ordering within a severity. */
  weight: number
}

const person = (p: CompPerson, note: string): FindingPerson => ({ id: p.id, name: p.name, note })
const ratio = (v: number | null) => fmt(v, 'ratio')
const pct2 = (v: number | null | undefined) => fmt(v, 'pct2')
const times = (v: number | null | undefined) => fmt(v, 'times')
/** "5.4% of 1,450", or nothing when the base is under the anonymity minimum. */
const shareOf = (n: number, of: number, min: number) =>
  of >= min ? `${fmt(n / of, 'pct')} of ${fmt(of, 'int')}` : ''

/* ───────── low compa-ratio by location or department ───────── */

function lowCompa(ctx: AnalyticsContext, m: FindingsInput, meets: Meets): Ranked[] {
  const out: Ranked[] = []
  const r = m.rules
  const min = r.minGroup
  const isLow = (median: number | null | undefined) => lowCompaAt(median, r.lowCompa.threshold)
  const dims: { key: 'location' | 'department'; rows: typeof m.overview.byLocation }[] = [
    { key: 'location', rows: m.overview.byLocation },
    { key: 'department', rows: m.overview.byDepartment },
  ]
  // Voluntary attrition as People stats measures it (its population and annualizing settings), so
  // the readout quotes the number People stats shows.
  const companyVol = peopleStatsAttrition(ctx.metrics, ctx.all.employees, ctx.window, 'voluntary')
  const counts = peopleStatsCounts(ctx.metrics)
  // Attrition, pay as the exit reason and range minimums are side clauses: each is said only when
  // its fields meet the data standard, so the compa-ratio finding never hides because of them.
  const attritionOk = meets(VOLUNTARY_ATTRITION)
  const reasonOk = meets(PAY_REASON)
  const positionOk = meets(POSITION)
  const flaggedLocations = new Set<string>()
  for (const { key, rows } of dims) {
    for (const g of rows) {
      if (!isLow(g.median) || g.group.startsWith('Other (')) continue
      const inGroup = (p: { location: string; department: string }) => p[key] === g.group
      if (key === 'location') flaggedLocations.add(g.group)
      else if (flaggedLocations.size) {
        // A department whose low pay sits entirely in an already-flagged location adds nothing.
        const elsewhere = values(
          m.pop.people.filter((p) => inGroup(p) && !flaggedLocations.has(p.location)),
          (p) => p.compa,
        )
        if (!isLow(safeMedian(elsewhere, min))) continue
      }
      const rest = values(
        m.company.people.filter((p) => !inGroup(p)),
        (p) => p.compa,
      )
      const restMedian = safeMedian(rest, min)
      if (restMedian == null) continue
      const emps = ctx.data.employees.filter((e: Employee) => e[key] === g.group)
      const vol = peopleStatsAttrition(ctx.metrics, emps, ctx.window, 'voluntary')
      const payExits = exitsIn(emps, ctx.window, counts).filter(
        (e) =>
          e.terminationType === 'Voluntary' && e.terminationReason && PAY_REASONS.has(e.terminationReason),
      ).length
      const comparable = attritionOk && vol.rate != null && companyVol.rate != null && vol.avgHeadcount >= min
      const linked = comparable && vol.rate! > companyVol.rate!
      const sentences: string[] = []
      if (linked) {
        // Below the standard the reasons are not read at all, so the note does not depend on them.
        const reasons = !reasonOk
          ? ` (exit reasons not shown: ${m.belowStandard.toLowerCase()})`
          : payExits > 0
            ? `, and ${payExits} of ${vol.events} leavers named pay as the reason`
            : ''
        sentences.push(
          `Voluntary attrition there is ${fmt(vol.rate, 'pct')} vs ${fmt(companyVol.rate, 'pct')} for the company over ${windowPhrase(ctx.filters.period)}${reasons}.`,
        )
      } else if (comparable) {
        const side = vol.rate! < companyVol.rate! ? 'below' : 'level with'
        sentences.push(
          `Voluntary attrition there is ${fmt(vol.rate, 'pct')} over ${windowPhrase(ctx.filters.period)}, ${side} the company's ${fmt(companyVol.rate, 'pct')}.`,
        )
      }
      const low = m.pop.people
        .filter((p) => inGroup(p) && p.compa != null && p.compa < m.settings.bandLow)
        .sort((a, b) => a.compa! - b.compa!)
      // A department is judged without the locations already flagged, so it reads location too.
      const excludes = key === 'department' && flaggedLocations.size > 0
      if (low.length) {
        const under =
          g.belowMin > 0 && positionOk ? `, ${fmt(g.belowMin, 'int')} of them below range minimum` : ''
        sentences.push(
          `${peopleText(low.length)} there ${isAre(low.length)} paid below the healthy band of ${ratio(m.settings.bandLow)}${under}.`,
        )
      }
      out.push({
        id: `comp-low-compa-${key}-${g.group}`,
        metricId: M.lowCompa,
        severity:
          linked && vol.rate! - companyVol.rate! >= r.lowCompa.attritionGap
            ? 'critical'
            : ('warning' as Severity),
        title: `Median compa-ratio in ${g.group} is ${ratio(g.median)} vs ${ratio(restMedian)} for the rest of the company`,
        detail: sentences.slice(0, 2).join(' '),
        action: `Review ${g.group} salary ranges and pay positioning before merit proposals are final.`,
        filter: { [key]: [g.group] } as Partial<Filters>,
        tab: 'ranges',
        people: low.map((p) => person(p, `compa-ratio ${ratio(p.compa)}`)),
        drill: () => compaGroupDrill(m, g, 'measured'),
        uses: refs(
          COMPA,
          BY[key],
          excludes && BY.location,
          comparable && VOLUNTARY_ATTRITION,
          linked && payExits > 0 && reasonOk && PAY_REASON,
          low.length > 0 && g.belowMin > 0 && positionOk && POSITION,
        ),
        weight: g.n,
      })
    }
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 2)
}

/* ───────── below minimum ───────── */

const PROMOTED = 'Promoted in the last 12 months'

function concentration(
  people: readonly CompPerson[],
  affected: (p: CompPerson) => boolean,
  dims: Dimension<CompPerson>[],
  min: number,
): { dim: string; value: string; affected: number }[] {
  const segs = decomposeRate(people, dims, affected, { minDev: 0.02, top: 8, minPopulation: min })
  const seen = new Set<string>()
  const out: { dim: string; value: string; affected: number }[] = []
  for (const s of segs) {
    if (seen.has(s.dim) || s.small) continue
    seen.add(s.dim)
    out.push({ dim: s.dim, value: s.value, affected: s.affected })
  }
  return out
}

const ORG_DIMS: Dimension<CompPerson>[] = [
  { key: 'location', label: 'Location', get: (p) => p.location },
  { key: 'department', label: 'Department', get: (p) => p.department },
  { key: 'businessUnit', label: 'Business unit', get: (p) => p.businessUnit },
  { key: 'level', label: 'Level', get: (p) => p.level },
]

/** "were promoted in the last 12 months", "are at L3", "is in Bengaluru" */
function segmentVerb(dim: string, value: string, n: number): string {
  if (dim === 'promoted') return `${n === 1 ? 'was' : 'were'} promoted in the last 12 months`
  return `${isAre(n)} ${dim === 'level' ? 'at' : 'in'} ${value}`
}

interface Seg {
  dim: string
  value: string
  get: (p: CompPerson) => string | null | undefined
}

/**
 * Where the affected people sit, as exclusive counts that add up: the first segment, then the
 * second one among everyone else ("41 are in Bengaluru, and 35 of the other 37 were promoted in
 * the last 12 months"). Overlapping counts joined with "and" would add up to more than the total.
 */
export function exclusivePhrase(affected: readonly CompPerson[], first: Seg, second?: Seg): string {
  const inFirst = affected.filter((p) => first.get(p) === first.value)
  let text = `${fmt(inFirst.length, 'int')} ${segmentVerb(first.dim, first.value, inFirst.length)}`
  if (second) {
    const others = affected.filter((p) => first.get(p) !== first.value)
    const n = others.filter((p) => second.get(p) === second.value).length
    if (n > 0 && others.length > 0) {
      const lead =
        n === others.length
          ? `the other ${fmt(n, 'int')}`
          : `${fmt(n, 'int')} of the other ${fmt(others.length, 'int')}`
      text += `, and ${lead} ${segmentVerb(second.dim, second.value, n)}`
    }
  }
  return `${text}.`
}

const FILTER_KEYS = new Set(['location', 'department', 'businessUnit', 'level'])

const PROMOTED_DIM: Dimension<CompPerson> = {
  key: 'promoted',
  label: PROMOTED,
  get: (p) => (p.promotedRecently ? 'Yes' : 'No'),
}

function belowMin(m: FindingsInput, meets: Meets, promotionsLoaded: boolean): Ranked[] {
  const rows = m.ranges.below
  if (!rows.length) return []
  const r = m.rules
  const min = r.minGroup
  const placed = m.pop.people.filter((p) => p.position != null)
  const affected = placed.filter((p) => p.position === 'Below minimum')
  const share = rows.length / placed.length
  // Segments whose fields are below the data standard are not named.
  const allDims = [...ORG_DIMS, PROMOTED_DIM]
  const dims = allDims.filter((d) => meets(dimUses(d.key)))
  const getOf = new Map(dims.map((d) => [d.key, d.get]))
  const segs = concentration(placed, (p) => p.position === 'Below minimum', dims, min).filter(
    (s) => s.dim !== 'promoted' || s.value === 'Yes',
  )
  // Lead with where it sits (a filter the reader can apply), then the promotions among the rest.
  const orgSegs = segs.filter((s) => s.dim !== 'promoted')
  const promo = segs.find((s) => s.dim === 'promoted')
  const first = orgSegs[0] ?? promo
  const second = first && first !== promo ? (promo ?? orgSegs[1]) : undefined
  const seg = (s: { dim: string; value: string }): Seg => ({ ...s, get: getOf.get(s.dim)! })
  const sentences: string[] = []
  if (first) sentences.push(exclusivePhrase(affected, seg(first), second && seg(second)))
  // Job changes below the standard are not read, and the finding says so whatever they hold.
  if (promotionsLoaded && !dims.includes(PROMOTED_DIM))
    sentences.push(`Recent promotions not shown: ${m.belowStandard.toLowerCase()}.`)
  const costed = m.showPay && m.ranges.costToMin.usd > 0 && meets(FX)
  if (costed) {
    const skipped = m.ranges.costToMin.skipped
    sentences.push(
      `Bringing them to minimum costs ${fmt(m.ranges.costToMin.usd, 'money')} a year${skipped ? ` (${peopleText(skipped)} without an FX rate left out)` : ''}.`,
    )
  }
  const promotedLed = !!promo && (first === promo || second === promo)
  const where = [first, second].find((s) => s && FILTER_KEYS.has(s.dim))
  const byId = new Map(m.pop.people.map((p) => [p.id, p]))
  return [
    {
      id: 'comp-below-min',
      metricId: M.belowMin,
      severity:
        placed.length >= min && share >= r.belowMin.criticalShare && rows.length >= r.belowMin.criticalCount
          ? 'critical'
          : rows.length >= min
            ? 'warning'
            : 'info',
      title: `${peopleText(rows.length)} ${isAre(rows.length)} paid below range minimum${placed.length >= min ? `, ${shareOf(rows.length, placed.length, min)}` : ''}`,
      detail: sentences.join(' '),
      action: promotedLed
        ? 'Check that promotion increases reach the new range minimum, then plan the rest into the focal cycle.'
        : 'Plan adjustments to range minimum into the focal cycle, starting with the largest gaps.',
      filter: where ? ({ [where.dim]: [where.value] } as Partial<Filters>) : undefined,
      tab: 'ranges',
      people: rows.map((r) => person(byId.get(r.id)!, `${r.department}, ${fmt(r.gapPct, 'pct')} to minimum`)),
      drill: () =>
        outsideDrill(
          m,
          'below',
          rows.map((r) => r.person),
          'Below range minimum',
          placed.length >= min
            ? `Rate = ${fmt(rows.length, 'int')} below minimum ÷ ${fmt(placed.length, 'int')} people with a salary range.`
            : undefined,
        ),
      // Each person is listed with their department.
      uses: refs(POSITION, BY.department, dimUses(first?.dim), dimUses(second?.dim), costed && FX),
      weight: rows.length,
    },
  ]
}

/* ───────── above maximum ───────── */

/**
 * The highest half-year tenure that at least 95% of a group has reached, so one recent arrival
 * doesn't define a long-tenured group.
 */
export function tenureFloor(tenures: readonly number[]): number {
  if (!tenures.length) return 0
  const need = Math.ceil(tenures.length * 0.95)
  for (let t = Math.floor(Math.max(...tenures) * 2) / 2; t > 0; t -= 0.5)
    if (tenures.filter((x) => x >= t).length >= need) return t
  return 0
}

function aboveMax(m: FindingsInput): Ranked[] {
  const rows = m.ranges.above
  const min = m.rules.minGroup
  if (rows.length < min) return []
  const placed = m.pop.people.filter((p) => p.position != null)
  const above = placed.filter((p) => p.position === 'Above maximum')
  const segs = concentration(
    placed,
    (p) => p.position === 'Above maximum',
    [
      { key: 'level', label: 'Level', get: (p) => p.level },
      { key: 'tenureBand', label: 'Tenure', get: (p) => p.tenureBand },
      { key: 'department', label: 'Department', get: (p) => p.department },
    ],
    min,
  )
  const lvl = segs.find((s) => s.dim === 'level')
  const ofAll = shareOf(rows.length, placed.length, min)
  let title = `${peopleText(rows.length)} ${isAre(rows.length)} paid above range maximum, ${ofAll}`
  let detail = ''
  let action = 'Review whether lump-sum awards should replace base increases for people above maximum.'
  const ledByLevel = !!lvl && lvl.affected >= rows.length / 2
  if (lvl && ledByLevel) {
    const inLevel = above.filter((p) => p.level === lvl.value)
    const levelN = placed.filter((p) => p.level === lvl.value).length
    title = `${peopleText(rows.length)} ${isAre(rows.length)} paid above range maximum, ${lvl.affected === rows.length ? 'all' : fmt(lvl.affected, 'int')} of them at ${lvl.value}`
    const floor = tenureFloor(inLevel.map((p) => p.tenure))
    const long = inLevel.filter((p) => p.tenure >= floor).length
    const tenure =
      floor >= 3
        ? `${fmt(long, 'int')} of those ${lvl.value}s have ${fmt(floor, 'num1')} or more years of tenure, and `
        : ''
    // The level is a decomposeRate segment, so it has at least the anonymity minimum of people.
    detail = `${tenure}${fmt(lvl.affected / levelN, 'pct')} of everyone at ${lvl.value} is above maximum.`
    action =
      floor >= 3
        ? `Review promotion readiness for the long-tenured ${lvl.value}s, and use lump-sum awards instead of base increases where they stay.`
        : `Review promotion readiness at ${lvl.value}, and use lump-sum awards instead of base increases where people stay.`
  }
  return [
    {
      id: 'comp-above-max',
      metricId: M.aboveMax,
      severity: 'warning',
      title,
      detail,
      action,
      filter: lvl && ledByLevel ? { level: [lvl.value] } : undefined,
      tab: 'ranges',
      people: rows.map((r) => ({
        id: r.id,
        name: r.name,
        note: `${r.level}, ${fmt(r.tenure, 'years')}, ${fmt(r.gapPct, 'pct')} over maximum`,
      })),
      drill: () =>
        outsideDrill(
          m,
          'above',
          rows.map((r) => r.person),
          'Above range maximum',
          `Rate = ${fmt(rows.length, 'int')} above maximum ÷ ${fmt(placed.length, 'int')} people with a salary range.`,
        ),
      // Each person is listed with their level and tenure.
      uses: refs(POSITION, BY.level, BY.tenureBand),
      weight: rows.length,
    },
  ]
}

/* ───────── compression ───────── */

function compressionFindings(m: FindingsInput): Ranked[] {
  const { findingMin, gap } = m.rules.compression
  const min = m.rules.minGroup
  const flagged = m.ranges.compression.filter((c) => c.flagged)
  const byDept = new Map<string, string[]>()
  for (const c of flagged) byDept.set(c.department, [...(byDept.get(c.department) ?? []), c.level])
  for (const levels of byDept.values()) levels.sort((a, b) => levelIndex(a) - levelIndex(b))
  const out: Ranked[] = []
  for (const [dept, levels] of byDept) {
    const cell = m.pop.people.filter((p) => p.department === dept && p.level && levels.includes(p.level))
    const hires = cell.filter((p) => p.hiredRecently)
    const inc = cell.filter((p) => !p.hiredRecently)
    const newMed = safeMedian(
      values(hires, (p) => p.compa),
      min,
    )
    const incMed = safeMedian(
      values(inc, (p) => p.compa),
      min,
    )
    if (hires.length < findingMin || inc.length < findingMin) continue
    if (newMed == null || incMed == null || newMed - incMed < gap - 1e-9) continue
    const span = levelSpan(levels)
    const behind = inc.filter((p) => p.compa != null && p.compa < newMed).sort((a, b) => a.compa! - b.compa!)
    out.push({
      id: `comp-compression-${dept}`,
      metricId: M.compression,
      severity: 'warning',
      title: `New hires in ${dept} ${span} are paid at a median compa-ratio of ${ratio(newMed)} vs ${ratio(incMed)} for incumbents`,
      detail: `${peopleText(hires.length)} hired in the last 12 months against ${fmt(inc.length, 'int')} already in those roles, ${fmt(behind.length, 'int')} of whom ${behind.length === 1 ? 'is' : 'are'} paid below the new-hire median.`,
      action: `Review incumbent pay in ${dept} before the focal cycle so it keeps pace with new offers.`,
      filter: { department: [dept], level: levels },
      tab: 'ranges',
      people: behind.map((p) => person(p, `${p.level}, compa-ratio ${ratio(p.compa)}`)),
      // The department and its levels: "Filter to" them shows the same cells and medians.
      drill: () =>
        filtered(
          peopleDrill({
            title: `New hires and incumbents, ${dept} ${span}`,
            subtitle: scopeLine(m),
            people: [...hires, ...inc].filter((p) => p.compa != null),
            extras: [X_HIRED, X_TENURE],
            hide: HIDE_POSITION,
            sort: (a, b) =>
              Number(b.hiredRecently) - Number(a.hiredRecently) || (a.compa ?? 0) - (b.compa ?? 0),
            note: `Median compa-ratio ${ratio(newMed)} for ${peopleText(hires.length)} hired in the last 12 months vs ${ratio(incMed)} for ${fmt(inc.length, 'int')} incumbents.`,
          }),
          { department: [dept], level: levels },
        ),
      uses: refs(COMPA, BY.department, BY.level, BY.tenureBand),
      weight: cell.length,
    })
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 2)
}

/* ───────── merit spend ───────── */

function overBudget(m: FindingsInput): Ranked[] {
  const out: Ranked[] = []
  const company = m.cycle.spend
  const { flag, critical } = m.rules.overBudget
  const over = (delta: number | null): delta is number => delta != null && delta >= flag
  for (const r of m.cycle.byBu) {
    if (!over(r.delta) || r.group.startsWith('Other (') || m.cycle.byBu.length < 2) continue
    const money =
      m.showPay && r.overUsd != null && r.overUsd > 0
        ? ` That is ${fmt(r.overUsd, 'money')} over budget.`
        : ''
    out.push({
      id: `comp-over-budget-${r.group}`,
      metricId: M.overBudget,
      severity: overBudgetSeverity(r.delta, critical),
      title: `${r.group} merit proposals cost ${pct2(r.spendPct)} of eligible base, ${pts2(r.delta).replace('+', '')} over the ${pct2(m.settings.meritBudget)} budget`,
      detail: `Across ${m.isCompany ? 'the company' : 'this scope'} spend is ${pct2(company.spendPct)} over ${fmt(company.eligible, 'int')} proposals.${money}`,
      action: `Ask ${r.group} leaders to bring proposals back to budget before calibration closes.`,
      filter: { businessUnit: [r.group] },
      tab: 'cycle',
      drill: () => spendDrill(m, r, 'priced'),
      uses: refs(MERIT, FX, BY.businessUnit),
      weight: r.n,
    })
  }
  if (over(company.delta) && company.priced >= m.rules.minGroup) {
    const money =
      m.showPay && company.overUsd != null && company.overUsd > 0
        ? ` That is ${fmt(company.overUsd, 'money')} over budget.`
        : ''
    out.push({
      id: 'comp-over-budget-total',
      metricId: M.overBudget,
      severity: overBudgetSeverity(company.delta, critical),
      title: `Merit proposals cost ${pct2(company.spendPct)} of eligible base, ${pts2(company.delta).replace('+', '')} over the ${pct2(m.settings.meritBudget)} budget`,
      detail: `${fmt(company.eligible, 'int')} proposals in ${m.isCompany ? 'the company' : 'this scope'}.${money}`,
      action: 'Agree where to bring proposals back to budget before calibration closes.',
      tab: 'cycle',
      drill: () => spendDrill(m, { ...company, group: null }, 'priced'),
      uses: refs(MERIT, FX),
      weight: company.eligible,
    })
  }
  return out
}

/* ───────── guideline exceptions ───────── */

function exceptions(m: FindingsInput, explained: ReadonlySet<string>): Ranked[] {
  const rows = m.cycle.exceptions
  const topLow = rows.filter((r) => r.kind === 'top-low')
  const lowHigh = rows.filter((r) => r.kind === 'low-high')
  const outliers = rows.filter((r) => r.kind === 'outlier')
  const rules = topLow.length + lowHigh.length
  if (!rules && !outliers.length) return []
  const x = m.rules.exceptions
  const parts: string[] = []
  if (topLow.length) parts.push(`${fmt(topLow.length, 'int')} rated 5 below ${settingPct(x.topRatingFloor)}`)
  if (lowHigh.length)
    parts.push(`${fmt(lowHigh.length, 'int')} rated 1-2 above ${settingPct(x.lowRatingCap)}`)
  let detail = ''
  let namesDept = false
  if (outliers.length) {
    const byDept = new Map<string, number>()
    for (const o of outliers) byDept.set(o.department, (byDept.get(o.department) ?? 0) + 1)
    const [dept, n] = [...byDept.entries()].sort((a, b) => b[1] - a[1])[0]
    // A department with no differentiation produces outliers at both ends; its finding counts them.
    const concentrated = n >= outliers.length / 2 && !explained.has(dept)
    namesDept = concentrated || (!rules && outliers.length === 1)
    if (rules) {
      const where = concentrated ? `, ${fmt(n, 'int')} of them in ${dept}` : ''
      detail = `Another ${fmt(outliers.length, 'int')} ${outliers.length === 1 ? 'proposal is' : 'proposals are'} unusual for the rating${where}.`
    } else if (outliers.length === 1) detail = `It is in ${dept}.`
    else if (concentrated) detail = `${fmt(n, 'int')} of them are in ${dept}.`
  }
  const title = rules
    ? `${fmt(rules, 'int')} merit ${rules === 1 ? 'proposal breaks' : 'proposals break'} the guideline rules: ${joinAnd(parts)}`
    : `${fmt(outliers.length, 'int')} merit ${outliers.length === 1 ? 'proposal is' : 'proposals are'} unusual for the rating`
  return [
    {
      id: 'comp-exceptions',
      metricId: M.exceptions,
      severity: rules ? 'warning' : 'info',
      title,
      detail,
      action: 'Confirm each exception with the manager and record the reason before proposals lock.',
      tab: 'cycle',
      people: [...topLow, ...lowHigh, ...outliers].map((r) => ({
        id: r.id,
        name: r.name,
        note: `rating ${r.rating}, merit ${pct2(r.merit)}`,
      })),
      drill: () =>
        rules
          ? exceptionsDrill(m, [...topLow, ...lowHigh], 'Proposals that break the guideline rules')
          : exceptionsDrill(m, outliers, 'Proposals unusual for the rating'),
      uses: refs(MERIT, RATING, namesDept && BY.department),
      weight: rules * 4 + outliers.length,
    },
  ]
}

/* ───────── market ───────── */

function belowMarket(m: FindingsInput): Ranked[] {
  const ranges: Ranked[] = []
  const positioning: Ranked[] = []
  const r = m.rules
  const min = r.minGroup
  const flag = marketFlag(r)
  const trail = 1 + r.belowMarket.rangeGap
  // Ranges vs positioning is decided by market ÷ midpoint; a single department becomes the filter.
  const uses = refs(MARKET, MARKET_VS_MID, jobUses(m.pop), BY.department)
  for (const g of m.market.byJob) {
    if (g.median == null || g.median > flag + 1e-9 || g.group.startsWith('Other (')) continue
    // Job functions too small to rank on the chart are too noisy to raise.
    if (g.n < r.marketGap.minFunction) continue
    const members = m.pop.people.filter((p) => p.job === g.group)
    const rest = safeMedian(
      values(
        m.company.people.filter((p) => p.job !== g.group),
        (p) => p.marketRatio,
      ),
      min,
    )
    const compa = safeMedian(
      values(members, (p) => p.compa),
      min,
    )
    const depts = [...new Set(members.map((p) => p.department))]
    const filter = depts.length === 1 ? { department: depts } : undefined
    const title = `${g.group} base pay is ${fmt(1 - g.median, 'pct0')} below market, a median market ratio of ${ratio(g.median)}`
    const restText = rest != null ? `Everyone else is at ${ratio(rest)}.` : ''
    // Market ratio = compa-ratio × midpoint ÷ market median: the gap comes from the ranges, or from pay low in range.
    if (g.marketVsMid != null && g.marketVsMid >= trail) {
      ranges.push({
        id: `comp-below-market-${g.group}`,
        metricId: M.belowMarket,
        severity: 'warning',
        title,
        detail:
          `${restText} Market medians for this function sit ${fmt(g.marketVsMid - 1, 'pct0')} above the range midpoints, so the ranges trail the market.`.trim(),
        action: `Review the ${g.group} salary ranges against current survey data.`,
        filter,
        tab: 'market',
        drill: () => marketDrill(m, g),
        uses,
        weight: g.n * (1 - g.median),
      })
    } else {
      positioning.push({
        id: `comp-below-market-${g.group}`,
        metricId: M.belowMarket,
        severity: 'info',
        title,
        detail:
          `${restText} The ranges track the market here; pay sits low in the range, at a median compa-ratio of ${ratio(compa)}.`.trim(),
        action: `Review ${g.group} pay positioning within the range before merit proposals are final.`,
        filter,
        tab: 'market',
        drill: () => marketDrill(m, g),
        uses,
        weight: g.n * (1 - g.median),
      })
    }
  }
  const byGap = (a: Ranked, b: Ranked) => b.weight - a.weight
  return [...ranges.sort(byGap).slice(0, 2), ...positioning.sort(byGap).slice(0, 1)]
}

/* ───────── differentiation ───────── */

function noDifferentiation(m: FindingsInput): Ranked[] {
  const company = m.performance.companyDifferentiation
  const { floor } = m.rules.differentiation
  const unusual = new Map<string, number>()
  for (const e of m.cycle.exceptions)
    if (e.kind === 'outlier') unusual.set(e.department, (unusual.get(e.department) ?? 0) + 1)
  return m.performance.byDepartment
    .filter((r) => r.ratio != null && r.ratio < floor && !r.group.startsWith('Other ('))
    .sort((a, b) => a.ratio! - b.ratio!)
    .slice(0, 2)
    .map((r) => {
      const vs = company.ratio != null ? `, against ${times(company.ratio)} across the company` : ''
      const k = unusual.get(r.group) ?? 0
      const odd =
        k > 0
          ? ` ${fmt(k, 'int')} of its ${k === 1 ? 'proposals is' : 'proposals are'} unusual for the rating.`
          : ''
      return {
        id: `comp-no-differentiation-${r.group}`,
        metricId: M.differentiation,
        severity: 'warning' as Severity,
        title: `${r.group} merit barely follows ratings: people rated 4-5 get ${times(r.ratio)} the merit of people rated 3`,
        detail: `Mean merit is ${pct2(r.merit45)} for ratings 4-5 and ${pct2(r.merit3)} for rating 3${vs}.${odd}`,
        action: `Review the ${r.group} proposals against the guideline with its managers before calibration closes.`,
        filter: { department: [r.group] },
        tab: 'performance',
        drill: () => differentiationDrill(m, r, r.group, null),
        uses: refs(MERIT, RATING, BY.department),
        weight: r.n45 + r.n3,
      }
    })
}

/* ───────── good news ───────── */

function goodNews(m: FindingsInput, others: readonly Ranked[]): Ranked[] {
  const d = m.performance.differentiation
  const r = m.rules
  if (d.ratio != null && d.ratio >= r.differentiation.strong) {
    return [
      {
        id: 'comp-good-differentiation',
        metricId: M.differentiation,
        severity: 'good',
        title: `Merit follows performance: people rated 4-5 get ${times(d.ratio)} the merit of people rated 3`,
        detail: `Mean merit is ${pct2(d.merit45)} for ratings 4-5 and ${pct2(d.merit3)} for rating 3, well above the ${times(r.differentiation.floor)} floor.`,
        action: 'Keep the guideline as it is for the next cycle.',
        tab: 'performance',
        drill: () => differentiationDrill(m, d, null, null),
        uses: refs(MERIT, RATING),
        weight: d.n45 + d.n3,
      },
    ]
  }
  const banded = inBandOf(m.pop.people, m.settings)
  const inBand = banded.length
  const n = m.pop.people.filter((p) => p.compa != null).length
  if (n >= r.minGroup && inBand / n >= r.inBand.goodShare && !others.some((f) => f.severity === 'critical')) {
    return [
      {
        id: 'comp-good-band',
        metricId: M.inBand,
        severity: 'good',
        title: `${fmt(inBand / n, 'pct')} of people are paid inside the healthy compa-ratio band`,
        detail: `${fmt(inBand, 'int')} of ${fmt(n, 'int')} sit from ${ratio(m.settings.bandLow)} to ${ratio(m.settings.bandHigh)}.`,
        action: 'Keep the current ranges for the next cycle.',
        tab: 'ranges',
        drill: () =>
          peopleDrill({
            title: 'In the healthy band',
            subtitle: scopeLine(m),
            people: banded,
            hide: HIDE_POSITION,
            sort: (a, b) => (a.compa ?? 0) - (b.compa ?? 0) || a.name.localeCompare(b.name),
            note: `Share = ${fmt(inBand, 'int')} with a compa-ratio from ${ratio(m.settings.bandLow)} to ${ratio(m.settings.bandHigh)} ÷ ${fmt(n, 'int')} with a compa-ratio.`,
          }),
        uses: COMPA,
        weight: n,
      },
    ]
  }
  return []
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

function toFinding(r: Ranked): Finding {
  const f: Finding = { id: r.id, severity: r.severity, title: sentence(r.title) }
  if (r.metricId) f.metricId = r.metricId
  if (r.detail) f.detail = r.detail
  if (r.action) f.action = r.action
  if (r.people?.length) f.people = r.people
  if (r.filter) f.filter = r.filter
  if (r.tab) f.tab = r.tab
  if (r.drill) f.drill = r.drill
  if (r.uses?.length) f.uses = r.uses
  return f
}

export function buildFindings(ctx: AnalyticsContext, m: FindingsInput): Finding[] {
  if (!m.pop.people.length) return []
  const flat = noDifferentiation(m)
  const explained = new Set(flat.map((f) => f.filter?.department?.[0]).filter((d): d is string => !!d))
  const meets = meetsFor(ctx)
  const found: Ranked[] = [
    ...lowCompa(ctx, m, meets),
    ...belowMin(m, meets, ctx.quality.datasetTier('jobChanges') !== 'none'),
    ...overBudget(m),
    ...compressionFindings(m),
    ...flat,
    ...belowMarket(m),
    ...aboveMax(m),
    ...exceptions(m, explained),
  ]
  found.push(...goodNews(m, found))
  return found.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.weight - a.weight).map(toFinding)
}

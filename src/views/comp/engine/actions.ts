/**
 * Compensation for the Scorecard and the Action center (docs/VIEWS.md, view contract;
 * docs/ROLES-V2.md 5.6 and 5.14; docs/ACTION-CENTER-AUDIT.md 4.1 to 4.3):
 *
 *  - `compSummary(ctx)`: in healthy band, below range minimum and merit spend (against the
 *    budget, its change), with the readout, from the memoized model (`compModel`).
 *  - `compActions(ctx)`, every item owned by Total rewards:
 *    - people paid below the minimum of their range, as one roll-up (`comp:below-minimum:all`, or
 *      one per business unit in an HRBP scope) with the people in Compensation's list;
 *    - merit spend over budget by business unit (`comp:over-budget:<unit>`), the rule the readout's
 *      finding uses ('comp.merit.overBudget');
 *    - people rated 4 or 5 in the latest annual cycle with a compa-ratio under the healthy band, 5
 *      or more in a business unit (`comp:high-rated-low-compa:<unit>`);
 *    - eligible people with no merit proposal while the cycle is open, 5 or more in a business
 *      unit (`comp:no-proposal:<unit>`);
 *    - merit proposals that break the guideline rules, one per person
 *      (`comp:guideline-exception:<id>`).
 *
 * Every item is due on the cycle's close date (Settings > Compensation cycle); without one it has
 * no due date and says so. No item's `what` or `note` holds a money amount, in any mode: amounts
 * sit in `amount`, which the Action center shows only as a pay column. Roll-ups carry a
 * `fingerprint` (the people behind them), so a handled roll-up reopens when they change. Finance
 * (pay view 'totals') gets no item about one person, and its drills list employees, never comp rows.
 *
 * Wording: `what` states the facts with no closing full stop, `note` is a polite ask. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import { dateWords } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ActionItem, ViewSummary } from '../../types'
import { costPeopleDrill, isCosted } from './cost'
import type { ExceptionRow, ProgressRow, SpendRow } from './cycle'
import {
  exceptionsDrill,
  outsideDrill,
  peopleDrill,
  ruleExceptions,
  scopeLine,
  spendDrill,
  X_ANNUAL_RATING,
  X_POSITION,
} from './drill'
import { BY, COMPA, FX, MERIT, POSITION, RATING, refs } from './fields'
import { annualRatingUses } from './lineage'
import { type CompModel, compModel } from './model'
import type { CompPerson } from './population'
import { ratingKey } from './settings'

/** The three measures the Scorecard judges Compensation on, in order. */
export const SUMMARY_KPIS = ['in-band', 'below-min', 'merit-spend'] as const

export function compSummary(ctx: AnalyticsContext): ViewSummary {
  const m = compModel(ctx)
  return {
    kpis: SUMMARY_KPIS.flatMap((id) => m.kpis.filter((k) => k.id === id)),
    findings: m.findings,
  }
}

/** Who every Compensation item waits on. */
export const TOTAL_REWARDS = 'Total rewards'

/** The kind labels the Action center groups by. */
export const COMP_KIND = {
  belowMinimum: 'Pay below range minimum',
  exception: 'Merit outside guideline',
  overBudget: 'Merit spend over budget',
  highRatedLow: 'High performers paid low in range',
  noProposal: 'Merit proposals missing',
} as const

/** Said in `what` when the cycle has no close date, so an item with no due date says why. */
export const NO_CLOSE_DATE = 'no cycle close date set'

const pct = (v: number) => fmt(v, 'pct')
const pct2 = (v: number | null | undefined) => fmt(v, 'pct2')
const int = (n: number) => fmt(n, 'int')
const peopleAre = (n: number) => `${int(n)} ${n === 1 ? 'person is' : 'people are'}`
/** "0.81 pts": an unsigned gap in points. */
const ptsGap = (v: number) => fmt(Math.abs(v), 'pts2').replace('+', '')

/**
 * Changes when the set of people behind a roll-up changes: the count and a short hash of the
 * sorted IDs (FNV-1a), so a handled mark with another fingerprint reopens.
 */
export function fingerprintOf(ids: readonly string[]): string {
  const sorted = [...ids].sort()
  let h = 0x811c9dc5
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    h ^= 0x2c
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${sorted.length}:${h.toString(36)}`
}

/** What every item shares: the owner, the view and the cycle's close date as the due date. */
function base(m: CompModel): Pick<ActionItem, 'ownerRole' | 'ownerId' | 'ownerName' | 'due' | 'view'> {
  return {
    ownerRole: 'total-rewards',
    ownerId: null,
    ownerName: TOTAL_REWARDS,
    due: m.cycle.calendar.close,
    view: 'comp',
  }
}

/** A `what` with the reason it has no due date, when the cycle has no close date. */
function whatOf(m: CompModel, text: string): string {
  return m.cycle.calendar.close ? text : `${text}; ${NO_CLOSE_DATE}`
}

/** Group people by business unit, largest first. */
function byUnit(people: readonly CompPerson[]): [string, CompPerson[]][] {
  const out = new Map<string, CompPerson[]>()
  for (const p of people) {
    const k = p.businessUnit || 'No business unit'
    const arr = out.get(k)
    if (arr) arr.push(p)
    else out.set(k, [p])
  }
  return [...out].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}

/* ───────── below range minimum: one roll-up ───────── */

function belowItems(ctx: AnalyticsContext, m: CompModel): ActionItem[] {
  const below = m.ranges.below
  if (!below.length) return []
  const kind = ctx.access.scope?.kind
  // In an HRBP scope, one per business unit (a region spans several); elsewhere one for everyone.
  const perUnit = kind === 'unit' || kind === 'region'
  const groups: [string | null, typeof below][] = perUnit
    ? byUnit(below.map((r) => r.person)).map(([bu, ps]) => {
        const ids = new Set(ps.map((p) => p.id))
        return [bu, below.filter((r) => ids.has(r.id))]
      })
    : [[null, below]]
  // An amount only where the mode can show one (never in ratios-only modes), and over 5 or more people.
  const amounts = ctx.access.pay !== 'none'
  return groups.map(([bu, rows]) => {
    const people = rows.map((r) => r.person)
    const priced = rows.filter((r) => r.gapUsd != null)
    const usd = priced.reduce((a, r) => a + (r.gapUsd ?? 0), 0)
    const amount =
      amounts && priced.length >= m.rules.minGroup && usd > 0
        ? { usd, label: 'Cost to bring to minimum, a year' }
        : undefined
    const where = bu ? ` in ${bu}` : ''
    const title = bu ? `Below range minimum, ${bu}` : 'Below range minimum'
    return {
      ...base(m),
      id: `comp:below-minimum:${bu ?? 'all'}`,
      kind: COMP_KIND.belowMinimum,
      severity: 'warning' as const,
      what: whatOf(
        m,
        `${peopleAre(rows.length)} paid below their range minimum${where}; plan moves before the cycle closes`,
      ),
      subject: { kind: 'none' as const, label: `${int(rows.length)} below range minimum${where}` },
      tab: 'ranges',
      drill: () =>
        m.cost.totals
          ? costPeopleDrill(m.cost, title, people, { note: 'Paid below the minimum of their salary range.' })
          : outsideDrill(m, 'below', people, title),
      note: 'Could we plan these moves to the range minimum in this cycle, or confirm why they wait?',
      // The amount reads the FX rate only while it is shown.
      uses: refs(POSITION, amount && m.showPay ? FX : null),
      fingerprint: fingerprintOf(people.map((p) => p.id)),
      ...(amount ? { amount } : {}),
      ...(bu ? { place: { businessUnit: bu } } : {}),
    }
  })
}

/* ───────── merit spend over budget, by business unit ───────── */

function overBudgetItems(m: CompModel): ActionItem[] {
  const { flag } = m.rules.overBudget
  const rows = m.cycle.byBu
  // The readout's rule: a business unit over by the flag gap, never Other, with units to compare.
  if (rows.length < 2) return []
  return rows
    .filter(
      (r): r is SpendRow & { delta: number } =>
        r.delta != null && r.delta >= flag && !r.group.startsWith('Other ('),
    )
    .map((r) => {
      const amount =
        r.overUsd != null && r.overUsd > 0 ? { usd: r.overUsd, label: 'Over merit budget' } : undefined
      return {
        ...base(m),
        id: `comp:over-budget:${r.group}`,
        kind: COMP_KIND.overBudget,
        severity: 'warning' as const,
        what: whatOf(
          m,
          `Merit proposals in ${r.group} cost ${pct2(r.spendPct)} of eligible base, ${ptsGap(r.delta)} over the ${pct2(r.budgetPct)} budget`,
        ),
        subject: { kind: 'none' as const, label: `Merit spend, ${r.group}` },
        tab: 'cost',
        drill: () =>
          m.cost.totals
            ? costPeopleDrill(m.cost, `Merit proposals, ${r.group}`, r.members.filter(isCosted), {
                note: 'People with a merit proposal and an exchange rate, the people the spend is over.',
              })
            : spendDrill(m, r, 'priced'),
        note: `Could we agree with the ${r.group} leaders where to bring proposals back to budget before the cycle closes?`,
        uses: refs(MERIT, FX, BY.businessUnit),
        fingerprint: `${r.n}:${Math.round((r.spendPct ?? 0) * 10_000)}`,
        place: { businessUnit: r.group },
        ...(amount ? { amount } : {}),
      }
    })
}

/* ───────── high performers paid low in range, by business unit ───────── */

/** Rated 4 or 5 in the latest annual cycle, with a compa-ratio under the healthy band's low end. */
export function highRatedLow(m: Pick<CompModel, 'pop' | 'settings'>): CompPerson[] {
  return m.pop.people.filter((p) => {
    const k = ratingKey(p.annualRating)
    return (k === 4 || k === 5) && p.compa != null && p.compa < m.settings.bandLow - 1e-9
  })
}

function highRatedLowItems(m: CompModel): ActionItem[] {
  const min = m.rules.minGroup
  const cycle = m.pop.annualCycle
  const band = fmt(m.settings.bandLow, 'ratio')
  return byUnit(highRatedLow(m))
    .filter(([, ps]) => ps.length >= min)
    .map(([bu, ps]) => ({
      ...base(m),
      id: `comp:high-rated-low-compa:${bu}`,
      kind: COMP_KIND.highRatedLow,
      severity: 'warning' as const,
      what: whatOf(
        m,
        `${int(ps.length)} people in ${bu} rated 4 or 5${cycle ? ` in the ${cycle} cycle` : ''} have a compa-ratio under ${band}`,
      ),
      subject: { kind: 'none' as const, label: `${int(ps.length)} high performers, ${bu}` },
      tab: 'performance',
      drill: () =>
        peopleDrill({
          title: `Rated 4 or 5 with a compa-ratio under ${band}, ${bu}`,
          subtitle: scopeLine(m),
          people: ps,
          extras: [X_ANNUAL_RATING, X_POSITION],
          sort: (a, b) => (a.compa ?? 9) - (b.compa ?? 9) || a.name.localeCompare(b.name),
          note: `Compa-ratio under the low end of the ${band} to ${fmt(m.settings.bandHigh, 'ratio')} healthy band, rated 4 or 5${cycle ? ` in ${cycle}` : ''}.`,
        }),
      note: 'Could we look at their pay position alongside the merit proposals before the cycle closes?',
      uses: refs(COMPA, annualRatingUses(cycle), BY.businessUnit),
      fingerprint: fingerprintOf(ps.map((p) => p.id)),
      place: { businessUnit: bu },
    }))
}

/* ───────── merit proposals missing, by business unit ───────── */

function noProposalItems(m: CompModel): ActionItem[] {
  const cal = m.cycle.calendar
  if (cal.state !== 'open') return []
  const min = m.rules.minGroup
  const soon = cal.daysToClose != null && cal.daysToClose <= cal.warnDays
  const closes = cal.close ? `; the cycle closes ${dateWords(cal.close, m.asOf)}` : `; ${NO_CLOSE_DATE}`
  return m.cycle.progress.rows
    .filter((r): r is ProgressRow & { dim: 'businessUnit' } => !r.isOther && r.missing >= min)
    .map((r) => ({
      ...base(m),
      id: `comp:no-proposal:${r.group}`,
      kind: COMP_KIND.noProposal,
      severity: soon ? ('warning' as const) : ('info' as const),
      what: `${int(r.missing)} eligible ${r.missing === 1 ? 'person' : 'people'} in ${r.group} ${r.missing === 1 ? 'has' : 'have'} no merit proposal${closes}`,
      subject: { kind: 'none' as const, label: `${int(r.missing)} without a proposal, ${r.group}` },
      tab: 'cycle',
      drill: () =>
        peopleDrill({
          title: `Eligible with no merit proposal, ${r.group}`,
          subtitle: scopeLine(m),
          people: r.missingPeople,
          sort: (a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name),
          note: cal.cutoff
            ? `Active employees with a comp record hired on or before ${fmt(cal.cutoff, 'date')} and no merit proposal.`
            : undefined,
        }),
      note: 'Could the managers enter these proposals before the cycle closes?',
      uses: refs(MERIT, BY.businessUnit),
      fingerprint: fingerprintOf(r.missingPeople.map((p) => p.id)),
      place: { businessUnit: r.group },
    }))
}

/* ───────── guideline exceptions, one per person ───────── */

function exceptionItem(m: CompModel, r: ExceptionRow, manager: string | null): ActionItem {
  const x = m.rules.exceptions
  const side =
    r.kind === 'top-low'
      ? `below the ${pct(x.topRatingFloor)} floor for a 5`
      : `above the ${pct(x.lowRatingCap)} cap for a 1 or 2`
  return {
    ...base(m),
    id: `comp:guideline-exception:${r.id}`,
    kind: COMP_KIND.exception,
    severity: 'warning',
    what: whatOf(
      m,
      `Rated ${r.rating} with a ${pct(r.merit)} merit proposal, ${side}; the guideline is ${pct(r.guideline)}`,
    ),
    subject: { kind: 'comp', id: r.id, label: r.name },
    tab: 'cycle',
    drill: () => exceptionsDrill(m, [r], `${r.name}: guideline exception`),
    note: manager
      ? `Could we confirm the merit proposal for ${r.name} with ${manager} before the cycle closes?`
      : `Could we confirm the merit proposal for ${r.name} before the cycle closes?`,
    uses: refs(MERIT, RATING),
    place: { businessUnit: r.person.businessUnit, location: r.person.location },
  }
}

/**
 * Open items for Total rewards: the below-minimum roll-up, merit over budget, high performers paid
 * low, proposals missing, then guideline exceptions by person.
 */
export function compActions(ctx: AnalyticsContext): ActionItem[] {
  const m = compModel(ctx)
  if (!m.pop.people.length) return []
  // Finance lists no item about one person's pay or rating.
  if (m.cost.totals) return [...belowItems(ctx, m), ...overBudgetItems(m)]
  const managerOf = (id: string): string | null => {
    const mid = ctx.org.byId.get(id)?.managerId
    return mid ? (ctx.org.byId.get(mid)?.name ?? null) : null
  }
  const exceptions = ruleExceptions(m.cycle.exceptions).map((r) => exceptionItem(m, r, managerOf(r.id)))
  return [
    ...belowItems(ctx, m),
    ...overBudgetItems(m),
    ...highRatedLowItems(m),
    ...noProposalItems(m),
    ...exceptions,
  ]
}

/** The cycle's close date, for homes and lists that say when Compensation's items are due. */
export const cycleCloseOf = (ctx: AnalyticsContext): ISODate | null => compModel(ctx).cycle.calendar.close

/**
 * Compensation for the Scorecard and the Action center (docs/VIEWS.md, view contract):
 *
 *  - `compSummary(ctx)`: in healthy band, below range minimum and merit spend (against the
 *    budget, its change), with the readout, from the memoized model (`compModel`).
 *  - `compActions(ctx)` for Total rewards, one item per person:
 *    - people paid below the minimum of their range: the increase to the minimum as a share of
 *      base always, the amount only while "Show pay amounts" is on (`ctx.showPay`);
 *    - merit proposals that break the guideline rules (rating 5 under the floor, rating 1-2 over
 *      the cap), the exceptions the Merit cycle tile counts. Unusual proposals that break no rule
 *      are left to the Merit cycle tab.
 *
 * Wording: `what` states the facts, `note` is a polite ask. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ActionItem, ViewSummary } from '../../types'
import type { ExceptionRow } from './cycle'
import { exceptionsDrill, outsideDrill, ruleExceptions } from './drill'
import { FX, MERIT, POSITION, RATING, refs } from './fields'
import { type CompModel, compModel } from './model'
import type { OutsideRangeRow } from './ranges'

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

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name
const pct = (v: number) => fmt(v, 'pct')
const possessive = (name: string) => `${name}'s`

function belowItem(m: CompModel, r: OutsideRangeRow): ActionItem {
  const amount = m.showPay && r.gapUsd != null ? `, ${fmt(r.gapUsd, 'moneyFull')} a year in USD` : ''
  const promoted = r.promoted === 'Yes' ? '; promoted in the last 12 months' : ''
  return {
    id: `comp:below-minimum:${r.id}`,
    ownerRole: 'total-rewards',
    ownerId: null,
    ownerName: TOTAL_REWARDS,
    due: null,
    severity: 'warning',
    what: `Base salary is below the range minimum; it takes an increase of ${pct(r.gapPct)} to reach it${amount}${promoted}`,
    subject: { kind: 'comp', id: r.id, label: r.name },
    view: 'comp',
    tab: 'ranges',
    drill: () => outsideDrill(m, 'below', [r.person], `${r.name}: below range minimum`),
    note: `Could we plan ${possessive(firstName(r.name))} move to the range minimum in the next cycle, or confirm why it waits?`,
    // The amount reads the FX rate only while it is shown.
    uses: refs(POSITION, m.showPay ? FX : null),
  }
}

function exceptionItem(m: CompModel, r: ExceptionRow, manager: string | null): ActionItem {
  const x = m.rules.exceptions
  const side =
    r.kind === 'top-low'
      ? `below the ${pct(x.topRatingFloor)} floor for a 5`
      : `above the ${pct(x.lowRatingCap)} cap for a 1 or 2`
  return {
    id: `comp:guideline-exception:${r.id}`,
    ownerRole: 'total-rewards',
    ownerId: null,
    ownerName: TOTAL_REWARDS,
    due: null,
    severity: 'warning',
    what: `Rated ${r.rating} with a ${pct(r.merit)} merit proposal, ${side}; the guideline is ${pct(r.guideline)}`,
    subject: { kind: 'comp', id: r.id, label: r.name },
    view: 'comp',
    tab: 'cycle',
    drill: () => exceptionsDrill(m, [r], `${r.name}: guideline exception`),
    note: manager
      ? `Could we confirm the merit proposal for ${r.name} with ${manager} before the cycle closes?`
      : `Could we confirm the merit proposal for ${r.name} before the cycle closes?`,
    uses: refs(MERIT, RATING),
  }
}

/** Open items for Total rewards: below-minimum people first (largest gap first), then guideline exceptions. */
export function compActions(ctx: AnalyticsContext): ActionItem[] {
  const m = compModel(ctx)
  if (!m.pop.people.length) return []
  const managerOf = (id: string): string | null => {
    const mid = ctx.org.byId.get(id)?.managerId
    return mid ? (ctx.org.byId.get(mid)?.name ?? null) : null
  }
  const below = m.ranges.below
    .slice()
    .sort((a, b) => b.gapPct - a.gapPct || a.name.localeCompare(b.name))
    .map((r) => belowItem(m, r))
  const exceptions = ruleExceptions(m.cycle.exceptions).map((r) => exceptionItem(m, r, managerOf(r.id)))
  return [...below, ...exceptions]
}

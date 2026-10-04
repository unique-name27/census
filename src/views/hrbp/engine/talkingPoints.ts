/**
 * Plain-text talking points for a leader 1:1: 5 to 7 bullets an HRBP can paste into notes.
 * Fixes the earlier tool, which named the manager with the most exits of any kind under the
 * regretted-exits bullet; this counts regretted exits per manager. Held to the same anonymity
 * rule as the tiles: no rate over fewer than 5 people, and no exit reason that could point to
 * one person. Held to the data standard too: a point whose data is below it is left out and
 * counted, as the tiles hide their numbers.
 */
import { type DataStandard, type FieldRef, meetsStandard, STANDARD_LABEL } from '@/data/quality'
import { addDays, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { HrbpModel } from '.'
import { count, possessive, quoted } from './base'
import { windowPhrase } from './kpis'
import {
  ATTRITION,
  FIRST_YEAR,
  HEADCOUNT,
  HRBP_DATASETS,
  ifPresent,
  type Lineage,
  MANAGER,
  NONE,
  PAST_HEADCOUNT,
  PROMOTION_RATE,
  REASON,
  VOLUNTARY,
} from './lineage'
import { exitsIn } from './population'

const n = (v: number) => v.toLocaleString('en-US')

/**
 * The manager with the most regretted exits in the window, if any manager has as many as the
 * readout's regretted cluster needs (2 by default).
 */
export function topRegrettedManager(m: HrbpModel): { name: string; count: number } | null {
  const p = m.prep
  const by = new Map<string, number>()
  for (const e of exitsIn(p.emps, p.window, p.counts)) {
    if (!p.isRegretted(e) || !e.managerId) continue
    by.set(e.managerId, (by.get(e.managerId) ?? 0) + 1)
  }
  let best: { id: string; count: number } | null = null
  for (const [id, c] of by) {
    if (!best || c > best.count || (c === best.count && m.prep.name(id) < m.prep.name(best.id)))
      best = { id, count: c }
  }
  return best && best.count >= p.set.regrettedCluster.minExits
    ? { name: m.prep.name(best.id), count: best.count }
    : null
}

/** Why points were left out, by data standard. */
const LEFT_OUT: Record<DataStandard, string> = {
  gold: 'not yet confirmed for production',
  silver: 'not yet validated',
  bronze: 'missing',
}

interface Point {
  text: string
  uses: readonly FieldRef[] | undefined
}

export function talkingPoints(m: HrbpModel): string {
  const { prep: p, kpi, attrition, movement, findings } = m
  const { quality, standard } = p.ctx
  const scope = p.ctx.scopeLabel
  const vsCompany = !p.ctx.isCompany
  const phrase = windowPhrase(p)
  const minGroup = p.set.minGroup
  const points: Point[] = []
  const add = (text: string, ...lineage: Lineage[]) => points.push({ text, uses: p.uses(...lineage) })
  const shown = (uses: readonly FieldRef[] | undefined) =>
    meetsStandard(quality.tierOf(uses, HRBP_DATASETS), standard)

  const before = kpi.headcountYearAgo
  if (before == null) {
    add(`Headcount is ${n(kpi.headcount)} employees.`, HEADCOUNT)
    add(
      'Attrition and the change from a year ago are not shown: the Employees upload has no leavers. Add rows with a Termination date to see them.',
      HEADCOUNT,
    )
  } else {
    const change = kpi.headcount - before
    const growth = before >= 5 ? ` (${fmt(Math.abs(change) / before, 'pct')})` : ''
    add(
      change === 0
        ? `Headcount is ${n(kpi.headcount)} employees, unchanged from 12 months ago.`
        : `Headcount is ${n(kpi.headcount)} employees, ${change > 0 ? 'up' : 'down'} ${n(Math.abs(change))}${growth} from 12 months ago.`,
      PAST_HEADCOUNT,
    )
  }

  if (kpi.all.avgHeadcount > 0 && kpi.all.avgHeadcount < minGroup) {
    add(
      `Rates are hidden to protect anonymity: this scope averages fewer than ${minGroup} employees.`,
      ATTRITION,
    )
  }

  if (kpi.vol.rate != null && kpi.vol.avgHeadcount >= minGroup) {
    const vs =
      vsCompany && kpi.companyVol != null ? ` against ${fmt(kpi.companyVol, 'pct')} for the company` : ''
    // A reason given by one person, or in a group under 5 leavers, could point to who said it.
    // Reasons below the data standard are not cited; the rate still is.
    const top = p.meets(REASON) ? attrition.reasons[0] : undefined
    const reason =
      top && top.exits >= 2 && attrition.voluntaryExits >= minGroup
        ? `. The top reason given was ${quoted(top.reason)} (${top.exits} of ${attrition.voluntaryExits} voluntary exits)`
        : ''
    add(
      `Voluntary attrition is ${fmt(kpi.vol.rate, 'pct')} over ${phrase}${vs}${reason}.`,
      VOLUNTARY,
      reason ? REASON : NONE,
    )
  }

  if (kpi.regretted.rate != null && kpi.regretted.avgHeadcount >= minGroup) {
    const regretted = kpi.regretted.events
    const mgr = topRegrettedManager(m)
    const exits = count(regretted, 'regretted exit', 'regretted exits')
    add(
      !regretted
        ? `No regretted exits over ${phrase}.`
        : mgr
          ? `${exits} over ${phrase}. The largest group, ${mgr.count} of ${n(regretted)}, left ${possessive(mgr.name)} team.`
          : `${exits} over ${phrase}, no more than one from any manager's team.`,
      p.lin.regretted,
      ifPresent(MANAGER),
    )
  }

  const fy = kpi.firstYear
  if (fy.rate != null) {
    add(
      `First-year attrition is ${fmt(fy.rate, 'pct')}: ${fy.leavers} of ${fy.cohort} people hired ${formatDate(addDays(fy.from, 1))} to ${formatDate(fy.to)} left within a year.`,
      FIRST_YEAR,
    )
  }

  const promo = movement.promotions
  if (promo.rate != null && promo.avgHeadcount >= minGroup) {
    const vs =
      vsCompany && movement.companyPromotions.rate != null
        ? ` against ${fmt(movement.companyPromotions.rate, 'pct')} for the company`
        : ''
    add(
      `Promotion rate is ${fmt(promo.rate, 'pct')} over ${phrase} (${count(promo.promotions, 'promotion', 'promotions')})${vs}.`,
      PROMOTION_RATE,
    )
  }

  // The top item among the findings the readout shows under the data standard.
  const listed = findings.filter((f) => shown(f.uses))
  const top = listed.find((f) => f.severity === 'critical') ?? listed.find((f) => f.severity !== 'good')
  if (top)
    points.push({
      text: `Top item to raise: ${top.title}.${top.action ? ` ${top.action}` : ''}`,
      uses: top.uses,
    })

  const lines = points.filter((pt) => shown(pt.uses)).map((pt) => pt.text)
  const left = points.length - lines.length
  if (left > 0)
    lines.push(
      left === 1
        ? `One point is left out because its data is ${LEFT_OUT[standard]}.`
        : `${n(left)} points are left out because their data is ${LEFT_OUT[standard]}.`,
    )

  const only = standard === 'bronze' ? '' : `, ${STANDARD_LABEL[standard].toLowerCase()} data only`
  const header = `Talking points for ${scope}, ${p.window.label.replace(' – ', ' to ')}, as of ${formatDate(p.asOf)}${only}`
  return [header, '', ...lines.map((l) => `- ${l}`)].join('\n')
}

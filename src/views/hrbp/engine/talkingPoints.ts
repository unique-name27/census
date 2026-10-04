/**
 * Plain-text talking points for a leader 1:1: 5 to 7 bullets an HRBP can paste into notes.
 * Fixes the earlier tool, which named the manager with the most exits of any kind under the
 * regretted-exits bullet; this counts regretted exits per manager. Held to the same anonymity
 * rule as the tiles: no rate over fewer than 5 people, and no exit reason that could point to
 * one person.
 */
import { MIN_GROUP } from '@/data/schema'
import { addDays, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { exitsIn } from '@/lib/people'
import type { HrbpModel } from '.'
import { count, possessive, quoted } from './base'
import { windowPhrase } from './kpis'

const n = (v: number) => v.toLocaleString('en-US')

/** The manager with the most regretted exits in the window, if any manager has 2 or more. */
export function topRegrettedManager(m: HrbpModel): { name: string; count: number } | null {
  const by = new Map<string, number>()
  for (const e of exitsIn(m.prep.emps, m.prep.window)) {
    if (e.terminationType !== 'Voluntary' || e.regrettable !== true || !e.managerId) continue
    by.set(e.managerId, (by.get(e.managerId) ?? 0) + 1)
  }
  let best: { id: string; count: number } | null = null
  for (const [id, c] of by) {
    if (!best || c > best.count || (c === best.count && m.prep.name(id) < m.prep.name(best.id)))
      best = { id, count: c }
  }
  return best && best.count >= 2 ? { name: m.prep.name(best.id), count: best.count } : null
}

export function talkingPoints(m: HrbpModel): string {
  const { prep: p, kpi, attrition, movement, findings } = m
  const scope = p.ctx.scopeLabel
  const vsCompany = !p.ctx.isCompany
  const phrase = windowPhrase(p)
  const lines: string[] = []

  const before = kpi.headcountYearAgo
  if (before == null) {
    lines.push(`Headcount is ${n(kpi.headcount)} employees.`)
    lines.push(
      'Attrition and the change from a year ago are not shown: the Employees upload has no leavers. Add rows with a Termination date to see them.',
    )
  } else {
    const change = kpi.headcount - before
    const growth = before >= 5 ? ` (${fmt(Math.abs(change) / before, 'pct')})` : ''
    lines.push(
      change === 0
        ? `Headcount is ${n(kpi.headcount)} employees, unchanged from 12 months ago.`
        : `Headcount is ${n(kpi.headcount)} employees, ${change > 0 ? 'up' : 'down'} ${n(Math.abs(change))}${growth} from 12 months ago.`,
    )
  }

  if (kpi.all.avgHeadcount > 0 && kpi.all.avgHeadcount < MIN_GROUP) {
    lines.push('Rates are hidden to protect anonymity: this scope averages fewer than 5 employees.')
  }

  if (kpi.vol.rate != null && kpi.vol.avgHeadcount >= MIN_GROUP) {
    const vs =
      vsCompany && kpi.companyVol != null ? ` against ${fmt(kpi.companyVol, 'pct')} for the company` : ''
    // A reason given by one person, or in a group under 5 leavers, could point to who said it.
    const top = attrition.reasons[0]
    const reason =
      top && top.exits >= 2 && attrition.voluntaryExits >= MIN_GROUP
        ? `. The top reason given was ${quoted(top.reason)} (${top.exits} of ${attrition.voluntaryExits} voluntary exits)`
        : ''
    lines.push(`Voluntary attrition is ${fmt(kpi.vol.rate, 'pct')} over ${phrase}${vs}${reason}.`)
  }

  if (kpi.regretted.rate != null && kpi.regretted.avgHeadcount >= MIN_GROUP) {
    const regretted = kpi.regretted.events
    const mgr = topRegrettedManager(m)
    const exits = count(regretted, 'regretted exit', 'regretted exits')
    lines.push(
      !regretted
        ? `No regretted exits over ${phrase}.`
        : mgr
          ? `${exits} over ${phrase}. The largest group, ${mgr.count} of ${n(regretted)}, left ${possessive(mgr.name)} team.`
          : `${exits} over ${phrase}, no more than one from any manager's team.`,
    )
  }

  const fy = kpi.firstYear
  if (fy.rate != null) {
    lines.push(
      `First-year attrition is ${fmt(fy.rate, 'pct')}: ${fy.leavers} of ${fy.cohort} people hired ${formatDate(addDays(fy.from, 1))} to ${formatDate(fy.to)} left within a year.`,
    )
  }

  const promo = movement.promotions
  if (promo.rate != null && promo.avgHeadcount >= MIN_GROUP) {
    const vs =
      vsCompany && movement.companyPromotions.rate != null
        ? ` against ${fmt(movement.companyPromotions.rate, 'pct')} for the company`
        : ''
    lines.push(
      `Promotion rate is ${fmt(promo.rate, 'pct')} over ${phrase} (${count(promo.promotions, 'promotion', 'promotions')})${vs}.`,
    )
  }

  const top = findings.find((f) => f.severity === 'critical') ?? findings.find((f) => f.severity !== 'good')
  if (top) lines.push(`Top item to raise: ${top.title}.${top.action ? ` ${top.action}` : ''}`)

  const header = `Talking points for ${scope}, ${p.window.label.replace(' – ', ' to ')}, as of ${formatDate(p.asOf)}`
  return [header, '', ...lines.map((l) => `- ${l}`)].join('\n')
}

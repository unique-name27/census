/**
 * Plain-text talking points for a leader 1:1: 5 to 7 bullets an HRBP can paste into notes.
 * Fixes the earlier tool, which named the manager with the most exits of any kind under the
 * regretted-exits bullet; this counts regretted exits per manager.
 */
import { addDays, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { exitsIn } from '@/lib/people'
import type { HrbpModel } from '.'
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

  const change = kpi.headcount - kpi.headcountYearAgo
  const growth = kpi.headcountYearAgo >= 5 ? ` (${fmt(Math.abs(change) / kpi.headcountYearAgo, 'pct')})` : ''
  lines.push(
    change === 0
      ? `Headcount is ${n(kpi.headcount)} employees, unchanged from 12 months ago.`
      : `Headcount is ${n(kpi.headcount)} employees, ${change > 0 ? 'up' : 'down'} ${n(Math.abs(change))}${growth} from 12 months ago.`,
  )

  if (kpi.vol.rate != null && kpi.vol.avgHeadcount >= 5) {
    const vs =
      vsCompany && kpi.companyVol != null ? ` against ${fmt(kpi.companyVol, 'pct')} for the company` : ''
    const top = attrition.reasons[0]
    const reason = top
      ? `; the top reason was ${top.reason} (${top.exits} of ${attrition.voluntaryExits} voluntary exits)`
      : ''
    lines.push(`Voluntary attrition is ${fmt(kpi.vol.rate, 'pct')} over ${phrase}${vs}${reason}.`)
  }

  if (kpi.regretted.rate != null) {
    const regretted = kpi.regretted.events
    const mgr = topRegrettedManager(m)
    lines.push(
      regretted
        ? `${n(regretted)} regretted ${regretted === 1 ? 'exit' : 'exits'} over ${phrase}${
            mgr ? `, most under ${mgr.name} (${mgr.count})` : ', with no manager losing more than one'
          }.`
        : `No regretted exits over ${phrase}.`,
    )
  }

  const fy = kpi.firstYear
  if (fy.rate != null) {
    lines.push(
      `First-year attrition is ${fmt(fy.rate, 'pct')}: ${fy.leavers} of ${fy.cohort} people hired ${formatDate(addDays(fy.from, 1))} to ${formatDate(fy.to)} left within a year.`,
    )
  }

  const promo = movement.promotions
  if (promo.rate != null && promo.avgHeadcount >= 5) {
    const vs =
      vsCompany && movement.companyPromotions.rate != null
        ? ` against ${fmt(movement.companyPromotions.rate, 'pct')} for the company`
        : ''
    lines.push(`Promotion rate is ${fmt(promo.rate, 'pct')} (${n(promo.promotions)} promotions)${vs}.`)
  }

  const top = findings.find((f) => f.severity === 'critical') ?? findings.find((f) => f.severity !== 'good')
  if (top) lines.push(`Top item to raise: ${top.title}.${top.action ? ` ${top.action}` : ''}`)

  const header = `Talking points for ${scope}, ${p.window.label.replace(' – ', ' to ')}, as of ${formatDate(p.asOf)}`
  return [header, '', ...lines.map((l) => `- ${l}`)].join('\n')
}

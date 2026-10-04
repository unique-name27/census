/**
 * The Talent readout: findings a talent or calibration owner would raise with leaders, each with
 * the number in its title, up to two sentences of detail, one neutral next step, the segment it
 * concentrates in (finding.filter) and the tab that explains it. Each finding names its rule in
 * the metric dictionary (`metricId`), and every threshold is one of that rule's settings.
 * Pure: no React, no DOM.
 */
import type { Finding, FindingPerson } from '@/components/types'
import { formatDate, formatMonth } from '@/lib/dates'
import type { Segment } from '@/lib/decompose'
import { fmt, plural } from '@/lib/format'
import { targetStatus } from '@/metrics/api'
import type { MetricTarget } from '@/metrics/types'
import { listText, segmentFilter, segmentName, type TalentBase, UNKNOWN } from './base'
import type { TalentDrills } from './drills'
import type { LearningResult } from './learning'
import type { TalentLineage } from './lineage'
import type { PerformanceResult } from './performance'
import type { OverdueResult } from './promotion'
import type { RetentionResult } from './retention'
import { factorDef, type RiskModel } from './risk'
import { highRatingText, TALENT_METRIC as M } from './settings'
import type { SuccessionResult } from './succession'
import { targetWords } from './wording'

/**
 * A training gap can be critical only for a compliance or security course (and only with enough
 * people behind, a setting of the rule).
 */
const CRITICAL_TRAINING = /compliance|security/i

/** "4 or higher" for a high performer rating of 4, "5" for 5. */
const orHigher = (min: number) => (min >= 5 ? '5' : `${min} or higher`)

/** "3 or more years", "a year or more", "2.5 or more years". */
const yearsOrMore = (years: number) => (years === 1 ? 'a year or more' : `${+years.toFixed(1)} or more years`)

export interface FindingInputs {
  base: TalentBase
  performance: PerformanceResult
  succession: SuccessionResult
  retention: RetentionResult
  overdue: OverdueResult
  learning: LearningResult
  risk: RiskModel
  drill: TalentDrills
  lineage: Pick<TalentLineage, 'finding'>
}

/** "11.0 pts" for a fraction difference, without a sign. */
const pts = (d: number) => `${(Math.abs(d) * 100).toFixed(1)} pts`
const pct = (v: number | null) => fmt(v, 'pct')
const pct0 = (v: number | null) => fmt(v, 'pct0')

/** Everyone behind a finding: the readout shows five and lists the rest on request. */
function people(list: readonly { employeeId: string; name: string; note?: string }[]): FindingPerson[] {
  return list.map((p) => ({ id: p.employeeId, name: p.name, note: p.note }))
}

/** The single value holding at least half of the items (and two or more), for a "Focus" link. */
function majority<T>(items: readonly T[], key: (t: T) => string | null | undefined): string | null {
  const m = new Map<string, number>()
  for (const t of items) {
    const k = key(t)
    if (k && k !== UNKNOWN) m.set(k, (m.get(k) ?? 0) + 1)
  }
  for (const [k, n] of m) if (n >= 2 && n * 2 >= items.length) return k
  return null
}

function segmentText(s: Segment): string {
  return `${segmentName(s.dim, s.value)} (${pct(s.segValue)}, ${s.affected} of ${s.population})`
}

export function buildFindings(x: FindingInputs): Finding[] {
  const out: Finding[] = []
  const { base, performance: perf, succession: succ, retention: ret, overdue, learning, risk, drill } = x
  const uses = x.lineage.finding
  const s = base.settings
  const rule = s.findings
  const hi = highRatingText(s.highRating)

  // High-potential regretted exits in the look-back window (6 months by default; needs termination
  // type, regrettable and potential).
  const hipo = ret.hipoExits.people
  if (ret.hipoExits.available && hipo.length > 0) {
    const named = hipo
      .slice(0, 5)
      .map((p) => `${p.name} (${p.department}, ${formatMonth(p.terminationDate)})`)
    const bu = majority(hipo, (p) => base.byId.get(p.employeeId)?.businessUnit)
    out.push({
      id: 'talent-hipo-exits',
      metricId: M.hipoExitsRule,
      severity: hipo.length >= 2 ? 'critical' : 'warning',
      title: `${plural(hipo.length, 'high-potential person', 'high-potential people')} rated ${orHigher(s.highRating)} resigned in the last ${plural(rule.hipoExitMonths, 'month')}.`,
      detail: `${listText(named)}. ${hipo.length === 1 ? 'This was a regretted loss.' : 'All were regretted losses.'}`,
      action: 'Hold stay conversations with the high potentials who remain in these teams this month.',
      people: people(
        hipo.map((p) => ({ ...p, note: `${p.department}, left ${formatDate(p.terminationDate)}` })),
      ),
      filter:
        bu && hipo.length === hipo.filter((p) => base.byId.get(p.employeeId)?.businessUnit === bu).length
          ? { businessUnit: [bu] }
          : undefined,
      tab: 'retention',
      drill: drill.hipoExits(),
      uses: uses['talent-hipo-exits'],
    })
  }

  // Roles whose incumbent is at high risk of loss with nobody named.
  const useModelRisk = !base.has.successionRisk
  const exposed = succ.roles.filter(
    (r) => r.successors === 0 && (useModelRisk ? r.modelRisk === 'High' : r.riskOfLoss === 'High'),
  )
  if (exposed.length > 0) {
    const critical = exposed.filter((r) => r.criticality === 'Critical').length
    const dept = majority(exposed, (r) => r.department)
    out.push({
      id: 'talent-succession-exposed',
      metricId: M.successionExposedRule,
      severity: 'critical',
      title: `${plural(exposed.length, 'role has', 'roles have')} an incumbent at high risk of loss and no successor named.`,
      detail: `${exposed
        .slice(0, 4)
        .map((r) => r.roleTitle)
        .join(
          '; ',
        )}${exposed.length > 4 ? `; and ${exposed.length - 4} more` : ''}. ${critical === exposed.length ? (exposed.length === 1 ? 'It is a critical role.' : 'All are critical roles.') : `${critical} of them ${critical === 1 ? 'is a critical role' : 'are critical roles'}.`}`,
      action:
        'Name at least one successor for each of these roles and agree on a retention plan with the incumbent’s leader.',
      people: exposed.map((r) => ({ id: r.incumbentId, name: r.incumbent, note: r.roleTitle })),
      filter: dept ? { department: [dept] } : undefined,
      tab: 'succession',
      drill: drill.roles(
        exposed,
        'Roles with an incumbent at high risk of loss and no successor',
        useModelRisk
          ? 'High risk of loss from the Census flight-risk model (the plans record none).'
          : 'High risk of loss as recorded in the succession plan.',
      ),
      uses: uses['talent-succession-exposed'],
    })
  }

  // Critical roles without a ready-now successor.
  const notReady = succ.critical - succ.criticalCovered
  if (succ.critical > 0 && notReady > 0) {
    const roles = succ.roles.filter((r) => r.criticality === 'Critical' && r.readyNow === 0)
    const thin = roles.filter((r) => r.successors > 0).length
    const none = roles.length - thin
    out.push({
      id: 'talent-critical-not-ready',
      metricId: M.criticalNotReadyRule,
      severity: notReady / succ.critical > rule.notReadyCritical ? 'critical' : 'warning',
      title: `${notReady} of ${succ.critical} critical roles (${pct(notReady / succ.critical)}) have no successor who is ready now.`,
      detail: `${thin === 0 ? 'None' : thin} of them ${thin === 1 ? 'has' : 'have'} successors who need more time, and ${none === 0 ? 'none' : none} ${none === 1 ? 'has' : 'have'} nobody named.`,
      action: 'Agree on development plans that make one successor ready now for each of these roles.',
      people: roles.map((r) => ({ id: r.incumbentId, name: r.incumbent, note: r.roleTitle })),
      tab: 'succession',
      drill: drill.roles(
        roles,
        'Critical roles with no successor ready now',
        `Rate = ${notReady} not ready ÷ ${succ.critical} critical roles. Successors who have left are not counted.`,
      ),
      uses: uses['talent-critical-not-ready'],
    })
  }

  // Rating inflation by business unit.
  for (const f of perf.inflation.slice(0, 2)) {
    const hist = f.history.filter((h) => h.share != null)
    const histText = hist.length
      ? `It was ${listText(hist.map((h) => `${pct(h.share)} in ${h.cycle}`))}. `
      : ''
    out.push({
      id: `talent-inflation-${f.businessUnit}`,
      metricId: M.inflationRule,
      severity: 'warning',
      title: `${f.businessUnit} rated ${pct(f.share)} of people ${hi} in ${perf.cycle?.cycle ?? 'the latest cycle'}, ${pts(f.share - s.highGuideline)} above the ${pct0(s.highGuideline)} guideline.`,
      detail: `${histText}${f.rest != null ? `The rest of the scope is at ${pct(f.rest)}.` : ''}`.trim(),
      action: `Review the ${f.businessUnit} rating distribution against the guideline in the next calibration session.`,
      filter: { businessUnit: [f.businessUnit] },
      tab: 'performance',
      drill: drill.unitHigh(f.businessUnit),
      uses: uses['talent-inflation'],
    })
  }

  // Calibration shift by business unit.
  for (const c of perf.calibrationFlags.slice(0, 2)) {
    out.push({
      id: `talent-calibration-${c.row.businessUnit}`,
      metricId: M.calibrationRule,
      severity: 'warning',
      title: `Calibration lowered ${c.row.businessUnit} ratings by ${fmt(c.row.shift, 'num2')} points on average in ${perf.cycle?.cycle ?? 'the latest cycle'}, vs ${fmt(c.rest.shift, 'num2')} elsewhere.`,
      detail: `Calibration moved ${pct0(c.row.movedDown)} of manager-proposed ratings down in ${c.row.businessUnit}, against ${pct0(c.rest.movedDown)} in the rest of the scope.`,
      action: `Brief ${c.row.businessUnit} managers on the rating guideline before they propose ratings next cycle.`,
      filter: { businessUnit: [c.row.businessUnit] },
      tab: 'performance',
      drill: drill.calibration(c.row.businessUnit, 'all'),
      uses: uses['talent-calibration'],
    })
  }

  // Required training overdue, where it concentrates.
  const conc = learning.concentration
  if (conc?.top) {
    const t = conc.top
    const where = segmentName(t.dim, t.value)
    const critical =
      t.segValue >= rule.overdueCriticalShare &&
      t.affected >= rule.overdueCriticalPeople &&
      CRITICAL_TRAINING.test(conc.category)
    out.push({
      id: 'talent-training-overdue',
      metricId: M.trainingOverdueRule,
      severity: critical ? 'critical' : 'warning',
      title: `${t.affected} of ${t.population} people in ${where} (${pct(t.segValue)}) are overdue on ${conc.course}, vs ${pct(t.compValue)} elsewhere.`,
      detail: `${conc.second ? `${segmentText(conc.second).replace(/^./, (m) => m.toUpperCase())} is also high. ` : ''}${conc.dueDate ? `The course was due ${formatDate(conc.dueDate)}; ` : ''}${plural(conc.overdue, 'person is', 'people are')} overdue on it in total.`,
      action: `Ask ${where} leaders to agree on a completion date for ${conc.course} with their teams.`,
      people: people(conc.segmentPeople.map((p) => ({ ...p, note: `${p.department}, ${p.location}` }))),
      filter: segmentFilter(t.dim, t.value),
      tab: 'learning',
      drill: drill.overdueSegment(),
      uses: uses['talent-training-overdue'],
    })
  }

  // High performers overdue for promotion.
  if (overdue.available && overdue.rows.length >= Math.max(1, rule.promotionMinPeople)) {
    const n = overdue.rows.length
    const top = overdue.top?.dim === 'department' ? overdue.top : null
    const inTop = top ? overdue.rows.filter((r) => r.department === top.value) : []
    const levels = [...new Set(inTop.map((r) => r.level ?? '—'))].sort()
    const [c1, c2] = overdue.cycles
    const years = s.promotionYears
    out.push({
      id: 'talent-promotion-overdue',
      metricId: M.promotionOverdueRule,
      severity: 'warning',
      title: `${plural(n, 'consistent high performer has', 'consistent high performers have')} had no promotion in ${yearsOrMore(years)}${top ? `, ${inTop.length} of them in ${top.value}` : ''}.`,
      detail: `${n === 1 ? 'They were' : 'All were'} rated ${hi} in ${c1.cycle} and ${c2.cycle} and have been here at least ${years === 1 ? 'a year' : `${+years.toFixed(1)} years`}.${top && levels.length <= 3 ? ` In ${top.value} they are at ${listText(levels)}.` : ''}`,
      action:
        'Review promotion readiness for these people with their managers before the next promotion cycle.',
      people: people(overdue.rows.map((r) => ({ ...r, note: `${r.department}, ${r.level ?? '—'}` }))),
      filter: top ? { department: [top.value] } : undefined,
      tab: 'retention',
      drill: drill.promotionOverdue(),
      uses: uses['talent-promotion-overdue'],
    })
  }

  // Key talent at risk.
  const kt = ret.keyTalent
  if (kt.length > 0) {
    const inKey = (key: string) =>
      kt.filter((k) => risk.scores.get(k.employeeId)?.factors.some((f) => f.key === key)).length
    const common = ret.commonFactors.filter((k) => risk.points[k] > 0)
    const reasons = ret.drivers
      .filter((d) => !d.common && d.anyReason > 0)
      .map((d) => ({ d, n: inKey(d.key) }))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2)
    const share = ret.highPerformers >= s.minGroup ? kt.length / ret.highPerformers : null
    const seg = ret.keyTalentTop
    const bt = risk.backTest
    const where = seg ? `${seg.affected} of them are in ${segmentName(seg.dim, seg.value)}. ` : ''
    const commonText = common.length
      ? `Most of the high band shares ${listText(common.map((k) => factorDef.get(k)!.label.toLowerCase()))}`
      : ''
    const reasonText = reasons.length
      ? `${commonText ? `${commonText}; beyond that, the` : 'The'} most common reasons are ${listText(reasons.map((r) => `${r.d.factor.toLowerCase()} (${r.n})`))}.`
      : commonText
        ? `${commonText}.`
        : ''
    const btText =
      bt.lift != null && bt.lift >= 1.2
        ? `Scored a year ago with the points known then, the high band left at ${bt.lift.toFixed(1)}× the rate of the low band.`
        : ''
    out.push({
      id: 'talent-key-talent-risk',
      metricId: M.keyTalentRule,
      severity: 'warning',
      title: `${plural(kt.length, 'person', 'people')} rated ${hi} ${kt.length === 1 ? 'is' : 'are'} in the high flight-risk band${share != null ? `, ${pct(share)} of high performers` : ''}.`,
      detail: `${where}${reasonText} ${btText}`.trim(),
      action: 'Ask their managers to hold stay conversations this month, starting with the highest scores.',
      people: people(kt.map((k) => ({ ...k, note: `${k.department} · ${k.reason1}` }))),
      filter: seg && seg.share >= 0.3 ? segmentFilter(seg.dim, seg.value) : undefined,
      tab: 'retention',
      drill: drill.keyTalent(),
      uses: uses['talent-key-talent-risk'],
    })
  }

  const good = goodFinding(x)
  if (good) out.push(good)
  return out
}

/** "above the 95% target" (or "at" it), or "within the target of at most 8%". */
function againstTarget(rate: number, t: MetricTarget): string {
  if (t.comparator !== '>=') return `within the target of ${targetWords(t)}`
  return `${rate > t.value + 1e-12 ? 'above' : 'at'} the ${targetWords(t)} target`
}

/** One finding about something clearly working, when there is one. */
function goodFinding(x: FindingInputs): Finding | null {
  const { base, performance: perf, succession: succ, learning, drill } = x
  const uses = x.lineage.finding
  const s = base.settings
  const rule = s.findings
  const cur = learning.current
  const target = s.onTimeTarget
  const met = targetStatus(cur.rate, target) === 'met'
  if (cur.rate != null && target && met && cur.due >= rule.goodTrainingMinDue) {
    return {
      id: 'talent-good-training',
      metricId: M.goodTrainingRule,
      severity: 'good',
      title: `${pct(cur.rate)} of required training due in this period was completed on time, ${againstTarget(cur.rate, target)}.`,
      detail: `${cur.onTime} of ${cur.due} assignments were done by their due date.`,
      action: 'Keep the current reminder schedule for the next campaign.',
      tab: 'learning',
      drill: drill.onTime(null, 'onTime'),
      uses: uses['talent-good-training'],
    }
  }
  const calibrated = new Set(perf.calibrationFlags.map((c) => c.row.businessUnit))
  const match = perf.byBusinessUnit
    .filter(
      (g) =>
        !g.other &&
        g.high != null &&
        g.share != null &&
        g.rated >= rule.goodDistributionMinRated &&
        Math.abs(g.share - s.highGuideline) <= rule.goodDistributionTolerance + 1e-12 &&
        !calibrated.has(g.group),
    )
    .sort((a, b) => b.rated - a.rated)[0]
  if (match && match.share != null) {
    const hi = highRatingText(s.highRating)
    return {
      id: 'talent-good-distribution',
      metricId: M.goodDistributionRule,
      severity: 'good',
      title: `${match.group} ratings match the guideline: ${pct0(match.share)} rated ${hi} against ${pct0(s.highGuideline)}.`,
      detail: `${match.high} of ${match.rated} people rated in ${perf.cycle?.cycle ?? 'the latest cycle'} received a ${hi}.`,
      action: `Use the ${match.group} calibration approach as the reference in the next cycle.`,
      filter: { businessUnit: [match.group] },
      tab: 'performance',
      drill: drill.unitHigh(match.group),
      uses: uses['talent-good-distribution'],
    }
  }
  if (
    succ.coverage != null &&
    succ.coverage >= rule.goodSuccessionCoverage - 1e-12 &&
    succ.critical >= rule.goodSuccessionMinCritical
  ) {
    return {
      id: 'talent-good-succession',
      metricId: M.goodSuccessionRule,
      severity: 'good',
      title: `${pct(succ.coverage)} of critical roles have a successor who is ready now.`,
      detail: `${succ.criticalCovered} of ${succ.critical} critical roles are covered.`,
      action: 'Keep the bench current at the next talent review.',
      tab: 'succession',
      drill: drill.coverage(),
      uses: uses['talent-good-succession'],
    }
  }
  return null
}

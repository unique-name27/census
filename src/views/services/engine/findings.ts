/**
 * The readout: findings a people operations lead would raise, most severe first.
 *
 * Each rule is a metric in the dictionary (../metrics.ts, `M.spike` …) and every finding names
 * it (`metricId`). The thresholds are that metric's settings, read once per context into
 * `settings` (engine/settings.ts); the defaults are:
 *
 *  - volume spike: a category's month at 1.8× or more of its trailing 6-month median (and at
 *    least 15 cases above it), skipping peaks that also happened in the same month a year earlier;
 *  - category resolution SLA under 80% (at least 20 cases), with the waiting-on-third-party share,
 *    unless the category already has a spike or aged-backlog finding;
 *  - final pay on time under 95% in a jurisdiction (at least 5 exits and 2 late);
 *  - new hire Day −3 readiness under 95% in a region that trails the other regions by 3 pts or
 *    more, or under 90% at a site elsewhere;
 *  - a channel's satisfaction 0.5 or more below the other channels (20+ responses on each side);
 *  - a category reopened at 2× the overall reopen rate or more (at least 5 reopens);
 *  - open cases older than 30 days, by category (at least 3);
 *  - retro adjustments above the DS-01 target of 2% of job and pay changes;
 *  - one good finding: the strongest category on resolution SLA (95% or better on 50+ cases).
 */
import type { Finding, FindingPerson, Severity } from '@/components/types'
import { type Employee, SITES } from '@/data/schema'
import type { Filters, Window } from '@/data/scope'
import { addMonths, formatDate, formatMonth, monthsBetween } from '@/lib/dates'
import { type Dimension, decomposeRate, type Segment } from '@/lib/decompose'
import { fmt, plural } from '@/lib/format'
import { groupBy, median } from '@/lib/stats'
import { M } from '../metrics'
import {
  type CategoryRow,
  type ChannelRow,
  medianHours,
  monthlyCounts,
  openedIn,
  type ReopenRow,
  resolutionSla,
  resolvedIn,
} from './cases'
import { ATLAS_PROCESSES, FINAL_PAY_RULES } from './catalog'
import {
  caseDrill,
  csatDrill,
  type DrillScope,
  drillWhen,
  monthSub,
  onTimeDrill,
  openDrill,
  reopenDrill,
  resolutionDrill,
  retroDrill,
} from './drills'
import { type CaseFact, dueIn, onTimeRate, type TxFact } from './facts'
import { type Lineage, union, when } from './lineage'
import { pctWords, type ServicesSettings } from './settings'
import { type FinalPayRow, retroCandidates, retroShare, type SiteRow } from './transactions'
import { duration, isOther } from './util'

export interface FindingInputs {
  facts: readonly CaseFact[]
  tx: readonly TxFact[]
  window: Window
  asOf: string
  people: ReadonlyMap<string, Employee>
  categories: readonly CategoryRow[]
  channels: readonly ChannelRow[]
  reopen: readonly ReopenRow[]
  finalPay: readonly FinalPayRow[]
  newHireSites: readonly SiteRow[]
  newHireRegions: readonly SiteRow[]
  /** Fewer than 5 people in scope: any finding would be about individuals, so none is raised. */
  small?: boolean
  /** Scope for the drill-downs behind each finding's number. */
  scope: DrillScope
  /** The fields behind each measure (engine/lineage.ts). */
  lineage: Lineage
  /** Each rule's thresholds, the targets and the anonymity minimum in force. */
  settings: ServicesSettings
}

interface Ranked extends Finding {
  /** Lower comes first within a severity. */
  rank: number
  /** The case category a finding is about, so one category isn't raised twice. */
  category?: string
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

const pct = (v: number | null) => fmt(v, 'pct')
const x1 = (v: number) => `${v.toFixed(1)}×`

/** "the PY-05 payroll correction steps", or "the process steps" when the ID is unknown. */
function stepsOf(processId: string | null): string {
  const p = processId ? ATLAS_PROCESSES.get(processId) : undefined
  return p ? `the ${p.id} ${p.short} steps` : 'the process steps'
}

/* ───────────── where a case problem concentrates ───────────── */

interface Located {
  f: CaseFact
  e: Employee | undefined
}

const CASE_DIMS: Dimension<Located>[] = [
  { key: 'location', label: 'Location', get: (r) => r.e?.location ?? null },
  { key: 'businessUnit', label: 'Business unit', get: (r) => r.e?.businessUnit ?? null },
  { key: 'department', label: 'Department', get: (r) => r.e?.department ?? null },
]

/** The org segment holding most of the problem, when one clearly does. */
function concentration(
  rows: readonly CaseFact[],
  isAffected: (f: CaseFact) => boolean,
  people: ReadonlyMap<string, Employee>,
): Segment | null {
  const located = rows.map((f) => ({ f, e: f.requesterId ? people.get(f.requesterId) : undefined }))
  const [top] = decomposeRate(located, CASE_DIMS, (r) => isAffected(r.f), { minDev: 0.05, top: 1 })
  if (!top || top.small || top.share < 0.4 || top.segValue < 1.5 * top.compValue) return null
  return top
}

const segmentFilter = (s: Segment | null): Partial<Filters> | undefined =>
  s ? ({ [s.dim]: [s.value] } as Partial<Filters>) : undefined

const segmentSentence = (s: Segment | null, what: string): string =>
  s
    ? ` ${s.value} accounts for ${fmt(s.share, 'pct0')} of the ${what} (${fmt(s.segValue, 'pct0')} of its cases, against ${fmt(s.compValue, 'pct0')} elsewhere).`
    : ''

/**
 * Categories with enough open cases past the aged-backlog age limit (3 older than 30 days by
 * default): reported once, by the aged-backlog rule.
 */
function agedGroups(x: FindingInputs): Map<string, CaseFact[]> {
  const { days, minCases } = x.settings.agedBacklog
  const groups = groupBy(
    x.facts.filter((f) => f.open && (f.ageDays ?? 0) > days),
    (f) => f.category,
  )
  return new Map([...groups].filter(([, list]) => list.length >= minCases))
}

/* ───────────── rules ───────────── */

function volumeSpikes(x: FindingInputs): Ranked[] {
  const cfg = x.settings.spike
  const min = x.settings.minGroup
  const months = new Set(x.facts.map((f) => f.month))
  if (!months.size) return []
  const first = [...months].sort()[0]
  const windowMonths = monthsBetween(x.window.start, x.window.end)
  const out: Ranked[] = []
  const categories = [...new Set(x.facts.map((f) => f.category))]
  for (const category of categories) {
    const counts = monthlyCounts(x.facts, category)
    let best: { month: string; count: number; base: number } | null = null
    for (const m of windowMonths) {
      const count = counts.get(m) ?? 0
      const trailing: number[] = []
      for (let i = 1; i <= cfg.baselineMonths; i++) {
        const k = addMonths(`${m}-01`, -i).slice(0, 7)
        if (k >= first) trailing.push(counts.get(k) ?? 0)
      }
      if (trailing.length < 3) continue
      const base = median(trailing) ?? 0
      if (base < cfg.minBase || count < cfg.factor * base || count - base < cfg.minExtra) continue
      // A peak that also happened a year earlier is seasonal (open enrollment, focal cycles).
      const lastYear = addMonths(`${m}-01`, -12).slice(0, 7)
      if (lastYear >= first && (counts.get(lastYear) ?? 0) >= cfg.seasonalFactor * base) continue
      if (!best || count / base > best.count / best.base) best = { month: m, count, base }
    }
    if (!best) continue
    const { month, count, base } = best
    const inWindow = openedIn(x.facts, x.window).filter((f) => f.category === category)
    const spike = inWindow.filter((f) => f.month === month)
    const rest = inWindow.filter((f) => f.month !== month)
    const slaSpike = resolutionSla(spike, min)
    const slaRest = resolutionSla(rest, min)
    const dropped =
      slaSpike.rate != null &&
      (slaSpike.rate < cfg.slaFloor || (slaRest.rate != null && slaRest.rate - slaSpike.rate >= cfg.slaDrop))
    const seg = concentration(inWindow, (f) => f.month === month, x.people)
    const monthRows = x.facts.filter((f) => f.category === category && f.month === month)
    const slaText =
      slaSpike.rate == null
        ? ''
        : ` Resolution SLA for those cases was ${pct(slaSpike.rate)}${
            slaRest.rate == null ? '' : `, against ${pct(slaRest.rate)} in the other months of the period`
          }.`
    out.push({
      id: `services-spike-${slug(category)}`,
      metricId: M.spike,
      severity: dropped ? 'critical' : 'warning',
      title: `${category} cases rose to ${fmt(count, 'int')} in ${formatMonth(`${month}-01`)}, ${x1(count / base)} the usual ${fmt(base, 'int')} a month.`,
      detail: `${slaText.trim()}${segmentSentence(seg, 'cases that month')}`.trim() || undefined,
      action: `Review ${stepsOf(spike[0]?.processId ?? null)} with the ${spike[0]?.team ?? category} team and confirm what drove the ${formatMonth(`${month}-01`)} volume.`,
      filter: segmentFilter(seg),
      tab: 'cases',
      drill: drillWhen(x.scope, monthRows, () =>
        caseDrill(x.scope, monthRows, {
          title: `Cases opened, ${category}, ${formatMonth(`${month}-01`)}`,
          subtitle: monthSub(x.scope, month),
          order: (a, b) => Number(b.resolutionMet === false) - Number(a.resolutionMet === false),
        }),
      ),
      // The SLA rates set the severity and the detail; a segment adds the requester's org.
      uses: union(
        x.lineage.opened,
        x.lineage.category,
        when(slaSpike.rate != null, x.lineage.resolutionSla),
        when(seg, x.lineage.segment),
      ),
      rank: 3,
      category,
    })
  }
  return out
}

/**
 * Categories under the floor (80%) on resolution SLA. A category already raised by the aged-backlog
 * rule or by a volume spike (whose finding carries the SLA drop) is not raised again.
 */
function slowCategories(x: FindingInputs, raised: ReadonlySet<string>): Ranked[] {
  const cfg = x.settings.slow
  const slaTarget = x.settings.resolutionTarget
  const out: Ranked[] = []
  const openNow = x.facts.filter((f) => f.open)
  const aged = agedGroups(x)
  for (const r of x.categories) {
    if (r.slaRate == null || r.slaN < cfg.minCases || r.slaRate >= cfg.floor || !r.processId) continue
    if (aged.has(r.category) || raised.has(r.category)) continue
    const open = openNow.filter((f) => f.category === r.category)
    const waiting = open.filter((f) => f.status === 'Waiting on third party')
    const inWindow = openedIn(x.facts, x.window).filter((f) => f.category === r.category)
    const target = inWindow[0]?.resolutionTarget ?? null
    const targetDays = target == null ? null : target / 24
    const pastTarget = targetDays == null ? 0 : waiting.filter((f) => (f.ageDays ?? 0) > targetDays).length
    const seg = concentration(inWindow, (f) => f.resolutionMet === false, x.people)
    const waitText = waiting.length
      ? `${fmt(waiting.length, 'int')} of the ${plural(open.length, 'open case')} ${
          waiting.length === 1 ? 'is' : 'are'
        } waiting on a third party${
          pastTarget && targetDays != null
            ? `, ${fmt(pastTarget, 'int')} of them past the ${fmt(targetDays, 'days')} target`
            : ''
        }.`
      : ''
    const action = waiting.length
      ? `Review the open ${r.processId} cases with the ${r.team} team and agree a follow-up date for each one waiting on a third party.`
      : open.length
        ? `Review the open ${r.processId} cases with the ${r.team} team.`
        : `Review ${stepsOf(r.processId)} with the ${r.team} team, starting with the cases that missed the target.`
    out.push({
      id: `services-sla-${slug(r.category)}`,
      metricId: M.slow,
      severity: r.slaRate < cfg.critical ? 'critical' : 'warning',
      title: `${r.category} met its resolution SLA on ${pct(r.slaRate)} of cases, against the ${pctWords(slaTarget)} target.`,
      detail: twoSentences([
        {
          text: `${fmt(r.slaN - (r.slaMet ?? 0), 'int')} of ${fmt(r.slaN, 'int')} cases opened in the period missed it.`,
          priority: 3,
        },
        { text: waitText, priority: 1 },
        { text: segmentSentence(seg, 'missed cases'), priority: 2 },
      ]),
      action,
      filter: segmentFilter(seg),
      tab: 'cases',
      drill: drillWhen(x.scope, r.records, () =>
        resolutionDrill(x.scope, r.records, `Cases judged on resolution SLA, ${r.category}, ${x.scope.per}`),
      ),
      // Only categories with an Atlas process are raised, so the process counts too.
      uses: union(
        x.lineage.resolutionSla,
        x.lineage.category,
        x.lineage.process,
        when(seg, x.lineage.segment),
      ),
      rank: 2,
      category: r.category,
    })
  }
  return out
}

function finalPayLate(x: FindingInputs): Ranked[] {
  const cfg = x.settings.finalPay
  const target = x.settings.levelTargets['of05-final-pay']
  const exits = dueIn(x.tx, x.window).filter((f) => f.type === 'Termination')
  return x.finalPay
    .filter(
      (r) =>
        r.rate != null &&
        r.exits >= cfg.minExits &&
        (r.late ?? 0) >= cfg.minLate &&
        r.rate < cfg.floor &&
        r.jurisdiction !== 'unknown' &&
        r.jurisdiction !== 'other',
    )
    .map((r) => {
      const late = exits.filter(
        (f) => f.jurisdiction === r.jurisdiction && (f.outcome === 'late' || f.outcome === 'overdue'),
      )
      const split =
        r.involuntaryRate != null && r.voluntaryRate != null && r.voluntaryRate - r.involuntaryRate >= 0.1
          ? ` Involuntary exits were on time for ${pct(r.involuntaryRate)} (${r.involuntaryN} exits), voluntary exits for ${pct(r.voluntaryRate)}.`
          : ''
      const by = r.medianDaysLate != null ? `, by a median ${fmt(r.medianDaysLate, 'days')}` : ''
      const sites = SITES.filter((s) => s.jurisdiction === r.jurisdiction).map((s) => s.location)
      return {
        id: `services-final-pay-${r.jurisdiction}`,
        metricId: M.finalPayLate,
        severity: 'critical' as const,
        title: `Final pay was on time for ${pct(r.rate)} of exits in ${r.name}, against a ${pctWords(target)} target.`,
        detail: `${r.late} of ${r.exits} were paid after the deadline (${FINAL_PAY_RULES.get(r.jurisdiction)?.phrase ?? 'the due date in the file'})${by}.${split}`,
        action: `Review the OF-05 final pay steps for ${r.name} with the Payroll team.`,
        people: late.slice(0, 50).map(personOfTx),
        peopleTotal: late.length > 50 ? late.length : undefined,
        filter: sites.length ? { location: sites } : undefined,
        tab: 'transactions',
        drill: drillWhen(x.scope, r.records, () =>
          onTimeDrill(x.scope, r.records, `Final pay due, ${r.name}, ${x.scope.per}`, { exitType: true }),
        ),
        uses: union(x.lineage.onTime, x.lineage.txType, x.lineage.site, when(split, x.lineage.exitType)),
        rank: 1 + (r.rate ?? 1),
      }
    })
}

function newHireReadiness(x: FindingInputs): Ranked[] {
  const cfg = x.settings.newHire
  const target = pctWords(x.settings.levelTargets['on03-hire-day-minus-3'])
  const hires = dueIn(x.tx, x.window).filter((f) => f.type === 'New hire')
  const out: Ranked[] = []
  const flaggedRegions = new Set<string>()
  for (const r of x.newHireRegions) {
    // A shown rate already stands on at least the anonymity minimum of starts.
    if (r.rate == null || (r.late ?? 0) < cfg.minLate || r.rate >= cfg.regionFloor || r.region === '—')
      continue
    // The other regions, from the transactions themselves (their rows may be folded or hidden).
    const restRate = onTimeRate(
      hires.filter((f) => f.region !== r.region),
      x.settings.minGroup,
    ).rate
    // A region that matches or beats the others is not the problem: the gap must be real.
    if (restRate != null && restRate - r.rate < cfg.regionGap) continue
    flaggedRegions.add(r.region)
    const sites = x.newHireSites.filter(
      (s) => s.region === r.region && s.rate != null && s.rate < cfg.regionFloor,
    )
    const late = hires.filter(
      (f) => f.region === r.region && (f.outcome === 'late' || f.outcome === 'overdue'),
    )
    out.push({
      id: `services-new-hire-${slug(r.region)}`,
      metricId: M.newHireGap,
      severity: 'warning',
      title: `New hires in ${r.region} were ready by Day −3 for ${pct(r.rate)} of starts, against a ${target} target.`,
      detail: `${r.late} of ${r.starts} hires were entered after Day −3${
        restRate != null ? `, against ${pct(restRate)} ready in the other regions` : ''
      }.${sites.length ? ` By site: ${sites.map((s) => `${s.location} ${pct(s.rate)}`).join(', ')}.` : ''}`,
      action: `Review the ON-03 hire entry steps for ${r.region} sites with the People operations team.`,
      people: late.slice(0, 50).map(personOfTx),
      peopleTotal: late.length > 50 ? late.length : undefined,
      filter: sites.length ? { location: sites.map((s) => s.location) } : undefined,
      // The ON-03 service level; readiness by site itself is on Onboarding, First 90 days.
      tab: 'levels',
      drill: drillWhen(x.scope, r.records, () =>
        onTimeDrill(x.scope, r.records, `New hires due, ${r.region}, ${x.scope.per}`),
      ),
      uses: union(x.lineage.onTime, x.lineage.txType, x.lineage.site),
      rank: 4,
    })
  }
  for (const s of x.newHireSites) {
    if (
      s.rate == null ||
      s.starts < cfg.siteMinStarts ||
      (s.late ?? 0) < cfg.minLate ||
      s.rate >= cfg.siteFloor
    )
      continue
    if (flaggedRegions.has(s.region) || s.region === '—') continue
    const late = hires.filter(
      (f) => f.location === s.location && (f.outcome === 'late' || f.outcome === 'overdue'),
    )
    out.push({
      id: `services-new-hire-${slug(s.location)}`,
      metricId: M.newHireGap,
      severity: 'warning',
      title: `New hires in ${s.location} were ready by Day −3 for ${pct(s.rate)} of starts, against a ${target} target.`,
      detail: `${s.late} of ${s.starts} hires were entered after Day −3.`,
      action: `Review the ON-03 hire entry steps for ${s.location} with the People operations team.`,
      people: late.slice(0, 50).map(personOfTx),
      peopleTotal: late.length > 50 ? late.length : undefined,
      filter: { location: [s.location] },
      tab: 'levels',
      drill: drillWhen(x.scope, s.records, () =>
        onTimeDrill(x.scope, s.records, `New hires due, ${s.location}, ${x.scope.per}`),
      ),
      uses: union(x.lineage.onTime, x.lineage.txType, x.lineage.site),
      rank: 4,
    })
  }
  return out
}

function channelGap(x: FindingInputs): Ranked[] {
  const cfg = x.settings.csatGap
  const scored = x.channels.filter((c) => c.csat != null)
  const out: Ranked[] = []
  for (const c of scored) {
    if (c.responses < cfg.minResponses || isOther(c.channel)) continue
    const others = scored.filter((o) => o !== c)
    const n = others.reduce((a, o) => a + o.responses, 0)
    if (!others.length || n < cfg.minResponses) continue
    const rest = others.reduce((a, o) => a + (o.csat as number) * o.responses, 0) / n
    const gap = rest - (c.csat as number)
    if (gap < cfg.gap) continue
    out.push({
      id: `services-csat-${slug(c.channel)}`,
      metricId: M.csatGap,
      severity: 'warning',
      title: `${c.channel} cases score ${fmt(c.csat, 'num1')} out of 5 on satisfaction, ${fmt(gap, 'num1')} below the other channels.`,
      detail: `Based on ${plural(c.responses, `${c.channel.toLowerCase()} response`)} in the period. ${others.map((o) => `${o.channel} ${fmt(o.csat, 'num1')}`).join(', ')}.`,
      action: `Review a sample of low-scoring ${c.channel.toLowerCase()} cases with the team leads and look at moving routine requests to the portal.`,
      tab: 'cases',
      drill: drillWhen(x.scope, c.resolvedRecords, () =>
        csatDrill(x.scope, c.resolvedRecords, `Cases rated for satisfaction, ${c.channel}, ${x.scope.per}`),
      ),
      uses: union(x.lineage.csat, x.lineage.channel),
      rank: 7,
    })
  }
  return out
}

function reopenHotspots(x: FindingInputs): Ranked[] {
  const cfg = x.settings.reopen
  const all = x.reopen.filter((r) => !isOther(r.category))
  // Company totals from the cases themselves (folded or hidden rows carry no counts).
  const judged = openedIn(x.facts, x.window).filter((f) => f.resolved != null && f.reopened != null)
  const resolved = judged.length
  const reopened = judged.filter((f) => f.reopened).length
  if (resolved < cfg.minResolved) return []
  const company = reopened / resolved
  const out: Ranked[] = []
  for (const r of all) {
    if (r.reopenRate == null || r.reopened == null) continue
    if (r.resolved < cfg.minResolved || r.reopened < cfg.minReopens || company <= 0) continue
    if (r.reopenRate < cfg.multiple * company) continue
    const restN = resolved - r.resolved
    const rest = restN > 0 ? (reopened - r.reopened) / restN : null
    const processId = x.categories.find((c) => c.category === r.category)?.processId ?? null
    const team = x.categories.find((c) => c.category === r.category)?.team ?? 'owning'
    const inWindow = openedIn(x.facts, x.window).filter((f) => f.category === r.category && f.resolved)
    const seg = concentration(inWindow, (f) => f.reopened === true, x.people)
    out.push({
      id: `services-reopen-${slug(r.category)}`,
      metricId: M.reopenHotspot,
      severity: 'warning',
      title: `${r.category} cases were reopened ${pct(r.reopenRate)} of the time, ${x1(r.reopenRate / company)} the rate across all cases.`,
      detail: `${r.reopened} of ${r.resolved} resolved cases opened in the period came back${
        rest != null ? `, against ${pct(rest)} in other categories` : ''
      }.${segmentSentence(seg, 'reopened cases')}`,
      action: `Review ${stepsOf(processId)} with the ${team} team, starting with the reopened cases.`,
      filter: segmentFilter(seg),
      tab: 'cases',
      drill: drillWhen(x.scope, r.records, () =>
        reopenDrill(x.scope, r.records, `Reopened cases, ${r.category}, ${x.scope.per}`),
      ),
      uses: union(x.lineage.reopen, x.lineage.category, when(seg, x.lineage.segment)),
      rank: 6,
    })
  }
  return out
}

function agedBacklog(x: FindingInputs): Ranked[] {
  const days = x.settings.agedBacklog.days
  const target = x.settings.resolutionTarget
  const anyAged = new Set(x.facts.filter((f) => f.open && (f.ageDays ?? 0) > days).map((f) => f.category))
  const out: Ranked[] = []
  for (const [category, list] of agedGroups(x)) {
    const oldest = Math.max(...list.map((f) => f.ageDays ?? 0))
    const others = [...anyAged].filter((c) => c !== category)
    const otherText = others.length
      ? `Other categories with open cases this old: ${others.join(', ')}.`
      : 'No other category has open cases this old.'
    const row = x.categories.find((c) => c.category === category)
    const slaText =
      row?.slaRate != null && row.slaRate < target
        ? `; resolution SLA for the category was ${pct(row.slaRate)} in the period`
        : ''
    const first = list[0]
    out.push({
      id: `services-aged-${slug(category)}`,
      metricId: M.agedBacklog,
      severity: 'warning',
      title: `${plural(list.length, `${category} case`, `${category} cases`)} ${list.length === 1 ? 'has' : 'have'} been open for more than ${plural(days, 'day')}, the oldest for ${fmt(oldest, 'days')}.`,
      detail: `By status: ${countWords(list.map((f) => f.status))}${slaText}. ${otherText}`,
      action: `Review each open ${first.processId ? `${first.processId} ` : ''}case with the ${first.team} team and agree a next step and date.`,
      tab: 'cases',
      // These cases are listed one by one in the aging table, so only the scope gate applies.
      drill: drillWhen(
        x.scope,
        list,
        () => openDrill(x.scope, list, `Cases open more than ${plural(days, 'day')}, ${category}`, true),
        true,
      ),
      uses: union(x.lineage.open, x.lineage.category, when(slaText, x.lineage.resolutionSla)),
      rank: 5,
    })
  }
  return out
}

function retroAdjustments(x: FindingInputs): Ranked[] {
  const cfg = x.settings.retro
  // The DS-01 ceiling is strict ("under 2%"): reaching it misses it.
  const ceiling = x.settings.levelTargets['ds01-retro-share']
  const r = retroShare(x.tx, x.window, x.settings.minGroup)
  if (r.rate == null || r.n < cfg.minChanges || r.rate < ceiling) return []
  const changes = retroCandidates(dueIn(x.tx, x.window))
  return [
    {
      id: 'services-retro',
      metricId: M.retroOver,
      severity: r.rate >= cfg.warning ? 'warning' : 'info',
      title: `${pct(r.rate)} of job and pay changes missed the payroll cut-off and needed a retro adjustment, against a DS-01 target under ${pctWords(ceiling)}.`,
      detail: `${r.retro} of ${r.n} changes due in the period. Each one means a correction on a later payslip.`,
      action: 'Review the DS-01 cut-off calendar with the HRIS and Payroll teams.',
      tab: 'transactions',
      drill: drillWhen(x.scope, changes, () =>
        retroDrill(x.scope, changes, `Retro adjustments, ${x.scope.per}`),
      ),
      uses: x.lineage.retro,
      rank: 8,
    },
  ]
}

function strongest(x: FindingInputs): Ranked[] {
  const cfg = x.settings.strongest
  const target = x.settings.resolutionTarget
  const best = x.categories
    .filter(
      (r) =>
        r.slaRate != null &&
        r.slaN >= cfg.minCases &&
        r.slaRate >= cfg.floor &&
        !r.category.startsWith('Other ('),
    )
    .sort((a, b) => (b.slaRate as number) - (a.slaRate as number))[0]
  if (!best) return []
  const p = best.processId ? ATLAS_PROCESSES.get(best.processId) : undefined
  const hours = duration(
    medianHours(
      resolvedIn(x.facts, x.window).filter((f) => f.category === best.category),
      x.settings.minGroup,
    ).hours,
  )
  const gap = ((best.slaRate as number) - target) * 100
  return [
    {
      id: `services-good-${slug(best.category)}`,
      metricId: M.strongest,
      severity: 'good',
      title: `${best.category} cases met the resolution SLA ${pct(best.slaRate)} of the time across ${fmt(best.slaN, 'int')} cases.`,
      detail: `That is ${fmt(Math.abs(gap), 'num1')} pts ${gap >= 0 ? 'above' : 'below'} the ${pctWords(target)} target${
        hours.value != null ? `, with a median time to resolve of ${fmt(hours.value, hours.format)}` : ''
      }.`,
      action: p
        ? `Share how the ${best.team} team runs the ${p.id} ${p.short} queue with the other teams.`
        : `Share how the ${best.team} team runs this queue with the other teams.`,
      tab: 'cases',
      drill: drillWhen(x.scope, best.records, () =>
        resolutionDrill(
          x.scope,
          best.records,
          `Cases judged on resolution SLA, ${best.category}, ${x.scope.per}`,
        ),
      ),
      uses: union(x.lineage.resolutionSla, x.lineage.category, when(hours.value != null, x.lineage.resolved)),
      rank: 9,
    },
  ]
}

/* ───────────── assembly ───────────── */

export function buildFindings(x: FindingInputs): Finding[] {
  if (x.small) return []
  const spikes = volumeSpikes(x)
  const spiked = new Set(spikes.flatMap((f) => (f.category ? [f.category] : [])))
  const all: Ranked[] = [
    ...finalPayLate(x),
    ...slowCategories(x, spiked),
    ...spikes,
    ...newHireReadiness(x),
    ...agedBacklog(x),
    ...reopenHotspots(x),
    ...channelGap(x),
    ...retroAdjustments(x),
    ...strongest(x),
  ]
  return all
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rank - b.rank)
    .map(({ rank: _rank, category: _category, ...f }) => f)
}

/* ───────────── helpers ───────────── */

/** The two most useful sentences, kept in reading order (findings carry at most two). */
function twoSentences(parts: { text: string; priority: number }[]): string | undefined {
  const keep = new Set(
    parts
      .filter((p) => p.text.trim())
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 2),
  )
  const text = parts
    .filter((p) => keep.has(p))
    .map((p) => p.text.trim())
    .join(' ')
  return text || undefined
}

function personOfTx(f: TxFact): FindingPerson {
  const when = f.completed ? `processed ${formatDate(f.completed)}` : 'not yet processed'
  return {
    id: f.employeeId,
    name: f.name ?? f.employeeId,
    note: `${f.location ?? 'Unknown site'}, due ${formatDate(f.due)}, ${when}`,
  }
}

function countWords(values: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `${n} ${v.toLowerCase()}`)
    .join(', ')
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

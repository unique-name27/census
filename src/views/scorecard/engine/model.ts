/**
 * The People scorecard as data (docs/VIEWS.md, Scorecard): every practice's measures from its
 * view's `summary(ctx)`, judged against the target in force, gated on the data standard, and the
 * most serious findings across Census. Pure: the summaries come in already computed (see
 * `schedule.ts`, which runs them in idle time), so this is cheap and testable.
 *
 * It follows the mode (`ctx.access`): a mode never shows numbers from a practice it hides, so a
 * practice whose view the mode hides is left out (`practiceShown`), and so is a measure or finding
 * whose metric it hides (`metricShown`). A practice left with no measure by the mode is left out
 * too. Ask's `view_summary` for the Scorecard reads this same model.
 */
import type { AccessContext } from '@/access/context'
import { S } from '@/access/surfaces'
import { kpiValueText, SUPPRESSED_NOTE } from '@/components/kpiModel'
import { gateFor, type TierGate } from '@/components/tier/tierModel'
import type { Finding, Kpi, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { DatasetKey, ViewKey } from '@/data/schema'
import type { RouteView } from '@/data/store'
import { plural } from '@/lib/format'
import { kpiTarget } from '@/metrics/api'
import { targetText } from '@/metrics/overrides'
import type { MetricsApi, MetricTarget } from '@/metrics/types'
import type { ViewDef, ViewSummary } from '../../types'
import { M, P } from '../metrics'
import { type Judgement, judge, missSeverity, type ScoreStatus, watchMargins } from './status'

/** What the scorecard needs of a view: its key, name, tabs and datasets. */
export type PracticeView = Pick<ViewDef, 'key' | 'label' | 'tabs' | 'datasets'>

/** One practice's summary as computed, or the error it threw. */
export interface PracticeInput {
  view: PracticeView
  summary: ViewSummary | null
  /** Set when the summary threw; the practice then reads "Could not be computed". */
  error?: unknown
  /** How long the summary took, in ms. */
  ms?: number
  /** Set by the scorecard when the mode hides every measure of the practice: it is left out. */
  hidden?: boolean
}

/** Where a row or a finding opens. */
export interface Destination {
  view: RouteView
  tab: string
  /** "Recruiting, Requisitions", for accessible names. */
  label: string
}

export interface ScoreRow {
  /** `<view>:<kpi id>`, unique across practices. */
  id: string
  view: ViewKey
  practice: string
  kpi: Kpi
  metricId: string | null
  /** The target the measure is judged against, or null (none, or not in the measure's unit). */
  target: MetricTarget | null
  /** "At least 95.0%", or "No target". */
  targetText: string
  judgement: Judgement
  status: ScoreStatus
  /** Which direction is good: the KPI's own, else its metric's. */
  goodDirection: 'up' | 'down' | null
  /** The data standard's decision for the number; null when it names no data. */
  gate: TierGate | null
  /** The value may be shown under the data standard. */
  shown: boolean
  /** The value as text ("52 d"), or "—" when hidden, missing or suppressed. */
  valueText: string
  /** Why the value reads "—": the data standard's reason or the anonymity note; null when it shows. */
  hiddenReason: string | null
  /** Where the measure is explained: the KPI's own link, else its tab of the practice's view. */
  opens: Destination
}

export interface Practice {
  view: ViewKey
  label: string
  /** The practice's view at its first tab. */
  opens: Destination
  rows: ScoreRow[]
  /** The summary threw: the practice reads "Could not be computed". */
  failed: boolean
  /** One muted line when the practice shows no measure: why. Null when at least one shows. */
  empty: string | null
  met: number
  judged: number
}

export interface ScoreCounts {
  /** Every measure row. */
  measures: number
  /** Measures with a target and a value shown (the folder-tab denominator). */
  judged: number
  met: number
  watch: number
  missed: number
  /** Value shown, no target. */
  noTarget: number
  /** Value missing, hidden by the data standard or hidden to protect anonymity. */
  unknown: number
}

/** A finding with the practice it comes from; its id is prefixed with the view key. */
export interface SourcedFinding {
  finding: Finding
  /** The practice's view; 'scorecard' for the scorecard's own finding. */
  view: ViewKey
  practice: string
  /** Where "Open in {practice}" goes; null for the scorecard's own finding. */
  opens: Destination | null
}

export interface ScorecardModel {
  practices: Practice[]
  rows: ScoreRow[]
  counts: ScoreCounts
  /** The folder-tab number ("9 of 14", or '' when no measure is judged) and its lineage. */
  headline: { value: string; uses: FieldRef[] }
  /** The fields behind every value the table shows (rows shown under the standard). */
  uses: FieldRef[]
  /** The scorecard's own finding when measures in several practices miss target. */
  own: Finding | null
  findings: {
    /** What the list shows: the scorecard's finding first, then `limit` from the practices' ranking. */
    top: SourcedFinding[]
    /** Critical and watch findings the data standard hides (counted by the readout). */
    hidden: SourcedFinding[]
    /** Every finding from every practice, ranked (for the monthly workbook). */
    all: SourcedFinding[]
  }
  /** How many findings the list carries (the `limit` setting). */
  limit: number
  /** Summary time per practice and in total, in ms. */
  timing: { total: number; byView: Partial<Record<ViewKey, number>> }
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }
const SERIOUS: readonly Severity[] = ['critical', 'warning']

const union = (lists: readonly (readonly FieldRef[] | undefined)[]): FieldRef[] => [
  ...new Set(lists.flatMap((l) => l ?? [])),
]

/** What the scorecard asks of the mode: nothing outside an analytics context (tests, scripts). */
type ModeAccess = Pick<AccessContext, 'can'> | undefined

/** Whether the mode shows a practice: its view is not hidden (limited views still show). */
export const practiceShown = (access: ModeAccess, view: ViewKey): boolean =>
  !access || access.can(S.view(view))

/** Whether the mode shows a measure or a finding: it names no metric, or one the mode shows. */
export const metricShown = (access: ModeAccess, metricId: string | null | undefined): boolean =>
  !access || !metricId || access.can(S.metric(metricId))

/** The view at its first tab (or the tab given), as a destination. */
export function viewDestination(view: PracticeView, tab?: string): Destination {
  const t = view.tabs.find((x) => x.key === tab) ?? view.tabs[0]
  const label = t && view.tabs.length > 1 ? `${view.label}, ${t.label}` : view.label
  return { view: view.key, tab: t?.key ?? '', label }
}

/** The target a value is judged against: the one in force, when it is in the value's unit. */
export function comparableTarget(
  metrics: Pick<MetricsApi, 'def' | 'target'>,
  metricId: string | null | undefined,
  format: Kpi['format'],
): MetricTarget | null {
  if (!metricId) return null
  const t = metrics.target(metricId)
  return t && kpiTarget(metrics, metricId, t.value, format) ? t : null
}

/** One measure row: its target, status and gate. */
export function scoreRow(
  ctx: Pick<AnalyticsContext, 'metrics' | 'quality' | 'standard'>,
  view: PracticeView,
  kpi: Kpi,
  margins = watchMargins(ctx.metrics),
): ScoreRow {
  const metricId = kpi.metricId && ctx.metrics.def(kpi.metricId) ? kpi.metricId : null
  const def = metricId ? ctx.metrics.def(metricId) : undefined
  const gate = gateFor(ctx.quality, ctx.standard, kpi.uses, view.datasets as readonly DatasetKey[])
  const shown = !gate || gate.shown
  const value = shown && !kpi.suppressed ? kpi.value : null
  const target = comparableTarget(ctx.metrics, metricId, kpi.format)
  const judgement = judge(value, target, kpi.format, margins)
  const hiddenReason = !shown ? (gate?.reason ?? null) : kpi.suppressed ? SUPPRESSED_NOTE : null
  return {
    id: `${view.key}:${kpi.id}`,
    view: view.key,
    practice: view.label,
    kpi,
    metricId,
    target,
    targetText: def && target ? targetText(def, target) : 'No target',
    judgement,
    status: judgement.status,
    goodDirection: kpi.goodDirection ?? def?.goodDirection ?? null,
    gate,
    shown,
    valueText: shown ? kpiValueText(kpi) : kpiValueText({ ...kpi, suppressed: true }),
    hiddenReason,
    opens: kpi.link
      ? { view: kpi.link.view, tab: kpi.link.tab ?? '', label: kpi.link.label }
      : viewDestination(view, kpi.tab),
  }
}

/** Critical first, then watch, notes and good news; the view's own order within a severity. */
export function bySeverity(findings: readonly Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.i - b.i)
    .map((x) => x.f)
}

/** A practice's findings with the practice attached and ids made unique across practices. */
export function sourced(view: PracticeView, findings: readonly Finding[]): SourcedFinding[] {
  return bySeverity(findings).map((f) => ({
    finding: { ...f, id: `${view.key}:${f.id}` },
    view: view.key,
    practice: view.label,
    opens: viewDestination(view, f.tab),
  }))
}

/**
 * Every practice's findings ranked: critical, then watch, then notes and good news. Within a
 * severity, each practice's most serious finding comes before any practice's second, and
 * practices take turns in folder-tab order, so one busy practice never fills the list.
 */
export function rankFindings(groups: readonly (readonly SourcedFinding[])[]): SourcedFinding[] {
  const out: SourcedFinding[] = []
  for (const severity of ['critical', 'warning', 'info', 'good'] as const) {
    const queues = groups.map((g) => g.filter((s) => s.finding.severity === severity))
    for (let round = 0; queues.some((q) => q.length > round); round++)
      for (const q of queues) if (q[round]) out.push(q[round])
  }
  return out
}

const listAnd = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

/**
 * "5 of 14 measures miss their target; 3 are in Onboarding and Compliance." when measures in at
 * least `minPractices` practices miss; null otherwise. The practices named are the two with the
 * most misses, when the first has two or more and together they hold more than half of them.
 */
export function missedFinding(
  rows: readonly ScoreRow[],
  practices: readonly Pick<Practice, 'view' | 'label'>[],
  minPractices: number,
): Finding | null {
  const judged = rows.filter((r) => r.status === 'met' || r.status === 'watch' || r.status === 'missed')
  const missed = judged.filter((r) => r.status === 'missed')
  const order = practices.map((p) => p.view)
  const byPractice = practices
    .map((p) => ({ label: p.label, n: missed.filter((r) => r.view === p.view).length }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n)
  if (!missed.length || byPractice.length < Math.max(1, minPractices)) return null
  const n = missed.length
  const head = `${n} of ${plural(judged.length, 'measure')} ${n === 1 ? 'misses its' : 'miss their'} target`
  const top = byPractice.slice(0, 2)
  const inTop = top.reduce((s, p) => s + p.n, 0)
  const names = listAnd(top.map((p) => p.label))
  // Practices are named only where misses concentrate: one practice with two or more of them.
  const concentrated = byPractice.length === 1 || (top[0].n >= 2 && inTop * 2 > n)
  const title = !concentrated
    ? `${head}, across ${byPractice.length} practices.`
    : inTop === n
      ? `${head}, all in ${names}.`
      : `${head}; ${inTop} are in ${names}.`
  const furthest = [...missed].sort(
    (a, b) =>
      missSeverity(b.judgement) - missSeverity(a.judgement) || order.indexOf(a.view) - order.indexOf(b.view),
  )[0]
  const detail = `Furthest from its target is ${furthest.kpi.label} in ${furthest.practice}: ${furthest.valueText} against a target of ${furthest.targetText.toLowerCase()}.`
  return {
    id: 'scorecard:missed-targets',
    metricId: M.missed,
    severity: 'warning',
    title,
    detail,
    action: 'Review the missed measures with each practice lead this month.',
    uses: union(missed.map((r) => r.kpi.uses)),
    // The records behind the measure the detail names, the furthest from its target.
    ...(furthest.kpi.drill ? { drill: furthest.kpi.drill } : {}),
  }
}

/**
 * The scorecard from computed summaries. `inputs` are in folder-tab order; practices without a
 * summary are left out by the caller.
 */
export function buildScorecard(
  ctx: Pick<AnalyticsContext, 'metrics' | 'quality' | 'standard'> & { access?: ModeAccess },
  given: readonly PracticeInput[],
): ScorecardModel {
  const margins = watchMargins(ctx.metrics)
  const limit = Math.max(1, Math.round(ctx.metrics.num(P.limit.metricId, P.limit.key)))
  const minPractices = ctx.metrics.num(P.minPractices.metricId, P.minPractices.key)
  // The mode's practices, measures and findings only (see the module comment).
  const { access } = ctx
  const inputs = given
    .filter((i) => practiceShown(access, i.view.key))
    .map((i): PracticeInput => {
      if (!access || !i.summary) return i
      const kpis = i.summary.kpis.filter((k) => metricShown(access, k.metricId))
      // Every measure was there and the mode hides them all: the practice is left out.
      if (i.summary.kpis.length && !kpis.length) return { ...i, summary: null, hidden: true }
      return {
        ...i,
        summary: {
          ...i.summary,
          kpis,
          findings: i.summary.findings.filter((f) => metricShown(access, f.metricId)),
        },
      }
    })
    .filter((i) => !i.hidden)

  const practices: Practice[] = inputs.map(({ view, summary }) => {
    const rows = (summary?.kpis ?? []).map((k) => scoreRow(ctx, view, k, margins))
    const judged = rows.filter((r) => r.status === 'met' || r.status === 'watch' || r.status === 'missed')
    const shownAny = rows.some((r) => r.shown)
    const empty = !summary
      ? 'Could not be computed. The other practices are not affected.'
      : !rows.length
        ? 'No measures for this practice yet.'
        : !shownAny
          ? `No measure shown: ${(rows[0].hiddenReason ?? 'held back by the data standard').toLowerCase()}.`
          : null
    return {
      view: view.key,
      label: view.label,
      opens: viewDestination(view),
      rows,
      failed: !summary,
      empty,
      met: judged.filter((r) => r.status === 'met').length,
      judged: judged.length,
    }
  })
  const rows = practices.flatMap((p) => p.rows)
  const count = (s: ScoreStatus) => rows.filter((r) => r.status === s).length
  const counts: ScoreCounts = {
    measures: rows.length,
    judged: count('met') + count('watch') + count('missed'),
    met: count('met'),
    watch: count('watch'),
    missed: count('missed'),
    noTarget: count('none'),
    unknown: count('unknown'),
  }
  const judgedRows = rows.filter((r) => r.status === 'met' || r.status === 'watch' || r.status === 'missed')

  // Findings: every practice's readout, ranked; the data standard decides what the list may show.
  const groups = inputs.map(({ view, summary }) => sourced(view, summary?.findings ?? []))
  const all = rankFindings(groups)
  const datasetsOf = new Map(inputs.map((i) => [i.view.key, i.view.datasets as readonly DatasetKey[]]))
  const gateOf = (s: SourcedFinding) =>
    gateFor(ctx.quality, ctx.standard, s.finding.uses, datasetsOf.get(s.view) ?? [])
  const serious = all.filter((s) => SERIOUS.includes(s.finding.severity))
  const shownSerious = serious.filter((s) => {
    const g = gateOf(s)
    return !g || g.shown
  })
  const own = missedFinding(rows, practices, minPractices)
  const ownSourced: SourcedFinding[] = own
    ? [{ finding: own, view: 'scorecard', practice: 'Scorecard', opens: null }]
    : []
  // The scorecard's own line leads and does not take a practice's place.
  const top = [...ownSourced, ...shownSerious.slice(0, limit)]

  const byView: Partial<Record<ViewKey, number>> = {}
  for (const i of inputs) if (i.ms != null) byView[i.view.key] = i.ms
  return {
    practices,
    rows,
    counts,
    headline: {
      value: counts.judged ? `${counts.met} of ${counts.judged}` : '',
      uses: union(judgedRows.map((r) => r.kpi.uses)),
    },
    uses: union(rows.filter((r) => r.shown).map((r) => r.kpi.uses)),
    own,
    findings: {
      top,
      hidden: serious.filter((s) => !shownSerious.includes(s)),
      all: [...ownSourced, ...all],
    },
    limit,
    timing: { total: inputs.reduce((s, i) => s + (i.ms ?? 0), 0), byView },
  }
}

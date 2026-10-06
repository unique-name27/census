/**
 * `view_summary` and `compare_groups`: a view's key figures and findings from the view's own
 * `summary(ctx)` (the same engine the screen and the People scorecard use), judged against the
 * targets in force and gated on the data standard exactly as the scorecard does it.
 */
import { kpiDeltaText, unitOf } from '@/components/kpiModel'
import { gateFor, hiddenFindingsText } from '@/components/tier/tierModel'
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { DatasetKey } from '@/data/schema'
import { type Filters, focusLeader, isActiveAt, isEmployee, withMode } from '@/data/scope'
import { kpiTarget } from '@/metrics/api'
import { minGroupOf } from '@/metrics/privacy'
import { scoreRow } from '@/views/scorecard/engine/model'
import { scorecardNow } from '@/views/scorecard/engine/schedule'
import type { ViewDef } from '@/views/types'
import {
  contextFor,
  dimensionValues,
  exclusionProblem,
  leaderProblem,
  resolveFilters,
  scopeOut,
  scopeWords,
} from '../scope'
import { HIDDEN_SMALL } from './query'
import { RTW_SMALL, rtwFinding, rtwSmallCount, rtwWithheldText, usesRightToWork } from './rightToWork'
import {
  dataViews,
  fail,
  inputOf,
  num,
  ok,
  scopedCtx,
  type ToolOutput,
  type ToolRuntime,
  unknownKeys,
  viewKeysText,
  viewLink,
} from './shared'

export const PAY_HIDDEN = 'Pay amounts are never sent to Claude.'

const isMoney = (k: Kpi): boolean => k.format === 'money' || k.format === 'moneyFull'

/**
 * One key figure as tool output. `status` is the tile's judgement (Met or Missed against the target
 * in force, `kpiTarget`), so Ask never says "watch" where the screen says Missed; a miss the People
 * scorecard shows as Watch (inside its watch margin) also carries `scorecard_status: 'watch'`.
 */
export function kpiOut(rt: ToolRuntime, ctx: AnalyticsContext, view: ViewDef, k: Kpi) {
  const row = scoreRow(ctx, view, k)
  const money = isMoney(k)
  // A right to work count under the minimum is not sent, and a right to work note never is.
  const min = minGroupOf(ctx.metrics)
  const rtwSmall = rtwSmallCount(k, min)
  const shown = row.shown && !k.suppressed && !money && k.value != null && !rtwSmall
  const hidden = money ? PAY_HIDDEN : !row.shown ? row.hiddenReason : rtwSmall ? RTW_SMALL(min) : null
  const noNote = !!hidden || usesRightToWork(k.uses)
  const label = `${view.label}, ${k.label}`
  const tile = shown ? kpiTarget(ctx.metrics, row.metricId, k.value, k.format) : null
  return {
    id: k.id,
    metric: row.metricId,
    label: k.label,
    value: shown ? num(k.value) : null,
    value_text: shown ? row.valueText : '—',
    unit: unitOf(k.format) || k.format,
    change: shown && !k.suppressed ? num(k.delta) : null,
    change_text: shown ? kpiDeltaText(k) : null,
    change_label: shown ? (k.deltaLabel ?? null) : null,
    good_direction: row.goodDirection,
    target: row.target ? row.targetText : null,
    status: !shown ? 'unknown' : (tile?.status ?? 'none'),
    ...(tile?.status === 'missed' && row.status === 'watch' ? { scorecard_status: 'watch' } : {}),
    tier: row.gate?.tier ?? null,
    hidden,
    suppressed: !hidden && k.suppressed ? (k.suppressedNote ?? HIDDEN_SMALL(minGroupOf(ctx.metrics))) : null,
    // A hidden number's note can carry the number itself, so it goes only with a shown value.
    note: noNote ? null : (k.note ?? null),
    ref: shown ? rt.refs.add(k.drill, label) : null,
    change_ref: shown && k.deltaDrill ? rt.refs.add(k.deltaDrill, `${label}, comparison`) : null,
    note_ref: !noNote && k.noteDrill ? rt.refs.add(k.noteDrill, `${label}, note`) : null,
    opens: k.link ? viewLink(k.link.view, k.link.tab) : viewLink(view.key, k.tab ?? view.tabs[0]?.key),
  }
}

/** Where a finding concentrates (its rescope), in words with the leader as a token. */
function concentratesIn(rt: ToolRuntime, f: Partial<Filters> | undefined): string | null {
  if (!f) return null
  const words = scopeWords(
    {
      ...rt.base.filters,
      leaderId: f.leaderId ?? null,
      businessUnit: f.businessUnit ?? [],
      department: f.department ?? [],
      location: f.location ?? [],
      level: f.level ?? [],
    },
    rt.tokens,
  )
  return words === 'Whole company' ? null : words
}

export function findingOut(rt: ToolRuntime, view: ViewDef, f: Finding) {
  return {
    id: f.id,
    metric: f.metricId ?? null,
    severity: f.severity,
    title: f.title,
    detail: f.detail ?? null,
    next_step: f.action ?? null,
    // Who is behind it stays here; Claude gets how many.
    people: f.people?.length ? (f.peopleTotal ?? f.people.length) : null,
    concentrates_in: concentratesIn(rt, f.filter),
    ref: rt.refs.add(f.drill, `${view.label}: ${f.title}`),
    opens: viewLink(view.key, f.tab ?? null),
  }
}

/** Findings the data standard shows, and a line for the ones it hides. */
function findingsOut(rt: ToolRuntime, ctx: AnalyticsContext, view: ViewDef, findings: readonly Finding[]) {
  const shown: ReturnType<typeof findingOut>[] = []
  let hidden = 0
  let withheld = 0
  const min = minGroupOf(ctx.metrics)
  for (const f of findings) {
    const g = gateFor(ctx.quality, ctx.standard, f.uses, view.datasets as readonly DatasetKey[])
    if (g && !g.shown) hidden++
    else {
      // Right to work: the title alone, and nothing about fewer people than the minimum.
      const rtw = rtwFinding(f, min)
      if (rtw === 'withhold') withheld++
      else if (rtw === 'title') shown.push({ ...findingOut(rt, view, f), detail: null, next_step: null })
      else shown.push(findingOut(rt, view, f))
    }
  }
  return {
    findings: shown,
    hidden_findings: hidden ? hiddenFindingsText(hidden, ctx.standard) : null,
    ...(withheld ? { withheld_findings: rtwWithheldText(withheld, min) } : {}),
  }
}

function scorecardOut(rt: ToolRuntime, ctx: AnalyticsContext) {
  const m = scorecardNow(ctx, rt.env.views)
  const min = minGroupOf(ctx.metrics)
  // Right to work findings: the title alone, and nothing about fewer people than the minimum.
  const top = m.findings.top.flatMap((s) => {
    const rtw = rtwFinding(s.finding, min)
    return rtw === 'withhold' ? [] : [{ s, titleOnly: rtw === 'title' }]
  })
  const withheld = m.findings.top.length - top.length
  return {
    practices: m.practices.map((p) => ({
      view: p.view,
      label: p.label,
      met: p.met,
      judged: p.judged,
      empty: p.empty,
      measures: p.rows.map((r) => {
        const money = isMoney(r.kpi)
        const rtwSmall = rtwSmallCount(r.kpi, min)
        const shown = r.shown && !r.kpi.suppressed && !money && r.kpi.value != null && !rtwSmall
        return {
          label: r.kpi.label,
          metric: r.metricId,
          value: shown ? num(r.kpi.value) : null,
          value_text: shown ? r.valueText : '—',
          target: r.targetText,
          status: money ? 'unknown' : r.status,
          hidden: money
            ? PAY_HIDDEN
            : r.shown && r.kpi.suppressed
              ? (r.kpi.suppressedNote ?? HIDDEN_SMALL(minGroupOf(ctx.metrics)))
              : r.shown && rtwSmall
                ? RTW_SMALL(min)
                : r.hiddenReason,
          ref: shown ? rt.refs.add(r.kpi.drill, `${p.label}, ${r.kpi.label}`) : null,
          opens: viewLink(r.opens.view, r.opens.tab),
        }
      }),
    })),
    counts: m.counts,
    targets_met: m.headline.value || null,
    top_findings: top.map(({ s, titleOnly }) => ({
      practice: s.practice,
      severity: s.finding.severity,
      title: s.finding.title,
      detail: titleOnly ? null : (s.finding.detail ?? null),
      next_step: titleOnly ? null : (s.finding.action ?? null),
      ref: rt.refs.add(s.finding.drill, `${s.practice}: ${s.finding.title}`),
      opens: s.opens ? viewLink(s.opens.view, s.opens.tab) : null,
    })),
    hidden_findings: m.findings.hidden.length
      ? hiddenFindingsText(m.findings.hidden.length, ctx.standard)
      : null,
    ...(withheld ? { withheld_findings: rtwWithheldText(withheld, min) } : {}),
  }
}

function findView(rt: ToolRuntime, key: unknown): ViewDef | string {
  if (typeof key !== 'string' || !key) return `view is required. Views: ${viewKeysText(rt)}.`
  const v = dataViews(rt).find((x) => x.key === key)
  if (v) return v
  if (key === 'ai') return 'AI in HR reads no data, so it has no key figures.'
  return `Unknown view "${key}". Views: ${viewKeysText(rt)}.`
}

export function viewSummary(rt: ToolRuntime, raw: unknown): ToolOutput {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['view', 'filters'])
  if (bad) return fail(bad)
  const view = findView(rt, input.view)
  if (typeof view === 'string') return fail(view)
  const s = scopedCtx(rt, input.filters)
  if (!s.ok) return fail(s.error)
  const ctx = s.ctx
  const head = {
    view: view.key,
    label: view.label,
    ...scopeOut(ctx, rt.tokens),
    data_standard: ctx.standard,
  }
  if (view.key === 'scorecard') return ok({ ...head, ...scorecardOut(rt, ctx) })
  if (!view.summary) {
    const h = view.headline(ctx)
    return ok({
      ...head,
      key_figures: h.value
        ? [{ label: h.label, value_text: h.value, metric: h.metricId ?? null, opens: viewLink(view.key) }]
        : [],
      findings: [],
      note: `${view.label} has no readout of its own; this is the number on its folder tab.`,
    })
  }
  const summary = view.summary(ctx)
  return ok({
    ...head,
    key_figures: summary.kpis.map((k) => kpiOut(rt, ctx, view, k)),
    ...findingsOut(rt, ctx, view, summary.findings),
  })
}

/* ───────────── compare_groups ───────────── */

export const COMPARE_BY = ['business_unit', 'department', 'location', 'level', 'leader'] as const
export type CompareBy = (typeof COMPARE_BY)[number]
/** Groups compared when none are named: the largest. */
export const DEFAULT_GROUPS = 12
const MAX_GROUPS = 25

const DIM: Record<Exclude<CompareBy, 'leader'>, 'businessUnit' | 'department' | 'location' | 'level'> = {
  business_unit: 'businessUnit',
  department: 'department',
  location: 'location',
  level: 'level',
}

/**
 * Why a group of compare_groups shows no numbers: inside a scope that leaves values out, it differs
 * from the same group without one of them by fewer people than the minimum.
 */
export const GROUP_EXCLUSION = (min: number): string =>
  `Hidden: the scope's exclusions remove fewer than ${min} people from this group, so comparing it with the same group without them would single those people out.`

/** Active employees in a context's scope (the group size shown beside each value). */
const headcount = (ctx: AnalyticsContext): number =>
  ctx.data.employees.filter((e) => isEmployee(e) && isActiveAt(e, ctx.asOf)).length

/** The leaders one level down from the scope's leader (or from the top of the org), largest org first. */
function leaderGroups(ctx: AnalyticsContext): string[] {
  // One level down from the leader the scope includes; a left-out leader is not the top.
  const top = focusLeader(ctx.filters)
  const roots = top
    ? (ctx.org.children.get(top) ?? [])
    : [...ctx.org.byId.values()].filter((e) => !e.managerId || !ctx.org.byId.has(e.managerId))
  // With no leader picked and one person at the top, compare the people who report to them.
  const level =
    !top && roots.filter((e) => isActiveAt(e, ctx.asOf)).length === 1
      ? (ctx.org.children.get(roots.find((e) => isActiveAt(e, ctx.asOf))?.employeeId ?? '') ?? [])
      : roots
  return level
    .filter((e) => isActiveAt(e, ctx.asOf) && (ctx.org.children.get(e.employeeId)?.length ?? 0) > 0)
    .map((e) => e.employeeId)
}

export function compareGroups(rt: ToolRuntime, raw: unknown): ToolOutput {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['view', 'kpi', 'by', 'values', 'filters'])
  if (bad) return fail(bad)
  const view = findView(rt, input.view)
  if (typeof view === 'string') return fail(view)
  if (!view.summary)
    return fail(`${view.label} has no key figures to compare. Use view_summary or query_records.`)
  const by = input.by as CompareBy
  if (!COMPARE_BY.includes(by)) return fail(`by must be one of ${COMPARE_BY.join(', ')}.`)
  const s = scopedCtx(rt, input.filters)
  if (!s.ok) return fail(s.error)
  const baseCtx = s.ctx
  const overall = view.summary(baseCtx)
  const want = typeof input.kpi === 'string' ? input.kpi : ''
  const kpi = overall.kpis.find((k) => k.id === want || k.metricId === want)
  if (!kpi)
    return fail(
      `No key figure "${want}" in ${view.label}. Key figures: ${overall.kpis.map((k) => `${k.id} (${k.label})`).join(', ')}.`,
    )

  // The groups: named values, or the largest in the scope.
  let groups: { label: string; filters: Filters }[] = []
  const values = input.values
  if (values != null && (!Array.isArray(values) || !values.every((v) => typeof v === 'string')))
    return fail('values must be a list of names (or leader tokens).')
  const named = (values as string[] | undefined)?.slice(0, MAX_GROUPS)
  if (by === 'leader') {
    const ids: string[] = []
    if (named?.length) {
      for (const t of named) {
        const id = rt.tokens.employeeIdOf(t)
        if (!id || !baseCtx.org.byId.has(id))
          return fail(`"${t}" is not a leader token. Use leader tokens from get_context.`)
        const problem = leaderProblem(rt.base, id, t)
        if (problem) return fail(problem)
        ids.push(id)
      }
    } else ids.push(...leaderGroups(baseCtx).filter((id) => !leaderProblem(rt.base, id, '')))
    // Each group includes its leader's org, whatever the scope's own leader mode.
    groups = ids.map((id) => ({
      label: rt.tokens.forEmployee(id),
      filters: { ...s.filters, leaderId: id, modes: withMode(s.filters.modes, 'leaderId', 'include') },
    }))
  } else {
    const dim = DIM[by]
    let picked: string[]
    if (named?.length) {
      const r = resolveFilters(rt.base, { [by]: named }, rt.tokens)
      if (!r.ok) return fail(r.error)
      picked = r.filters[dim]
    } else picked = dimensionValues(baseCtx, dim)
    groups = picked.map((v) => ({
      label: v,
      filters: { ...s.filters, [dim]: [v], modes: withMode(s.filters.modes, dim, 'include') },
    }))
  }
  const sized = groups.map((g) => {
    const ctx = contextFor(rt.base, g.filters)
    return { ...g, ctx, size: headcount(ctx) }
  })
  const chosen = named?.length
    ? sized
    : sized
        .filter((g) => g.size > 0)
        .sort((a, b) => b.size - a.size || a.label.localeCompare(b.label))
        .slice(0, DEFAULT_GROUPS)

  const min = minGroupOf(rt.base.metrics)
  const rows = chosen.map((g) => {
    // The exclusion rule holds for each group too: a group the scope's exclusions cut by a few
    // people would single them out next to the same group without the exclusion.
    if (exclusionProblem(rt.base, g.filters, rt.tokens))
      return { group: g.label, headcount: null, value: null, value_text: '—', hidden: GROUP_EXCLUSION(min) }
    const k = view.summary?.(g.ctx).kpis.find((x) => x.id === kpi.id)
    return {
      group: g.label,
      headcount: g.size,
      ...(k
        ? kpiOut(rt, g.ctx, view, k)
        : { value: null, value_text: '—', hidden: 'This figure is not computed for this group.' }),
    }
  })
  return ok({
    view: view.key,
    label: view.label,
    key_figure: kpi.label,
    metric: kpi.metricId ?? null,
    by,
    ...scopeOut(baseCtx, rt.tokens),
    overall: kpiOut(rt, baseCtx, view, kpi),
    groups: rows,
    groups_total: named?.length ? rows.length : sized.filter((g) => g.size > 0).length,
    notes: [
      'headcount is active employees in the group on the as-of date.',
      'Small groups follow the figure’s own suppression.',
    ],
  })
}

/**
 * `view_summary` and `compare_groups`: a view's key figures and findings from the view's own
 * `summary(ctx)` (the same engine the screen and the People scorecard use), judged against the
 * targets in force and gated on the data standard exactly as the scorecard does it.
 */

import { modeName } from '@/access/copy'
import { findingsInMode, kpisInMode } from '@/access/numbers'
import { clampFilters } from '@/access/scopes/clamp'
import { scopeOfAccess } from '@/access/scopes/records'
import { kpiDeltaText, unitOf } from '@/components/kpiModel'
import { gateFor, hiddenFindingsText } from '@/components/tier/tierModel'
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { DatasetKey } from '@/data/schema'
import { type Filters, focusLeader, isActiveAt, isEmployee, isExcluded, withMode } from '@/data/scope'
import { kpiTarget } from '@/metrics/api'
import { minGroupOf } from '@/metrics/privacy'
import { analysisDef, analysisSummary } from '@/views/hrbp/analyses/registry'
import { ANALYSIS_KEYS, analysesTab, analysisSurface, parseAnalysesTab } from '@/views/hrbp/analyses/tab'
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

const isMoney = (k: Kpi): boolean => k.format === 'money' || k.format === 'moneyFull' || k.format === 'moneyM'

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
    // A company comparison opens no records in a scoped mode (the company's are not listed there).
    change_ref:
      shown && k.deltaDrill && !(scopeOfAccess(ctx.access) && /company|all reqs/i.test(k.deltaLabel ?? ''))
        ? rt.refs.add(k.deltaDrill, `${label}, comparison`)
        : null,
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
  // A view the mode hides is refused in plain words, worded for the mode (docs/ROLES-V2.md 7).
  const hidden = rt.env.views.find((x) => x.key === key)
  const access = rt.base.access
  if (hidden && access && access.mode !== 'developer' && !access.can(`view:${key}`))
    return key === 'scorecard'
      ? `The scorecard is not shown in ${modeName(access.mode)}.`
      : `${hidden.label} is not shown in ${modeName(access.mode)}, so Ask does not answer about it. Say so, and do not estimate it.`
  return `Unknown view "${key}". Views: ${viewKeysText(rt)}.`
}

/** The tabs `view_summary` takes: People stats' special analyses (docs/ANALYSES.md, 1.8). */
export const SUMMARY_TABS: readonly string[] = ANALYSIS_KEYS.map((k) => analysesTab(k))

/**
 * One special analysis of People stats (`tab: 'analyses:declines'`): its key figures and findings
 * from `analysisSummary`, the same objects the tab renders, with what the mode hides dropped. An
 * analysis the mode hides is refused like any hidden number; one without its data says what to add.
 */
function analysisOut(rt: ToolRuntime, ctx: AnalyticsContext, view: ViewDef, tab: unknown) {
  const key = typeof tab === 'string' ? parseAnalysesTab(tab).key : null
  if (view.key !== 'hrbp' || !key)
    return `tab is for People stats special analyses only: ${SUMMARY_TABS.join(', ')}.`
  const def = analysisDef(key)
  if (!ctx.access.can(analysisSurface(key)))
    return `${def.label} is not shown in ${modeName(ctx.access.mode)}, so Ask does not answer about it. Say so, and do not estimate it.`
  const opens = viewLink('hrbp', analysesTab(key))
  // The window the analysis's numbers cover: three of the four keep their own, whatever the period.
  const w = def.window(ctx)
  const analysis_window = {
    start: w.start,
    end: w.end,
    label: w.label,
    ignores_period: w.ignoresPeriod,
    ...(w.ignoresPeriod
      ? { note: 'The period picked does not change this analysis: state this window, not the period.' }
      : {}),
  }
  const readiness = def.ready(ctx)
  if (!readiness.ready)
    return {
      tab: analysesTab(key),
      analysis: def.title,
      analysis_window,
      key_figures: [],
      findings: [],
      note: readiness.message,
      opens,
    }
  const summary = analysisSummary(ctx, key)
  const found = findingsOut(rt, ctx, view, findingsInMode(ctx.access, summary.findings))
  return {
    tab: analysesTab(key),
    analysis: def.title,
    analysis_window,
    key_figures: kpisInMode(ctx.access, summary.kpis).map((k) => ({ ...kpiOut(rt, ctx, view, k), opens })),
    ...found,
    findings: found.findings.map((f) => ({ ...f, opens })),
    // Aggregate tables the analysis offers beyond its tiles (the pyramid's flow by level), held
    // back like a figure when their fields fall below the data standard.
    ...(summary.tables?.length
      ? {
          tables: summary.tables.map((t) => {
            const g = gateFor(ctx.quality, ctx.standard, t.uses, view.datasets as readonly DatasetKey[])
            return g && !g.shown
              ? {
                  id: t.id,
                  title: t.title,
                  rows: [],
                  hidden: 'Held back: its data does not meet the data standard in force.',
                }
              : { id: t.id, title: t.title, columns: t.columns, rows: t.rows }
          }),
        }
      : {}),
    opens,
  }
}

export function viewSummary(rt: ToolRuntime, raw: unknown): ToolOutput {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['view', 'filters', 'tab'])
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
  if (input.tab !== undefined) {
    const out = analysisOut(rt, ctx, view, input.tab)
    if (typeof out === 'string') return fail(out)
    // An analysis with its own window has no prior window to compare with, so none is quoted.
    const { comparison: _comparison, ...fixed } = head
    return ok({ ...(out.analysis_window.ignores_period ? fixed : head), ...out })
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
  // What the mode hides on screen is dropped here too.
  return ok({
    ...head,
    key_figures: kpisInMode(ctx.access, summary.kpis).map((k) => kpiOut(rt, ctx, view, k)),
    ...findingsOut(rt, ctx, view, findingsInMode(ctx.access, summary.findings)),
  })
}

/* ───────────── compare_groups ───────────── */

export const COMPARE_BY = ['business_unit', 'department', 'location', 'level', 'leader'] as const
export type CompareBy = (typeof COMPARE_BY)[number]

/** The dimensions a mode compares by: Finance compares business units only (docs/ROLES-V2.md 2.3). */
export function compareByIn(
  access: { mode: string; scope?: unknown; lock?: unknown } | null | undefined,
): readonly CompareBy[] {
  return access?.mode === 'finance' && !access.scope && !access.lock ? ['business_unit'] : COMPARE_BY
}
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

/**
 * A group's size: active employees, or in Recruiter mode the recruiter's reqs in the group (the
 * roster there is kept only for names, so its headcount says nothing about the reqs).
 */
const sizeOf = (ctx: AnalyticsContext): number =>
  scopeOfAccess(ctx.access)?.kind === 'reqs' ? ctx.data.requisitions.length : headcount(ctx)

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

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
  const access = rt.base.access
  const allowed = compareByIn(access)
  if (!allowed.includes(by))
    return fail(
      `${modeName(access.mode)} filters by business unit and period only, so compare_groups compares by ${allowed.join(' or ')}.`,
    )
  const scope = scopeOfAccess(access)
  const reqs = scope?.kind === 'reqs'
  const s = scopedCtx(rt, input.filters)
  if (!s.ok) return fail(s.error)
  const baseCtx = s.ctx
  const overall = view.summary(baseCtx)
  const want = typeof input.kpi === 'string' ? input.kpi : ''
  // The refusal names only the key figures the mode shows, never one it hides.
  const shownKpis = kpisInMode(baseCtx.access, overall.kpis)
  const kpi = shownKpis.find((k) => k.id === want || k.metricId === want)
  if (!kpi)
    return fail(
      `No key figure "${want}" in ${view.label}. Key figures: ${shownKpis.map((k) => `${k.id} (${k.label})`).join(', ')}.`,
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
        // Manager mode compares leaders inside the org only.
        const lock = rt.base.access?.lock
        if (lock && !lock.orgIds.has(id))
          return fail(
            `In Manager mode a leader filter must be someone in ${rt.tokens.forEmployee(lock.managerId)}'s org.`,
          )
        // HRBP for a business unit: leaders of people in the unit only.
        if (scope?.kind === 'unit' && !scope.leaderIds.has(id))
          return fail(
            `${t} leads nobody in ${scope.unit}. In HRBP mode a leader filter must lead people in it.`,
          )
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
  // Inside a scope, a group the scope's clamp would change (another business unit, a department of
  // another unit, a site outside the region) is not a group of the scope: it is left out.
  const inScope = (g: { filters: Filters }): boolean => {
    if (!scope && access.mode !== 'finance') return true
    const kept = clampFilters(g.filters, scope, access.mode)
    if (by === 'leader') return kept.leaderId === g.filters.leaderId
    const dim = DIM[by]
    return sameList(kept[dim], g.filters[dim]) && !isExcluded(kept, dim)
  }
  const sized = groups.filter(inScope).map((g) => {
    const ctx = contextFor(rt.base, g.filters)
    return { ...g, ctx, size: sizeOf(ctx) }
  })
  const chosen = named?.length
    ? sized
    : sized
        .filter((g) => g.size > 0)
        .sort((a, b) => b.size - a.size || a.label.localeCompare(b.label))
        .slice(0, DEFAULT_GROUPS)

  // Grouping by a list dimension the scope filters on compares every value of it: each group's
  // scope leaves that filter out, which the result says. (Leaders' orgs sit inside the scope.) The
  // mode's own pin stays: a business unit's groups are its own, a region's are its sites.
  const byDim = by === 'leader' ? null : DIM[by]
  const pinned =
    (scope?.kind === 'unit' && byDim === 'businessUnit') || (scope?.kind === 'region' && byDim === 'location')
  const unfiltered =
    byDim && s.filters[byDim].length
      ? clampFilters(
          { ...s.filters, [byDim]: [], modes: withMode(s.filters.modes, byDim, 'include') },
          scope,
          access.mode,
        )
      : null
  const groupsScope =
    byDim && unfiltered && !(pinned && sameList(unfiltered[byDim], s.filters[byDim]))
      ? scopeWords(unfiltered, rt.tokens, scope)
      : null
  const min = minGroupOf(rt.base.metrics)
  const rows = chosen.map((g) => {
    // The exclusion rule holds for each group too: a group the scope's exclusions cut by a few
    // people would single them out next to the same group without the exclusion.
    if (exclusionProblem(rt.base, g.filters, rt.tokens))
      return {
        group: g.label,
        ...(reqs ? { reqs: null } : { headcount: null }),
        value: null,
        value_text: '—',
        hidden: GROUP_EXCLUSION(min),
      }
    const k = view.summary?.(g.ctx).kpis.find((x) => x.id === kpi.id)
    return {
      group: g.label,
      ...(reqs ? { reqs: g.size } : { headcount: g.size }),
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
    ...(groupsScope ? { groups_scope: groupsScope } : {}),
    notes: [
      reqs
        ? by === 'leader'
          ? "reqs is the recruiter's reqs whose hiring manager is in the leader's org: the groups are the hiring managers' orgs inside the reqs."
          : "reqs is the recruiter's reqs in the group."
        : 'headcount is active employees in the group on the as-of date.',
      'Small groups follow the figure’s own suppression.',
      ...(groupsScope
        ? [
            `Grouped by ${by === 'business_unit' ? 'business unit' : by}, so the scope's own ${by === 'business_unit' ? 'business unit' : by} filter is not applied to the groups: they cover ${groupsScope.replace(/^Whole company/, 'the whole company').replaceAll(' · ', ', ')}. overall is the scope itself.`,
          ]
        : []),
    ],
  })
}
